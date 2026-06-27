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
  "servers.console",
  "servers.command",
  "servers.files",
  "servers.config",
  "servers.backups",
  "servers.ports",
  "nodes.view",
  "nodes.manage",
  "plugins.view",
  "plugins.manage",
  "activity.view",
  "users.view",
  "users.manage",
  "settings.view",
  "settings.manage",
  "backups.view",
  "backups.manage",
  "logs.view",
  "ddos.view",
  "ddos.manage",
  "kvm.access",
  "panel.colors",
  "api.read",
  "api.manage",
] as const;
export type UserPermission = typeof userPermissions[number];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  nickname: text("nickname"),
  role: text("role").notNull().default("admin"),
  permissions: jsonb("permissions")
    .$type<UserPermission[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  allowedServerIds: jsonb("allowed_server_ids").$type<string[] | null>(),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  telegramBotToken: text("telegram_bot_token"),
  telegramChatId: text("telegram_chat_id"),
  accessExpiresAt: timestamp("access_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  nickname: true,
  role: true,
  permissions: true,
  allowedServerIds: true,
  twoFactorEnabled: true,
  telegramBotToken: true,
  telegramChatId: true,
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
  isFullAccess?: boolean;
  twoFactorEnabled?: boolean;
  accessExpiresAt?: string | null;
  createdAt: string;
}

export interface AuthSession {
  user: UserProfile;
  csrfToken: string;
  version?: string;
}

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
  visibility: jsonb("visibility").$type<{
    console?: boolean;
    files?: boolean;
    stats?: boolean;
    settings?: boolean;
    backups?: boolean;
    ports?: boolean;
    sftp?: boolean;
  }>().default({}),
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
  "profile_update",
  "2fa_enable",
  "2fa_disable",
  "settings_update",
  "sftp_user_update",
  "security_event",
] as const;

export type ActivityType = typeof activityTypes[number];

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

export interface NodeStats {
  nodeId: string;
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  serversCount: number;
  timestamp: number;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  modified: number;
}

export interface ConsoleLog {
  timestamp: number;
  message: string;
  type: "info" | "error" | "warn" | "system";
}

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(4, "New password must be at least 4 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ChangePassword = z.infer<typeof changePasswordSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type Login = z.infer<typeof loginSchema>;

export const serverCommandSchema = z.object({
  serverId: z.string(),
  command: z.string().min(1, "Command cannot be empty"),
});

export type ServerCommand = z.infer<typeof serverCommandSchema>;

export const backups = pgTable("backups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  size: integer("size").notNull().default(0),
  path: text("path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by"),
});

export type Backup = typeof backups.$inferSelect;
export type InsertBackup = typeof backups.$inferInsert;

export const serverPorts = pgTable("server_ports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull().default("tcp"),
  name: text("name"),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ServerPort = typeof serverPorts.$inferSelect;
export type InsertServerPort = typeof serverPorts.$inferInsert;

export const sftpUsers = pgTable("sftp_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  homeDirectory: text("home_directory").notNull().default("/data"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by"),
});

export type SftpUser = typeof sftpUsers.$inferSelect;
export type InsertSftpUser = typeof sftpUsers.$inferInsert;

export const permissionMeta: Record<UserPermission, { label: string; description?: string }> = {
  "servers.view": { label: "Просмотр серверов", description: "Просмотр списка серверов и их информации" },
  "servers.control": { label: "Управление серверами", description: "Запуск, остановка и перезагрузка серверов" },
  "servers.manage": { label: "Полное управление серверами", description: "Создание, удаление и полная настройка серверов" },
  "servers.console": { label: "Доступ к консоли", description: "Просмотр консоли сервера" },
  "servers.command": { label: "Выполнение команд", description: "Отправка команд на сервер" },
  "servers.files": { label: "Управление файлами", description: "Просмотр и редактирование файлов сервера" },
  "servers.config": { label: "Управление конфигурацией", description: "Редактирование конфигурации сервера" },
  "servers.backups": { label: "Управление резервными копиями", description: "Создание и восстановление резервных копий" },
  "servers.ports": { label: "Управление портами", description: "Добавление и удаление портов" },
  "nodes.view": { label: "Просмотр нод", description: "Просмотр информации о физических серверах" },
  "nodes.manage": { label: "Управление нодами", description: "Управление физическими и виртуальными серверами" },
  "plugins.view": { label: "Просмотр плагинов", description: "Просмотр установленных плагинов" },
  "plugins.manage": { label: "Управление плагинами", description: "Установка и настройка плагинов" },
  "activity.view": { label: "Просмотр активности", description: "Просмотр логов активности" },
  "users.view": { label: "Просмотр пользователей", description: "Просмотр списка пользователей" },
  "users.manage": { label: "Управление пользователями", description: "Создание, редактирование и удаление пользователей" },
  "settings.view": { label: "Просмотр настроек", description: "Просмотр системных настроек" },
  "settings.manage": { label: "Управление настройками", description: "Изменение системных настроек" },
  "backups.view": { label: "Просмотр резервных копий", description: "Просмотр резервных копий" },
  "backups.manage": { label: "Управление резервными копиями", description: "Создание и восстановление резервных копий" },
  "logs.view": { label: "Просмотр логов", description: "Просмотр системных логов" },
  "ddos.view": { label: "Просмотр DDoS защиты", description: "Просмотр статуса DDoS защиты" },
  "ddos.manage": { label: "Управление DDoS защитой", description: "Настройка DDoS защиты" },
  "kvm.access": { label: "Доступ к KVM", description: "Доступ к виртуальной консоли" },
  "panel.colors": { label: "Настройка цветов", description: "Настройка цветовой схемы панели" },
  "api.read": { label: "Чтение API", description: "Доступ к чтению через API" },
  "api.manage": { label: "Управление API", description: "Управление API ключами и доступом" },
};

export const ddosSettings = pgTable("ddos_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetType: text("target_type").notNull(),
  targetId: varchar("target_id"),
  l3Enabled: boolean("l3_enabled").notNull().default(false),
  l3MaxPacketsPerSecond: integer("l3_max_packets_per_second"),
  l3BlockDuration: integer("l3_block_duration"),
  l4Enabled: boolean("l4_enabled").notNull().default(false),
  l4MaxConnectionsPerIp: integer("l4_max_connections_per_ip"),
  l4SynFloodProtection: boolean("l4_syn_flood_protection").notNull().default(false),
  l7Enabled: boolean("l7_enabled").notNull().default(false),
  l7MaxRequestsPerMinute: integer("l7_max_requests_per_minute"),
  l7ChallengeMode: boolean("l7_challenge_mode").notNull().default(false),
  l7UserAgentBlocking: boolean("l7_user_agent_blocking").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by"),
});

export type DdosSettings = typeof ddosSettings.$inferSelect;
export type InsertDdosSettings = typeof ddosSettings.$inferInsert;
