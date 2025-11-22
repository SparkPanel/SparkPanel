import { type User, type InsertUser, type Server, type InsertServer, type Node, type InsertNode, type ServerStats, type NodeStats, type Activity, type UserPermission, type UserRole, userPermissions, type Backup, type InsertBackup, type ServerPort, type InsertServerPort, type SftpUser, type InsertSftpUser } from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserPassword(id: string, newPasswordHash: string): Promise<void>;
  deleteUser(id: string): Promise<boolean>;

  // Servers
  getAllServers(): Promise<Server[]>;
  getServer(id: string): Promise<Server | undefined>;
  createServer(server: InsertServer): Promise<Server>;
  updateServer(id: string, updates: Partial<Server>): Promise<Server | undefined>;
  deleteServer(id: string): Promise<boolean>;

  // Nodes
  getAllNodes(): Promise<Node[]>;
  getNode(id: string): Promise<Node | undefined>;
  createNode(node: InsertNode): Promise<Node>;
  updateNode(id: string, updates: Partial<Node>): Promise<Node | undefined>;
  deleteNode(id: string): Promise<boolean>;

  // Stats (in-memory, not persisted)
  setServerStats(id: string, stats: ServerStats): void;
  getServerStats(id: string): ServerStats | undefined;
  getAllServerStats(): Record<string, ServerStats>;
  setNodeStats(id: string, stats: NodeStats): void;
  getNodeStats(id: string): NodeStats | undefined;
  getAllNodeStats(): Record<string, NodeStats>;

  // Activity log
  addActivity(activity: Omit<Activity, 'id'>): Promise<Activity>;
  getRecentActivities(limit?: number): Promise<Activity[]>;

  // Backups
  getBackupsByServer(serverId: string): Promise<Backup[]>;
  getBackup(id: string): Promise<Backup | undefined>;
  createBackup(backup: InsertBackup): Promise<Backup>;
  deleteBackup(id: string): Promise<boolean>;

  // Server Ports
  getPortsByServer(serverId: string): Promise<ServerPort[]>;
  getPort(id: string): Promise<ServerPort | undefined>;
  createPort(port: InsertServerPort): Promise<ServerPort>;
  deletePort(id: string): Promise<boolean>;
  checkPortAvailable(port: number, excludeServerId?: string): Promise<boolean>;

  // SFTP Users
  getSftpUsersByServer(serverId: string): Promise<SftpUser[]>;
  getSftpUser(id: string): Promise<SftpUser | undefined>;
  createSftpUser(user: InsertSftpUser): Promise<SftpUser>;
  updateSftpUser(id: string, updates: Partial<SftpUser>): Promise<SftpUser | undefined>;
  deleteSftpUser(id: string): Promise<boolean>;

  // Panel Settings
  getPanelSettings(): Promise<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }>;
  updatePanelSettings(settings: { panelName?: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }): Promise<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private servers: Map<string, Server>;
  private nodes: Map<string, Node>;
  private serverStats: Map<string, ServerStats>;
  private nodeStats: Map<string, NodeStats>;
  private activities: Activity[];
  private backups: Map<string, Backup>;
  private serverPorts: Map<string, ServerPort>;
  private sftpUsers: Map<string, SftpUser>;

  constructor() {
    this.users = new Map();
    this.servers = new Map();
    this.nodes = new Map();
    this.serverStats = new Map();
    this.nodeStats = new Map();
    this.activities = [];
    this.backups = new Map();
    this.serverPorts = new Map();
    this.sftpUsers = new Map();

    // Initialize default user (adplayer/0000) - вызываем синхронно
    this.initializeDefaultUser().catch((err) => {
      console.error("Failed to initialize default user:", err);
    });
  }

  private async initializeDefaultUser(): Promise<void> {
    try {
      const defaultUsername = "adplayer";
      const defaultPassword = "0000";
      const existing = await this.getUserByUsername(defaultUsername);
      
      if (!existing) {
        const passwordHash = await bcrypt.hash(defaultPassword, 10);
        const user: User = {
          id: randomUUID(),
          username: defaultUsername,
          password: passwordHash,
          role: "admin",
          permissions: [...userPermissions],
          allowedServerIds: null,
          createdAt: new Date(),
        };
        this.users.set(user.id, user);
      }
    } catch (error) {
      console.error("Error initializing default user:", error);
      throw error;
    }
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    
    // Обрабатываем permissions - может быть Json из базы данных
    let permissions: UserPermission[] = [];
    if (Array.isArray(insertUser.permissions)) {
      permissions = insertUser.permissions.filter((p): p is UserPermission => 
        typeof p === "string" && userPermissions.includes(p as UserPermission)
      );
    }
    
    // Обрабатываем allowedServerIds - может быть Json из базы данных
    let allowedServerIds: string[] | null = null;
    if (insertUser.allowedServerIds !== undefined && insertUser.allowedServerIds !== null) {
      if (Array.isArray(insertUser.allowedServerIds)) {
        allowedServerIds = insertUser.allowedServerIds.filter((id): id is string => typeof id === "string");
      }
    }
    
    const user: User = {
      ...insertUser,
      id,
      role: (insertUser.role as UserRole) ?? "viewer",
      permissions,
      allowedServerIds,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) {
      return undefined;
    }
    
    // Обрабатываем permissions
    let permissions: UserPermission[] = user.permissions;
    if (updates.permissions !== undefined) {
      if (Array.isArray(updates.permissions)) {
        permissions = updates.permissions.filter((p): p is UserPermission => 
          typeof p === "string" && userPermissions.includes(p as UserPermission)
        );
      }
    }
    
    // Обрабатываем allowedServerIds
    let allowedServerIds: string[] | null = user.allowedServerIds;
    if (updates.allowedServerIds !== undefined) {
      if (updates.allowedServerIds === null) {
        allowedServerIds = null;
      } else if (Array.isArray(updates.allowedServerIds)) {
        allowedServerIds = updates.allowedServerIds.filter((id): id is string => typeof id === "string");
      }
    }
    
    const updated: User = {
      ...user,
      ...updates,
      permissions,
      allowedServerIds,
    };
    this.users.set(id, updated);
    return updated;
  }

  async updateUserPassword(id: string, newPasswordHash: string): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.password = newPasswordHash;
      this.users.set(id, user);
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  // Servers
  async getAllServers(): Promise<Server[]> {
    return Array.from(this.servers.values());
  }

  async getServer(id: string): Promise<Server | undefined> {
    return this.servers.get(id);
  }

  async createServer(insertServer: InsertServer): Promise<Server> {
    const id = randomUUID();
    const server: Server = {
      ...insertServer,
      id,
      status: insertServer.status ?? "stopped",
      containerId: null,
      autoStart: insertServer.autoStart ?? false,
      config: insertServer.config ?? {},
      visibility: (insertServer.visibility as Server['visibility']) ?? {},
      limits: (insertServer.limits as Server['limits']) ?? {},
      createdAt: new Date(),
    };
    this.servers.set(id, server);
    return server;
  }

  async updateServer(id: string, updates: Partial<Server>): Promise<Server | undefined> {
    const server = this.servers.get(id);
    if (server) {
      const updated = { ...server, ...updates };
      this.servers.set(id, updated);
      return updated;
    }
    return undefined;
  }

  async deleteServer(id: string): Promise<boolean> {
    const deleted = this.servers.delete(id);
    if (deleted) {
      // Удаляем связанные данные
      for (const [userId, user] of this.users.entries()) {
        if (user.allowedServerIds && Array.isArray(user.allowedServerIds)) {
          const filtered = user.allowedServerIds.filter((serverId) => serverId !== id);
          if (filtered.length !== user.allowedServerIds.length) {
            this.users.set(userId, { ...user, allowedServerIds: filtered });
          }
        }
      }
      // Удаляем бекапы
      const backups = await this.getBackupsByServer(id);
      for (const backup of backups) {
        this.backups.delete(backup.id);
      }
      // Удаляем порты
      const ports = await this.getPortsByServer(id);
      for (const port of ports) {
        this.serverPorts.delete(port.id);
      }
      // Удаляем SFTP пользователей
      const sftpUsers = await this.getSftpUsersByServer(id);
      for (const sftpUser of sftpUsers) {
        this.sftpUsers.delete(sftpUser.id);
      }
    }
    return deleted;
  }

  // Nodes
  async getAllNodes(): Promise<Node[]> {
    return Array.from(this.nodes.values());
  }

  async getNode(id: string): Promise<Node | undefined> {
    return this.nodes.get(id);
  }

  async createNode(insertNode: InsertNode): Promise<Node> {
    const id = randomUUID();
    const node: Node = {
      ...insertNode,
      id,
      status: insertNode.status ?? "online",
      port: insertNode.port ?? 2375,
      createdAt: new Date(),
    };
    this.nodes.set(id, node);
    return node;
  }

  async updateNode(id: string, updates: Partial<Node>): Promise<Node | undefined> {
    const node = this.nodes.get(id);
    if (node) {
      const updated = { ...node, ...updates };
      this.nodes.set(id, updated);
      return updated;
    }
    return undefined;
  }

  async deleteNode(id: string): Promise<boolean> {
    return this.nodes.delete(id);
  }

  // Stats
  setServerStats(id: string, stats: ServerStats): void {
    this.serverStats.set(id, stats);
  }

  getServerStats(id: string): ServerStats | undefined {
    return this.serverStats.get(id);
  }

  getAllServerStats(): Record<string, ServerStats> {
    const stats: Record<string, ServerStats> = {};
    this.serverStats.forEach((value, key) => {
      stats[key] = value;
    });
    return stats;
  }

  setNodeStats(id: string, stats: NodeStats): void {
    this.nodeStats.set(id, stats);
  }

  getNodeStats(id: string): NodeStats | undefined {
    return this.nodeStats.get(id);
  }

  getAllNodeStats(): Record<string, NodeStats> {
    const stats: Record<string, NodeStats> = {};
    this.nodeStats.forEach((value, key) => {
      stats[key] = value;
    });
    return stats;
  }

  // Activity log
  async addActivity(activity: Omit<Activity, 'id'>): Promise<Activity> {
    const newActivity: Activity = {
      ...activity,
      id: randomUUID(),
    };
    this.activities.unshift(newActivity);
    // Keep only last 100 activities
    if (this.activities.length > 100) {
      this.activities = this.activities.slice(0, 100);
    }
    return newActivity;
  }

  async getRecentActivities(limit: number = 50): Promise<Activity[]> {
    return this.activities.slice(0, limit);
  }

  // Backups
  async getBackupsByServer(serverId: string): Promise<Backup[]> {
    return Array.from(this.backups.values()).filter(b => b.serverId === serverId);
  }

  async getBackup(id: string): Promise<Backup | undefined> {
    return this.backups.get(id);
  }

  async createBackup(insertBackup: InsertBackup): Promise<Backup> {
    const id = randomUUID();
    const backup: Backup = {
      ...insertBackup,
      id,
      size: insertBackup.size ?? 0,
      description: insertBackup.description ?? null,
      createdBy: insertBackup.createdBy ?? null,
      createdAt: new Date(),
    };
    this.backups.set(id, backup);
    return backup;
  }

  async deleteBackup(id: string): Promise<boolean> {
    return this.backups.delete(id);
  }

  // Server Ports
  async getPortsByServer(serverId: string): Promise<ServerPort[]> {
    return Array.from(this.serverPorts.values()).filter(p => p.serverId === serverId);
  }

  async getPort(id: string): Promise<ServerPort | undefined> {
    return this.serverPorts.get(id);
  }

  async createPort(insertPort: InsertServerPort): Promise<ServerPort> {
    const id = randomUUID();
    const port: ServerPort = {
      ...insertPort,
      id,
      protocol: insertPort.protocol ?? "tcp",
      name: insertPort.name ?? null,
      description: insertPort.description ?? null,
      isPublic: insertPort.isPublic ?? false,
      createdAt: new Date(),
    };
    this.serverPorts.set(id, port);
    return port;
  }

  async deletePort(id: string): Promise<boolean> {
    return this.serverPorts.delete(id);
  }

  async checkPortAvailable(port: number, excludeServerId?: string): Promise<boolean> {
    // Проверяем, не используется ли порт другим сервером или портом
    const allServers = Array.from(this.servers.values());
    const allPorts = Array.from(this.serverPorts.values());
    
    // Проверяем основной порт серверов
    const serverUsingPort = allServers.find(s => s.port === port && s.id !== excludeServerId);
    if (serverUsingPort) return false;
    
    // Проверяем дополнительные порты
    const portInUse = allPorts.find(p => p.port === port && p.serverId !== excludeServerId);
    if (portInUse) return false;
    
    return true;
  }

  // SFTP Users
  async getSftpUsersByServer(serverId: string): Promise<SftpUser[]> {
    return Array.from(this.sftpUsers.values()).filter(u => u.serverId === serverId);
  }

  async getSftpUser(id: string): Promise<SftpUser | undefined> {
    return this.sftpUsers.get(id);
  }

  async createSftpUser(insertUser: InsertSftpUser): Promise<SftpUser> {
    const id = randomUUID();
    const user: SftpUser = {
      ...insertUser,
      id,
      homeDirectory: insertUser.homeDirectory ?? "/data",
      isActive: insertUser.isActive ?? true,
      createdBy: insertUser.createdBy ?? null,
      createdAt: new Date(),
    };
    this.sftpUsers.set(id, user);
    return user;
  }

  async updateSftpUser(id: string, updates: Partial<SftpUser>): Promise<SftpUser | undefined> {
    const user = this.sftpUsers.get(id);
    if (user) {
      const updated = { ...user, ...updates };
      this.sftpUsers.set(id, updated);
      return updated;
    }
    return undefined;
  }

  async deleteSftpUser(id: string): Promise<boolean> {
    return this.sftpUsers.delete(id);
  }

  // Panel Settings
  private panelSettings: { panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string } = {
    panelName: "SparkPanel",
    primaryColor: undefined, // По умолчанию используется тема
    backgroundColor: undefined, // По умолчанию используется тема
    borderColor: undefined, // По умолчанию используется тема
    sidebarAccentColor: undefined, // По умолчанию используется тема
  };

  async getPanelSettings(): Promise<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }> {
    return { ...this.panelSettings };
  }

  async updatePanelSettings(settings: { panelName?: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }): Promise<{ panelName: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string }> {
    this.panelSettings = { ...this.panelSettings, ...settings };
    return { ...this.panelSettings };
  }
}

// Выбираем хранилище в зависимости от наличия DATABASE_URL
// Если DATABASE_URL установлен - используем PostgreSQL, иначе - in-memory
let storage: IStorage;

if (process.env.DATABASE_URL) {
  try {
    const { PostgresStorage } = await import("./postgres-storage");
    storage = new PostgresStorage(process.env.DATABASE_URL);
    console.log("[storage] Using PostgreSQL storage");
  } catch (error) {
    console.error("[storage] Failed to initialize PostgreSQL storage, falling back to in-memory:", error);
    storage = new MemStorage();
    console.log("[storage] Using in-memory storage (fallback)");
  }
} else {
  storage = new MemStorage();
  console.log("[storage] Using in-memory storage (DATABASE_URL not set)");
  console.log("[storage] Note: Data will not persist between restarts. Set DATABASE_URL to enable PostgreSQL.");
}

export { storage };
