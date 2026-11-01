import type { Server, User, UserPermission } from "@shared/schema";
import { settingsStore } from "./data-dir";

/**
 * Доступ к отдельным серверам поверх общих прав панели:
 *  - владелец (кто создал сервер) получает все права на свой сервер и приглашает участников;
 *  - участники — пользователи с набором прав только на этот сервер;
 *  - квоты позволяют пользователю без servers.manage создавать собственные серверы в пределах лимитов;
 *  - оплата: срок действия сервера и приостановка (для биллинга через API).
 */
export const SERVER_SCOPED_PERMISSIONS = [
  "servers.view",
  "servers.control",
  "servers.console",
  "servers.command",
  "servers.files",
  "servers.config",
  "servers.backups",
  "servers.ports",
] as const satisfies readonly UserPermission[];
export type ServerScopedPermission = (typeof SERVER_SCOPED_PERMISSIONS)[number];

export interface ServerMember {
  userId: string;
  permissions: ServerScopedPermission[];
  addedAt: string;
}

export interface ServerAccessRecord {
  ownerId?: string;
  members: ServerMember[];
  /** Сервер оплачен до этой даты; после — приостанавливается. */
  paidUntil?: string | null;
  suspended?: { at: string; reason: string } | null;
}

export interface UserQuota {
  maxServers: number;
  maxRamGb: number;
  maxCpuPercent: number;
  maxDiskGb: number;
  /** Ноды, на которых пользователь может создавать серверы (пусто — любые). */
  nodeIds: string[];
}

const ACCESS_KEY = "server-access";
const QUOTA_KEY = "user-quotas";

const allAccess = () => settingsStore.get<Record<string, ServerAccessRecord>>(ACCESS_KEY, {});
const allQuotas = () => settingsStore.get<Record<string, UserQuota>>(QUOTA_KEY, {});

export function getServerAccess(serverId: string): ServerAccessRecord {
  const record = allAccess()[serverId];
  return { ...record, members: record?.members ?? [] };
}

export async function updateServerAccess(serverId: string, patch: Partial<ServerAccessRecord>): Promise<ServerAccessRecord> {
  const all = { ...allAccess() };
  const next: ServerAccessRecord = { ...all[serverId], ...patch, members: patch.members ?? all[serverId]?.members ?? [] };
  all[serverId] = next;
  await settingsStore.set(ACCESS_KEY, all);
  return next;
}

export async function removeServerAccess(serverId: string): Promise<void> {
  const all = { ...allAccess() };
  delete all[serverId];
  await settingsStore.set(ACCESS_KEY, all);
}

/** Пользователь удалён — убираем его из участников серверов (владение остаётся за панелью). */
export async function forgetUser(userId: string): Promise<void> {
  const all = { ...allAccess() };
  for (const [id, record] of Object.entries(all)) {
    all[id] = { ...record, members: record.members.filter((m) => m.userId !== userId), ownerId: record.ownerId === userId ? undefined : record.ownerId };
  }
  await settingsStore.set(ACCESS_KEY, all);
  const quotas = { ...allQuotas() };
  delete quotas[userId];
  await settingsStore.set(QUOTA_KEY, quotas);
}

/** Права пользователя именно на этот сервер (сверх общих прав). */
export function serverPermissionsFor(userId: string, serverId: string): ServerScopedPermission[] {
  const record = allAccess()[serverId];
  if (!record) return [];
  if (record.ownerId === userId) return [...SERVER_SCOPED_PERMISSIONS];
  return record.members.find((m) => m.userId === userId)?.permissions ?? [];
}

export const isServerOwner = (userId: string, serverId: string) => allAccess()[serverId]?.ownerId === userId;

/** Серверы, к которым у пользователя есть доступ как у владельца или участника. */
export function memberServerIds(userId: string): string[] {
  return Object.entries(allAccess())
    .filter(([, r]) => r.ownerId === userId || r.members.some((m) => m.userId === userId))
    .map(([id]) => id);
}

export const ownedServerIds = (userId: string) =>
  Object.entries(allAccess())
    .filter(([, r]) => r.ownerId === userId)
    .map(([id]) => id);

/* Квоты */

export function getUserQuota(userId: string): UserQuota | null {
  return allQuotas()[userId] ?? null;
}

export async function setUserQuota(userId: string, quota: UserQuota | null): Promise<void> {
  const quotas = { ...allQuotas() };
  if (quota) quotas[userId] = quota;
  else delete quotas[userId];
  await settingsStore.set(QUOTA_KEY, quotas);
}

export function quotaUsage(userId: string, servers: Server[]) {
  const owned = new Set(ownedServerIds(userId));
  const mine = servers.filter((s) => owned.has(s.id));
  return {
    servers: mine.length,
    ramGb: mine.reduce((sum, s) => sum + s.ramLimit, 0),
    cpuPercent: mine.reduce((sum, s) => sum + s.cpuLimit, 0),
    diskGb: mine.reduce((sum, s) => sum + s.diskLimit, 0),
  };
}

/** Проверяет, помещается ли новый сервер (или новые лимиты существующего) в квоту владельца. */
export function assertWithinQuota(user: User, servers: Server[], next: { nodeId: string; ramLimit: number; cpuLimit: number; diskLimit: number }, replacingServerId?: string): void {
  const quota = getUserQuota(user.id);
  if (!quota) throw Object.assign(new Error("You cannot create servers. Ask the panel owner for a quota."), { status: 403 });
  const usage = quotaUsage(
    user.id,
    servers.filter((s) => s.id !== replacingServerId),
  );
  const fail = (what: string) => Object.assign(new Error(`Your quota allows ${what}`), { status: 403 });
  if (!replacingServerId && usage.servers + 1 > quota.maxServers) throw fail(`${quota.maxServers} servers`);
  if (usage.ramGb + next.ramLimit > quota.maxRamGb) throw fail(`${quota.maxRamGb} GB of memory in total (${quota.maxRamGb - usage.ramGb} GB left)`);
  if (usage.cpuPercent + next.cpuLimit > quota.maxCpuPercent) throw fail(`${quota.maxCpuPercent}% CPU in total (${quota.maxCpuPercent - usage.cpuPercent}% left)`);
  if (usage.diskGb + next.diskLimit > quota.maxDiskGb) throw fail(`${quota.maxDiskGb} GB of disk in total (${quota.maxDiskGb - usage.diskGb} GB left)`);
  if (quota.nodeIds.length && !quota.nodeIds.includes(next.nodeId)) throw fail("other nodes only");
}

/* Оплата и приостановка */

export function suspensionOf(serverId: string): ServerAccessRecord["suspended"] {
  return allAccess()[serverId]?.suspended ?? null;
}

/** Серверы с истёкшей оплатой, которые ещё не приостановлены. */
export function expiredServerIds(now = Date.now()): string[] {
  return Object.entries(allAccess())
    .filter(([, r]) => r.paidUntil && new Date(r.paidUntil).getTime() <= now && !r.suspended)
    .map(([id]) => id);
}
