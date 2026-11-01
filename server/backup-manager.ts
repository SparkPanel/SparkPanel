import { createReadStream, createWriteStream } from "fs";
import { stat, unlink, rm } from "fs/promises";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import type { Backup, Server } from "@shared/schema";
import { storage } from "./storage";
import { dataPath, ensureDir } from "./data-dir";
import { archiveVolume, restoreVolume, startGameServer, stopGameServer } from "./game-server";
import { notify } from "./notifier";
import { deleteObject, downloadObject, getBackupStorage, remoteBackupKey, uploadObject } from "./s3-storage";
import type { Readable } from "stream";

const BACKUP_ROOT = ensureDir(dataPath("backups"));

function serverBackupDir(serverId: string): string {
  return ensureDir(join(BACKUP_ROOT, serverId));
}

/** Путь архива всегда должен лежать внутри каталога бэкапов панели. */
export function resolveBackupFile(backup: Backup): string {
  const file = resolve(backup.path);
  if (!file.startsWith(resolve(BACKUP_ROOT))) {
    throw new Error("Invalid backup path");
  }
  return file;
}

const runningBackups = new Set<string>();

/**
 * Создаёт архив tar.gz всего тома сервера и сохраняет его на хосте панели.
 * Старые архивы удаляются, если превышен лимит maxBackups.
 */
export async function createServerBackup(
  server: Server,
  params: { name: string; description?: string | null; createdBy?: string | null },
): Promise<Backup> {
  if (runningBackups.has(server.id)) {
    throw new Error("A backup for this server is already in progress");
  }
  runningBackups.add(server.id);
  const file = join(serverBackupDir(server.id), `${Date.now()}-${randomUUID()}.tar.gz`);
  try {
    const maxBackups = server.limits?.maxBackups;
    if (maxBackups !== undefined && maxBackups > 0) {
      const existing = (await storage.getBackupsByServer(server.id)).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      while (existing.length >= maxBackups) {
        await deleteServerBackup(existing.shift()!);
      }
    }

    const output = createWriteStream(file);
    const closed = new Promise<void>((res, rej) => {
      output.on("close", () => res());
      output.on("error", rej);
    });
    await archiveVolume(server, output);
    output.end();
    await closed;

    const { size } = await stat(file);
    const backup = await storage.createBackup({
      serverId: server.id,
      name: params.name,
      description: params.description ?? null,
      size,
      path: file,
      createdBy: params.createdBy ?? null,
    });
    await copyToRemote(server, backup, file, size);
    return backup;
  } catch (error) {
    await unlink(file).catch(() => {});
    notify("backup_failed", `Backup of ${server.name} failed`, (error as Error).message, server.id, 10 * 60_000);
    throw error;
  } finally {
    runningBackups.delete(server.id);
  }
}

/** Отправляет архив во внешнее хранилище, если оно включено. Локальная копия остаётся, пока загрузка не удалась. */
async function copyToRemote(server: Server, backup: Backup, file: string, size: number): Promise<void> {
  const remote = getBackupStorage();
  if (!remote.enabled) return;
  try {
    await uploadObject(remote, remoteBackupKey(remote, server.id, backup.id), createReadStream(file), size);
    if (!remote.keepLocal) await unlink(file);
  } catch (error) {
    notify("backup_failed", `Backup of ${server.name} was not sent to storage`, `${(error as Error).message}. The archive is kept on the panel disk.`, `${server.id}:remote`, 10 * 60_000);
  }
}

async function hasLocalFile(backup: Backup): Promise<boolean> {
  return stat(resolveBackupFile(backup)).then(
    () => true,
    () => false,
  );
}

/** Поток архива: с диска панели, а если там его нет — из внешнего хранилища. */
export async function openBackupStream(backup: Backup): Promise<Readable> {
  if (await hasLocalFile(backup)) return createReadStream(resolveBackupFile(backup));
  const remote = getBackupStorage();
  if (!remote.enabled) throw new Error("Backup archive is missing on disk");
  return downloadObject(remote, remoteBackupKey(remote, backup.serverId, backup.id));
}

/** Восстанавливает том из архива. Сервер останавливается на время восстановления и запускается снова, если работал. */
export async function restoreServerBackup(server: Server, backup: Backup): Promise<void> {
  const input = await openBackupStream(backup);
  const wasRunning = server.status === "running";
  if (wasRunning) await stopGameServer(server);
  await restoreVolume(server, input);
  if (wasRunning) {
    await startGameServer((await storage.getServer(server.id)) ?? server);
  }
}

export async function deleteServerBackup(backup: Backup): Promise<void> {
  try {
    await unlink(resolveBackupFile(backup));
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  const remote = getBackupStorage();
  if (remote.enabled) {
    await deleteObject(remote, remoteBackupKey(remote, backup.serverId, backup.id)).catch((error) =>
      console.warn(`Backup ${backup.id} was not deleted from storage:`, error.message),
    );
  }
  await storage.deleteBackup(backup.id);
}

export async function deleteAllServerBackups(serverId: string): Promise<void> {
  const remote = getBackupStorage();
  if (remote.enabled) {
    for (const backup of await storage.getBackupsByServer(serverId)) {
      await deleteObject(remote, remoteBackupKey(remote, serverId, backup.id)).catch(() => {});
    }
  }
  await rm(join(BACKUP_ROOT, serverId), { recursive: true, force: true });
}
