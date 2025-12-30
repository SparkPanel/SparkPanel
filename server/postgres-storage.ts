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
  apiKeys,
  ddosSettings,
  panelSettings,
  twoFactorCodes,
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
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import type { IStorage } from "./storage";

// In-memory stats (not persisted to DB, real-time only)
const serverStatsCache = new Map<string, ServerStats>();
const nodeStatsCache = new Map<string, NodeStats>();

export class PostgresStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;
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
        });
      }
    } catch (error) {
      console.error("Error initializing default user:", error);
    }
  }

  private async loadPanelSettings(): Promise<void> {
    try {
      const result = await this.db.select().from(panelSettings).where(eq(panelSettings.id, "main")).limit(1);
      if (result[0]) {
        this.panelSettings = {
          panelName: result[0].panelName,
          primaryColor: result[0].primaryColor || undefined,
          backgroundColor: result[0].backgroundColor || undefined,
          borderColor: result[0].borderColor || undefined,
          sidebarAccentColor: result[0].sidebarAccentColor || "#e5e7eb",
        };
      } else {
        // Create default settings if not exist
        await this.db.insert(panelSettings).values({
          id: "main",
          panelName: "SparkPanel v1.3.1",
          sidebarAccentColor: "#e5e7eb",
        });
        this.panelSettings = {
          panelName: "SparkPanel v1.3.1",
          sidebarAccentColor: "#e5e7eb",
        };
      }
    } catch (error) {
      console.error("Error loading panel settings:", error);
      this.panelSettings = {
        panelName: "SparkPanel v1.3.1",
      };
    }
  }

  // Users
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

  // Servers
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
    // Delete related backups, ports, and SFTP users
    await this.db.delete(backups).where(eq(backups.serverId, id));
    await this.db.delete(serverPorts).where(eq(serverPorts.serverId, id));
    await this.db.delete(sftpUsers).where(eq(sftpUsers.serverId, id));
    
    const result = await this.db.delete(servers).where(eq(servers.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Nodes
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

  // Stats (in-memory, not persisted)
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

  // Activity log
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
      timestamp: r.timestamp,
      userId: r.userId || undefined,
    }));
  }

  // Backups
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

  // Server Ports
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
    // Check if port is used by any server's main port
    const allServers = await this.getAllServers();
    const serverUsingPort = allServers.find(s => s.port === port && (!excludeServerId || s.id !== excludeServerId));
    if (serverUsingPort) return false;

    // Check if port is used by any additional server ports (excluding the specified server)
    const allPorts = await this.db
      .select()
      .from(serverPorts)
      .where(eq(serverPorts.port, port));
    
    const portInUse = excludeServerId
      ? allPorts.find(p => p.serverId !== excludeServerId)
      : allPorts[0];
    
    return !portInUse;
  }

  // SFTP Users
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

  // Panel Settings (stored in memory for now, can be moved to DB later)
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
    const updates: any = { updatedAt: new Date() };
    if (settings.panelName !== undefined) {
      this.panelSettings.panelName = settings.panelName;
      updates.panelName = settings.panelName;
    }
    if (settings.primaryColor !== undefined) {
      this.panelSettings.primaryColor = settings.primaryColor;
      updates.primaryColor = settings.primaryColor;
    }
    if (settings.backgroundColor !== undefined) {
      this.panelSettings.backgroundColor = settings.backgroundColor;
      updates.backgroundColor = settings.backgroundColor;
    }
    if (settings.borderColor !== undefined) {
      this.panelSettings.borderColor = settings.borderColor;
      updates.borderColor = settings.borderColor;
    }
    if (settings.sidebarAccentColor !== undefined) {
      this.panelSettings.sidebarAccentColor = settings.sidebarAccentColor;
      updates.sidebarAccentColor = settings.sidebarAccentColor;
    }
    
    try {
      await this.db.update(panelSettings).set(updates).where(eq(panelSettings.id, "main"));
    } catch (error) {
      console.error("Error updating panel settings in database:", error);
    }
    
    return { ...this.panelSettings };
  }

  // API Keys
  async getAllApiKeys(): Promise<any[]> {
    return await this.db.select().from(apiKeys);
  }

  async getApiKey(id: string): Promise<any | undefined> {
    const result = await this.db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return result[0];
  }

  async getApiKeyByKey(key: string): Promise<any | undefined> {
    const result = await this.db.select().from(apiKeys).where(eq(apiKeys.key, key)).limit(1);
    return result[0];
  }

  async createApiKey(data: any): Promise<any> {
    const id = randomUUID();
    const newApiKey = {
      id,
      ...data,
      createdAt: new Date(),
      lastUsedAt: null,
    };
    await this.db.insert(apiKeys).values(newApiKey);
    return this.getApiKey(id);
  }

  async updateApiKey(id: string, updates: any): Promise<any> {
    await this.db.update(apiKeys).set({ ...updates, lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
    return this.getApiKey(id);
  }

  async deleteApiKey(id: string): Promise<boolean> {
    const result = await this.db.delete(apiKeys).where(eq(apiKeys.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // DDoS Settings
  async getAllDdosSettings(): Promise<any[]> {
    return await this.db.select().from(ddosSettings);
  }

  async getDdosSettings(id: string): Promise<any | undefined> {
    const result = await this.db.select().from(ddosSettings).where(eq(ddosSettings.id, id)).limit(1);
    return result[0];
  }

  async getDdosSettingsByTarget(targetType: string, targetId: string | null): Promise<any | undefined> {
    const result = await this.db
      .select()
      .from(ddosSettings)
      .where(
        targetId
          ? (and(eq(ddosSettings.targetType, targetType), eq(ddosSettings.targetId, targetId)))
          : (and(eq(ddosSettings.targetType, targetType), isNull(ddosSettings.targetId)))
      )
      .limit(1);
    return result[0];
  }

  async createDdosSettings(data: any): Promise<any> {
    const id = randomUUID();
    const newSettings = {
      id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.db.insert(ddosSettings).values(newSettings);
    return this.getDdosSettings(id);
  }

  async updateDdosSettings(id: string, updates: any): Promise<any> {
    await this.db.update(ddosSettings).set({ ...updates, updatedAt: new Date() }).where(eq(ddosSettings.id, id));
    return this.getDdosSettings(id);
  }

  async deleteDdosSettings(id: string): Promise<boolean> {
    const result = await this.db.delete(ddosSettings).where(eq(ddosSettings.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // 2FA Methods
  async create2FACode(userId: string, code: string, expiresAt: Date): Promise<{ id: string; code: string }> {
    const id = randomUUID();
    await this.db.insert(twoFactorCodes).values({
      id,
      userId,
      code,
      expiresAt,
    });
    return { id, code };
  }

  async verify2FACode(userId: string, code: string): Promise<boolean> {
    const result = await this.db
      .select()
      .from(twoFactorCodes)
      .where(and(eq(twoFactorCodes.userId, userId), eq(twoFactorCodes.code, code)))
      .limit(1);
    
    if (!result[0]) return false;
    
    // Проверяем, не истёк ли код
    if (new Date() > result[0].expiresAt) {
      await this.db.delete(twoFactorCodes).where(eq(twoFactorCodes.id, result[0].id));
      return false;
    }
    
    // Удаляем использованный код
    await this.db.delete(twoFactorCodes).where(eq(twoFactorCodes.id, result[0].id));
    return true;
  }

  async get2FACode(userId: string): Promise<{ id: string; userId: string; code: string; expiresAt: Date } | undefined> {
    const result = await this.db
      .select()
      .from(twoFactorCodes)
      .where(eq(twoFactorCodes.userId, userId))
      .limit(1);
    
    if (!result[0]) return undefined;
    
    // Проверяем, не истёк ли код
    if (new Date() > result[0].expiresAt) {
      await this.db.delete(twoFactorCodes).where(eq(twoFactorCodes.id, result[0].id));
      return undefined;
    }
    
    return result[0];
  }

  async delete2FACode(codeId: string): Promise<boolean> {
    const result = await this.db.delete(twoFactorCodes).where(eq(twoFactorCodes.id, codeId));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async deleteExpired2FACodes(): Promise<void> {
    // Удаляем истёкшие коды
    await this.db.delete(twoFactorCodes).where(
      lt(twoFactorCodes.expiresAt, new Date())
    );
  }

  async updateApiKeyLastUsed(id: string): Promise<void> {
    await this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }
}

