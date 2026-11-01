import {
  type User,
  type InsertUser,
  type Server,
  type InsertServer,
  type Node,
  type InsertNode,
  type ServerStats,
  type NodeStats,
  type Activity,
  type UserPermission,
  userPermissions,
  type Backup,
  type InsertBackup,
  type ServerPort,
  type InsertServerPort,
  type SftpUser,
  type InsertSftpUser,
  type DdosSettings,
  type InsertDdosSettings,
  type ApiKey,
  type InsertApiKey,
  type PanelSettings,
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { settingsStore } from "./data-dir";

export interface IStorage {
  init(): Promise<void>;
  /** Сохраняет несохранённые данные и закрывает соединения. */
  close(): Promise<void>;

  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserPassword(id: string, newPasswordHash: string): Promise<void>;
  deleteUser(id: string): Promise<boolean>;

  getAllServers(): Promise<Server[]>;
  getServer(id: string): Promise<Server | undefined>;
  createServer(server: InsertServer): Promise<Server>;
  updateServer(id: string, updates: Partial<Server>): Promise<Server | undefined>;
  deleteServer(id: string): Promise<boolean>;

  getAllNodes(): Promise<Node[]>;
  getNode(id: string): Promise<Node | undefined>;
  createNode(node: InsertNode): Promise<Node>;
  updateNode(id: string, updates: Partial<Node>): Promise<Node | undefined>;
  deleteNode(id: string): Promise<boolean>;

  setServerStats(id: string, stats: ServerStats): void;
  getServerStats(id: string): ServerStats | undefined;
  deleteServerStats(id: string): void;
  getAllServerStats(): Record<string, ServerStats>;
  setNodeStats(id: string, stats: NodeStats): void;
  getNodeStats(id: string): NodeStats | undefined;
  getAllNodeStats(): Record<string, NodeStats>;

  addActivity(activity: Omit<Activity, "id">): Promise<Activity>;
  getRecentActivities(limit?: number): Promise<Activity[]>;

  getBackupsByServer(serverId: string): Promise<Backup[]>;
  getBackup(id: string): Promise<Backup | undefined>;
  createBackup(backup: InsertBackup): Promise<Backup>;
  deleteBackup(id: string): Promise<boolean>;

  getPortsByServer(serverId: string): Promise<ServerPort[]>;
  getPort(id: string): Promise<ServerPort | undefined>;
  createPort(port: InsertServerPort): Promise<ServerPort>;
  deletePort(id: string): Promise<boolean>;
  checkPortAvailable(port: number, excludeServerId?: string): Promise<boolean>;

  getSftpUsersByServer(serverId: string): Promise<SftpUser[]>;
  getSftpUser(id: string): Promise<SftpUser | undefined>;
  createSftpUser(user: InsertSftpUser): Promise<SftpUser>;
  updateSftpUser(id: string, updates: Partial<SftpUser>): Promise<SftpUser | undefined>;
  deleteSftpUser(id: string): Promise<boolean>;

  getPanelSettings(): Promise<PanelSettings>;
  updatePanelSettings(settings: Partial<PanelSettings>): Promise<PanelSettings>;

  getDdosSettings(targetType: string, targetId?: string | null): Promise<DdosSettings | undefined>;
  upsertDdosSettings(targetType: string, targetId: string | null, settings: Partial<InsertDdosSettings>): Promise<DdosSettings>;


  getAllApiKeys(): Promise<ApiKey[]>;
  getApiKey(id: string): Promise<ApiKey | undefined>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  createApiKey(apiKey: InsertApiKey): Promise<ApiKey>;
  updateApiKey(id: string, updates: Partial<ApiKey>): Promise<ApiKey | undefined>;
  deleteApiKey(id: string): Promise<boolean>;
}

export const DEFAULT_PANEL_SETTINGS: PanelSettings = { panelName: "SparkPanel" };
export const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || "adplayer";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "0000";
export const MAX_ACTIVITIES = 1000;

export const DDOS_DEFAULTS = {
  l3Enabled: false,
  l3MaxPacketsPerSecond: 10000,
  l3BlockDuration: 3600,
  l4Enabled: false,
  l4MaxConnectionsPerIp: 100,
  l4SynFloodProtection: false,
  l7Enabled: false,
  l7MaxRequestsPerMinute: 600,
  l7ChallengeMode: false,
  l7UserAgentBlocking: false,
};

export function sanitizePermissions(value: unknown): UserPermission[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((p): p is UserPermission => userPermissions.includes(p as UserPermission))));
}

export async function defaultAdminUser(): Promise<InsertUser> {
  return {
    username: DEFAULT_ADMIN_USERNAME,
    password: await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10),
    role: "admin",
    permissions: [...userPermissions],
    allowedServerIds: null,
  };
}

/** Права, которые появились позже остальных: раньше главная страница и учётная запись были доступны всем. */
const PERMISSIONS_ADDED_IN_V2: UserPermission[] = ["dashboard.view", "account.manage"];

/**
 * Однократно выдаёт новые права тем, у кого были все прежние права (полный доступ), чтобы администраторы
 * не потеряли главную страницу и учётную запись. Остальным пользователям ничего не добавляется:
 * у них видно только то, что отмечено галочками.
 */
export async function migratePermissionsToV2(users: User[], save: (id: string, permissions: UserPermission[]) => Promise<unknown>): Promise<void> {
  if (settingsStore.get<number>("permissionsVersion", 1) >= 2) return;
  const previous = userPermissions.filter((p) => !PERMISSIONS_ADDED_IN_V2.includes(p));
  for (const user of users) {
    if (previous.every((p) => user.permissions.includes(p))) {
      await save(user.id, Array.from(new Set([...user.permissions, ...PERMISSIONS_ADDED_IN_V2])));
    }
  }
  await settingsStore.set("permissionsVersion", 2);
}

/** Цвета, которые старая кнопка «Reset to Default» записывала вместо очистки. Они перекрывали тему, поэтому удаляются. */
const LEGACY_DEFAULT_COLORS = { primaryColor: "#3b82f6", backgroundColor: "#ffffff", borderColor: "#e5e7eb", sidebarAccentColor: "#e5e7eb" };

export async function dropLegacyDefaultColors(settings: PanelSettings, update: (patch: Partial<PanelSettings>) => Promise<unknown>): Promise<void> {
  const legacy = (Object.keys(LEGACY_DEFAULT_COLORS) as (keyof typeof LEGACY_DEFAULT_COLORS)[]).every(
    (key) => (settings[key] ?? "").toLowerCase() === LEGACY_DEFAULT_COLORS[key],
  );
  if (legacy) await update({ primaryColor: null, backgroundColor: null, borderColor: null, sidebarAccentColor: null } as unknown as Partial<PanelSettings>);
}

export function isPortFree(port: number, servers: Server[], ports: ServerPort[], excludeServerId?: string): boolean {
  if (servers.some((s) => s.id !== excludeServerId && (s.port === port || Number((s.config as any)?.sftpPort) === port))) return false;
  if (ports.some((p) => p.port === port && p.serverId !== excludeServerId)) return false;
  return true;
}

export function mergePanelSettings(current: PanelSettings, updates: Partial<PanelSettings>): PanelSettings {
  const merged: PanelSettings = { ...current };
  for (const key of ["panelName", "primaryColor", "backgroundColor", "borderColor", "sidebarAccentColor"] as const) {
    const value = updates[key];
    if (value === undefined) continue;
    if (value === null || value === "") {
      if (key !== "panelName") delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

const DDOS_FIELDS = Object.keys(DDOS_DEFAULTS) as (keyof typeof DDOS_DEFAULTS)[];

/** Оставляет только известные поля DDoS-настроек с корректными типами (защита от mass assignment). */
export function pickDdosFields(input: Record<string, unknown>): Partial<typeof DDOS_DEFAULTS> {
  const result: Record<string, unknown> = {};
  for (const field of DDOS_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null) continue;
    if (typeof DDOS_DEFAULTS[field] === "boolean") {
      result[field] = Boolean(value);
    } else {
      const num = Number(value);
      if (Number.isFinite(num) && num > 0) result[field] = Math.floor(num);
    }
  }
  return result as Partial<typeof DDOS_DEFAULTS>;
}
