import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoles = ["admin", "operator", "viewer"] as const;
export type UserRole = typeof userRoles[number];

export const userPermissions = [
  "servers.view",
  "servers.control",
  "servers.manage",
  "nodes.manage",
  "plugins.manage",
  "activity.view",
  "users.manage",
] as const;
export type UserPermission = typeof userPermissions[number];

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("admin"),
  permissions: jsonb("permissions")
    .$type<UserPermission[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  allowedServerIds: jsonb("allowed_server_ids").$type<string[] | null>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
  permissions: true,
  allowedServerIds: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

const permissionEnum = z.enum(userPermissions);
const roleEnum = z.enum(userRoles);

export const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(4),
  role: roleEnum,
  permissions: z.array(permissionEnum).default([]),
  allowedServerIds: z.array(z.string().uuid()).default([]),
  allServersAccess: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(4).optional(),
  role: roleEnum.optional(),
  permissions: z.array(permissionEnum).optional(),
  allowedServerIds: z.array(z.string().uuid()).optional(),
  allServersAccess: z.boolean().optional(),
});

export interface UserProfile {
  id: string;
  username: string;
  role: UserRole;
  permissions: UserPermission[];
  allowedServerIds: string[] | null;
  hasAllServerAccess: boolean;
  createdAt: string;
}

export interface AuthSession {
  user: UserProfile;
  csrfToken: string;
  version?: string;
}

// Nodes table (physical/virtual servers)
export const nodes = pgTable("nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location").notNull(),
  ip: text("ip").notNull(),
  port: integer("port").notNull().default(2375),
  status: text("status").notNull().default("online"),
  cpuCores: integer("cpu_cores").notNull(),
  ramTotal: integer("ram_total").notNull(),
  diskTotal: integer("disk_total").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeSchema = createInsertSchema(nodes).omit({
  id: true,
  createdAt: true,
});

export type InsertNode = z.infer<typeof insertNodeSchema>;
export type Node = typeof nodes.$inferSelect;

// Game server types
export const gameTypes = [
  "minecraft",
  "csgo",
  "rust",
  "ark",
  "valheim",
  "terraria",
  "gmod",
  "custom"
] as const;

export type GameType = typeof gameTypes[number];

// Servers table (game servers)
export const servers = pgTable("servers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  gameType: text("game_type").notNull(),
  nodeId: varchar("node_id").notNull(),
  containerId: text("container_id"),
  status: text("status").notNull().default("stopped"),
  cpuLimit: integer("cpu_limit").notNull(),
  ramLimit: integer("ram_limit").notNull(),
  diskLimit: integer("disk_limit").notNull(),
  port: integer("port").notNull(),
  autoStart: boolean("auto_start").notNull().default(false),
  config: jsonb("config").default({}),
  // Visibility settings - какие компоненты видны пользователям
  visibility: jsonb("visibility").$type<{
    console?: boolean;
    files?: boolean;
    stats?: boolean;
    settings?: boolean;
    backups?: boolean;
    ports?: boolean;
    sftp?: boolean;
  }>().default({}),
  // Limits - лимиты для различных функций
  limits: jsonb("limits").$type<{
    maxPorts?: number;
    maxBackups?: number;
    maxSftpUsers?: number;
  }>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertServerSchema = createInsertSchema(servers).omit({
  id: true,
  containerId: true,
  createdAt: true,
});

export type InsertServer = z.infer<typeof insertServerSchema>;
export type Server = typeof servers.$inferSelect;

// Server stats (real-time metrics)
export interface ServerStats {
  serverId: string;
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  networkRx: number;
  networkTx: number;
  uptime: number;
  timestamp: number;
}

// Activity log
export const activityTypes = [
  "server_start",
  "server_stop",
  "server_restart",
  "server_create",
  "server_delete",
  "server_command",
  "backup_create",
  "backup_restore",
  "backup_delete",
  "port_create",
  "port_delete",
  "sftp_user_create",
  "sftp_user_delete",
  "node_add",
  "node_delete",
  "user_login",
  "password_change",
  "user_create",
  "user_update",
  "user_delete",
  "security_event",
] as const;

export type ActivityType = typeof activityTypes[number];

// Activities table
export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  userId: varchar("user_id"),
});

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: Date;
  userId?: string;
}

// Node stats (real-time metrics)
export interface NodeStats {
  nodeId: string;
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  serversCount: number;
  timestamp: number;
}

// File system entry
export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: number;
}

// Console log entry
export interface ConsoleLog {
  timestamp: number;
  message: string;
  type: "info" | "error" | "warn" | "system";
}

// Change password schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(4, "New password must be at least 4 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ChangePassword = z.infer<typeof changePasswordSchema>;

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type Login = z.infer<typeof loginSchema>;

// Server command schema
export const serverCommandSchema = z.object({
  serverId: z.string(),
  command: z.string().min(1, "Command cannot be empty"),
});

export type ServerCommand = z.infer<typeof serverCommandSchema>;

// Backups table
export const backups = pgTable("backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  size: integer("size").notNull().default(0), // размер в байтах
  path: text("path").notNull(), // путь к файлу бекапа
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by"), // ID пользователя, создавшего бекап
});

export type Backup = typeof backups.$inferSelect;
export type InsertBackup = typeof backups.$inferInsert;

// Ports table (дополнительные порты для сервера)
export const serverPorts = pgTable("server_ports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull().default("tcp"), // tcp, udp
  name: text("name"), // название порта (например, "Rcon", "Query")
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(false), // публичный или внутренний
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ServerPort = typeof serverPorts.$inferSelect;
export type InsertServerPort = typeof serverPorts.$inferInsert;

// SFTP users table
export const sftpUsers = pgTable("sftp_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(), // зашифрованный пароль
  homeDirectory: text("home_directory").notNull().default("/data"), // домашняя директория
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by"), // ID пользователя, создавшего SFTP пользователя
});

export type SftpUser = typeof sftpUsers.$inferSelect;
export type InsertSftpUser = typeof sftpUsers.$inferInsert;
