import type { Node, Server } from "@shared/schema";
import { storage } from "./storage";
import { dockerManager } from "./docker-manager";
import { copyServerFiles, ensureGameContainer, gameContainerName, removeServerResources } from "./game-server";
import { ensureDatabaseContainer, getServerDatabase } from "./server-database";
import { connectHost } from "./node-address";
import { syncProxy, getServerDomains } from "./domains";
import { notify } from "./notifier";

/**
 * Масштабирование сайта: несколько копий одного сервера на разных нодах.
 *  - Копия — такой же контейнер (образ, команда, переменные) со своим томом и внешним портом; внутри контейнера
 *    приложение слушает тот же порт, что и основной сервер. Файлы копируются с основного сервера.
 *  - Общая база: порт базы сервера публикуется на её ноде, копии подключаются к нему (DB_HOST, DATABASE_URL).
 *  - Трафик домена Caddy распределяет между всеми копиями и убирает упавшие из ротации.
 *  - Автомасштабирование добавляет и убирает копии по средней загрузке CPU, следит, чтобы копии работали,
 *    и останавливает их вместе с основным сервером.
 * Основной сервер — тоже копия: «копий всего» = основной + дополнительные.
 */
export interface Replica {
  id: string;
  nodeId: string;
  port: number;
  createdAt: string;
}

export interface ScalingSettings {
  /** Автомасштабирование по CPU; копии можно добавлять и вручную, без него. */
  autoscale: boolean;
  /** Копий всего, включая основной сервер. */
  min: number;
  max: number;
  /** Средняя загрузка CPU (% от лимита сервера), выше которой добавляется копия. */
  targetCpu: number;
  /** Ноды для копий; пусто — любые ноды в сети. */
  nodeIds: string[];
  replicas: Replica[];
}

const DEFAULTS: ScalingSettings = { autoscale: false, min: 1, max: 4, targetCpu: 70, nodeIds: [], replicas: [] };
const REPLICA_PORT_START = 40000;
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

export function getScaling(server: Server): ScalingSettings {
  return { ...DEFAULTS, ...((server.config as Record<string, any> | null)?.scaling ?? {}) };
}

async function saveScaling(serverId: string, patch: Partial<ScalingSettings>): Promise<Server> {
  const server = await storage.getServer(serverId);
  if (!server) throw fail("Server not found", 404);
  const config = { ...((server.config as Record<string, any>) || {}), scaling: { ...getScaling(server), ...patch } };
  return (await storage.updateServer(serverId, { config }))!;
}

export function assertScalable(server: Server): void {
  if (server.gameType !== "custom") throw fail("Scaling is for websites, APIs and bots (Custom servers). Players of a game connect to one server, so games are not scaled this way.");
}

/** Порты, занятые копиями и опубликованными базами, — чтобы новые серверы их не получили. */
export async function reservedPorts(): Promise<Set<number>> {
  const ports = new Set<number>();
  for (const server of await storage.getAllServers()) {
    for (const r of getScaling(server).replicas) ports.add(r.port);
    const db = getServerDatabase(server);
    if (db?.publishedPort) ports.add(db.publishedPort);
  }
  return ports;
}

async function allocatePort(): Promise<number> {
  const reserved = await reservedPorts();
  for (let port = REPLICA_PORT_START; port < 65000; port += 1) {
    if (!reserved.has(port) && (await storage.checkPortAvailable(port))) return port;
  }
  throw fail("No free ports for a new copy", 409);
}

async function nodeOf(id: string): Promise<Node> {
  const node = await storage.getNode(id);
  if (!node) throw fail("Node not found", 404);
  return node;
}

/** Адрес, по которому до копии или базы на ноде можно достучаться с другой машины. */
function reachableHost(node: Node): string {
  const host = connectHost(node);
  if (!host) throw fail(`Set the public address of node ${node.name} on the Nodes page: copies on other machines need it to reach this node.`, 409);
  return host;
}

/** Публикует порт базы сервера, чтобы к ней могли подключаться копии. */
async function ensureSharedDatabase(server: Server): Promise<Server> {
  const db = getServerDatabase(server);
  if (!db || db.publishedPort) return server;
  const port = await allocatePort();
  const config = { ...((server.config as Record<string, any>) || {}), database: { ...db, publishedPort: port } };
  const updated = (await storage.updateServer(server.id, { config }))!;
  await ensureDatabaseContainer(updated);
  return updated;
}

/** Сервер-копия: тот же сервер, но со своим id (контейнер, том) и нодой; база подключается через databaseEnvFor. */
function replicaServer(server: Server, replica: Replica): Server {
  const config = { ...((server.config as Record<string, any>) || {}) };
  delete config.database;
  delete config.scaling;
  return { ...server, id: replica.id, nodeId: replica.nodeId, containerId: gameContainerName(replica.id), config } as Server;
}

/**
 * Подключение копии к общей базе: на машине с базой — через host.docker.internal, на других нодах — по адресу
 * ноды с базой. Те же переменные, что получает основной сервер: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DATABASE_URL.
 */
async function databaseEnvFor(server: Server, replica: Replica): Promise<string[]> {
  const db = getServerDatabase(server);
  if (!db?.publishedPort) return [];
  const host = replica.nodeId === server.nodeId ? "host.docker.internal" : reachableHost(await nodeOf(server.nodeId));
  const scheme = db.engine === "postgres" ? "postgresql" : "mysql";
  return [
    `DB_HOST=${host}`,
    `DB_PORT=${db.publishedPort}`,
    `DB_NAME=${db.name}`,
    `DB_USER=${db.user}`,
    `DB_PASSWORD=${db.password}`,
    `DATABASE_URL=${scheme}://${db.user}:${encodeURIComponent(db.password)}@${host}:${db.publishedPort}/${db.name}`,
  ];
}

async function replicaContainer(server: Server, replica: Replica, node: Node) {
  return ensureGameContainer(replicaServer(server, replica), node, { hostPort: replica.port, hostGateway: true, allowRecreateRunning: true, env: await databaseEnvFor(server, replica) });
}

/** Нода для новой копии: из разрешённых нод в сети — та, где копий этого сервера меньше всего. */
async function pickNode(server: Server, settings: ScalingSettings, requested?: string): Promise<Node> {
  const nodes = (await storage.getAllNodes()).filter((n) => n.status === "online" && (!settings.nodeIds.length || settings.nodeIds.includes(n.id)));
  if (requested) {
    const node = nodes.find((n) => n.id === requested);
    if (!node) throw fail("That node is offline or not allowed for copies");
    return node;
  }
  if (!nodes.length) throw fail("No online node is available for a copy", 409);
  const load = (id: string) => settings.replicas.filter((r) => r.nodeId === id).length + (id === server.nodeId ? 1 : 0);
  return nodes.sort((a, b) => load(a.id) - load(b.id))[0];
}

const locks = new Map<string, Promise<unknown>>();
function withLock<T>(serverId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(serverId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(serverId, next.catch(() => {}));
  return next;
}

export function addReplica(serverId: string, nodeId?: string): Promise<Replica> {
  return withLock(serverId, async () => {
    let server = await storage.getServer(serverId);
    if (!server) throw fail("Server not found", 404);
    assertScalable(server);
    const settings = getScaling(server);
    if (settings.replicas.length + 1 >= 20) throw fail("A site can have at most 20 copies");
    server = await ensureSharedDatabase(server);
    const node = await pickNode(server, settings, nodeId);
    if (node.id !== server.nodeId) reachableHost(node);
    const index = Math.max(0, ...settings.replicas.map((r) => Number(r.id.split("-r").pop()) || 0)) + 1;
    const replica: Replica = { id: `${server.id}-r${index}`, nodeId: node.id, port: await allocatePort(), createdAt: new Date().toISOString() };
    await saveScaling(server.id, { replicas: [...settings.replicas, replica] });
    try {
      const container = await replicaContainer(server, replica, node);
      await copyServerFiles(server, replicaServer(server, replica));
      if (server.status === "running") await container.start().catch((e: any) => (e?.statusCode === 304 ? undefined : Promise.reject(e)));
    } catch (error) {
      await removeReplicaResources(server, replica).catch(() => {});
      await saveScaling(server.id, { replicas: getScaling((await storage.getServer(server.id))!).replicas.filter((r) => r.id !== replica.id) });
      throw error;
    }
    await syncProxy((await storage.getServer(server.id))!).catch((e) => console.warn(`Proxy update for ${server!.name} failed:`, e.message));
    return replica;
  });
}

async function removeReplicaResources(server: Server, replica: Replica): Promise<void> {
  const node = await storage.getNode(replica.nodeId);
  if (node) await removeServerResources(replicaServer(server, replica), node, true);
}

export function removeReplica(serverId: string, replicaId: string): Promise<void> {
  return withLock(serverId, async () => {
    const server = await storage.getServer(serverId);
    if (!server) throw fail("Server not found", 404);
    const settings = getScaling(server);
    const replica = settings.replicas.find((r) => r.id === replicaId);
    if (!replica) throw fail("Copy not found", 404);
    /* Сначала копия убирается из балансировки, потом удаляется — запросы к ней не теряются. */
    const updated = await saveScaling(server.id, { replicas: settings.replicas.filter((r) => r.id !== replicaId) });
    await syncProxy(updated).catch(() => {});
    await removeReplicaResources(server, replica);
  });
}

export async function removeAllReplicas(server: Server): Promise<void> {
  for (const replica of getScaling(server).replicas) await removeReplicaResources(server, replica).catch(() => {});
}

/** Копирует текущие файлы основного сервера во все копии по очереди: остальные копии в это время обслуживают трафик. */
export function syncReplicaFiles(serverId: string): Promise<number> {
  return withLock(serverId, async () => {
    const server = await storage.getServer(serverId);
    if (!server) throw fail("Server not found", 404);
    const { replicas } = getScaling(server);
    for (const replica of replicas) {
      const node = await nodeOf(replica.nodeId);
      const container = await replicaContainer(server, replica, node);
      const running = (await container.inspect()).State?.Running;
      if (running) await container.stop({ t: 10 }).catch(() => {});
      await copyServerFiles(server, replicaServer(server, replica));
      if (running || server.status === "running") await container.start().catch(() => {});
    }
    return replicas.length;
  });
}

/* Состояние копий и загрузка CPU */

export interface ReplicaState extends Replica {
  nodeName: string;
  address: string;
  running: boolean;
  /** Загрузка CPU в % от лимита сервера. */
  cpu: number | null;
}

async function containerCpuOfNode(node: Node, name: string): Promise<{ running: boolean; cpu: number | null }> {
  try {
    const container = dockerManager.getDockerClient(node).getContainer(name);
    const info = await container.inspect();
    if (!info.State?.Running) return { running: false, cpu: null };
    const stats: any = await container.stats({ stream: false });
    const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage ?? 0) - (stats.precpu_stats?.cpu_usage?.total_usage ?? 0);
    const systemDelta = (stats.cpu_stats?.system_cpu_usage ?? 0) - (stats.precpu_stats?.system_cpu_usage ?? 0);
    return { running: true, cpu: systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0 };
  } catch {
    return { running: false, cpu: null };
  }
}

export async function replicaStates(server: Server): Promise<ReplicaState[]> {
  return Promise.all(
    getScaling(server).replicas.map(async (replica) => {
      const node = await storage.getNode(replica.nodeId);
      const state = node ? await containerCpuOfNode(node, gameContainerName(replica.id)) : { running: false, cpu: null };
      return {
        ...replica,
        nodeName: node?.name ?? "missing node",
        address: `${node ? (connectHost(node) ?? node.ip) : "?"}:${replica.port}`,
        running: state.running,
        cpu: state.cpu === null ? null : Math.round((state.cpu / Math.max(server.cpuLimit, 1)) * 1000) / 10,
      };
    }),
  );
}

export async function updateScalingSettings(serverId: string, input: Omit<ScalingSettings, "replicas">): Promise<Server> {
  const server = await storage.getServer(serverId);
  if (!server) throw fail("Server not found", 404);
  assertScalable(server);
  if (input.min < 1 || input.max < input.min || input.max > 20) throw fail("Copies: at least 1, at most 20, and the maximum not below the minimum");
  if (input.targetCpu < 10 || input.targetCpu > 95) throw fail("CPU threshold: from 10 to 95%");
  return saveScaling(serverId, input);
}

/* Автомасштабирование */

const INTERVAL_MS = Number(process.env.SCALING_INTERVAL_MS) || 30_000;
const COOLDOWN_MS = Number(process.env.SCALING_COOLDOWN_MS) || 120_000;
const memory = new Map<string, { high: number; low: number; lastChange: number }>();

async function tick(): Promise<void> {
  for (const server of await storage.getAllServers()) {
    const settings = getScaling(server);
    if (!settings.replicas.length && !settings.autoscale) continue;
    try {
      await reconcile(server, settings);
    } catch (error) {
      console.warn(`Scaling of ${server.name} failed:`, (error as Error).message);
    }
  }
}

async function reconcile(server: Server, settings: ScalingSettings): Promise<void> {
  const states = await replicaStates(server);
  const primaryRunning = server.status === "running";

  /* Копии работают вместе с основным сервером: остановлен он — останавливаются и они. Упавшие копии запускаются снова. */
  for (const state of states) {
    const node = await storage.getNode(state.nodeId);
    if (!node || node.status !== "online") continue;
    const container = dockerManager.getDockerClient(node).getContainer(gameContainerName(state.id));
    if (primaryRunning && !state.running) await container.start().catch(() => {});
    if (!primaryRunning && state.running) await container.stop({ t: 10 }).catch(() => {});
  }
  if (!primaryRunning || !settings.autoscale) return;

  const total = settings.replicas.length + 1;
  if (total < settings.min) {
    await addReplica(server.id);
    return;
  }
  const primaryCpu = storage.getServerStats(server.id)?.cpuUsage;
  const loads = [primaryCpu === undefined ? null : (primaryCpu / Math.max(server.cpuLimit, 1)) * 100, ...states.map((s) => s.cpu)].filter((v): v is number => v !== null);
  if (!loads.length) return;
  const average = loads.reduce((a, b) => a + b, 0) / loads.length;
  const m = memory.get(server.id) ?? { high: 0, low: 0, lastChange: 0 };
  m.high = average >= settings.targetCpu ? m.high + 1 : 0;
  m.low = average < settings.targetCpu * 0.4 ? m.low + 1 : 0;
  memory.set(server.id, m);
  if (Date.now() - m.lastChange < COOLDOWN_MS) return;

  if (m.high >= 2 && total < settings.max) {
    const replica = await addReplica(server.id);
    m.lastChange = Date.now();
    m.high = 0;
    notify("server_recovered", `${server.name}: added a copy`, `Average CPU ${average.toFixed(0)}% ≥ ${settings.targetCpu}%. Copies: ${total + 1}.`, `scale-up:${server.id}`, 60_000);
    await storage.addActivity({ type: "server_update", title: "Site Scaled Up", description: `${server.name}: copy ${replica.id.split("-r").pop()} added, CPU ${average.toFixed(0)}%`, timestamp: new Date() });
  } else if (m.low >= 4 && total > settings.min && settings.replicas.length > 0) {
    const last = settings.replicas[settings.replicas.length - 1];
    await removeReplica(server.id, last.id);
    m.lastChange = Date.now();
    m.low = 0;
    await storage.addActivity({ type: "server_update", title: "Site Scaled Down", description: `${server.name}: copy ${last.id.split("-r").pop()} removed, CPU ${average.toFixed(0)}%`, timestamp: new Date() });
  }
}

let timer: NodeJS.Timeout | null = null;
let running = false;
export function startAutoscaler(): void {
  if (timer) return;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } finally {
      running = false;
    }
  }, INTERVAL_MS);
  timer.unref();
}

/** Есть ли у сервера балансировка: домен и хотя бы одна копия. */
export const isBalanced = (server: Server) => getServerDomains(server.id).length > 0 && getScaling(server).replicas.length > 0;
