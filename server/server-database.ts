import { randomBytes } from "crypto";
import type Docker from "dockerode";
import type { Node, Server } from "@shared/schema";
import { dockerManager } from "./docker-manager";
import { storage } from "./storage";
import { ensureImage, ensureVolume, execInContainer, removeContainerQuietly } from "./container-utils";

/**
 * Отдельная база данных для сервера: контейнер PostgreSQL или MariaDB со своим томом в частной сети,
 * общей только с игровым контейнером. Снаружи порт базы не открывается; сервер обращается к ней по имени «database».
 */
export const DATABASE_ENGINES = {
  postgres: { image: "postgres:16-alpine", port: 5432, dataDir: "/var/lib/postgresql/data", label: "PostgreSQL 16" },
  mariadb: { image: "mariadb:11.4", port: 3306, dataDir: "/var/lib/mysql", label: "MariaDB 11.4" },
} as const;
export type DatabaseEngine = keyof typeof DATABASE_ENGINES;

export interface ServerDatabase {
  engine: DatabaseEngine;
  name: string;
  user: string;
  password: string;
  createdAt: string;
  /** Порт базы на ноде для копий сайта при масштабировании; без него база доступна только в сети сервера. */
  publishedPort?: number;
}

export const DATABASE_HOST = "database";
export const dbContainerName = (serverId: string) => `sparkpanel-db-${serverId}`;
export const dbVolumeName = (serverId: string) => `sparkpanel-${serverId}-db`;
export const serverNetworkName = (serverId: string) => `sparkpanel-net-${serverId}`;

export function getServerDatabase(server: Server): ServerDatabase | null {
  const db = (server.config as Record<string, any> | null)?.database;
  return db && typeof db.engine === "string" && db.engine in DATABASE_ENGINES ? (db as ServerDatabase) : null;
}

/** Переменные окружения для игрового контейнера. */
export function databaseEnv(server: Server): string[] {
  const db = getServerDatabase(server);
  if (!db) return [];
  const engine = DATABASE_ENGINES[db.engine];
  const scheme = db.engine === "postgres" ? "postgresql" : "mysql";
  return [
    `DB_HOST=${DATABASE_HOST}`,
    `DB_PORT=${engine.port}`,
    `DB_NAME=${db.name}`,
    `DB_USER=${db.user}`,
    `DB_PASSWORD=${db.password}`,
    `DATABASE_URL=${scheme}://${db.user}:${encodeURIComponent(db.password)}@${DATABASE_HOST}:${engine.port}/${db.name}`,
  ];
}

async function ensureNetwork(docker: Docker, serverId: string): Promise<void> {
  const name = serverNetworkName(serverId);
  try {
    await docker.getNetwork(name).inspect();
  } catch {
    await docker.createNetwork({ Name: name, Driver: "bridge", Labels: { "sparkpanel.managed": "true", "sparkpanel.server-id": serverId } });
  }
}

async function nodeOf(server: Server): Promise<Node> {
  const node = await storage.getNode(server.nodeId);
  if (!node) throw new Error("Node not found");
  return node;
}

/** Запускает контейнер базы (создаёт, если его нет). */
export async function ensureDatabaseContainer(server: Server): Promise<void> {
  const db = getServerDatabase(server);
  if (!db) return;
  const engine = DATABASE_ENGINES[db.engine];
  const docker = dockerManager.getDockerClient(await nodeOf(server));
  await ensureNetwork(docker, server.id);
  const name = dbContainerName(server.id);
  const existing = docker.getContainer(name);
  try {
    const info = await existing.inspect();
    const published = info.HostConfig?.PortBindings?.[`${engine.port}/tcp`]?.[0]?.HostPort;
    /* Публикация порта изменилась — контейнер пересоздаётся, данные остаются в томе. */
    if ((published ?? undefined) === (db.publishedPort ? String(db.publishedPort) : undefined)) {
      if (!info.State.Running) await existing.start();
      return;
    }
    await existing.remove({ force: true });
  } catch (error: any) {
    if (error?.statusCode !== 404) throw error;
  }
  await ensureImage(docker, engine.image);
  await ensureVolume(docker, dbVolumeName(server.id), { "sparkpanel.server-id": server.id });
  const env =
    db.engine === "postgres"
      ? [`POSTGRES_DB=${db.name}`, `POSTGRES_USER=${db.user}`, `POSTGRES_PASSWORD=${db.password}`]
      : [`MARIADB_DATABASE=${db.name}`, `MARIADB_USER=${db.user}`, `MARIADB_PASSWORD=${db.password}`, `MARIADB_RANDOM_ROOT_PASSWORD=1`];
  const container = await docker.createContainer({
    name,
    Image: engine.image,
    Env: env,
    Labels: { "sparkpanel.managed": "true", "sparkpanel.server-id": server.id, "sparkpanel.role": "database" },
    ...(db.publishedPort ? { ExposedPorts: { [`${engine.port}/tcp`]: {} } } : {}),
    HostConfig: {
      Binds: [`${dbVolumeName(server.id)}:${engine.dataDir}`],
      ...(db.publishedPort ? { PortBindings: { [`${engine.port}/tcp`]: [{ HostPort: String(db.publishedPort) }] } } : {}),
      NetworkMode: serverNetworkName(server.id),
      RestartPolicy: { Name: "unless-stopped" },
      Memory: 512 * 1024 * 1024,
      LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "2" } },
    },
    NetworkingConfig: { EndpointsConfig: { [serverNetworkName(server.id)]: { Aliases: [DATABASE_HOST] } } },
  });
  await container.start();
}

/** Создаёт базу для сервера. Игровой контейнер подключается к ней после перезапуска. */
export async function createServerDatabase(server: Server, engineName: DatabaseEngine): Promise<Server> {
  if (getServerDatabase(server)) throw Object.assign(new Error("This server already has a database"), { status: 409 });
  const db: ServerDatabase = {
    engine: engineName,
    name: "server",
    user: "server",
    password: randomBytes(18).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  const updated = (await storage.updateServer(server.id, { config: { ...((server.config as Record<string, any>) || {}), database: db } }))!;
  try {
    await ensureDatabaseContainer(updated);
  } catch (error) {
    await storage.updateServer(server.id, { config: server.config });
    await removeDatabaseResources(updated).catch(() => {});
    throw error;
  }
  return updated;
}

/** Состояние контейнера базы и готовность принимать подключения. */
export async function databaseStatus(server: Server): Promise<{ state: "running" | "starting" | "stopped" | "missing"; ready: boolean; sizeBytes: number | null }> {
  const db = getServerDatabase(server);
  if (!db) return { state: "missing", ready: false, sizeBytes: null };
  const docker = dockerManager.getDockerClient(await nodeOf(server));
  const container = docker.getContainer(dbContainerName(server.id));
  let info;
  try {
    info = await container.inspect();
  } catch {
    return { state: "missing", ready: false, sizeBytes: null };
  }
  if (!info.State.Running) return { state: "stopped", ready: false, sizeBytes: null };
  const probe =
    db.engine === "postgres"
      ? ["psql", "-U", db.user, "-d", db.name, "-tAc", `SELECT pg_database_size('${db.name}')`]
      : ["mariadb", "-u", db.user, `-p${db.password}`, "-N", "-e", `SELECT COALESCE(SUM(data_length + index_length), 0) FROM information_schema.tables WHERE table_schema = '${db.name}'`];
  const result = await execInContainer(container, probe, { timeoutMs: 10000 }).catch(() => null);
  if (!result || result.exitCode !== 0) return { state: "starting", ready: false, sizeBytes: null };
  return { state: "running", ready: true, sizeBytes: Number(result.stdout.toString().trim()) || 0 };
}

/** Удаляет контейнер, том и сеть базы. */
export async function removeDatabaseResources(server: Server): Promise<void> {
  const docker = dockerManager.getDockerClient(await nodeOf(server));
  await removeContainerQuietly(docker, dbContainerName(server.id));
  await docker
    .getVolume(dbVolumeName(server.id))
    .remove()
    .catch((error: any) => {
      if (error?.statusCode !== 404) console.warn(`Failed to remove database volume of ${server.id}:`, error?.message);
    });
  const network = docker.getNetwork(serverNetworkName(server.id));
  const info = await network.inspect().catch(() => null);
  if (!info) return;
  for (const id of Object.keys(info.Containers ?? {})) await network.disconnect({ Container: id, Force: true }).catch(() => {});
  await network.remove().catch((error: any) => console.warn(`Failed to remove network of ${server.id}:`, error?.message));
}
