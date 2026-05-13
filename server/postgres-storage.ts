import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, desc, and, lt, isNull } from "drizzle-orm";
import {
  users,
  servers,
  nodes,
  activities,
  backups,
  serverPorts,
  sftpUsers,
  ddosSettings,
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
  type UserPermission,
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import type { IStorage } from "./storage";


const serverStatsCache = new Map<string, ServerStats>();
const nodeStatsCache = new Map<string, NodeStats>();

interface TwoFactorCode {
  id: string;
  userId: string;
  code: string;
  expiresAt: Date;
}

interface ApiKey {
  id: string;
  name: string;
  description?: string;
  key: string;
  permissions: UserPermission[];
  expiresAt: Date | null;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
}

export class PostgresStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
  private twoFactorCodes: Map<string, TwoFactorCode> = new Map();
  private apiKeys: Map<string, ApiKey> = new Map();
  private panelSettings: {
    panelName: string;
    primaryColor?: string;
    backgroundColor?: string;
    borderColor?: string;
    sidebarAccentColor?: string;
  } = {
    panelName: "SparkPanel v1.3.1",
    sidebarAccentColor: "#e5e7eb",
  };

  constructor(databaseUrl: string) {
    const sql = neon(databaseUrl);
    this.db = drizzle(sql);
    this.initializeDefaultUser().catch((err) => {
      console.error("Failed to initialize default user:", err);
    });
    this.loadPanelSettings().catch((err) => {
      console.error("Failed to load panel settings:", err);
    });
  }

  private async initializeDefaultUser(): Promise<void> {
    try {
      const defaultUsername = "adplayer";
      const existing = await this.getUserByUsername(defaultUsername);
      
      if (!existing) {
        const defaultPassword = "0000";
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        const allPermissions = [
          "servers.view", "servers.manage", "servers.control", "servers.console", "servers.files", "servers.config", "servers.backups", "servers.ports",
          "nodes.view", "nodes.manage",
          "users.view", "users.manage",
          "activity.view",
          "plugins.view", "plugins.manage",
          "settings.view", "settings.manage", "panel.colors",
          "kvm.access",
          "api.read", "api.manage",
          "ddos.view", "ddos.manage",
          "backups.view", "backups.manage",
          "logs.view",
        ];
        await this.db.insert(users).values({
          id: randomUUID(),
          username: defaultUsername,
          password: passwordHash,
          role: "admin",
          permissions: allPermissions as any,
          allowedServerIds: null,
          accessExpiresAt: null,
        });
      }
    } catch (error) {
      console.error("Error initializing default user:", error);
    }
  }

  private async loadPanelSettings(): Promise<void> {
    this.panelSettings = {
      panelName: "SparkPanel v1.3.1",
      sidebarAccentColor: "#e5e7eb",
    };
  }

  
  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await this.db.select().from(users);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const passwordHash = typeof user.password === "string" 
      ? await bcrypt.hash(user.password, 10)
      : user.password;
    
    const permissions: string[] = Array.isArray(user.permissions) 
      ? user.permissions.filter((p): p is string => typeof p === "string")
      : [];

    const allowedServerIds: string[] | null = Array.isArray(user.allowedServerIds)
      ? user.allowedServerIds.filter((id): id is string => typeof id === "string")
      : (user.allowedServerIds === null ? null : null);

    const newUser = {
      id,
      username: user.username,
      password: passwordHash,
      role: "viewer",
      permissions: permissions as any,
      allowedServerIds: allowedServerIds,
      nickname: user.nickname,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      telegramBotToken: user.telegramBotToken,
      telegramChatId: user.telegramChatId,
      accessExpiresAt: user.accessExpiresAt ?? null,
    };

    await this.db.insert(users).values(newUser);
    return (await this.getUser(id))!;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const updateData: any = {};
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.role !== undefined) updateData.role = updates.role;
    if (updates.permissions !== undefined) updateData.permissions = updates.permissions;
    if (updates.allowedServerIds !== undefined) updateData.allowedServerIds = updates.allowedServerIds;
    if (updates.twoFactorEnabled !== undefined) updateData.twoFactorEnabled = updates.twoFactorEnabled;
    if (updates.telegramBotToken !== undefined) updateData.telegramBotToken = updates.telegramBotToken;
    if (updates.telegramChatId !== undefined) updateData.telegramChatId = updates.telegramChatId;
    if (updates.accessExpiresAt !== undefined) updateData.accessExpiresAt = updates.accessExpiresAt;

    await this.db.update(users).set(updateData).where(eq(users.id, id));
    return await this.getUser(id);
  }

  async updateUserPassword(id: string, newPasswordHash: string): Promise<void> {
    await this.db.update(users).set({ password: newPasswordHash }).where(eq(users.id, id));
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.db.delete(users).where(eq(users.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  
  async getAllServers(): Promise<Server[]> {
    return await this.db.select().from(servers);
  }

  async getServer(id: string): Promise<Server | undefined> {
    const result = await this.db.select().from(servers).where(eq(servers.id, id)).limit(1);
    return result[0];
  }

  async createServer(server: InsertServer): Promise<Server> {
    const id = randomUUID();
    const insertData: any = {
      id,
      name: server.name,
      gameType: server.gameType,
      nodeId: server.nodeId,
      status: server.status || "stopped",
      cpuLimit: server.cpuLimit,
      ramLimit: server.ramLimit,
      diskLimit: server.diskLimit,
      port: server.port,
      autoStart: server.autoStart ?? false,
      config: server.config || {},
      visibility: server.visibility || {},
      limits: server.limits || {},
    };
    await this.db.insert(servers).values(insertData);
    return (await this.getServer(id))!;
  }

  async updateServer(id: string, updates: Partial<Server>): Promise<Server | undefined> {
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.gameType !== undefined) updateData.gameType = updates.gameType;
    if (updates.nodeId !== undefined) updateData.nodeId = updates.nodeId;
    if (updates.containerId !== undefined) updateData.containerId = updates.containerId;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.cpuLimit !== undefined) updateData.cpuLimit = updates.cpuLimit;
    if (updates.ramLimit !== undefined) updateData.ramLimit = updates.ramLimit;
    if (updates.diskLimit !== undefined) updateData.diskLimit = updates.diskLimit;
    if (updates.port !== undefined) updateData.port = updates.port;
    if (updates.autoStart !== undefined) updateData.autoStart = updates.autoStart;
    if (updates.config !== undefined) updateData.config = updates.config;
    if (updates.visibility !== undefined) updateData.visibility = updates.visibility;
    if (updates.limits !== undefined) updateData.limits = updates.limits;

    await this.db.update(servers).set(updateData).where(eq(servers.id, id));
    return await this.getServer(id);
  }

  async deleteServer(id: string): Promise<boolean> {
    
    await this.db.delete(backups).where(eq(backups.serverId, id));
    await this.db.delete(serverPorts).where(eq(serverPorts.serverId, id));
    await this.db.delete(sftpUsers).where(eq(sftpUsers.serverId, id));
    
    const result = await this.db.delete(servers).where(eq(servers.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  
  async getAllNodes(): Promise<Node[]> {
    return await this.db.select().from(nodes);
  }

  async getNode(id: string): Promise<Node | undefined> {
    const result = await this.db.select().from(nodes).where(eq(nodes.id, id)).limit(1);
    return result[0];
  }

  async createNode(node: InsertNode): Promise<Node> {
    const id = randomUUID();
    await this.db.insert(nodes).values({
      id,
      ...node,
    });
    return (await this.getNode(id))!;
  }

  async updateNode(id: string, updates: Partial<Node>): Promise<Node | undefined> {
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.location !== undefined) updateData.location = updates.location;
    if (updates.ip !== undefined) updateData.ip = updates.ip;
    if (updates.port !== undefined) updateData.port = updates.port;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.cpuCores !== undefined) updateData.cpuCores = updates.cpuCores;
    if (updates.ramTotal !== undefined) updateData.ramTotal = updates.ramTotal;
    if (updates.diskTotal !== undefined) updateData.diskTotal = updates.diskTotal;

    await this.db.update(nodes).set(updateData).where(eq(nodes.id, id));
    return await this.getNode(id);
  }

  async deleteNode(id: string): Promise<boolean> {
    const result = await this.db.delete(nodes).where(eq(nodes.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  
  setServerStats(id: string, stats: ServerStats): void {
    serverStatsCache.set(id, stats);
  }

  getServerStats(id: string): ServerStats | undefined {
    return serverStatsCache.get(id);
  }

  getAllServerStats(): Record<string, ServerStats> {
    return Object.fromEntries(serverStatsCache);
  }

  setNodeStats(id: string, stats: NodeStats): void {
    nodeStatsCache.set(id, stats);
  }

  getNodeStats(id: string): NodeStats | undefined {
    return nodeStatsCache.get(id);
  }

  getAllNodeStats(): Record<string, NodeStats> {
    return Object.fromEntries(nodeStatsCache);
  }

  
  async addActivity(activity: Omit<Activity, "id">): Promise<Activity> {
    const id = randomUUID();
    await this.db.insert(activities).values({
      id,
      type: activity.type,
      title: activity.title,
      description: activity.description,
      timestamp: activity.timestamp,
      userId: activity.userId || null,
    });
    return {
      id,
      ...activity,
    };
  }

  async getRecentActivities(limit: number = 100): Promise<Activity[]> {
    const results = await this.db
      .select()
      .from(activities)
      .orderBy(desc(activities.timestamp))
      .limit(limit);
    return results.map((r): Activity => ({
      id: r.id,
      type: r.type as ActivityType,
      title: r.title,
      description: r.description,
      
      timestamp: r.timestamp instanceof Date ? r.timestamp : new Date(r.timestamp),
      userId: r.userId || undefined,
    }));
  }

  
  async getBackupsByServer(serverId: string): Promise<Backup[]> {
    return await this.db.select().from(backups).where(eq(backups.serverId, serverId));
  }

  async getBackup(id: string): Promise<Backup | undefined> {
    const result = await this.db.select().from(backups).where(eq(backups.id, id)).limit(1);
    return result[0];
  }

  async createBackup(backup: InsertBackup): Promise<Backup> {
    const id = randomUUID();
    await this.db.insert(backups).values({
      id,
      ...backup,
    });
    return (await this.getBackup(id))!;
  }

  async deleteBackup(id: string): Promise<boolean> {
    const result = await this.db.delete(backups).where(eq(backups.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  
  async getPortsByServer(serverId: string): Promise<ServerPort[]> {
    return await this.db.select().from(serverPorts).where(eq(serverPorts.serverId, serverId));
  }

  async getPort(id: string): Promise<ServerPort | undefined> {
    const result = await this.db.select().from(serverPorts).where(eq(serverPorts.id, id)).limit(1);
    return result[0];
  }

  async createPort(port: InsertServerPort): Promise<ServerPort> {
    const id = randomUUID();
    await this.db.insert(serverPorts).values({
      id,
      ...port,
    });
    return (await this.getPort(id))!;
  }

  async deletePort(id: string): Promise<boolean> {
    const result = await this.db.delete(serverPorts).where(eq(serverPorts.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async checkPortAvailable(port: number, excludeServerId?: string): Promise<boolean> {
    
    const allServers = await this.getAllServers();
    const serverUsingPort = allServers.find(s => s.port === port && (!excludeServerId || s.id !== excludeServerId));
    if (serverUsingPort) return false;

    
    const allPorts = await this.db
      .select()
      .from(serverPorts)
      .where(eq(serverPorts.port, port));
    
    const portInUse = excludeServerId
      ? allPorts.find(p => p.serverId !== excludeServerId)
      : allPorts[0];
    
    return !portInUse;
  }

  
  async getSftpUsersByServer(serverId: string): Promise<SftpUser[]> {
    return await this.db.select().from(sftpUsers).where(eq(sftpUsers.serverId, serverId));
  }

  async getSftpUser(id: string): Promise<SftpUser | undefined> {
    const result = await this.db.select().from(sftpUsers).where(eq(sftpUsers.id, id)).limit(1);
    return result[0];
  }

  async createSftpUser(user: InsertSftpUser): Promise<SftpUser> {
    const id = randomUUID();
    await this.db.insert(sftpUsers).values({
      id,
      ...user,
    });
    return (await this.getSftpUser(id))!;
  }

  async updateSftpUser(id: string, updates: Partial<SftpUser>): Promise<SftpUser | undefined> {
    const updateData: any = {};
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.password !== undefined) updateData.password = updates.password;
    if (updates.homeDirectory !== undefined) updateData.homeDirectory = updates.homeDirectory;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    await this.db.update(sftpUsers).set(updateData).where(eq(sftpUsers.id, id));
    return await this.getSftpUser(id);
  }

  async deleteSftpUser(id: string): Promise<boolean> {
    const result = await this.db.delete(sftpUsers).where(eq(sftpUsers.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  
  async getPanelSettings(): Promise<{
    panelName: string;
    primaryColor?: string;
    backgroundColor?: string;
    borderColor?: string;
    sidebarAccentColor?: string;
  }> {
    return { ...this.panelSettings };
  }
  async updatePanelSettings(settings: {
    panelName?: string;
    primaryColor?: string;
    backgroundColor?: string;
    borderColor?: string;
    sidebarAccentColor?: string;
  }): Promise<{
    panelName: string;
    primaryColor?: string;
    backgroundColor?: string;
    borderColor?: string;
    sidebarAccentColor?: string;
  }> {
    if (settings.panelName !== undefined) this.panelSettings.panelName = settings.panelName;
    if (settings.primaryColor !== undefined) this.panelSettings.primaryColor = settings.primaryColor;
    if (settings.backgroundColor !== undefined) this.panelSettings.backgroundColor = settings.backgroundColor;
    if (settings.borderColor !== undefined) this.panelSettings.borderColor = settings.borderColor;
    if (settings.sidebarAccentColor !== undefined) this.panelSettings.sidebarAccentColor = settings.sidebarAccentColor;
    return { ...this.panelSettings };
  }

  async getDdosSettings(targetType: string, targetId?: string | null): Promise<DdosSettings | undefined> {
    const where = targetId ? eq(ddosSettings.targetId, targetId) : eq(ddosSettings.targetId, null as any);
    const result = await this.db
      .select()
      .from(ddosSettings)
      .where(and(eq(ddosSettings.targetType, targetType), where))
      .limit(1);
    return result[0];
  }

  async updateDdosSettings(
    targetTypeOrId: string,
    targetIdOrSettings: string | null | Partial<InsertDdosSettings>,
    settingsArg?: Partial<InsertDdosSettings>,
  ): Promise<DdosSettings> {
    if (settingsArg === undefined && typeof targetIdOrSettings === "object" && targetIdOrSettings !== null) {
      const existing = await this.db
        .select()
        .from(ddosSettings)
        .where(eq(ddosSettings.id, targetTypeOrId))
        .limit(1);
      if (!existing[0]) {
        throw new Error("DDoS settings not found");
      }
      const updateData = { ...targetIdOrSettings, updatedAt: new Date() };
      await this.db.update(ddosSettings).set(updateData).where(eq(ddosSettings.id, targetTypeOrId));
      const updated = await this.db.select().from(ddosSettings).where(eq(ddosSettings.id, targetTypeOrId)).limit(1);
      return updated[0]!;
    }

    const targetType = targetTypeOrId;
    const targetId = (targetIdOrSettings as string | null) ?? null;
    const settings = settingsArg ?? {};

    const where = targetId ? eq(ddosSettings.targetId, targetId) : eq(ddosSettings.targetId, null as any);
    const existing = await this.db
      .select()
      .from(ddosSettings)
      .where(and(eq(ddosSettings.targetType, targetType), where))
      .limit(1);

    const updateData: any = {};
    if (settings.l3Enabled !== undefined) updateData.l3Enabled = settings.l3Enabled;
    if (settings.l3MaxPacketsPerSecond !== undefined) updateData.l3MaxPacketsPerSecond = settings.l3MaxPacketsPerSecond;
    if (settings.l3BlockDuration !== undefined) updateData.l3BlockDuration = settings.l3BlockDuration;
    if (settings.l4Enabled !== undefined) updateData.l4Enabled = settings.l4Enabled;
    if (settings.l4MaxConnectionsPerIp !== undefined) updateData.l4MaxConnectionsPerIp = settings.l4MaxConnectionsPerIp;
    if (settings.l4SynFloodProtection !== undefined) updateData.l4SynFloodProtection = settings.l4SynFloodProtection;
    if (settings.l7Enabled !== undefined) updateData.l7Enabled = settings.l7Enabled;
    if (settings.l7MaxRequestsPerMinute !== undefined) updateData.l7MaxRequestsPerMinute = settings.l7MaxRequestsPerMinute;
    if (settings.l7ChallengeMode !== undefined) updateData.l7ChallengeMode = settings.l7ChallengeMode;
    if (settings.l7UserAgentBlocking !== undefined) updateData.l7UserAgentBlocking = settings.l7UserAgentBlocking;
    if (settings.updatedBy !== undefined) updateData.updatedBy = settings.updatedBy;
    updateData.updatedAt = new Date();

    if (existing[0]) {
      
      await this.db.update(ddosSettings).set(updateData).where(eq(ddosSettings.id, existing[0].id));
      return (await this.getDdosSettings(targetType, targetId))!;
    } else {
      
      const id = randomUUID();
      await this.db.insert(ddosSettings).values({
        id,
        targetType,
        targetId: targetId || null,
        ...updateData,
      });
      return (await this.getDdosSettings(targetType, targetId))!;
    }
  }

  async getDdosSettingsByTarget(targetType: string, targetId: string | null): Promise<DdosSettings | undefined> {
    return this.getDdosSettings(targetType, targetId);
  }

  async createDdosSettings(setting: InsertDdosSettings): Promise<DdosSettings> {
    return this.updateDdosSettings(setting.targetType, setting.targetId ?? null, setting);
  }

  async create2FACode(userId: string, code: string, expiresAt: Date): Promise<void> {
    this.twoFactorCodes.set(userId, { id: randomUUID(), userId, code, expiresAt });
  }

  async verify2FACode(userId: string, code: string): Promise<boolean> {
    const stored = this.twoFactorCodes.get(userId);
    if (!stored) return false;
    if (stored.expiresAt.getTime() < Date.now()) {
      this.twoFactorCodes.delete(userId);
      return false;
    }
    const valid = stored.code === code;
    if (valid) this.twoFactorCodes.delete(userId);
    return valid;
  }

  async getAllApiKeys(): Promise<ApiKey[]> {
    return Array.from(this.apiKeys.values());
  }

  async getApiKey(id: string): Promise<ApiKey | undefined> {
    return this.apiKeys.get(id);
  }

  async createApiKey(apiKey: Omit<ApiKey, "id" | "createdAt">): Promise<ApiKey> {
    const created: ApiKey = { ...apiKey, id: randomUUID(), createdAt: new Date() };
    this.apiKeys.set(created.id, created);
    return created;
  }

  async updateApiKey(id: string, updates: Partial<ApiKey>): Promise<ApiKey | undefined> {
    const existing = this.apiKeys.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates };
    this.apiKeys.set(id, updated);
    return updated;
  }

  async deleteApiKey(id: string): Promise<boolean> {
    return this.apiKeys.delete(id);
  }
}


