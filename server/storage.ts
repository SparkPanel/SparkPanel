import { type User, type InsertUser, type Server, type InsertServer, type Node, type InsertNode, type ServerStats, type NodeStats, type Activity, type UserPermission, type UserRole, userPermissions } from "@shared/schema";
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private servers: Map<string, Server>;
  private nodes: Map<string, Node>;
  private serverStats: Map<string, ServerStats>;
  private nodeStats: Map<string, NodeStats>;
  private activities: Activity[];

  constructor() {
    this.users = new Map();
    this.servers = new Map();
    this.nodes = new Map();
    this.serverStats = new Map();
    this.nodeStats = new Map();
    this.activities = [];

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
      for (const [userId, user] of this.users.entries()) {
        if (user.allowedServerIds && Array.isArray(user.allowedServerIds)) {
          const filtered = user.allowedServerIds.filter((serverId) => serverId !== id);
          if (filtered.length !== user.allowedServerIds.length) {
            this.users.set(userId, { ...user, allowedServerIds: filtered });
          }
        }
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
}

export const storage = new MemStorage();
