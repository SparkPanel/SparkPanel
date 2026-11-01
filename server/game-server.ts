import type Docker from "dockerode";
import type { Container, ContainerCreateOptions } from "dockerode";
import { createHash } from "crypto";
import { posix } from "path";
import type { Readable, Writable } from "stream";
import type { Node, Server, SftpUser } from "@shared/schema";
import { dockerManager } from "./docker-manager";
import { storage } from "./storage";
import { buildGameSpec, getCrashRestart, nanoCpusFor } from "./game-templates";
import { ensureServerSecrets } from "./server-secrets";
import { databaseEnv, ensureDatabaseContainer, getServerDatabase, removeDatabaseResources, serverNetworkName } from "./server-database";
import {
  buildImageFromFiles,
  ensureImage,
  ensureVolume,
  execChecked,
  execInContainer,
  passThrough,
  removeContainerQuietly,
} from "./container-utils";

export const COMPANION_IMAGE = "sparkpanel/companion:2";
const COMPANION_DATA = "/srv/data";
const VIRTUAL_ROOT = "/data";

export const gameContainerName = (serverId: string) => `sparkpanel-${serverId}`;
export const companionName = (serverId: string) => `sparkpanel-companion-${serverId}`;
export const volumeName = (serverId: string) => `sparkpanel-${serverId}-data`;

/* ------------------------------------------------------------------ */
/* Пути файлового менеджера                                            */
/* ------------------------------------------------------------------ */

/**
 * Нормализует путь файлового менеджера. Все пути виртуальные и начинаются с /data —
 * это корень тома сервера. Выход за пределы корня невозможен.
 */
export function normalizeVirtualPath(input: string | undefined | null): string {
  const raw = String(input ?? "").replace(/\\/g, "/").trim();
  if (raw.includes("\0")) throw new Error("Invalid path");
  const withRoot = raw.startsWith("/") ? raw : `${VIRTUAL_ROOT}/${raw}`;
  const normalized = posix.normalize(withRoot).replace(/\/+$/, "") || "/";
  if (normalized !== VIRTUAL_ROOT && !normalized.startsWith(`${VIRTUAL_ROOT}/`)) {
    throw new Error("Path must be inside /data");
  }
  if (normalized.length > 1024) throw new Error("Path is too long");
  return normalized;
}

function toCompanionPath(virtualPath: string): string {
  return COMPANION_DATA + virtualPath.slice(VIRTUAL_ROOT.length);
}

export function validateFileName(name: string): string {
  const trimmed = String(name ?? "").trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || /[\/\\\0]/.test(trimmed) || trimmed.length > 255) {
    throw new Error("Invalid file name");
  }
  return trimmed;
}

/* ------------------------------------------------------------------ */
/* Игровой контейнер                                                   */
/* ------------------------------------------------------------------ */

async function getServerNode(server: Server): Promise<Node> {
  const node = await storage.getNode(server.nodeId);
  if (!node) throw new Error("Node not found");
  return node;
}

/**
 * Автоперезапуск при падении — политика Docker on-failure с лимитом попыток (Docker поднимает контейнер,
 * только если процесс завершился с ошибкой). Иначе «Auto Start» — unless-stopped, чтобы сервер поднимался
 * после перезагрузки машины.
 */
function restartPolicyFor(server: Server): { Name: string; MaximumRetryCount?: number } {
  const crash = getCrashRestart(server);
  if (crash.enabled) return { Name: "on-failure", MaximumRetryCount: crash.maxAttempts };
  return server.autoStart ? { Name: "unless-stopped" } : { Name: "no" };
}

/**
 * Дополнительные параметры контейнера для копий сайта при масштабировании: внешний порт отличается от порта
 * внутри контейнера (приложение слушает тот же порт, что и основной сервер), а адрес host.docker.internal
 * ведёт на машину, где опубликован порт общей базы.
 */
export interface ContainerExtras {
  hostPort?: number;
  hostGateway?: boolean;
  /** Переменные, которые задаёт панель (подключение копии к общей базе); пользовательские их не перекрывают. */
  env?: string[];
}

async function buildGameContainerOptions(server: Server, node: Node, extras: ContainerExtras = {}): Promise<{ options: ContainerCreateOptions; hash: string }> {
  const spec = buildGameSpec(server);
  const extraPorts = await storage.getPortsByServer(server.id);

  const exposed: Record<string, {}> = {};
  const bindings: Record<string, { HostPort: string }[]> = {};
  const addPort = (port: number, protocol: string, hostPort = port) => {
    const key = `${port}/${protocol === "udp" ? "udp" : "tcp"}`;
    exposed[key] = {};
    bindings[key] = [{ HostPort: String(hostPort) }];
  };
  const shift = extras.hostPort !== undefined ? extras.hostPort - server.port : 0;
  spec.ports.forEach((p) => addPort(p.port, p.protocol, p.port + shift));
  if (!shift) extraPorts.forEach((p) => addPort(p.port, p.protocol));

  const options: ContainerCreateOptions = {
    name: gameContainerName(server.id),
    Image: spec.image,
    Env: [...spec.env, ...databaseEnv(server), ...(extras.env ?? [])],
    Cmd: spec.cmd,
    Entrypoint: spec.entrypoint,
    WorkingDir: spec.workingDir,
    ExposedPorts: exposed,
    OpenStdin: true,
    StdinOnce: false,
    AttachStdin: false,
    Tty: false,
    StopTimeout: 30,
    Labels: {
      "sparkpanel.managed": "true",
      "sparkpanel.server-id": server.id,
      "sparkpanel.role": "game",
    },
    HostConfig: {
      Binds: [`${volumeName(server.id)}:${spec.dataDir}`],
      PortBindings: bindings,
      Memory: Math.max(server.ramLimit, 1) * 1024 * 1024 * 1024,
      NanoCpus: nanoCpusFor(server, node),
      RestartPolicy: restartPolicyFor(server),
      LogConfig: { Type: "json-file", Config: { "max-size": "20m", "max-file": "3" } },
      ...(getServerDatabase(server) ? { NetworkMode: serverNetworkName(server.id) } : {}),
      ...(extras.hostGateway ? { ExtraHosts: ["host.docker.internal:host-gateway"] } : {}),
    },
  };

  const hash = createHash("sha256").update(JSON.stringify(options)).digest("hex").slice(0, 16);
  options.Labels!["sparkpanel.config-hash"] = hash;
  return { options, hash };
}

const containerLocks = new Map<string, Promise<unknown>>();

/** Сериализует операции с контейнером одного сервера (создание, пересоздание, удаление). */
function withContainerLock<T>(serverId: string, fn: () => Promise<T>): Promise<T> {
  const previous = containerLocks.get(serverId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  containerLocks.set(serverId, next);
  next.finally(() => {
    if (containerLocks.get(serverId) === next) containerLocks.delete(serverId);
  }).catch(() => {});
  return next;
}

/**
 * Гарантирует наличие актуального контейнера: создаёт том, тянет образ и пересоздаёт контейнер,
 * если конфигурация сервера (образ, порты, лимиты, команда) изменилась. Данные в томе сохраняются.
 */
export function ensureGameContainer(server: Server, node: Node, opts: { allowRecreateRunning?: boolean } & ContainerExtras = {}): Promise<Container> {
  return withContainerLock(server.id, async () => ensureGameContainerInner((await storage.getServer(server.id)) ?? server, node, opts));
}

async function ensureGameContainerInner(server: Server, node: Node, opts: { allowRecreateRunning?: boolean } & ContainerExtras): Promise<Container> {
  const docker = dockerManager.getDockerClient(node);
  const { options, hash } = await buildGameContainerOptions(server, node, opts);
  await ensureVolume(docker, volumeName(server.id), { "sparkpanel.server-id": server.id });
  await ensureCompanion(server, node).catch((err) => console.warn(`Companion for ${server.id} not ready:`, err.message));

  const imageId = await localImageId(docker, options.Image!);
  const candidates = [server.containerId, gameContainerName(server.id)].filter(Boolean) as string[];
  for (const id of candidates) {
    try {
      const container = docker.getContainer(id);
      const info = await container.inspect();
      const sameConfig = info.Config?.Labels?.["sparkpanel.config-hash"] === hash && (!imageId || info.Image === imageId);
      if (sameConfig) {
        if (server.containerId !== info.Id) await storage.updateServer(server.id, { containerId: info.Id });
        return container;
      }
      if (info.State?.Running && !opts.allowRecreateRunning) {
        return container;
      }
      await container.remove({ force: true });
      break;
    } catch (error: any) {
      if (error?.statusCode !== 404) throw error;
    }
  }

  await ensureImage(docker, options.Image!);
  const container = await docker.createContainer(options);
  await storage.updateServer(server.id, { containerId: container.id });
  return container;
}

async function localImageId(docker: Docker, image: string): Promise<string | null> {
  try {
    return (await docker.getImage(image).inspect()).Id;
  } catch {
    return null;
  }
}

export async function hasPendingConfigChanges(server: Server): Promise<boolean> {
  if (!server.containerId) return false;
  const node = await getServerNode(server);
  const { hash, options } = await buildGameContainerOptions(server, node);
  try {
    const docker = dockerManager.getDockerClient(node);
    const info = await docker.getContainer(server.containerId).inspect();
    const imageId = await localImageId(docker, options.Image!);
    return info.Config?.Labels?.["sparkpanel.config-hash"] !== hash || Boolean(imageId && info.Image !== imageId);
  } catch {
    return false;
  }
}

/**
 * Скачивает свежую версию образа сервера (тот же тег, например :latest или java21).
 * Контейнер пересоздаётся с ней при следующем запуске; файлы сервера в томе не затрагиваются.
 * Возвращает true, если образ действительно обновился.
 */
export async function pullLatestImage(server: Server): Promise<boolean> {
  const node = await getServerNode(server);
  const docker = dockerManager.getDockerClient(node);
  const { image } = buildGameSpec(server);
  const before = await localImageId(docker, image);
  await ensureImage(docker, image, true);
  return (await localImageId(docker, image)) !== before;
}

export async function startGameServer(server: Server): Promise<void> {
  const node = await getServerNode(server);
  server = await ensureServerSecrets(server);
  await ensureDatabaseContainer(server);
  const container = await ensureGameContainer(server, node, { allowRecreateRunning: false });
  const info = await container.inspect();
  if (!info.State?.Running) {
    await container.start();
  }
  await storage.updateServer(server.id, { status: "running" });
}

export async function stopGameServer(server: Server): Promise<void> {
  const node = await getServerNode(server);
  if (!server.containerId) {
    await storage.updateServer(server.id, { status: "stopped" });
    return;
  }
  const container = await dockerManager.getContainer(node, server.containerId);
  try {
    await container.stop({ t: 30 });
  } catch (error: any) {
    if (error?.statusCode === 404) {
      await storage.updateServer(server.id, { containerId: null, status: "stopped" });
      return;
    }
    if (error?.statusCode !== 304) throw error;
  }
  await storage.updateServer(server.id, { status: "stopped" });
}

export async function restartGameServer(server: Server): Promise<void> {
  await stopGameServer(server);
  const fresh = (await storage.getServer(server.id)) ?? server;
  await startGameServer(fresh);
}

export async function killGameServer(server: Server): Promise<void> {
  const node = await getServerNode(server);
  if (!server.containerId) return;
  try {
    await (await dockerManager.getContainer(node, server.containerId)).kill();
  } catch (error: any) {
    if (error?.statusCode !== 409 && error?.statusCode !== 404) throw error;
  }
  await storage.updateServer(server.id, { status: "stopped" });
}

/** Удаляет все Docker-ресурсы сервера: игровой контейнер, вспомогательный контейнер и (опционально) том. */
export function removeServerResources(server: Server, node: Node, removeVolume = true): Promise<void> {
  return withContainerLock(server.id, () => removeServerResourcesInner(server, node, removeVolume));
}

async function removeServerResourcesInner(server: Server, node: Node, removeVolume: boolean): Promise<void> {
  const docker = dockerManager.getDockerClient(node);
  if (server.containerId) await removeContainerQuietly(docker, server.containerId);
  await removeContainerQuietly(docker, gameContainerName(server.id));
  await removeContainerQuietly(docker, companionName(server.id));
  if (removeVolume && getServerDatabase(server)) await removeDatabaseResources(server);
  if (removeVolume) {
    try {
      await docker.getVolume(volumeName(server.id)).remove();
    } catch (error: any) {
      if (error?.statusCode !== 404) console.warn(`Failed to remove volume for ${server.id}:`, error?.message);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Вспомогательный контейнер (файлы, бэкапы, SFTP)                     */
/* ------------------------------------------------------------------ */

const COMPANION_DOCKERFILE = `FROM alpine:3.20
RUN apk add --no-cache openssh-server openssh-sftp-server coreutils findutils tar gzip zip unzip git ca-certificates \\
 && git config --system --add safe.directory '*' \\
 && ssh-keygen -A \\
 && mkdir -p ${COMPANION_DATA} \\
 && cp /etc/passwd /etc/passwd.base \\
 && cp /etc/shadow /etc/shadow.base
COPY sshd_config /etc/ssh/sshd_config
COPY sync-users.sh /usr/local/bin/sync-users
RUN chmod +x /usr/local/bin/sync-users
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
`;

const COMPANION_SSHD_CONFIG = `Port 22
PermitRootLogin yes
PasswordAuthentication yes
KbdInteractiveAuthentication no
PermitEmptyPasswords no
ChrootDirectory /srv
ForceCommand internal-sftp -u 002
AllowTcpForwarding no
AllowAgentForwarding no
X11Forwarding no
PermitTunnel no
Subsystem sftp internal-sftp
`;

const COMPANION_SYNC_SCRIPT = `#!/bin/sh
set -e
OWNER_UID=$(stat -c %u ${COMPANION_DATA})
OWNER_GID=$(stat -c %g ${COMPANION_DATA})
cp /etc/passwd.base /etc/passwd.new
cp /etc/shadow.base /etc/shadow.new
while read -r name hash home active; do
  [ -z "$name" ] && continue
  [ "$active" = "1" ] || hash="!$hash"
  echo "$name:x:$OWNER_UID:$OWNER_GID::$home:/sbin/nologin" >> /etc/passwd.new
  echo "$name:$hash:19000:0:99999:7:::" >> /etc/shadow.new
done
chmod 640 /etc/shadow.new
mv /etc/passwd.new /etc/passwd
mv /etc/shadow.new /etc/shadow
`;

const companionImageReady = new Map<string, Promise<void>>();

async function ensureCompanionImage(docker: Docker, nodeId: string): Promise<void> {
  if (!companionImageReady.has(nodeId)) {
    const task = (async () => {
      try {
        await docker.getImage(COMPANION_IMAGE).inspect();
      } catch {
        await buildImageFromFiles(docker, COMPANION_IMAGE, {
          Dockerfile: COMPANION_DOCKERFILE,
          sshd_config: COMPANION_SSHD_CONFIG,
          "sync-users.sh": COMPANION_SYNC_SCRIPT,
        });
      }
    })();
    companionImageReady.set(nodeId, task);
    task.catch(() => companionImageReady.delete(nodeId));
  }
  return companionImageReady.get(nodeId)!;
}

function sftpPortOf(server: Server): number | null {
  const port = Number((server.config as Record<string, any>)?.sftpPort);
  return Number.isInteger(port) && port > 0 ? port : null;
}

const companionLocks = new Map<string, Promise<Container>>();

/**
 * Возвращает запущенный вспомогательный контейнер сервера (Alpine + sshd), смонтированный к тому данных.
 * Через него работают файловый менеджер, бэкапы, подсчёт места и SFTP — независимо от того,
 * запущен ли игровой сервер и есть ли в игровом образе оболочка.
 */
export function ensureCompanion(server: Server, node: Node): Promise<Container> {
  const pending = companionLocks.get(server.id);
  if (pending) return pending;
  const task = ensureCompanionInner(server, node).finally(() => companionLocks.delete(server.id));
  companionLocks.set(server.id, task);
  return task;
}

async function ensureCompanionInner(server: Server, node: Node): Promise<Container> {
  const docker = dockerManager.getDockerClient(node);
  const name = companionName(server.id);
  const sftpPort = sftpPortOf(server);
  const wantedBinding = sftpPort ? String(sftpPort) : "";

  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    const currentBinding = info.HostConfig?.PortBindings?.["22/tcp"]?.[0]?.HostPort ?? "";
    if (currentBinding === wantedBinding && info.Config?.Image === COMPANION_IMAGE) {
      if (!info.State?.Running) await container.start();
      return container;
    }
    await container.remove({ force: true });
  } catch (error: any) {
    if (error?.statusCode !== 404) throw error;
  }

  await ensureVolume(docker, volumeName(server.id), { "sparkpanel.server-id": server.id });
  await ensureCompanionImage(docker, node.id);

  const container = await docker.createContainer({
    name,
    Image: COMPANION_IMAGE,
    Labels: {
      "sparkpanel.managed": "true",
      "sparkpanel.server-id": server.id,
      "sparkpanel.role": "companion",
    },
    ExposedPorts: { "22/tcp": {} },
    HostConfig: {
      Binds: [`${volumeName(server.id)}:${COMPANION_DATA}`],
      PortBindings: sftpPort ? { "22/tcp": [{ HostPort: String(sftpPort) }] } : {},
      RestartPolicy: { Name: "unless-stopped" },
      Memory: 128 * 1024 * 1024,
      NanoCpus: 5e8,
    },
  });
  await container.start();

  const { dataUid } = buildGameSpec(server);
  const listing = await execInContainer(container, ["find", COMPANION_DATA, "-mindepth", "1", "-maxdepth", "1", "-print", "-quit"]);
  if (!listing.stdout.toString().trim() && dataUid !== 0) {
    await execInContainer(container, ["chown", `${dataUid}:${dataUid}`, COMPANION_DATA]);
  }

  await syncSftpUsersInto(container, await storage.getSftpUsersByServer(server.id));
  return container;
}

async function syncSftpUsersInto(container: Container, users: SftpUser[]): Promise<void> {
  const lines = users
    .map((user) => {
      const home = normalizeVirtualPath(user.homeDirectory || VIRTUAL_ROOT);
      return `${user.username} ${user.password} ${home} ${user.isActive ? 1 : 0}`;
    })
    .join("\n");
  await execChecked(container, ["/usr/local/bin/sync-users"], { stdin: lines + "\n", timeoutMs: 15000 });
}

async function allocateSftpPort(server: Server): Promise<number> {
  const servers = await storage.getAllServers();
  const used = new Set<number>();
  for (const s of servers) {
    used.add(s.port);
    const p = sftpPortOf(s);
    if (p && s.id !== server.id) used.add(p);
    for (const extra of await storage.getPortsByServer(s.id)) used.add(extra.port);
  }
  const base = Number(process.env.SFTP_PORT_START) || 2022;
  for (let port = base; port < base + 5000; port += 1) {
    if (!used.has(port)) return port;
  }
  throw new Error("No free SFTP port available");
}

/**
 * Применяет список SFTP-пользователей из БД к вспомогательному контейнеру.
 * При первом пользователе выделяет порт SFTP и публикует его на ноде.
 */
export async function syncSftp(server: Server): Promise<{ port: number | null }> {
  const node = await getServerNode(server);
  const users = await storage.getSftpUsersByServer(server.id);
  let current = server;
  if (users.length > 0 && !sftpPortOf(server)) {
    const port = await allocateSftpPort(server);
    const config = { ...((server.config as Record<string, any>) || {}), sftpPort: port };
    current = (await storage.updateServer(server.id, { config })) ?? { ...server, config };
  }
  const container = await ensureCompanion(current, node);
  await syncSftpUsersInto(container, users);
  return { port: sftpPortOf(current) };
}

/* ------------------------------------------------------------------ */
/* Файловый менеджер                                                   */
/* ------------------------------------------------------------------ */

export interface ListedFile {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: number;
}

async function companionFor(server: Server): Promise<{ container: Container; node: Node }> {
  const node = await getServerNode(server);
  const container = await ensureCompanion(server, node);
  return { container, node };
}

async function fixOwnership(container: Container, companionPath: string): Promise<void> {
  const owner = (await execInContainer(container, ["stat", "-c", "%u:%g", COMPANION_DATA])).stdout.toString().trim();
  if (owner && owner !== "0:0") {
    await execInContainer(container, ["chown", "-R", owner, companionPath]);
  }
}

/**
 * Выполняет команду во вспомогательном контейнере сервера в папке его данных
 * и возвращает файлам владельца, которого ожидает игровой образ.
 */
export async function execInServerFiles(server: Server, cmd: string[], options: { stdin?: string; timeoutMs?: number; env?: string[] } = {}) {
  const { container } = await companionFor(server);
  const result = await execInContainer(container, cmd, { ...options, workingDir: COMPANION_DATA });
  await fixOwnership(container, COMPANION_DATA);
  return result;
}

export async function listFiles(server: Server, virtualPath: string): Promise<ListedFile[]> {
  const dir = normalizeVirtualPath(virtualPath);
  const { container } = await companionFor(server);
  const result = await execInContainer(
    container,
    ["find", toCompanionPath(dir), "-mindepth", "1", "-maxdepth", "1", "-printf", "%y\\t%s\\t%T@\\t%f\\0"],
    { timeoutMs: 20000 },
  );
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().includes("No such file") ? "Directory not found" : result.stderr.toString().trim() || "Failed to list files");
  }
  const files: ListedFile[] = [];
  for (const entry of result.stdout.toString("utf-8").split("\0")) {
    if (!entry) continue;
    const [kind, size, mtime, ...nameParts] = entry.split("\t");
    const name = nameParts.join("\t");
    if (!name) continue;
    files.push({
      name,
      path: dir === "/" ? `/${name}` : `${dir}/${name}`,
      type: kind === "d" ? "directory" : "file",
      size: Number(size) || 0,
      modified: Math.round((Number(mtime) || 0) * 1000),
    });
  }
  files.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));
  return files;
}

export async function writeFileStream(server: Server, virtualDir: string, fileName: string, input: Readable): Promise<string> {
  const dir = normalizeVirtualPath(virtualDir);
  const target = normalizeVirtualPath(`${dir}/${validateFileName(fileName)}`);
  const { container } = await companionFor(server);
  const companionTarget = toCompanionPath(target);
  await execChecked(container, ["mkdir", "-p", toCompanionPath(dir)]);
  await execChecked(container, ["sh", "-c", 'cat > "$1"', "sh", companionTarget], { stdin: input, timeoutMs: 10 * 60 * 1000 });
  await fixOwnership(container, companionTarget);
  return target;
}

export async function readFileStream(server: Server, virtualPath: string, output: Writable): Promise<void> {
  const target = normalizeVirtualPath(virtualPath);
  const { container } = await companionFor(server);
  const companionTarget = toCompanionPath(target);
  const check = await execInContainer(container, ["test", "-f", companionTarget]);
  if (check.exitCode !== 0) throw new Error("File not found");
  await execChecked(container, ["cat", companionTarget], { stdout: output, timeoutMs: 30 * 60 * 1000 });
}

export async function readTextFile(server: Server, virtualPath: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const target = normalizeVirtualPath(virtualPath);
  const { container } = await companionFor(server);
  const companionTarget = toCompanionPath(target);
  const size = Number((await execChecked(container, ["stat", "-c", "%s", companionTarget])).stdout.toString().trim());
  if (size > maxBytes) throw new Error("File is too large to edit in the browser");
  return (await execChecked(container, ["cat", companionTarget])).stdout.toString("utf-8");
}

export async function writeTextFile(server: Server, virtualPath: string, content: string): Promise<void> {
  const target = normalizeVirtualPath(virtualPath);
  const { container } = await companionFor(server);
  const companionTarget = toCompanionPath(target);
  await execChecked(container, ["sh", "-c", 'cat > "$1"', "sh", companionTarget], { stdin: content });
  await fixOwnership(container, companionTarget);
}

export async function makeDirectory(server: Server, virtualDir: string, name: string): Promise<string> {
  const target = normalizeVirtualPath(`${normalizeVirtualPath(virtualDir)}/${validateFileName(name)}`);
  const { container } = await companionFor(server);
  await execChecked(container, ["mkdir", "-p", toCompanionPath(target)]);
  await fixOwnership(container, toCompanionPath(target));
  return target;
}

export async function renamePath(server: Server, fromPath: string, newName: string): Promise<string> {
  const from = normalizeVirtualPath(fromPath);
  if (from === VIRTUAL_ROOT) throw new Error("Cannot rename the root directory");
  const to = normalizeVirtualPath(`${posix.dirname(from)}/${validateFileName(newName)}`);
  const { container } = await companionFor(server);
  await execChecked(container, ["mv", "-n", "--", toCompanionPath(from), toCompanionPath(to)]);
  return to;
}

export async function removePath(server: Server, virtualPath: string): Promise<void> {
  const target = normalizeVirtualPath(virtualPath);
  if (target === VIRTUAL_ROOT) throw new Error("Cannot delete the root directory");
  const { container } = await companionFor(server);
  await execChecked(container, ["rm", "-rf", "--", toCompanionPath(target)]);
}

/** Упаковывает выбранные файлы и папки одной директории в zip-архив рядом с ними. */
export async function compressPaths(server: Server, virtualDir: string, names: string[], archiveName: string): Promise<string> {
  const dir = normalizeVirtualPath(virtualDir);
  if (names.length === 0) throw new Error("Select files to compress");
  const entries = names.map((name) => `./${validateFileName(name)}`);
  const fileName = validateFileName(archiveName.toLowerCase().endsWith(".zip") ? archiveName : `${archiveName}.zip`);
  const target = normalizeVirtualPath(`${dir}/${fileName}`);
  const { container } = await companionFor(server);
  if ((await execInContainer(container, ["test", "-e", toCompanionPath(target)])).exitCode === 0) {
    throw new Error(`${fileName} already exists`);
  }
  await execChecked(container, ["zip", "-r", "-q", "-y", `./${fileName}`, ...entries], { workingDir: toCompanionPath(dir), timeoutMs: 30 * 60 * 1000 });
  await fixOwnership(container, toCompanionPath(target));
  return target;
}

const ARCHIVE_PATTERN = /\.(zip|tar|tar\.gz|tgz)$/i;

/** Распаковывает архив (.zip, .tar, .tar.gz, .tgz) в папку, где он лежит. Существующие файлы заменяются. */
export async function extractArchive(server: Server, virtualPath: string): Promise<string> {
  const target = normalizeVirtualPath(virtualPath);
  const name = posix.basename(target).toLowerCase();
  if (!ARCHIVE_PATTERN.test(name)) throw new Error("Only .zip, .tar, .tar.gz and .tgz archives can be extracted");
  const dir = posix.dirname(target);
  const { container } = await companionFor(server);
  const archive = toCompanionPath(target);
  const dest = toCompanionPath(dir);
  if ((await execInContainer(container, ["test", "-f", archive])).exitCode !== 0) throw new Error("File not found");
  const isZip = name.endsWith(".zip");
  const cmd = isZip ? ["unzip", "-o", "-q", archive, "-d", dest] : ["tar", name.endsWith(".tar") ? "-xf" : "-xzf", archive, "-C", dest, "--no-same-owner"];
  const result = await execInContainer(container, cmd, { timeoutMs: 30 * 60 * 1000 });
  if (result.exitCode !== 0 && !(isZip && result.exitCode === 1)) {
    const message = result.stderr.toString().trim() || result.stdout.toString().trim() || `exit code ${result.exitCode}`;
    throw new Error(`Archive not extracted: ${message.split("\n").slice(-2).join(" ")}`);
  }
  await fixOwnership(container, dest);
  return dir;
}

const SEARCH_LIMIT = 200;

/** Ищет файлы и папки по части имени (без учёта регистра) внутри директории и её подпапок. */
export async function searchFiles(server: Server, virtualDir: string, query: string): Promise<{ files: ListedFile[]; truncated: boolean }> {
  const dir = normalizeVirtualPath(virtualDir);
  const text = query.trim();
  if (text.length < 2) throw new Error("Type at least 2 characters");
  if (text.length > 100) throw new Error("Search text is too long");
  const pattern = `*${text.replace(/[*?[\]\\]/g, "\\$&")}*`;
  const { container } = await companionFor(server);
  const result = await execInContainer(
    container,
    ["sh", "-c", 'find "$1" -mindepth 1 -iname "$2" -printf "%y\\t%s\\t%T@\\t%P\\0" 2>/dev/null | head -z -n "$3"', "sh", toCompanionPath(dir), pattern, String(SEARCH_LIMIT + 1)],
    { timeoutMs: 30000 },
  );
  const files: ListedFile[] = [];
  for (const entry of result.stdout.toString("utf-8").split("\0")) {
    if (!entry) continue;
    const [kind, size, mtime, ...rest] = entry.split("\t");
    const relative = rest.join("\t");
    if (!relative) continue;
    files.push({
      name: relative,
      path: dir === "/" ? `/${relative}` : `${dir}/${relative}`,
      type: kind === "d" ? "directory" : "file",
      size: Number(size) || 0,
      modified: Math.round((Number(mtime) || 0) * 1000),
    });
  }
  return { files: files.slice(0, SEARCH_LIMIT), truncated: files.length > SEARCH_LIMIT };
}

/** Занятое место в томе сервера (байты). */
export async function getVolumeUsage(server: Server): Promise<number> {
  const { container } = await companionFor(server);
  const result = await execInContainer(container, ["du", "-sb", COMPANION_DATA], { timeoutMs: 60000 });
  return Number(result.stdout.toString().split(/\s+/)[0]) || 0;
}

/* ------------------------------------------------------------------ */
/* Архивы (бэкапы и миграция)                                          */
/* ------------------------------------------------------------------ */

/** Пишет tar.gz всего тома в поток. */
export async function archiveVolume(server: Server, output: Writable): Promise<void> {
  const { container } = await companionFor(server);
  await execChecked(container, ["tar", "-czf", "-", "-C", COMPANION_DATA, "."], { stdout: output, timeoutMs: 6 * 60 * 60 * 1000 });
}

/** Полностью заменяет содержимое тома архивом tar.gz из потока. */
export async function restoreVolume(server: Server, input: Readable): Promise<void> {
  const { container } = await companionFor(server);
  await execChecked(container, ["find", COMPANION_DATA, "-mindepth", "1", "-delete"], { timeoutMs: 10 * 60 * 1000 });
  await execChecked(container, ["tar", "-xzf", "-", "-C", COMPANION_DATA], { stdin: input, timeoutMs: 6 * 60 * 60 * 1000 });
}

/** Копирует все файлы одного сервера в другой (содержимое целевого тома заменяется). Ноды могут быть разными. */
export async function copyServerFiles(source: Server, target: Server): Promise<void> {
  const pipe = passThrough();
  await Promise.all([archiveVolume(source, pipe).then(() => pipe.end(), (error) => { pipe.destroy(error); throw error; }), restoreVolume(target, pipe)]);
  const { container } = await companionFor(target);
  await fixOwnership(container, COMPANION_DATA);
}

/**
 * Переносит сервер на другую ноду: копирует том через поток tar, создаёт контейнеры на целевой ноде
 * и (если keepSource=false) удаляет ресурсы на исходной.
 */
export async function migrateServer(server: Server, targetNode: Node, keepSource: boolean): Promise<Server> {
  const sourceNode = await getServerNode(server);
  const wasRunning = server.status === "running";
  await stopGameServer(server).catch(() => {});

  const sourceCompanion = await ensureCompanion(server, sourceNode);
  const targetServer: Server = { ...server, nodeId: targetNode.id, containerId: null };
  const targetCompanion = await ensureCompanion(targetServer, targetNode);

  const pipe = passThrough();
  await execChecked(targetCompanion, ["find", COMPANION_DATA, "-mindepth", "1", "-delete"]);
  await Promise.all([
    execChecked(sourceCompanion, ["tar", "-czf", "-", "-C", COMPANION_DATA, "."], { stdout: pipe, timeoutMs: 6 * 60 * 60 * 1000 }).then(() => pipe.end()),
    execChecked(targetCompanion, ["tar", "-xzf", "-", "-C", COMPANION_DATA], { stdin: pipe, timeoutMs: 6 * 60 * 60 * 1000 }),
  ]);

  const updated = (await storage.updateServer(server.id, { nodeId: targetNode.id, containerId: null, status: "stopped" }))!;
  if (!keepSource) {
    await removeServerResources(server, sourceNode, true);
  }
  await ensureGameContainer(updated, targetNode);
  if (wasRunning) {
    await startGameServer((await storage.getServer(server.id))!);
  }
  return (await storage.getServer(server.id))!;
}
