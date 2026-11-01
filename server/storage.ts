import type {
  User,
  InsertUser,
  Server,
  InsertServer,
  Node,
  InsertNode,
  ServerStats,
  NodeStats,
  Activity,
  Backup,
  InsertBackup,
  ServerPort,
  InsertServerPort,
  SftpUser,
  InsertSftpUser,
  DdosSettings,
  InsertDdosSettings,
  ApiKey,
  InsertApiKey,
  PanelSettings,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { dataPath, readJsonSync, writeJsonAtomic } from "./data-dir";
import { PostgresStorage } from "./postgres-storage";
import {
  type IStorage,
  DEFAULT_PANEL_SETTINGS,
  DEFAULT_ADMIN_USERNAME,
  DDOS_DEFAULTS,
  MAX_ACTIVITIES,
  defaultAdminUser,
  isPortFree,
  mergePanelSettings,
  pickDdosFields,
  sanitizePermissions,
  migratePermissionsToV2,
  dropLegacyDefaultColors,
} from "./storage-common";

export type { IStorage } from "./storage-common";

interface FileData {
  users: User[];
  servers: Server[];
  nodes: Node[];
  activities: Activity[];
  backups: Backup[];
  serverPorts: ServerPort[];
  sftpUsers: SftpUser[];
  ddosSettings: DdosSettings[];
  apiKeys: ApiKey[];
  panelSettings: PanelSettings;
}

const DATE_FIELDS = ["createdAt", "timestamp", "updatedAt", "expiresAt", "lastUsedAt", "accessExpiresAt"];

function reviveDates<T>(item: T): T {
  const record = item as Record<string, any>;
  for (const field of DATE_FIELDS) {
    if (typeof record[field] === "string") record[field] = new Date(record[field]);
  }
  return item;
}

function removeWhere<T>(list: T[], predicate: (item: T) => boolean): boolean {
  let removed = false;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (predicate(list[i])) {
      list.splice(i, 1);
      removed = true;
    }
  }
  return removed;
}

/**
 * Хранилище по умолчанию (без DATABASE_URL): все данные сохраняются в DATA_DIR/storage.json
 * и переживают перезапуск панели.
 */
export class FileStorage implements IStorage {
  private file = dataPath("storage.json");
  private data: FileData;
  private serverStats = new Map<string, ServerStats>();
  private nodeStats = new Map<string, NodeStats>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    const raw = readJsonSync<Partial<FileData>>(this.file, {});
    this.data = {
      users: (raw.users ?? []).map(reviveDates).map(({ telegramBotToken: _t, telegramChatId: _c, ...u }: User & Record<string, unknown>) => ({
        ...u,
        permissions: sanitizePermissions(u.permissions),
        twoFactorEnabled: Boolean(u.twoFactorEnabled && u.twoFactorSecret),
        twoFactorSecret: u.twoFactorSecret ?? null,
        twoFactorRecoveryCodes: u.twoFactorRecoveryCodes ?? [],
      })),
      servers: (raw.servers ?? []).map(reviveDates),
      nodes: (raw.nodes ?? []).map(reviveDates),
      activities: (raw.activities ?? []).map(reviveDates),
      backups: (raw.backups ?? []).map(reviveDates),
      serverPorts: (raw.serverPorts ?? []).map(reviveDates),
      sftpUsers: (raw.sftpUsers ?? []).map(reviveDates),
      ddosSettings: (raw.ddosSettings ?? []).map(reviveDates),
      apiKeys: (raw.apiKeys ?? []).map(reviveDates).map((k) => ({ ...k, permissions: sanitizePermissions(k.permissions) })),
      panelSettings: { ...DEFAULT_PANEL_SETTINGS, ...(raw.panelSettings ?? {}) },
    };
  }

  async init(): Promise<void> {
    if (this.data.users.length === 0) {
      await this.createUser(await defaultAdminUser());
      console.log(`[storage] Default user '${DEFAULT_ADMIN_USERNAME}' created with full permissions`);
    }
    await migratePermissionsToV2(this.data.users, (id, permissions) => this.updateUser(id, { permissions }));
    await dropLegacyDefaultColors(this.data.panelSettings, (patch) => this.updatePanelSettings(patch));
    await this.flush();
  }

  private persist(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush().catch((err) => console.error("Failed to persist storage:", err));
    }, 200);
  }

  async flush(): Promise<void> {
    await writeJsonAtomic(this.file, this.data);
  }

  async close(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await this.flush();
  }

  private update<T extends { id: string }>(list: T[], id: string, updates: Partial<T>): T | undefined {
    const index = list.findIndex((item) => item.id === id);
    if (index < 0) return undefined;
    list[index] = { ...list[index], ...updates, id };
    this.persist();
    return list[index];
  }

  private remove<T>(list: T[], predicate: (item: T) => boolean): boolean {
    const removed = removeWhere(list, predicate);
    if (removed) this.persist();
    return removed;
  }

  /* users */
  async getUser(id: string) {
    return this.data.users.find((u) => u.id === id);
  }
  async getUserByUsername(username: string) {
    return this.data.users.find((u) => u.username === username);
  }
  async getAllUsers() {
    return [...this.data.users];
  }
  async createUser(insert: InsertUser): Promise<User> {
    const user: User = {
      id: randomUUID(),
      username: insert.username,
      password: insert.password,
      nickname: insert.nickname ?? null,
      role: insert.role ?? "viewer",
      permissions: sanitizePermissions(insert.permissions),
      allowedServerIds: (insert.allowedServerIds ?? null) as string[] | null,
      twoFactorEnabled: insert.twoFactorEnabled ?? false,
      twoFactorSecret: insert.twoFactorSecret ?? null,
      twoFactorRecoveryCodes: insert.twoFactorRecoveryCodes ?? [],
      accessExpiresAt: insert.accessExpiresAt ?? null,
      createdAt: new Date(),
    };
    this.data.users.push(user);
    this.persist();
    return user;
  }
  async updateUser(id: string, updates: Partial<User>) {
    const patch = { ...updates };
    if (patch.permissions !== undefined) patch.permissions = sanitizePermissions(patch.permissions);
    return this.update(this.data.users, id, patch);
  }
  async updateUserPassword(id: string, newPasswordHash: string) {
    await this.updateUser(id, { password: newPasswordHash });
  }
  async deleteUser(id: string) {
    return this.remove(this.data.users, (u) => u.id === id);
  }

  /* servers */
  async getAllServers() {
    return [...this.data.servers];
  }
  async getServer(id: string) {
    return this.data.servers.find((s) => s.id === id);
  }
  async createServer(insert: InsertServer): Promise<Server> {
    const server: Server = {
      ...insert,
      id: randomUUID(),
      status: insert.status ?? "stopped",
      containerId: null,
      autoStart: insert.autoStart ?? false,
      config: insert.config ?? {},
      visibility: (insert.visibility as Server["visibility"]) ?? {},
      limits: (insert.limits as Server["limits"]) ?? {},
      createdAt: new Date(),
    };
    this.data.servers.push(server);
    this.persist();
    return server;
  }
  async updateServer(id: string, updates: Partial<Server>) {
    return this.update(this.data.servers, id, updates);
  }
  async deleteServer(id: string) {
    if (!this.remove(this.data.servers, (s) => s.id === id)) return false;
    for (const user of this.data.users) {
      if (Array.isArray(user.allowedServerIds)) {
        user.allowedServerIds = user.allowedServerIds.filter((sid) => sid !== id);
      }
    }
    removeWhere(this.data.backups, (b) => b.serverId === id);
    removeWhere(this.data.serverPorts, (p) => p.serverId === id);
    removeWhere(this.data.sftpUsers, (u) => u.serverId === id);
    removeWhere(this.data.ddosSettings, (d) => d.targetType === "server" && d.targetId === id);
    this.serverStats.delete(id);
    this.persist();
    return true;
  }

  /* nodes */
  async getAllNodes() {
    return [...this.data.nodes];
  }
  async getNode(id: string) {
    return this.data.nodes.find((n) => n.id === id);
  }
  async createNode(insert: InsertNode): Promise<Node> {
    const node: Node = {
      ...insert,
      id: randomUUID(),
      status: insert.status ?? "online",
      port: insert.port ?? 2375,
      createdAt: new Date(),
    };
    this.data.nodes.push(node);
    this.persist();
    return node;
  }
  async updateNode(id: string, updates: Partial<Node>) {
    return this.update(this.data.nodes, id, updates);
  }
  async deleteNode(id: string) {
    this.nodeStats.delete(id);
    return this.remove(this.data.nodes, (n) => n.id === id);
  }

  /* stats — оперативные данные, на диск не пишутся */
  setServerStats(id: string, stats: ServerStats) {
    this.serverStats.set(id, stats);
  }
  getServerStats(id: string) {
    return this.serverStats.get(id);
  }
  deleteServerStats(id: string) {
    this.serverStats.delete(id);
  }
  getAllServerStats() {
    return Object.fromEntries(this.serverStats);
  }
  setNodeStats(id: string, stats: NodeStats) {
    this.nodeStats.set(id, stats);
  }
  getNodeStats(id: string) {
    return this.nodeStats.get(id);
  }
  getAllNodeStats() {
    return Object.fromEntries(this.nodeStats);
  }

  /* activity */
  async addActivity(activity: Omit<Activity, "id">): Promise<Activity> {
    const entry: Activity = { ...activity, id: randomUUID() };
    this.data.activities.unshift(entry);
    if (this.data.activities.length > MAX_ACTIVITIES) this.data.activities.length = MAX_ACTIVITIES;
    this.persist();
    return entry;
  }
  async getRecentActivities(limit = 50) {
    return this.data.activities.slice(0, limit);
  }

  /* backups */
  async getBackupsByServer(serverId: string) {
    return this.data.backups.filter((b) => b.serverId === serverId);
  }
  async getBackup(id: string) {
    return this.data.backups.find((b) => b.id === id);
  }
  async createBackup(insert: InsertBackup): Promise<Backup> {
    const backup: Backup = {
      id: randomUUID(),
      serverId: insert.serverId,
      name: insert.name,
      description: insert.description ?? null,
      size: insert.size ?? 0,
      path: insert.path,
      createdBy: insert.createdBy ?? null,
      createdAt: new Date(),
    };
    this.data.backups.push(backup);
    this.persist();
    return backup;
  }
  async deleteBackup(id: string) {
    return this.remove(this.data.backups, (b) => b.id === id);
  }

  /* ports */
  async getPortsByServer(serverId: string) {
    return this.data.serverPorts.filter((p) => p.serverId === serverId);
  }
  async getPort(id: string) {
    return this.data.serverPorts.find((p) => p.id === id);
  }
  async createPort(insert: InsertServerPort): Promise<ServerPort> {
    const port: ServerPort = {
      id: randomUUID(),
      serverId: insert.serverId,
      port: insert.port,
      protocol: insert.protocol ?? "tcp",
      name: insert.name ?? null,
      description: insert.description ?? null,
      isPublic: insert.isPublic ?? false,
      createdAt: new Date(),
    };
    this.data.serverPorts.push(port);
    this.persist();
    return port;
  }
  async deletePort(id: string) {
    return this.remove(this.data.serverPorts, (p) => p.id === id);
  }
  async checkPortAvailable(port: number, excludeServerId?: string) {
    return isPortFree(port, this.data.servers, this.data.serverPorts, excludeServerId);
  }

  /* sftp */
  async getSftpUsersByServer(serverId: string) {
    return this.data.sftpUsers.filter((u) => u.serverId === serverId);
  }
  async getSftpUser(id: string) {
    return this.data.sftpUsers.find((u) => u.id === id);
  }
  async createSftpUser(insert: InsertSftpUser): Promise<SftpUser> {
    const user: SftpUser = {
      id: randomUUID(),
      serverId: insert.serverId,
      username: insert.username,
      password: insert.password,
      homeDirectory: insert.homeDirectory ?? "/data",
      isActive: insert.isActive ?? true,
      createdBy: insert.createdBy ?? null,
      createdAt: new Date(),
    };
    this.data.sftpUsers.push(user);
    this.persist();
    return user;
  }
  async updateSftpUser(id: string, updates: Partial<SftpUser>) {
    return this.update(this.data.sftpUsers, id, updates);
  }
  async deleteSftpUser(id: string) {
    return this.remove(this.data.sftpUsers, (u) => u.id === id);
  }

  /* panel settings */
  async getPanelSettings() {
    return { ...this.data.panelSettings };
  }
  async updatePanelSettings(settings: Partial<PanelSettings>) {
    this.data.panelSettings = mergePanelSettings(this.data.panelSettings, settings);
    this.persist();
    return { ...this.data.panelSettings };
  }

  /* ddos */
  async getDdosSettings(targetType: string, targetId: string | null = null) {
    return this.data.ddosSettings.find((d) => d.targetType === targetType && (d.targetId ?? null) === (targetId ?? null));
  }
  async upsertDdosSettings(targetType: string, targetId: string | null, settings: Partial<InsertDdosSettings>): Promise<DdosSettings> {
    const clean = pickDdosFields(settings as Record<string, unknown>);
    const existing = await this.getDdosSettings(targetType, targetId);
    if (existing) {
      return this.update(this.data.ddosSettings, existing.id, {
        ...clean,
        updatedAt: new Date(),
        updatedBy: settings.updatedBy ?? existing.updatedBy,
      })!;
    }
    const created: DdosSettings = {
      id: randomUUID(),
      targetType,
      targetId,
      ...DDOS_DEFAULTS,
      ...clean,
      updatedAt: new Date(),
      updatedBy: settings.updatedBy ?? null,
    };
    this.data.ddosSettings.push(created);
    this.persist();
    return created;
  }

  /* api keys */
  async getAllApiKeys() {
    return [...this.data.apiKeys];
  }
  async getApiKey(id: string) {
    return this.data.apiKeys.find((k) => k.id === id);
  }
  async getApiKeyByHash(keyHash: string) {
    return this.data.apiKeys.find((k) => k.keyHash === keyHash);
  }
  async createApiKey(insert: InsertApiKey): Promise<ApiKey> {
    const key: ApiKey = {
      id: randomUUID(),
      name: insert.name,
      description: insert.description ?? null,
      keyHash: insert.keyHash,
      keyPrefix: insert.keyPrefix,
      permissions: sanitizePermissions(insert.permissions),
      expiresAt: insert.expiresAt ?? null,
      isActive: insert.isActive ?? true,
      lastUsedAt: null,
      createdBy: insert.createdBy,
      createdAt: new Date(),
    };
    this.data.apiKeys.push(key);
    this.persist();
    return key;
  }
  async updateApiKey(id: string, updates: Partial<ApiKey>) {
    return this.update(this.data.apiKeys, id, updates);
  }
  async deleteApiKey(id: string) {
    return this.remove(this.data.apiKeys, (k) => k.id === id);
  }
}

export const storage: IStorage = process.env.DATABASE_URL ? new PostgresStorage(process.env.DATABASE_URL) : new FileStorage();
