import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { existsSync } from "fs";
import { resolve } from "path";
import {
  users,
  servers,
  nodes,
  activities,
  backups,
  serverPorts,
  sftpUsers,
  ddosSettings,
  apiKeys,
  panelSettingsTable,
  type User,
  type InsertUser,
  type Server,
  type InsertServer,
  type Node,
  type InsertNode,
  type ServerStats,
  type NodeStats,
  type Activity,
  type ActivityType,
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

const PANEL_SETTINGS_KEY = "panel";

/** Убирает undefined-поля, чтобы drizzle не затирал колонки значением NULL. */
function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export class PostgresStorage implements IStorage {
  readonly pool: pg.Pool;
  private db: ReturnType<typeof drizzle>;
  private serverStats = new Map<string, ServerStats>();
  private nodeStats = new Map<string, NodeStats>();

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
    this.db = drizzle(this.pool);
  }

  /** Применяет миграции схемы и создаёт администратора по умолчанию. */
  async init(): Promise<void> {
    const migrationsFolder = resolve(process.env.MIGRATIONS_DIR || "migrations");
    if (!existsSync(migrationsFolder)) {
      throw new Error(`Migrations folder not found: ${migrationsFolder}`);
    }
    await migrate(this.db, { migrationsFolder });

    for (const user of await this.db.select({ id: users.id, permissions: users.permissions }).from(users)) {
      const clean = sanitizePermissions(user.permissions);
      if (clean.length !== user.permissions.length) await this.db.update(users).set({ permissions: clean }).where(eq(users.id, user.id));
    }
    for (const key of await this.db.select({ id: apiKeys.id, permissions: apiKeys.permissions }).from(apiKeys)) {
      const clean = sanitizePermissions(key.permissions);
      if (clean.length !== key.permissions.length) await this.db.update(apiKeys).set({ permissions: clean }).where(eq(apiKeys.id, key.id));
    }

    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(users);
    if (count === 0) {
      await this.createUser(await defaultAdminUser());
      console.log(`[storage] Default user '${DEFAULT_ADMIN_USERNAME}' created with full permissions`);
    }
    await migratePermissionsToV2(await this.getAllUsers(), (id, permissions) => this.updateUser(id, { permissions }));
    await dropLegacyDefaultColors(await this.getPanelSettings(), (patch) => this.updatePanelSettings(patch));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /* users */
  async getUser(id: string) {
    return (await this.db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  }
  async getUserByUsername(username: string) {
    return (await this.db.select().from(users).where(eq(users.username, username)).limit(1))[0];
  }
  async getAllUsers() {
    return this.db.select().from(users);
  }
  async createUser(user: InsertUser): Promise<User> {
    const [created] = await this.db
      .insert(users)
      .values({
        username: user.username,
        password: user.password,
        nickname: user.nickname ?? null,
        role: user.role ?? "viewer",
        permissions: sanitizePermissions(user.permissions),
        allowedServerIds: (user.allowedServerIds ?? null) as string[] | null,
        twoFactorEnabled: user.twoFactorEnabled ?? false,
        twoFactorSecret: user.twoFactorSecret ?? null,
        twoFactorRecoveryCodes: user.twoFactorRecoveryCodes ?? [],
        accessExpiresAt: user.accessExpiresAt ?? null,
      })
      .returning();
    return created;
  }
  async updateUser(id: string, updates: Partial<User>) {
    const { id: _id, createdAt: _c, ...rest } = updates;
    const patch = defined({ ...rest, permissions: rest.permissions !== undefined ? sanitizePermissions(rest.permissions) : undefined });
    if (Object.keys(patch).length === 0) return this.getUser(id);
    const [updated] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
    return updated;
  }
  async updateUserPassword(id: string, newPasswordHash: string) {
    await this.db.update(users).set({ password: newPasswordHash }).where(eq(users.id, id));
  }
  async deleteUser(id: string) {
    return ((await this.db.delete(users).where(eq(users.id, id))).rowCount ?? 0) > 0;
  }

  /* servers */
  async getAllServers() {
    return this.db.select().from(servers);
  }
  async getServer(id: string) {
    return (await this.db.select().from(servers).where(eq(servers.id, id)).limit(1))[0];
  }
  async createServer(server: InsertServer): Promise<Server> {
    const [created] = await this.db
      .insert(servers)
      .values({
        ...server,
        status: server.status ?? "stopped",
        autoStart: server.autoStart ?? false,
        config: server.config ?? {},
        visibility: (server.visibility as Server["visibility"]) ?? {},
        limits: (server.limits as Server["limits"]) ?? {},
      })
      .returning();
    return created;
  }
  async updateServer(id: string, updates: Partial<Server>) {
    const { id: _id, createdAt: _c, ...rest } = updates;
    const patch = defined(rest);
    if (Object.keys(patch).length === 0) return this.getServer(id);
    const [updated] = await this.db.update(servers).set(patch).where(eq(servers.id, id)).returning();
    return updated;
  }
  async deleteServer(id: string) {
    return this.db.transaction(async (tx) => {
      await tx.delete(backups).where(eq(backups.serverId, id));
      await tx.delete(serverPorts).where(eq(serverPorts.serverId, id));
      await tx.delete(sftpUsers).where(eq(sftpUsers.serverId, id));
      await tx.delete(ddosSettings).where(and(eq(ddosSettings.targetType, "server"), eq(ddosSettings.targetId, id)));
      await tx.execute(
        sql`UPDATE users SET allowed_server_ids = COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(allowed_server_ids) e WHERE e <> to_jsonb(${id}::text)), '[]'::jsonb) WHERE allowed_server_ids IS NOT NULL AND allowed_server_ids ? ${id}`,
      );
      const result = await tx.delete(servers).where(eq(servers.id, id));
      this.serverStats.delete(id);
      return (result.rowCount ?? 0) > 0;
    });
  }

  /* nodes */
  async getAllNodes() {
    return this.db.select().from(nodes);
  }
  async getNode(id: string) {
    return (await this.db.select().from(nodes).where(eq(nodes.id, id)).limit(1))[0];
  }
  async createNode(node: InsertNode): Promise<Node> {
    const [created] = await this.db.insert(nodes).values(node).returning();
    return created;
  }
  async updateNode(id: string, updates: Partial<Node>) {
    const { id: _id, createdAt: _c, ...rest } = updates;
    const patch = defined(rest);
    if (Object.keys(patch).length === 0) return this.getNode(id);
    const [updated] = await this.db.update(nodes).set(patch).where(eq(nodes.id, id)).returning();
    return updated;
  }
  async deleteNode(id: string) {
    this.nodeStats.delete(id);
    return ((await this.db.delete(nodes).where(eq(nodes.id, id))).rowCount ?? 0) > 0;
  }

  /* stats — оперативные данные в памяти */
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
    const [row] = await this.db
      .insert(activities)
      .values({
        type: activity.type,
        title: activity.title,
        description: activity.description,
        timestamp: activity.timestamp,
        userId: activity.userId ?? null,
      })
      .returning();
    if (Math.random() < 0.01) {
      await this.db.execute(
        sql`DELETE FROM activities WHERE id IN (SELECT id FROM activities ORDER BY timestamp DESC OFFSET ${MAX_ACTIVITIES * 10})`,
      );
    }
    return { ...activity, id: row.id };
  }
  async getRecentActivities(limit = 50): Promise<Activity[]> {
    const rows = await this.db.select().from(activities).orderBy(desc(activities.timestamp)).limit(limit);
    return rows.map((r) => ({
      id: r.id,
      type: r.type as ActivityType,
      title: r.title,
      description: r.description,
      timestamp: r.timestamp,
      userId: r.userId ?? undefined,
    }));
  }

  /* backups */
  async getBackupsByServer(serverId: string) {
    return this.db.select().from(backups).where(eq(backups.serverId, serverId)).orderBy(desc(backups.createdAt));
  }
  async getBackup(id: string) {
    return (await this.db.select().from(backups).where(eq(backups.id, id)).limit(1))[0];
  }
  async createBackup(backup: InsertBackup): Promise<Backup> {
    const [created] = await this.db.insert(backups).values(backup).returning();
    return created;
  }
  async deleteBackup(id: string) {
    return ((await this.db.delete(backups).where(eq(backups.id, id))).rowCount ?? 0) > 0;
  }

  /* ports */
  async getPortsByServer(serverId: string) {
    return this.db.select().from(serverPorts).where(eq(serverPorts.serverId, serverId));
  }
  async getPort(id: string) {
    return (await this.db.select().from(serverPorts).where(eq(serverPorts.id, id)).limit(1))[0];
  }
  async createPort(port: InsertServerPort): Promise<ServerPort> {
    const [created] = await this.db.insert(serverPorts).values(port).returning();
    return created;
  }
  async deletePort(id: string) {
    return ((await this.db.delete(serverPorts).where(eq(serverPorts.id, id))).rowCount ?? 0) > 0;
  }
  async checkPortAvailable(port: number, excludeServerId?: string) {
    const [allServers, allPorts] = await Promise.all([this.getAllServers(), this.db.select().from(serverPorts)]);
    return isPortFree(port, allServers, allPorts, excludeServerId);
  }

  /* sftp */
  async getSftpUsersByServer(serverId: string) {
    return this.db.select().from(sftpUsers).where(eq(sftpUsers.serverId, serverId));
  }
  async getSftpUser(id: string) {
    return (await this.db.select().from(sftpUsers).where(eq(sftpUsers.id, id)).limit(1))[0];
  }
  async createSftpUser(user: InsertSftpUser): Promise<SftpUser> {
    const [created] = await this.db.insert(sftpUsers).values(user).returning();
    return created;
  }
  async updateSftpUser(id: string, updates: Partial<SftpUser>) {
    const { id: _id, createdAt: _c, ...rest } = updates;
    const patch = defined(rest);
    if (Object.keys(patch).length === 0) return this.getSftpUser(id);
    const [updated] = await this.db.update(sftpUsers).set(patch).where(eq(sftpUsers.id, id)).returning();
    return updated;
  }
  async deleteSftpUser(id: string) {
    return ((await this.db.delete(sftpUsers).where(eq(sftpUsers.id, id))).rowCount ?? 0) > 0;
  }

  /* panel settings */
  async getPanelSettings(): Promise<PanelSettings> {
    const row = (await this.db.select().from(panelSettingsTable).where(eq(panelSettingsTable.key, PANEL_SETTINGS_KEY)).limit(1))[0];
    return { ...DEFAULT_PANEL_SETTINGS, ...((row?.value as PanelSettings) ?? {}) };
  }
  async updatePanelSettings(settings: Partial<PanelSettings>): Promise<PanelSettings> {
    const merged = mergePanelSettings(await this.getPanelSettings(), settings);
    await this.db
      .insert(panelSettingsTable)
      .values({ key: PANEL_SETTINGS_KEY, value: merged, updatedAt: new Date() })
      .onConflictDoUpdate({ target: panelSettingsTable.key, set: { value: merged, updatedAt: new Date() } });
    return merged;
  }

  /* ddos */
  async getDdosSettings(targetType: string, targetId: string | null = null) {
    const targetCondition = targetId ? eq(ddosSettings.targetId, targetId) : isNull(ddosSettings.targetId);
    return (await this.db.select().from(ddosSettings).where(and(eq(ddosSettings.targetType, targetType), targetCondition)).limit(1))[0];
  }
  async upsertDdosSettings(targetType: string, targetId: string | null, settings: Partial<InsertDdosSettings>): Promise<DdosSettings> {
    const clean = pickDdosFields(settings as Record<string, unknown>);
    const existing = await this.getDdosSettings(targetType, targetId);
    if (existing) {
      const [updated] = await this.db
        .update(ddosSettings)
        .set({ ...clean, updatedAt: new Date(), updatedBy: settings.updatedBy ?? existing.updatedBy })
        .where(eq(ddosSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await this.db
      .insert(ddosSettings)
      .values({ targetType, targetId, ...DDOS_DEFAULTS, ...clean, updatedBy: settings.updatedBy ?? null })
      .returning();
    return created;
  }

  /* api keys */
  async getAllApiKeys() {
    return this.db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  }
  async getApiKey(id: string) {
    return (await this.db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1))[0];
  }
  async getApiKeyByHash(keyHash: string) {
    return (await this.db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1))[0];
  }
  async createApiKey(apiKey: InsertApiKey): Promise<ApiKey> {
    const [created] = await this.db
      .insert(apiKeys)
      .values({ ...apiKey, permissions: sanitizePermissions(apiKey.permissions) })
      .returning();
    return created;
  }
  async updateApiKey(id: string, updates: Partial<ApiKey>) {
    const { id: _id, createdAt: _c, keyHash: _h, ...rest } = updates;
    const patch = defined(rest);
    if (Object.keys(patch).length === 0) return this.getApiKey(id);
    const [updated] = await this.db.update(apiKeys).set(patch).where(eq(apiKeys.id, id)).returning();
    return updated;
  }
  async deleteApiKey(id: string) {
    return ((await this.db.delete(apiKeys).where(eq(apiKeys.id, id))).rowCount ?? 0) > 0;
  }
}
