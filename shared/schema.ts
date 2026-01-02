import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Все доступные права доступа в системе
export const userPermissions = [
  // Серверы - просмотр
  "servers.view",        // Просмотр списка серверов
  // Серверы - управление
  "servers.control",     // Управление серверами (start/stop/restart)
  "servers.console",     // Доступ к консоли сервера
  "servers.command",     // Отправка команд в консоль
  "servers.files",       // Доступ к файлам сервера
  "servers.config",      // Редактирование конфигурации
  "servers.backups",     // Управление бэкапами
  "servers.ports",       // Управление портами
  "servers.manage",      // Полное управление (создание/удаление/настройка)
  // Ноды
  "nodes.view",          // Просмотр нод
  "nodes.manage",        // Управление нодами
  // Плагины
  "plugins.view",        // Просмотр плагинов
  "plugins.manage",      // Управление плагинами
  // Активность
  "activity.view",       // Просмотр журнала активности
  // Пользователи
  "users.view",          // Просмотр пользователей
  "users.manage",        // Управление пользователями
  // Настройки панели
  "settings.view",       // Просмотр настроек
  "settings.manage",     // Изменение настроек панели
  "panel.colors",        // Управление цветами и внешним видом панели
  // KVM консоль
  "kvm.access",          // Доступ к KVM консоли
  // API управление
  "api.manage",          // Управление API ключами
  "api.read",            // Чтение информации об API
  // Anti-DDoS защита
  "ddos.manage",         // Управление защитой от DDoS
  "ddos.view",           // Просмотр DDoS статистики
  // Резервные копии
  "backups.manage",      // Управление резервными копиями
  "backups.view",        // Просмотр резервных копий
  // Логи
  "logs.view",           // Просмотр логов сервера
] as const;
export type UserPermission = typeof userPermissions[number];

// Описания прав для UI (используется в users.tsx как permissionMeta)
export const permissionMeta: Record<UserPermission, { label: string; description: string; category: string }> = {
  "servers.view": { label: "Просмотр серверов", description: "Просмотр списка и информации о серверах", category: "Серверы" },
  "servers.control": { label: "Управление серверами", description: "Запуск, остановка, перезагрузка серверов", category: "Серверы" },
  "servers.console": { label: "Консоль сервера", description: "Доступ к консоли сервера", category: "Серверы" },
  "servers.command": { label: "Отправка команд", description: "Отправка команд в консоль", category: "Серверы" },
  "servers.files": { label: "Файлы сервера", description: "Просмотр и редактирование файлов сервера", category: "Серверы" },
  "servers.config": { label: "Конфигурация", description: "Редактирование конфигурации сервера", category: "Серверы" },
  "servers.backups": { label: "Управление бэкапами", description: "Создание и восстановление резервных копий", category: "Серверы" },
  "servers.ports": { label: "Управление портами", description: "Добавление и удаление портов", category: "Серверы" },
  "servers.manage": { label: "Полное управление", description: "Создание, удаление и полная настройка серверов", category: "Серверы" },
  "nodes.view": { label: "Просмотр нод", description: "Просмотр списка и статуса нод", category: "Ноды" },
  "nodes.manage": { label: "Управление нодами", description: "Добавление, удаление и настройка нод", category: "Ноды" },
  "plugins.view": { label: "Просмотр плагинов", description: "Просмотр установленных плагинов", category: "Плагины" },
  "plugins.manage": { label: "Управление плагинами", description: "Установка, удаление и настройка плагинов", category: "Плагины" },
  "activity.view": { label: "Журнал активности", description: "Просмотр истории действий", category: "Система" },
  "users.view": { label: "Просмотр пользователей", description: "Просмотр списка пользователей", category: "Пользователи" },
  "users.manage": { label: "Управление пользователями", description: "Создание, удаление и редактирование пользователей", category: "Пользователи" },
  "settings.view": { label: "Просмотр настроек", description: "Просмотр настроек панели", category: "Система" },
  "settings.manage": { label: "Управление настройками", description: "Изменение настроек панели", category: "Система" },
  "panel.colors": { label: "Управление цветами", description: "Изменение цветов панели и названия", category: "Система" },
  "kvm.access": { label: "KVM консоль", description: "Доступ к терминалу VDS", category: "Система" },
  "api.manage": { label: "Управление API", description: "Создание и управление API ключами", category: "Администрирование" },
  "api.read": { label: "Просмотр API", description: "Просмотр информации об API ключах", category: "Администрирование" },
  "ddos.manage": { label: "Управление DDoS", description: "Управление защитой от DDoS атак", category: "Администрирование" },
  "ddos.view": { label: "Просмотр DDoS", description: "Просмотр статистики DDoS защиты", category: "Администрирование" },
  "backups.manage": { label: "Управление бэкапами", description: "Полное управление резервными копиями", category: "Хранилище" },
  "backups.view": { label: "Просмотр бэкапов", description: "Просмотр списка резервных копий", category: "Хранилище" },
  "logs.view": { label: "Просмотр логов", description: "Просмотр логов сервера", category: "Система" },
};

// Шаблоны прав для быстрого назначения (не обязательные роли)
export const permissionPresets = {
  full: [...userPermissions] as UserPermission[], // Все права
  admin: ["servers.manage", "nodes.manage", "users.manage", "settings.manage", "panel.colors", "api.manage", "ddos.manage", "backups.manage", "plugins.manage"] as UserPermission[],
  operator: ["servers.view", "servers.control", "servers.console", "servers.files", "servers.config", "servers.backups", "servers.ports", "nodes.view", "activity.view", "plugins.view", "backups.view", "logs.view"] as UserPermission[],
  viewer: ["servers.view", "nodes.view", "activity.view", "backups.view", "logs.view", "api.read", "ddos.view"] as UserPermission[],
} as const;

// Убираем обязательные роли - теперь это просто метка для удобства
export const userRoles = ["admin", "operator", "viewer", "custom"] as const;
export type UserRole = typeof userRoles[number];

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  nickname: text("nickname"),
  // Роль теперь просто информационное поле, основной контроль через permissions
  role: text("role").notNull().default("custom"),
  permissions: jsonb("permissions")
    .$type<UserPermission[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  allowedServerIds: jsonb("allowed_server_ids").$type<string[] | null>(),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  telegramBotToken: text("telegram_bot_token"), // Telegram bot token
  telegramChatId: text("telegram_chat_id"), // Telegram chat ID пользователя
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Table for 2FA codes
export const twoFactorCodes = pgTable("two_factor_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  nickname: true,
  permissions: true,
  allowedServerIds: true,
  twoFactorEnabled: true,
  telegramBotToken: true,
  telegramChatId: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Вспомогательная функция для проверки наличия всех прав
export const hasAllPermissions = (permissions: UserPermission[]): boolean => {
  return userPermissions.every(p => permissions.includes(p));
};

const permissionEnum = z.enum(userPermissions);
const roleEnum = z.enum(userRoles);

export const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(4),
  permissions: z.array(permissionEnum).min(1, "Выберите хотя бы одно право доступа"),
  allowedServerIds: z.array(z.string().uuid()).default([]),
  allServersAccess: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(4).optional(),
  nickname: z.string().max(50).optional(),
  permissions: z.array(permissionEnum).optional(),
  allowedServerIds: z.array(z.string().uuid()).optional(),
  allServersAccess: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
  telegramBotToken: z.string().optional(),
  telegramChatId: z.string().optional(),
});

export interface UserProfile {
  id: string;
  username: string;
  nickname?: string;
  permissions: UserPermission[];
  allowedServerIds: string[] | null;
  hasAllServerAccess: boolean;
  twoFactorEnabled: boolean;
  telegramBotToken?: string;
  telegramChatId?: string;
  createdAt: string;
  isFullAccess: boolean; // true если есть все права
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
  "sftp_user_update",
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

// API Keys table - для управления API доступом к панели
export const apiKeys = pgTable("api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  key: text("key").notNull().unique(), // уникальный API ключ
  description: text("description"),
  permissions: jsonb("permissions")
    .$type<UserPermission[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"), // null = не истекает
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").notNull(), // ID пользователя, создавшего ключ
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// DDoS Protection settings - настройки защиты от DDoS атак
export const ddosSettings = pgTable("ddos_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  targetType: text("target_type").notNull(), // 'panel' или 'server'
  targetId: varchar("target_id"), // null для панели, serverId для сервера
  
  // L3 Protection (Network Layer)
  l3Enabled: boolean("l3_enabled").notNull().default(false),
  l3MaxPacketsPerSecond: integer("l3_max_packets_per_second").default(10000),
  l3BlockDuration: integer("l3_block_duration").default(3600), // секунды
  
  // L4 Protection (Transport Layer)
  l4Enabled: boolean("l4_enabled").notNull().default(false),
  l4MaxConnectionsPerIp: integer("l4_max_connections_per_ip").default(100),
  l4SynFloodProtection: boolean("l4_syn_flood_protection").notNull().default(false),
  
  // L7 Protection (Application Layer)
  l7Enabled: boolean("l7_enabled").notNull().default(false),
  l7MaxRequestsPerMinute: integer("l7_max_requests_per_minute").default(60),
  l7ChallengeMode: boolean("l7_challenge_mode").notNull().default(false), // JS challenge
  l7UserAgentBlocking: boolean("l7_user_agent_blocking").notNull().default(false),
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: varchar("updated_by"), // ID пользователя, обновившего настройки
});

export type DdosSettings = typeof ddosSettings.$inferSelect;
export type InsertDdosSettings = typeof ddosSettings.$inferInsert;

// Panel Settings table
export const panelSettings = pgTable("panel_settings", {
  id: varchar("id").primaryKey().default("main"),
  panelName: text("panel_name").notNull().default("SparkPanel v1.3.1"),
  primaryColor: text("primary_color"),
  backgroundColor: text("background_color"),
  borderColor: text("border_color"),
  sidebarAccentColor: text("sidebar_accent_color"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PanelSettings = typeof panelSettings.$inferSelect;
export type InsertPanelSettings = typeof panelSettings.$inferInsert;
