import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server as HTTPServer, type IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import session from "express-session";
import memorystore from "memorystore";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import multer from "multer";
import { createHash, randomBytes } from "crypto";
import { isIP } from "net";
import { createReadStream } from "fs";
import { unlink } from "fs/promises";
import { basename } from "path";
import { z } from "zod";
import {
  insertServerSchema,
  insertNodeSchema,
  loginSchema,
  changePasswordSchema,
  createUserSchema,
  updateUserSchema,
  userPermissions,
  gameTypes,
  type Server,
  type InsertServer,
  type Node as PanelNode,
  type User,
  type UserPermission,
  type UserRole,
  type UserProfile,
  type ApiKey,
} from "@shared/schema";
import { APP_VERSION } from "@shared/version";
import { storage } from "./storage";
import { PostgresStorage } from "./postgres-storage";
import { dataPath, ensureDir, settingsStore } from "./data-dir";
import { dockerManager } from "./docker-manager";
import { statsCollector } from "./stats-collector";
import { statsHistory } from "./stats-history";
import { logStreamer } from "./log-streamer";
import { vdsTerminal } from "./vds-terminal";
import { sanitizeCommand, sanitizeUsername, sanitizeSftpUsername, isValidUUID, loginRateLimiter, twoFactorRateLimiter, commandRateLimiter } from "./security";
import { generateCSRFToken, getOrCreateCSRFToken, verifyCSRFToken } from "./csrf";
import { logSecurityEvent } from "./security-logger";
import { pluginManager } from "./plugins/plugin-manager";
import { installPlugin } from "./plugins/plugin-installer";
import { generateTotpSecret, totpUri, verifyTotp, generateRecoveryCodes, consumeRecoveryCode } from "./totp";
import QRCode from "qrcode";
import { ddosProtection, CHALLENGE_PATH } from "./ddos-protection";
import { registerDdosRoutes } from "./ddos-routes";
import { getRuntimeVersions } from "./runtime-versions";
import { notify, sendToChannels, getNotificationSettings, saveNotificationSettings, publicNotificationSettings } from "./notifier";
import { ENV_KEY_PATTERN, RESERVED_ENV_KEYS, getEnvVars, type EnvVar } from "./game-templates";
import { deployFromGit, getGitSettings, newWebhookSecret, publicGitSettings, validateGitInput, verifyWebhook, type GitSettings } from "./git-deploy";
import { scheduler, TASK_TYPES, type ScheduledTaskType } from "./scheduler";
import { getBackupStorage, publicBackupStorage, saveBackupStorage, testBackupStorage } from "./s3-storage";
import { assertPortInPool, findFreePort, portPoolUsage, resolveServerPort, setPortPool } from "./port-pools";
import { getStatusPageSettings, publicStatus, saveStatusPageSettings } from "./status-page";
import { installFromCatalog, searchCatalog } from "./modrinth";
import { DATABASE_ENGINES, DATABASE_HOST, createServerDatabase, databaseStatus, getServerDatabase, removeDatabaseResources, type DatabaseEngine } from "./server-database";
import {
  SERVER_SCOPED_PERMISSIONS,
  assertWithinQuota,
  expiredServerIds,
  forgetUser,
  getServerAccess,
  getUserQuota,
  isServerOwner,
  memberServerIds,
  quotaUsage,
  removeServerAccess,
  serverPermissionsFor,
  setUserQuota,
  updateServerAccess,
  type ServerScopedPermission,
} from "./server-access";
import { createEnrollment, findEnrollment, installScript, markEnrollmentUsed, signNodeCertificate } from "./node-enrollment";
import { certificateStatus, dnsStatus, forgetServerDomains, getProxySettings, getServerDomains, saveProxySettings, setServerDomains, syncProxy } from "./domains";
import { connectHost, getPublicAddress, setPublicAddress } from "./node-address";
import { PLAYER_ACTIONS, getPlayers, playerAction } from "./minecraft-players";
import { ensureServerSecrets } from "./server-secrets";
import { invalidateOnStorageWrites, invalidateOnWrite, sendCachedJson } from "./response-cache";
import { addReplica, assertScalable, getScaling, removeAllReplicas, removeReplica, replicaStates, reservedPorts, syncReplicaFiles, updateScalingSettings } from "./scaling";
import { gamePlayerCommand, getGamePlayers, updateValheimList } from "./game-players";
import { installThunderstore, installUmod, searchThunderstore, searchUmod } from "./game-mods";
import { GAME_PROFILES, isProfiledGame, validateGameSettings, type GameSettings } from "@shared/game-profiles";
import { beginServerAction, isActionInProgress, type PowerAction } from "./server-actions";
import {
  compressPaths,
  copyServerFiles,
  ensureGameContainer,
  extractArchive,
  hasPendingConfigChanges,
  listFiles,
  makeDirectory,
  migrateServer,
  normalizeVirtualPath,
  pullLatestImage,
  readFileStream,
  readTextFile,
  removePath,
  removeServerResources,
  renamePath,
  searchFiles,
  syncSftp,
  writeFileStream,
  writeTextFile,
} from "./game-server";
import { createServerBackup, deleteAllServerBackups, deleteServerBackup, openBackupStream, restoreServerBackup } from "./backup-manager";

interface SecuritySettings {
  allowlistEnabled: boolean;
  allowedIps: string[];
  lockdownEnabled: boolean;
}

const ALL_PERMISSIONS: UserPermission[] = [...userPermissions];
const TEMP_DIR = ensureDir(dataPath("tmp"));
const UPLOAD_MAX_BYTES = (Number(process.env.UPLOAD_MAX_MB) || 512) * 1024 * 1024;

const unique = <T,>(items: T[]): T[] => Array.from(new Set(items));
const hasFullAccess = (permissions: UserPermission[]) => ALL_PERMISSIONS.every((p) => permissions.includes(p));
const hasPermission = (user: User, permission: UserPermission) => user.permissions.includes(permission);
const clientIp = (req: Request | IncomingMessage) =>
  (("ip" in req && req.ip) || req.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
const normalizeIp = (raw: string) => {
  const cleaned = raw.replace(/^::ffff:/, "");
  return cleaned === "::1" ? "127.0.0.1" : cleaned;
};
const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Ошибка с HTTP-статусом для единообразной обработки в маршрутах. */
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const handle =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch((error: any) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.errors.map((e) => `${e.path.join(".") || "body"}: ${e.message}`).join(", ") });
        return;
      }
      const status = error?.status || error?.statusCode;
      if (status && status >= 400 && status < 600 && status !== 500) {
        res.status(status).json({ message: error.message });
        return;
      }
      console.error(`${req.method} ${req.path} failed:`, error);
      res.status(500).json({ message: error?.message || "Internal Server Error" });
    });
  };

const serializeUser = (user: User): UserProfile & { nickname?: string | null; canCreateServers?: boolean } => ({
  id: user.id,
  username: user.username,
  nickname: user.nickname,
  role: user.role as UserRole,
  permissions:
    !user.permissions.includes("servers.view") && (memberServerIds(user.id).length > 0 || getUserQuota(user.id))
      ? [...user.permissions, "servers.view"]
      : user.permissions,
  canCreateServers: hasPermission(user, "servers.manage") || Boolean(getUserQuota(user.id)),
  allowedServerIds: user.allowedServerIds,
  hasAllServerAccess: user.allowedServerIds === null,
  isFullAccess: hasFullAccess(user.permissions),
  twoFactorEnabled: user.twoFactorEnabled,
  recoveryCodesLeft: user.twoFactorEnabled ? (user.twoFactorRecoveryCodes ?? []).length : undefined,
  accessExpiresAt: user.accessExpiresAt ? new Date(user.accessExpiresAt).toISOString() : null,
  createdAt: new Date(user.createdAt).toISOString(),
});

const serializeApiKey = ({ keyHash: _hash, ...key }: ApiKey) => key;

export async function registerRoutes(app: Express): Promise<HTTPServer> {
  /* ------------------------------------------------------------------ */
  /* Сессии                                                             */
  /* ------------------------------------------------------------------ */

  const isSecure = process.env.FORCE_HTTPS === "true";
  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    sessionSecret = settingsStore.get<string>("sessionSecret", "");
    if (!sessionSecret) {
      sessionSecret = randomBytes(32).toString("hex");
      await settingsStore.set("sessionSecret", sessionSecret);
    }
    console.warn("SESSION_SECRET is not set — using a generated secret stored in the data directory.");
  }

  const sessionStore =
    storage instanceof PostgresStorage
      ? new (connectPgSimple(session))({ pool: storage.pool, createTableIfMissing: true, tableName: "user_sessions" })
      : new (memorystore(session))({ checkPeriod: 24 * 60 * 60 * 1000 });

  const sessionMiddleware = session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: "sparkpanel.sid",
    store: sessionStore,
    rolling: true,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
    },
  });
  app.use(sessionMiddleware);
  app.use(invalidateOnWrite);
  invalidateOnStorageWrites(storage);

  /* ------------------------------------------------------------------ */
  /* Глобальные ограничения доступа                                      */
  /* ------------------------------------------------------------------ */

  const securitySettings: SecuritySettings = settingsStore.get("security", {
    allowlistEnabled: false,
    allowedIps: [],
    lockdownEnabled: false,
  });

  app.use((req, res, next) => {
    if (!securitySettings.allowlistEnabled || securitySettings.allowedIps.length === 0) return next();
    if (securitySettings.allowedIps.includes(normalizeIp(clientIp(req)))) return next();
    res.status(403).json({ message: "IP is not allowed" });
  });

  app.post(CHALLENGE_PATH, ddosProtection.handleChallengeSubmit);
  app.use((req, res, next) => {
    if (req.path.startsWith("/assets/") || req.path === "/favicon.ico") return next();
    void ddosProtection.applyProtection(req, res, next);
  });

  /* ------------------------------------------------------------------ */
  /* Аутентификация и права                                              */
  /* ------------------------------------------------------------------ */

  const apiKeyLastTouch = new Map<string, number>();

  /** Аутентификация по API-ключу: права ключа пересекаются с правами создавшего его пользователя. */
  const authenticateApiKey = async (req: Request): Promise<User | null> => {
    const header = (req.headers["x-api-key"] as string) || "";
    const bearer = String(req.headers.authorization || "");
    const rawKey = header || (bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : "");
    if (!rawKey) return null;
    const key = await storage.getApiKeyByHash(hashApiKey(rawKey));
    if (!key || !key.isActive || (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now())) {
      throw new HttpError(401, "Invalid or expired API key");
    }
    const owner = await storage.getUser(key.createdBy);
    if (!owner) throw new HttpError(401, "API key owner no longer exists");
    const last = apiKeyLastTouch.get(key.id) ?? 0;
    if (Date.now() - last > 60_000) {
      apiKeyLastTouch.set(key.id, Date.now());
      storage.updateApiKey(key.id, { lastUsedAt: new Date() }).catch(() => {});
    }
    req.apiKeyId = key.id;
    return { ...owner, permissions: key.permissions.filter((p) => owner.permissions.includes(p)) };
  };

  const requireAuth = handle(async (req, res, next) => {
    let user: User | null | undefined = await authenticateApiKey(req);
    if (!user) {
      if (!req.session?.userId || req.session.require2FA) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      user = await storage.getUser(req.session.userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Unauthorized" });
      }
    }
    if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now()) {
      if (!req.apiKeyId) req.session.destroy(() => {});
      return res.status(403).json({ message: "Temporary access expired" });
    }
    if (securitySettings.lockdownEnabled && !["GET", "HEAD"].includes(req.method) && !hasPermission(user, "settings.manage")) {
      return res.status(423).json({ message: "Panel is in lockdown mode" });
    }
    req.currentUser = user;
    next();
  });

  /** Доступ к серверу по общим правам пользователя (все серверы или список allowedServerIds). */
  const hasDirectServerAccess = (user: User, serverId: string) => user.allowedServerIds === null || (user.allowedServerIds ?? []).includes(serverId);

  /**
   * Право на конкретный сервер. Если доступ к серверу у пользователя только как у владельца или участника,
   * действуют лишь права, выданные на этот сервер, — общие права его роли к чужому серверу не применяются.
   */
  const canOnServer = (user: User, serverId: string, permission: UserPermission) =>
    (hasDirectServerAccess(user, serverId) && hasPermission(user, permission)) ||
    serverPermissionsFor(user.id, serverId).includes(permission as ServerScopedPermission);

  const requirePermission =
    (...permissions: UserPermission[]) =>
    (req: Request, res: Response, next: NextFunction) => {
      const user = req.currentUser;
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const serverId = req.path.startsWith("/api/servers/") && isValidUUID(req.params.id ?? "") ? req.params.id : null;
      const allowed = serverId
        ? permissions.some((p) => canOnServer(user, serverId, p))
        : permissions.some((p) => hasPermission(user, p)) || (permissions.includes("servers.view") && memberServerIds(user.id).length > 0);
      if (!allowed) return res.status(403).json({ message: "Insufficient permissions" });
      next();
    };

  const requireCSRF = (req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.apiKeyId) return next();
    const token = (req.headers["x-csrf-token"] as string) || req.body?._csrf;
    if (!verifyCSRFToken(req.session, token)) {
      void logSecurityEvent({
        type: "csrf_attack",
        ip: clientIp(req),
        userId: req.currentUser?.id,
        details: `Invalid CSRF token: ${req.method} ${req.path}`,
        timestamp: new Date(),
      });
      return res.status(403).json({ message: "Invalid CSRF token" });
    }
    next();
  };

  const userHasServerAccess = (user: User, serverId: string) => hasDirectServerAccess(user, serverId) || serverPermissionsFor(user.id, serverId).length > 0;

  /** Ключ кеша по видимости серверов: у всех с полным доступом список одинаковый. */
  const visibilityKey = (user: User) => (user.allowedServerIds === null && hasPermission(user, "servers.view") ? "all" : user.id);

  const filterServersForUser = (servers: Server[], user: User) => {
    if (user.allowedServerIds === null && hasPermission(user, "servers.view")) return servers;
    const visible = new Set([...(hasPermission(user, "servers.view") ? user.allowedServerIds ?? [] : []), ...memberServerIds(user.id)]);
    return servers.filter((s) => visible.has(s.id));
  };

  /** Загружает сервер из :id в res.locals.server и проверяет доступ пользователя к нему. */
  const loadServer = handle(async (req, res, next) => {
    const serverId = req.params.id;
    if (!isValidUUID(serverId)) return res.status(400).json({ message: "Invalid server ID" });
    const server = await storage.getServer(serverId);
    if (!server) return res.status(404).json({ message: "Server not found" });
    if (!userHasServerAccess(req.currentUser!, serverId)) return res.status(403).json({ message: "Access denied" });
    res.locals.server = server;
    next();
  });
  const srv = (res: Response) => res.locals.server as Server;

  const activity = (req: Request, type: Parameters<typeof storage.addActivity>[0]["type"], title: string, description: string) =>
    storage.addActivity({ type, title, description, timestamp: new Date(), userId: req.currentUser?.id }).catch(() => {});

  const resolveAllowedServerIds = async (allServersAccess: boolean, serverIds?: string[]): Promise<string[] | null> => {
    if (allServersAccess) return null;
    const ids = unique((serverIds ?? []).filter((id) => isValidUUID(id)));
    if (ids.length === 0) return [];
    const existing = new Set((await storage.getAllServers()).map((s) => s.id));
    return ids.filter((id) => existing.has(id));
  };

  const managers = (users: User[]) => users.filter((u) => u.permissions.includes("users.manage"));

  const createSessionForUser = (req: Request, userId: string, require2FA: boolean) =>
    new Promise<string>((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);
        req.session.userId = userId;
        req.session.require2FA = require2FA;
        const csrfToken = generateCSRFToken(req.session);
        req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve(csrfToken)));
      });
    });

  /* ------------------------------------------------------------------ */
  /* Auth                                                               */
  /* ------------------------------------------------------------------ */

  app.post(
    "/api/auth/login",
    handle(async (req, res) => {
      const ip = clientIp(req);
      const identifier = `login:${ip}`;
      if (!loginRateLimiter.checkLimit(identifier)) {
        await logSecurityEvent({ type: "brute_force", ip, details: "Too many login attempts", timestamp: new Date() });
        return res.status(429).json({ message: "Too many login attempts. Please try again later." });
      }

      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByUsername(String(data.username).trim());
      const passwordMatch = await bcrypt.compare(data.password, user?.password ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
      await pluginManager.callHook("user_login_attempt", user?.id, { username: data.username, ip, success: Boolean(user && passwordMatch) });
      if (!user || !passwordMatch) return res.status(401).json({ message: "Invalid credentials" });
      if (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now()) {
        return res.status(403).json({ message: "Temporary access expired" });
      }

      if (user.twoFactorEnabled && user.twoFactorSecret) {
        await createSessionForUser(req, user.id, true);
        loginRateLimiter.reset(identifier);
        return res.json({ require2FA: true, message: "Enter the code from your authenticator app" });
      }

      const csrfToken = await createSessionForUser(req, user.id, false);
      loginRateLimiter.reset(identifier);
      await storage.addActivity({ type: "user_login", title: "User Login", description: `User '${user.username}' logged in from ${ip}`, timestamp: new Date(), userId: user.id });
      res.json({ user: serializeUser(user), csrfToken, version: APP_VERSION });
    }),
  );

  app.post(
    "/api/auth/verify-2fa",
    handle(async (req, res) => {
      if (!req.session?.userId || !req.session.require2FA) {
        return res.status(401).json({ message: "Not in 2FA verification state" });
      }
      const ip = clientIp(req);
      if (!twoFactorRateLimiter.checkLimit(`2fa:${ip}`)) {
        return res.status(429).json({ message: "Too many attempts. Please try again later." });
      }
      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      if (!code) return res.status(400).json({ message: "Code is required" });
      const user = await storage.getUser(req.session.userId);
      if (!user || !user.twoFactorSecret) return res.status(401).json({ message: "User not found" });
      let method = "authenticator app";
      if (!verifyTotp(user.twoFactorSecret, code.replace(/\s/g, ""), user.id)) {
        const remaining = consumeRecoveryCode(user.twoFactorRecoveryCodes ?? [], code);
        if (!remaining) return res.status(401).json({ message: "Invalid code" });
        await storage.updateUser(user.id, { twoFactorRecoveryCodes: remaining });
        method = `recovery code, ${remaining.length} left`;
      }
      const csrfToken = await createSessionForUser(req, user.id, false);
      twoFactorRateLimiter.reset(`2fa:${ip}`);
      await storage.addActivity({ type: "user_login", title: "User Login", description: `User '${user.username}' logged in with 2FA (${method}) from ${ip}`, timestamp: new Date(), userId: user.id });
      res.json({ user: serializeUser(user), csrfToken, version: APP_VERSION });
    }),
  );

  app.post(
    "/api/auth/logout",
    requireAuth,
    requireCSRF,
    handle(async (req, res) => {
      const user = req.currentUser!;
      await pluginManager.callHook("user_logout", user.id, { userId: user.id, username: user.username, timestamp: new Date() });
      req.session.destroy(() => {
        res.clearCookie("sparkpanel.sid");
        res.json({ message: "Logged out" });
      });
    }),
  );

  app.get("/api/auth/me", requireAuth, (req, res) => {
    if (req.apiKeyId) return res.json({ user: serializeUser(req.currentUser!), version: APP_VERSION });
    const csrfToken = getOrCreateCSRFToken(req.session);
    req.session.save(() => res.json({ user: serializeUser(req.currentUser!), csrfToken, version: APP_VERSION }));
  });

  app.post(
    "/api/auth/change-password",
    requireAuth,
    requirePermission("account.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const data = changePasswordSchema.parse(req.body);
      const user = req.currentUser!;
      if (!(await bcrypt.compare(data.currentPassword, user.password))) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      await storage.updateUserPassword(user.id, await bcrypt.hash(data.newPassword, 10));
      await pluginManager.callHook("password_change", user.id, { userId: user.id, username: user.username, timestamp: new Date() });
      await activity(req, "password_change", "Password Changed", `User '${user.username}' changed their password`);
      res.json({ message: "Password changed successfully" });
    }),
  );

  app.put(
    "/api/auth/profile",
    requireAuth,
    requirePermission("account.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const { nickname } = req.body ?? {};
      if (nickname !== undefined && (typeof nickname !== "string" || nickname.length > 50)) {
        return res.status(400).json({ message: "Invalid nickname" });
      }
      const updated = await storage.updateUser(req.currentUser!.id, { nickname: typeof nickname === "string" ? nickname.trim() || null : undefined });
      if (!updated) return res.status(404).json({ message: "User not found" });
      await activity(req, "profile_update", "Profile Updated", `User '${updated.username}' updated their profile`);
      res.json(serializeUser(updated));
    }),
  );

  /** Шаг 1 настройки 2FA: новый секрет и QR-код для приложения. Секрет хранится в сессии до подтверждения. */
  app.post(
    "/api/auth/2fa/setup",
    requireAuth,
    requirePermission("account.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (req.apiKeyId) return res.status(403).json({ message: "2FA is configured from the panel, not with an API key" });
      const user = req.currentUser!;
      if (user.twoFactorEnabled) return res.status(400).json({ message: "2FA is already enabled" });
      const secret = generateTotpSecret();
      req.session.pendingTotpSecret = secret;
      const issuer = (await storage.getPanelSettings()).panelName || "SparkPanel";
      const uri = totpUri(secret, user.username, issuer);
      const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
      req.session.save(() => res.json({ secret, uri, qr }));
    }),
  );

  /** Шаг 2: код из приложения подтверждает, что секрет сохранён. Возвращает коды восстановления — один раз. */
  app.post(
    "/api/auth/2fa/enable",
    requireAuth,
    requirePermission("account.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const user = req.currentUser!;
      const secret = req.session.pendingTotpSecret;
      if (!secret) return res.status(400).json({ message: "Start the setup first" });
      const code = String(req.body?.code ?? "").replace(/\s/g, "");
      if (!verifyTotp(secret, code, user.id)) return res.status(400).json({ message: "Wrong code. Check the time on your phone and try again." });
      const recovery = generateRecoveryCodes();
      const updated = await storage.updateUser(user.id, { twoFactorEnabled: true, twoFactorSecret: secret, twoFactorRecoveryCodes: recovery.hashes });
      delete req.session.pendingTotpSecret;
      await pluginManager.callHook("2fa_enable", user.id, { userId: user.id, username: user.username, method: "totp", timestamp: new Date() });
      await activity(req, "2fa_enable", "2FA Enabled", "Two-factor authentication enabled (authenticator app)");
      req.session.save(() => res.json({ user: serializeUser(updated!), recoveryCodes: recovery.codes }));
    }),
  );

  /** Новые коды восстановления (старые перестают работать). Нужен текущий код из приложения. */
  app.post(
    "/api/auth/2fa/recovery-codes",
    requireAuth,
    requirePermission("account.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const user = req.currentUser!;
      if (!user.twoFactorEnabled || !user.twoFactorSecret) return res.status(400).json({ message: "2FA is not enabled" });
      if (!verifyTotp(user.twoFactorSecret, String(req.body?.code ?? "").replace(/\s/g, ""), user.id)) {
        return res.status(400).json({ message: "Wrong code" });
      }
      const recovery = generateRecoveryCodes();
      await storage.updateUser(user.id, { twoFactorRecoveryCodes: recovery.hashes });
      await activity(req, "security_event", "Recovery Codes Regenerated", `User '${user.username}' generated new 2FA recovery codes`);
      res.json({ recoveryCodes: recovery.codes });
    }),
  );

  /** Отключение 2FA своей учётной записи: нужен код из приложения или код восстановления. */
  app.post(
    "/api/auth/2fa/disable",
    requireAuth,
    requirePermission("account.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const user = req.currentUser!;
      if (!user.twoFactorEnabled || !user.twoFactorSecret) return res.status(400).json({ message: "2FA is not enabled" });
      const code = String(req.body?.code ?? "").trim();
      const valid = verifyTotp(user.twoFactorSecret, code.replace(/\s/g, ""), user.id) || consumeRecoveryCode(user.twoFactorRecoveryCodes ?? [], code) !== null;
      if (!valid) return res.status(400).json({ message: "Wrong code" });
      const updated = await storage.updateUser(user.id, { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: [] });
      await pluginManager.callHook("2fa_disable", user.id, { userId: user.id, username: user.username, timestamp: new Date() });
      await activity(req, "2fa_disable", "2FA Disabled", "Two-factor authentication disabled");
      res.json({ message: "2FA disabled", user: serializeUser(updated!) });
    }),
  );

  /* ------------------------------------------------------------------ */
  /* Системные настройки                                                 */
  /* ------------------------------------------------------------------ */

  app.get(
    "/api/system/info",
    requireAuth,
    handle(async (_req, res) => {
      const settings = await storage.getPanelSettings();
      let docker: { version?: string; available: boolean } = { available: false };
      try {
        const info = await dockerManager.getLocalDocker().version();
        docker = { version: info.Version, available: true };
      } catch {
      }
      res.json({
        name: settings.panelName,
        version: APP_VERSION,
        description: "Game Server Management Platform",
        storage: storage instanceof PostgresStorage ? "postgresql" : "file",
        docker,
      });
    }),
  );

  /* Публичная страница состояния серверов (/status). Без входа; данные только для выбранных серверов. */
  app.get(
    "/api/public/status",
    handle(async (req, res) => {
      const status = await publicStatus((req.header("x-forwarded-host") || req.hostname || "").split(":")[0]);
      if (!status) return res.status(404).json({ message: "The status page is turned off" });
      res.setHeader("Cache-Control", "public, max-age=15");
      res.json(status);
    }),
  );

  app.get("/api/settings/status-page", requireAuth, requirePermission("settings.view", "settings.manage"), (_req, res) => res.json(getStatusPageSettings()));

  app.put(
    "/api/settings/status-page",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const body = z
        .object({
          enabled: z.boolean(),
          title: z.string().trim().min(1).max(80),
          description: z.string().trim().max(300),
          serverIds: z.array(z.string().uuid()).max(200),
          showAddress: z.boolean(),
        })
        .parse(req.body);
      const saved = await saveStatusPageSettings(body);
      await activity(req, "settings_update", "Status Page Updated", saved.enabled ? `Public status page shows ${saved.serverIds.length} servers` : "Public status page turned off");
      res.json(saved);
    }),
  );

  app.get(
    "/api/settings/panel",
    handle(async (_req, res) => res.json(await storage.getPanelSettings())),
  );

  app.put(
    "/api/settings/panel",
    requireAuth,
    requirePermission("panel.colors"),
    requireCSRF,
    handle(async (req, res) => {
      const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "must be a hex color like #FF5733").nullable().optional();
      const data = z
        .object({
          panelName: z.string().trim().min(1).max(50).optional(),
          primaryColor: color,
          backgroundColor: color,
          borderColor: color,
          sidebarAccentColor: color,
        })
        .parse(req.body);
      const settings = await storage.updatePanelSettings(data as any);
      await activity(req, "settings_update", "Panel Settings Updated", "Panel appearance settings updated");
      res.json(settings);
    }),
  );

  app.get("/api/settings/security", requireAuth, requirePermission("settings.view", "settings.manage"), (_req, res) => res.json(securitySettings));

  app.get("/api/settings/notifications", requireAuth, requirePermission("settings.view", "settings.manage"), (_req, res) => res.json(publicNotificationSettings()));

  app.put(
    "/api/settings/notifications",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const data = z
        .object({
          discordWebhookUrl: z.string().max(300).optional(),
          telegramBotToken: z.string().max(100).optional(),
          telegramChatId: z.string().max(64).optional(),
          events: z.record(z.boolean()).optional(),
        })
        .parse(req.body);
      await saveNotificationSettings(data as Parameters<typeof saveNotificationSettings>[0]);
      await activity(req, "settings_update", "Notifications Updated", "Notification channels or events were changed");
      res.json(publicNotificationSettings());
    }),
  );

  app.post(
    "/api/settings/notifications/test",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (_req, res) => {
      const settings = getNotificationSettings();
      if (!settings.discordWebhookUrl && !(settings.telegramBotToken && settings.telegramChatId)) {
        return res.status(400).json({ message: "Add a Discord webhook or a Telegram bot first" });
      }
      const errors = await sendToChannels("SparkPanel test", "Notifications work. You will get messages about the events you selected.", settings);
      if (errors.length) return res.status(502).json({ message: errors.join("; ") });
      res.json({ message: "Test message sent" });
    }),
  );

  /* Внешнее хранилище бэкапов (S3-совместимое). */
  const backupStorageInput = z.object({
    enabled: z.boolean(),
    endpoint: z.string().max(300),
    region: z.string().max(50),
    bucket: z.string().max(63),
    accessKeyId: z.string().max(200),
    secretAccessKey: z.string().max(200).optional(),
    prefix: z.string().max(200),
    pathStyle: z.boolean(),
    keepLocal: z.boolean(),
  });

  app.get("/api/settings/backup-storage", requireAuth, requirePermission("settings.view", "settings.manage"), (_req, res) => res.json(publicBackupStorage()));

  app.put(
    "/api/settings/backup-storage",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const saved = await saveBackupStorage(backupStorageInput.parse(req.body));
      await activity(req, "settings_update", "Backup Storage Updated", saved.enabled ? `Backups are copied to ${saved.bucket} at ${saved.endpoint}` : "External backup storage turned off");
      res.json(publicBackupStorage());
    }),
  );

  app.post(
    "/api/settings/backup-storage/test",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const input = backupStorageInput.parse(req.body);
      const current = getBackupStorage();
      try {
        await testBackupStorage({ ...current, ...input, secretAccessKey: input.secretAccessKey || current.secretAccessKey, endpoint: input.endpoint.trim().replace(/\/+$/, "") });
      } catch (error: any) {
        throw new HttpError(502, error.message);
      }
      res.json({ message: "The storage accepted, returned and deleted a test file" });
    }),
  );

  app.put(
    "/api/settings/security",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const { allowlistEnabled, allowedIps, lockdownEnabled } = req.body ?? {};
      if (allowedIps !== undefined) {
        if (!Array.isArray(allowedIps)) return res.status(400).json({ message: "allowedIps must be an array" });
        const cleaned = allowedIps.map((ip: unknown) => normalizeIp(String(ip).trim())).filter((ip) => isIP(ip) !== 0);
        securitySettings.allowedIps = unique(cleaned);
      }
      if (allowlistEnabled !== undefined) {
        const enable = Boolean(allowlistEnabled);
        if (enable && !securitySettings.allowedIps.includes(normalizeIp(clientIp(req)))) {
          return res.status(400).json({ message: `Your current IP (${normalizeIp(clientIp(req))}) must be in the allowlist` });
        }
        securitySettings.allowlistEnabled = enable;
      }
      if (lockdownEnabled !== undefined) securitySettings.lockdownEnabled = Boolean(lockdownEnabled);
      await settingsStore.set("security", securitySettings);
      await activity(req, "settings_update", "Security Settings Updated", "Updated allowlist or lockdown mode");
      res.json(securitySettings);
    }),
  );

  /* ------------------------------------------------------------------ */
  /* Планировщик                                                        */
  /* ------------------------------------------------------------------ */

  app.get("/api/scheduler/tasks", requireAuth, requirePermission("settings.view", "settings.manage"), (_req, res) => res.json(scheduler.list()));

  app.post(
    "/api/scheduler/tasks",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const data = z
        .object({
          name: z.string().trim().min(1).max(100),
          type: z.enum(TASK_TYPES as [ScheduledTaskType, ...ScheduledTaskType[]]),
          serverId: z.string().uuid(),
          cron: z.string().trim().min(9).max(100),
          command: z.string().max(1000).optional(),
          enabled: z.boolean().optional(),
        })
        .parse(req.body);
      if (!(await storage.getServer(data.serverId))) return res.status(404).json({ message: "Server not found" });
      if (data.type === "server_command") data.command = sanitizeCommand(data.command);
      const task = await scheduler.create({ ...data, enabled: data.enabled !== false });
      await activity(req, "settings_update", "Scheduled Task Created", `Task '${task.name}' (${task.cron})`);
      res.status(201).json(task);
    }),
  );

  app.patch(
    "/api/scheduler/tasks/:id",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const data = z
        .object({ name: z.string().trim().min(1).max(100).optional(), cron: z.string().trim().optional(), enabled: z.boolean().optional(), command: z.string().max(1000).optional() })
        .parse(req.body);
      const task = await scheduler.update(req.params.id, data);
      if (!task) return res.status(404).json({ message: "Task not found" });
      res.json(task);
    }),
  );

  app.post(
    "/api/scheduler/tasks/:id/run",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const task = scheduler.get(req.params.id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      await scheduler.run(task);
      res.json(task);
    }),
  );

  app.delete(
    "/api/scheduler/tasks/:id",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!(await scheduler.remove(req.params.id))) return res.status(404).json({ message: "Task not found" });
      res.json({ message: "Task deleted" });
    }),
  );

  /* ------------------------------------------------------------------ */
  /* Пользователи                                                       */
  /* ------------------------------------------------------------------ */

  /** Пользователь не может выдать права, которых нет у него самого. */
  const assertGrantable = (actor: User, permissions: UserPermission[]) => {
    const missing = permissions.filter((p) => !actor.permissions.includes(p));
    if (missing.length) throw new HttpError(403, `You cannot grant permissions you do not have: ${missing.join(", ")}`);
  };

  app.get(
    "/api/users",
    requireAuth,
    requirePermission("users.view", "users.manage"),
    handle(async (_req, res) => res.json((await storage.getAllUsers()).map(serializeUser))),
  );

  app.post(
    "/api/users",
    requireAuth,
    requirePermission("users.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const data = createUserSchema.parse(req.body);
      const username = sanitizeUsername(data.username);
      if (await storage.getUserByUsername(username)) return res.status(409).json({ message: "Username already exists" });
      const permissions = unique(data.permissions) as UserPermission[];
      if (permissions.length === 0) return res.status(400).json({ message: "At least one permission is required" });
      assertGrantable(req.currentUser!, permissions);

      const user = await storage.createUser({
        username,
        password: await bcrypt.hash(data.password, 10),
        role: data.role ?? (permissions.includes("users.manage") ? "admin" : permissions.includes("servers.control") ? "operator" : "viewer"),
        permissions,
        allowedServerIds: await resolveAllowedServerIds(data.allServersAccess ?? true, data.allowedServerIds),
      });
      await pluginManager.callHook("user_create", user.id, { userId: user.id, username: user.username, permissions: user.permissions, createdBy: req.currentUser?.id });
      await activity(req, "user_create", "User Created", `User '${user.username}' was created with ${permissions.length} permissions`);
      res.status(201).json(serializeUser(user));
    }),
  );

  app.put(
    "/api/users/:id",
    requireAuth,
    requirePermission("users.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid user ID format" });
      const data = updateUserSchema.parse(req.body);
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const updates: Partial<User> = {};
      if (data.username && data.username !== user.username) {
        const username = sanitizeUsername(data.username);
        if (await storage.getUserByUsername(username)) return res.status(409).json({ message: "Username already exists" });
        updates.username = username;
      }
      if (data.permissions) {
        const permissions = unique(data.permissions) as UserPermission[];
        assertGrantable(req.currentUser!, permissions.filter((p) => !user.permissions.includes(p)));
        if (user.permissions.includes("users.manage") && !permissions.includes("users.manage") && managers(await storage.getAllUsers()).length <= 1) {
          return res.status(400).json({ message: "Cannot remove users.manage from the last user with this permission" });
        }
        updates.permissions = permissions;
      }
      if (data.role) updates.role = data.role;
      if (data.allServersAccess !== undefined || data.allowedServerIds !== undefined) {
        updates.allowedServerIds = await resolveAllowedServerIds(
          data.allServersAccess ?? user.allowedServerIds === null,
          data.allowedServerIds ?? user.allowedServerIds ?? [],
        );
      }
      if (data.password) updates.password = await bcrypt.hash(data.password, 10);

      const updated = await storage.updateUser(user.id, updates);
      await pluginManager.callHook("user_update", user.id, { userId: user.id, username: updated!.username, updatedBy: req.currentUser?.id });
      await activity(req, "user_update", "User Updated", `User '${updated!.username}' was updated`);
      res.json(serializeUser(updated!));
    }),
  );

  app.post(
    "/api/users/:id/temporary-access",
    requireAuth,
    requirePermission("users.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid user ID format" });
      const durationMinutes = Number(req.body?.durationMinutes);
      if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 60 * 24 * 30) {
        return res.status(400).json({ message: "durationMinutes must be between 1 and 43200" });
      }
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.id === req.currentUser!.id) return res.status(400).json({ message: "You cannot limit your own access" });
      const updated = await storage.updateUser(user.id, { accessExpiresAt: new Date(Date.now() + durationMinutes * 60000) });
      await activity(req, "user_update", "Temporary Access Granted", `Temporary access for ${durationMinutes} minutes was granted to ${user.username}`);
      res.json(serializeUser(updated!));
    }),
  );

  app.delete(
    "/api/users/:id/temporary-access",
    requireAuth,
    requirePermission("users.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid user ID format" });
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      const updated = await storage.updateUser(user.id, { accessExpiresAt: null });
      await activity(req, "user_update", "Temporary Access Revoked", `Temporary access was revoked for ${user.username}`);
      res.json(serializeUser(updated!));
    }),
  );

  app.post(
    "/api/users/:id/2fa/reset",
    requireAuth,
    requirePermission("users.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid user ID" });
      const target = await storage.getUser(req.params.id);
      if (!target) return res.status(404).json({ message: "User not found" });
      const updated = await storage.updateUser(target.id, { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: [] });
      await pluginManager.callHook("2fa_disable", target.id, { userId: target.id, username: target.username, resetBy: req.currentUser?.id, timestamp: new Date() });
      await activity(req, "2fa_disable", "2FA Reset", `Two-factor authentication of '${target.username}' was reset by '${req.currentUser!.username}'`);
      res.json(serializeUser(updated!));
    }),
  );

  app.delete(
    "/api/users/:id",
    requireAuth,
    requirePermission("users.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid user ID format" });
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.id === req.currentUser!.id) return res.status(400).json({ message: "You cannot delete yourself" });
      if (user.permissions.includes("users.manage") && managers(await storage.getAllUsers()).length <= 1) {
        return res.status(400).json({ message: "Cannot delete the last user with users.manage permission" });
      }
      await storage.deleteUser(user.id);
      await forgetUser(user.id);
      for (const key of (await storage.getAllApiKeys()).filter((k) => k.createdBy === user.id)) {
        await storage.deleteApiKey(key.id);
      }
      await activity(req, "user_delete", "User Deleted", `User '${user.username}' was deleted`);
      res.json({ message: "User deleted" });
    }),
  );

  /* ------------------------------------------------------------------ */
  /* Плагины                                                            */
  /* ------------------------------------------------------------------ */

  const uploadPlugin = multer({
    dest: TEMP_DIR,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/\.(js|mjs|cjs|ts|py|jar|zip|tar\.gz|tgz)$/i.test(file.originalname)) cb(null, true);
      else cb(new HttpError(400, "Invalid file type. Allowed: .js, .mjs, .cjs, .ts, .py, .jar, .zip, .tar.gz"));
    },
  });

  app.get(
    "/api/plugins",
    requireAuth,
    requirePermission("plugins.view", "plugins.manage"),
    handle(async (_req, res) => res.json(await pluginManager.getAllPlugins())),
  );

  app.get("/api/plugins/:id", requireAuth, requirePermission("plugins.view", "plugins.manage"), (req, res) => {
    const plugin = pluginManager.getPlugin(req.params.id);
    if (!plugin) return res.status(404).json({ message: "Plugin not found" });
    res.json(plugin);
  });

  app.post(
    "/api/plugins/upload",
    requireAuth,
    requirePermission("plugins.manage"),
    requireCSRF,
    uploadPlugin.single("plugin"),
    handle(async (req, res) => {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      try {
        const manifest = await installPlugin(pluginManager.getPluginsDir(), req.file.path, req.file.originalname, req.body ?? {});
        await pluginManager.loadPlugin(manifest.id);
        await pluginManager.callHook("plugin_upload", manifest.id, {
          pluginId: manifest.id,
          pluginName: manifest.name,
          pluginVersion: manifest.version,
          pluginType: manifest.type,
          uploadedBy: req.currentUser?.id,
        });
        await activity(req, "settings_update", "Plugin Uploaded", `Plugin '${manifest.name}' (${manifest.version}) uploaded`);
        res.json({ message: "Plugin uploaded successfully", plugin: manifest });
      } catch (error: any) {
        throw new HttpError(400, error.message || "Failed to install plugin");
      } finally {
        await unlink(req.file.path).catch(() => {});
      }
    }),
  );

  for (const action of ["enable", "disable"] as const) {
    app.post(
      `/api/plugins/:id/${action}`,
      requireAuth,
      requirePermission("plugins.manage"),
      requireCSRF,
      handle(async (req, res) => {
        const plugin = pluginManager.getPlugin(req.params.id);
        if (!plugin) return res.status(404).json({ message: "Plugin not found" });
        if (action === "enable") await pluginManager.enablePlugin(plugin.id);
        else await pluginManager.disablePlugin(plugin.id);
        await pluginManager.callHook(`plugin_${action}`, plugin.id, { pluginId: plugin.id, pluginName: plugin.name, by: req.currentUser?.id });
        await activity(req, "settings_update", `Plugin ${action}d`, `Plugin '${plugin.name}' was ${action}d`);
        res.json({ message: `Plugin ${action}d` });
      }),
    );
  }

  app.delete(
    "/api/plugins/:id",
    requireAuth,
    requirePermission("plugins.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const plugin = pluginManager.getPlugin(req.params.id);
      if (!plugin) return res.status(404).json({ message: "Plugin not found" });
      await pluginManager.callHook("plugin_delete", plugin.id, { pluginId: plugin.id, pluginName: plugin.name, deletedBy: req.currentUser?.id });
      await pluginManager.deletePlugin(plugin.id);
      await activity(req, "settings_update", "Plugin Deleted", `Plugin '${plugin.name}' was deleted`);
      res.json({ message: "Plugin deleted" });
    }),
  );

  /* ------------------------------------------------------------------ */
  /* Серверы                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Проверяет настройки игры из запроса. Пустые секретные поля (токены) сохраняют прежнее значение,
   * чтобы форма могла не знать сохранённый токен.
   */
  const checkGameSettings = (gameType: string, incoming: unknown, current?: Partial<GameSettings>): GameSettings | undefined => {
    if (!isProfiledGame(gameType) || incoming === undefined) return undefined;
    const input = (incoming ?? {}) as Partial<GameSettings>;
    const values = { ...(input.values ?? {}) };
    for (const field of GAME_PROFILES[gameType].fields) {
      if (field.secret && !values[field.key] && current?.values?.[field.key]) values[field.key] = current.values[field.key];
    }
    const result = validateGameSettings(gameType, { ...input, values });
    if ("error" in result) throw new HttpError(400, result.error);
    return result.settings;
  };

  /** Создаёт запись сервера, открывает к нему доступ создателю и готовит контейнер в фоне. */
  const createServerFor = async (req: Request, node: PanelNode, data: InsertServer): Promise<Server> => {
    let server = await storage.createServer({ ...data, status: "stopped" });
    await updateServerAccess(server.id, { ownerId: req.currentUser!.id });
    server = await ensureServerSecrets(server);
    const user = req.currentUser!;
    if (user.allowedServerIds !== null) {
      await storage.updateUser(user.id, { allowedServerIds: [...(user.allowedServerIds ?? []), server.id] });
    }
    ensureGameContainer(server, node).catch((error) => {
      console.error(`Failed to prepare container for ${server.name}:`, error.message);
      void storage.addActivity({ type: "server_create", title: "Server Preparation Failed", description: `${server.name}: ${error.message}`, timestamp: new Date() });
    });
    await pluginManager.callHook("server_create", server.id, { id: server.id, name: server.name, gameType: server.gameType, nodeId: server.nodeId });
    return server;
  };

  /** Сервер для ответа API: значения секретных переменных и служебные пароли не покидают панель. */
  const publicServer = (server: Server): Server => {
    const config = { ...((server.config as Record<string, any>) || {}) };
    delete config.rconPassword;
    if (config.database) config.database = { engine: config.database.engine, createdAt: config.database.createdAt };
    if (config.gameSettings && isProfiledGame(server.gameType)) {
      const values = { ...config.gameSettings.values };
      const secretsSet: string[] = [];
      for (const field of GAME_PROFILES[server.gameType].fields.filter((f) => f.secret)) {
        if (values[field.key]) secretsSet.push(field.key);
        values[field.key] = "";
      }
      config.gameSettings = { ...config.gameSettings, values, secretsSet };
    }
    if (config.git) config.git = publicGitSettings(server);
    if (Array.isArray(config.envVars)) {
      config.envVars = (config.envVars as EnvVar[]).map((v) => (v.secret ? { key: v.key, value: "", secret: true, hasValue: v.value.length > 0 } : v));
    }
    return { ...server, config };
  };

  const serverResponse = async (server: Server) => ({
    ...publicServer(server),
    pendingRestart: server.status === "running" ? await hasPendingConfigChanges(server).catch(() => false) : false,
  });

  app.get(
    "/api/servers",
    requireAuth,
    requirePermission("servers.view"),
    handle(async (req, res) =>
      sendCachedJson(req, res, `servers:${visibilityKey(req.currentUser!)}`, 2000, async () =>
        filterServersForUser(await storage.getAllServers(), req.currentUser!).map(publicServer),
      ),
    ),
  );

  app.get(
    "/api/servers/:id",
    requireAuth,
    requirePermission("servers.view"),
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const user = req.currentUser!;
      const access = getServerAccess(server.id);
      const node = await storage.getNode(server.nodeId);
      res.json({
        ...(await serverResponse(server)),
        connectHost: node ? connectHost(node) : null,
        myPermissions: SERVER_SCOPED_PERMISSIONS.filter((p) => canOnServer(user, server.id, p)),
        isOwner: access.ownerId === user.id,
        paidUntil: access.paidUntil ?? null,
        suspended: access.suspended ?? null,
      });
    }),
  );

  /** Переменные окружения сервера. Значения секретных переменных не возвращаются — только признак, что они заданы. */
  /** История нагрузки: range=day (шаг 5 минут) или week (шаг 30 минут). */
  app.get(
    "/api/servers/:id/history",
    requireAuth,
    requirePermission("servers.view"),
    loadServer,
    handle(async (req, res) => res.json(statsHistory.get(`server:${srv(res).id}`, req.query.range === "week" ? "week" : "day"))),
  );

  app.get(
    "/api/nodes/:id/history",
    requireAuth,
    requirePermission("nodes.view", "nodes.manage"),
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid node ID format" });
      res.json(statsHistory.get(`node:${req.params.id}`, req.query.range === "week" ? "week" : "day"));
    }),
  );

  /* Деплой из Git */

  app.get(
    "/api/servers/:id/git",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    loadServer,
    handle(async (req, res) => {
      const git = publicGitSettings(srv(res));
      const origin = `${req.protocol}://${req.get("host")}`;
      res.json(git ? { ...git, webhookUrl: `${origin}/api/webhooks/git/${srv(res).id}` } : null);
    }),
  );

  app.put(
    "/api/servers/:id/git",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const data = z
        .object({
          url: z.string().trim().max(500),
          branch: z.string().trim().max(200).default("main"),
          token: z.string().max(500).optional(),
          restartAfterDeploy: z.boolean().default(true),
          regenerateSecret: z.boolean().optional(),
        })
        .parse(req.body);
      validateGitInput(data);
      const current = getGitSettings(server);
      const git: GitSettings = {
        url: data.url,
        branch: data.branch,
        token: data.token === "-" ? undefined : data.token ? data.token : current?.token,
        webhookSecret: current && !data.regenerateSecret ? current.webhookSecret : newWebhookSecret(),
        restartAfterDeploy: data.restartAfterDeploy,
        lastDeploy: current?.lastDeploy,
      };
      const updated = (await storage.updateServer(server.id, { config: { ...((server.config as Record<string, any>) || {}), git } }))!;
      await activity(req, "server_update", "Git Repository Connected", `${updated.name}: ${git.url} (${git.branch})`);
      res.json(publicGitSettings(updated));
    }),
  );

  app.delete(
    "/api/servers/:id/git",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const { git: _removed, ...config } = (server.config as Record<string, any>) || {};
      await storage.updateServer(server.id, { config });
      await activity(req, "server_update", "Git Repository Disconnected", `${server.name}: deploys from Git turned off. Files stay as they are.`);
      res.json({ ok: true });
    }),
  );

  app.post(
    "/api/servers/:id/git/deploy",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => res.json(await deployFromGit(srv(res), `by ${req.currentUser!.username}`, req.currentUser!.id))),
  );

  /** Скачивает свежую версию образа сервера; запущенный сервер перезапускается уже на ней. Файлы не меняются. */
  const pullingImages = new Set<string>();
  app.post(
    "/api/servers/:id/update-image",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      if (pullingImages.has(server.id)) return res.status(409).json({ message: "The image is already being updated" });
      if (isActionInProgress(server.id)) return res.status(409).json({ message: "Wait for the current power action to finish" });
      pullingImages.add(server.id);
      res.status(202).json({ message: "Image update started" });
      const userId = req.currentUser!.id;
      const username = req.currentUser!.username;
      (async () => {
        await logStreamer.notifyStatus(server, "Downloading the latest server image…");
        const changed = await pullLatestImage(server);
        if (!changed) {
          await logStreamer.notifyStatus(server, "The server image is already up to date.");
          return;
        }
        await storage.addActivity({ type: "server_update", title: "Server Image Updated", description: `${server.name}: new image downloaded (by ${username})`, timestamp: new Date(), userId });
        const fresh = (await storage.getServer(server.id)) ?? server;
        if (fresh.status === "running" && !isActionInProgress(fresh.id)) {
          await logStreamer.notifyStatus(fresh, "New image downloaded. Restarting the server on it…");
          const { done } = await beginServerAction(fresh, "restart", userId);
          await done;
        } else {
          await logStreamer.notifyStatus(fresh, "New image downloaded. It will be used on the next start.");
        }
      })()
        .catch(async (error) => {
          console.warn(`Image update of ${server.name} failed:`, error.message);
          await logStreamer.notifyStatus(server, `Image update failed: ${error.message}`).catch(() => {});
        })
        .finally(() => pullingImages.delete(server.id));
    }),
  );

  /* Игроки Minecraft: онлайн, белый список, операторы, баны. Команды идут через RCON внутри контейнера. */

  /* Диапазон портов ноды: новые серверы получают свободный порт автоматически. */
  app.get(
    "/api/nodes/:id/port-pool",
    requireAuth,
    requirePermission("nodes.view", "nodes.manage", "servers.manage"),
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id) || !(await storage.getNode(req.params.id))) return res.status(404).json({ message: "Node not found" });
      res.json({ ...(await portPoolUsage(req.params.id)), publicAddress: getPublicAddress(req.params.id) });
    }),
  );

  app.put(
    "/api/nodes/:id/public-address",
    requireAuth,
    requirePermission("nodes.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const node = isValidUUID(req.params.id) ? await storage.getNode(req.params.id) : undefined;
      if (!node) return res.status(404).json({ message: "Node not found" });
      const { address } = z.object({ address: z.string().max(253).nullable() }).parse(req.body);
      await setPublicAddress(node.id, address);
      await activity(req, "settings_update", "Node Address Updated", `${node.name}: ${getPublicAddress(node.id) ?? "address removed"}`);
      res.json({ ...(await portPoolUsage(node.id)), publicAddress: getPublicAddress(node.id) });
    }),
  );

  app.put(
    "/api/nodes/:id/port-pool",
    requireAuth,
    requirePermission("nodes.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const node = isValidUUID(req.params.id) ? await storage.getNode(req.params.id) : undefined;
      if (!node) return res.status(404).json({ message: "Node not found" });
      const body = z.object({ start: z.number().int(), end: z.number().int() }).nullable().parse(req.body?.pool ?? null);
      await setPortPool(node.id, body);
      await activity(req, "settings_update", "Port Range Updated", body ? `${node.name}: ports ${body.start}–${body.end}` : `${node.name}: port range removed`);
      res.json({ ...(await portPoolUsage(node.id)), publicAddress: getPublicAddress(node.id) });
    }),
  );

  app.get(
    "/api/nodes/:id/free-port",
    requireAuth,
    requirePermission("servers.manage"),
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(404).json({ message: "Node not found" });
      res.json({ port: await findFreePort(req.params.id) });
    }),
  );

  const requireMinecraft = (_req: Request, res: Response, next: NextFunction) =>
    srv(res).gameType === "minecraft" ? next() : res.status(400).json({ message: "Available for Minecraft servers only" });

  /* Каталог плагинов и модов (Modrinth): поиск совместимых проектов и установка в plugins/ или mods/. */
  app.get(
    "/api/servers/:id/catalog",
    requireAuth,
    requirePermission("servers.files"),
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const q = String(req.query.q ?? "");
      const offset = Number(req.query.offset) || 0;
      if (server.gameType === "minecraft") return res.json({ ...(await searchCatalog(server, q, offset)), source: "Modrinth" });
      if (server.gameType === "rust") return res.json(await searchUmod(server, q, offset));
      if (server.gameType === "valheim") return res.json(await searchThunderstore(server, q, offset));
      res.status(400).json({ message: "This game has no mod catalog. Upload mods on the Files tab or use Workshop IDs in Settings." });
    }),
  );

  app.post(
    "/api/servers/:id/catalog/install",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const { projectId } = z.object({ projectId: z.string().max(200) }).parse(req.body);
      const server = srv(res);
      if (server.gameType === "minecraft") {
        const result = await installFromCatalog(server, projectId);
        await activity(req, "file_change", "Plugin Installed", `${server.name}: ${result.file} (${result.version}) from Modrinth`);
        return res.json({ ...result, restartRequired: server.status === "running" });
      }
      const result =
        server.gameType === "rust" ? await installUmod(server, projectId) : server.gameType === "valheim" ? await installThunderstore(server, projectId) : null;
      if (!result) return res.status(400).json({ message: "This game has no mod catalog" });
      await activity(req, "file_change", "Plugin Installed", `${server.name}: ${result.file} from ${server.gameType === "rust" ? "uMod" : "Thunderstore"}`);
      res.json({ ...result, restartRequired: server.gameType === "valheim" && server.status === "running" });
    }),
  );

  /* База данных сервера: отдельный контейнер в частной сети сервера. */
  const databaseView = async (server: Server) => {
    const db = getServerDatabase(server);
    const engines = Object.entries(DATABASE_ENGINES).map(([id, e]) => ({ id, label: e.label }));
    if (!db) return { database: null, engines };
    const engine = DATABASE_ENGINES[db.engine];
    const status = await databaseStatus(server);
    const restartRequired = server.status === "running" && (await hasPendingConfigChanges(server).catch(() => false));
    return {
      database: { engine: db.engine, label: engine.label, host: DATABASE_HOST, port: engine.port, name: db.name, user: db.user, password: db.password, createdAt: db.createdAt },
      status,
      restartRequired,
      engines,
    };
  };

  app.get(
    "/api/servers/:id/database",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    loadServer,
    handle(async (_req, res) => res.json(await databaseView(srv(res)))),
  );

  app.post(
    "/api/servers/:id/database",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const { engine } = z.object({ engine: z.enum(Object.keys(DATABASE_ENGINES) as [DatabaseEngine, ...DatabaseEngine[]]) }).parse(req.body);
      const updated = await createServerDatabase(srv(res), engine);
      await activity(req, "server_update", "Database Created", `${updated.name}: ${DATABASE_ENGINES[engine].label}`);
      res.status(201).json(await databaseView(updated));
    }),
  );

  app.delete(
    "/api/servers/:id/database",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      if (!getServerDatabase(server)) return res.status(404).json({ message: "This server has no database" });
      await removeDatabaseResources(server);
      const { database: _d, ...config } = (server.config as Record<string, any>) || {};
      const updated = (await storage.updateServer(server.id, { config }))!;
      if (updated.status !== "running") {
        const node = await storage.getNode(updated.nodeId);
        if (node) ensureGameContainer(updated, node).catch((err) => console.warn(`Container update for ${updated.id} deferred:`, err.message));
      }
      await activity(req, "server_update", "Database Deleted", `${server.name}: database and its data removed`);
      res.json({ ok: true });
    }),
  );

  /* Участники сервера: владелец (или менеджер) выдаёт другим пользователям права только на этот сервер. */
  const canManageMembers = (user: User, server: Server) =>
    hasPermission(user, "users.manage") || canOnServer(user, server.id, "servers.manage") || isServerOwner(user.id, server.id);

  const membersView = async (server: Server) => {
    const access = getServerAccess(server.id);
    const users = new Map((await storage.getAllUsers()).map((u) => [u.id, u]));
    return {
      owner: access.ownerId && users.get(access.ownerId) ? { id: access.ownerId, username: users.get(access.ownerId)!.username } : null,
      members: access.members
        .filter((m) => users.has(m.userId))
        .map((m) => ({ userId: m.userId, username: users.get(m.userId)!.username, permissions: m.permissions, addedAt: m.addedAt })),
      available: SERVER_SCOPED_PERMISSIONS,
    };
  };

  app.get(
    "/api/servers/:id/members",
    requireAuth,
    loadServer,
    handle(async (req, res) => {
      if (!canManageMembers(req.currentUser!, srv(res))) return res.status(403).json({ message: "Insufficient permissions" });
      res.json(await membersView(srv(res)));
    }),
  );

  app.put(
    "/api/servers/:id/members",
    requireAuth,
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      if (!canManageMembers(req.currentUser!, server)) return res.status(403).json({ message: "Insufficient permissions" });
      const body = z.object({ username: z.string().trim().min(1).max(100), permissions: z.array(z.enum(SERVER_SCOPED_PERMISSIONS)).min(1) }).parse(req.body);
      const member = (await storage.getAllUsers()).find((u) => u.username.toLowerCase() === body.username.toLowerCase());
      if (!member) return res.status(404).json({ message: `No user named ${body.username}` });
      const access = getServerAccess(server.id);
      if (member.id === access.ownerId) return res.status(400).json({ message: "The owner already has full access" });
      const permissions = Array.from(new Set<ServerScopedPermission>(["servers.view", ...body.permissions]));
      const others = access.members.filter((m) => m.userId !== member.id);
      const existing = access.members.find((m) => m.userId === member.id);
      await updateServerAccess(server.id, { members: [...others, { userId: member.id, permissions, addedAt: existing?.addedAt ?? new Date().toISOString() }] });
      await activity(req, "server_update", existing ? "Server Member Updated" : "Server Member Added", `${server.name}: ${member.username} (${permissions.join(", ")})`);
      res.json(await membersView(server));
    }),
  );

  app.delete(
    "/api/servers/:id/members/:userId",
    requireAuth,
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      if (!canManageMembers(req.currentUser!, server)) return res.status(403).json({ message: "Insufficient permissions" });
      const access = getServerAccess(server.id);
      if (!access.members.some((m) => m.userId === req.params.userId)) return res.status(404).json({ message: "Not a member of this server" });
      await updateServerAccess(server.id, { members: access.members.filter((m) => m.userId !== req.params.userId) });
      await activity(req, "server_update", "Server Member Removed", `${server.name}: access removed`);
      res.json(await membersView(server));
    }),
  );

  /* Оплата: срок действия и приостановка. Подходит для внешнего биллинга через API-ключ с правом servers.manage. */
  const suspendServer = async (server: Server, reason: string, userId?: string) => {
    await updateServerAccess(server.id, { suspended: { at: new Date().toISOString(), reason } });
    if (server.status === "running" || server.status === "starting") {
      const { done } = await beginServerAction(server, "stop", userId);
      await done.catch(() => {});
    }
    await logStreamer.notifyStatus((await storage.getServer(server.id)) ?? server, `Server suspended: ${reason}`);
    await storage.addActivity({ type: "server_stop", title: "Server Suspended", description: `${server.name}: ${reason}`, timestamp: new Date(), userId });
  };

  app.put(
    "/api/servers/:id/billing",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const body = z
        .object({ paidUntil: z.string().datetime().nullable().optional(), suspended: z.boolean().optional(), reason: z.string().trim().max(200).optional() })
        .parse(req.body);
      if (body.paidUntil !== undefined) await updateServerAccess(server.id, { paidUntil: body.paidUntil });
      if (body.suspended === true && !getServerAccess(server.id).suspended) await suspendServer(server, body.reason || "suspended by billing", req.currentUser!.id);
      if (body.suspended === false && getServerAccess(server.id).suspended) {
        await updateServerAccess(server.id, { suspended: null });
        await activity(req, "server_update", "Server Unsuspended", server.name);
      }
      const access = getServerAccess(server.id);
      res.json({ paidUntil: access.paidUntil ?? null, suspended: access.suspended ?? null });
    }),
  );

  const billingTimer = setInterval(async () => {
    for (const id of expiredServerIds()) {
      const server = await storage.getServer(id);
      if (!server) continue;
      await suspendServer(server, "payment period ended").catch((err) => console.warn(`Suspending ${server.name} failed:`, err.message));
      notify("server_crash", `${server.name} suspended`, "Its paid period ended.", `suspend:${id}`, 24 * 3600_000);
    }
  }, 60_000);
  billingTimer.unref();

  /* Квоты пользователей: самостоятельное создание серверов в пределах лимитов. */
  const quotaInput = z.object({
    maxServers: z.number().int().min(0).max(1000),
    maxRamGb: z.number().int().min(0).max(4096),
    maxCpuPercent: z.number().int().min(0).max(100000),
    maxDiskGb: z.number().int().min(0).max(1000000),
    nodeIds: z.array(z.string().uuid()).max(100),
  });

  app.get(
    "/api/users/:id/quota",
    requireAuth,
    requirePermission("users.view", "users.manage"),
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid user ID format" });
      res.json({ quota: getUserQuota(req.params.id), usage: quotaUsage(req.params.id, await storage.getAllServers()) });
    }),
  );

  app.put(
    "/api/users/:id/quota",
    requireAuth,
    requirePermission("users.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const user = isValidUUID(req.params.id) ? await storage.getUser(req.params.id) : undefined;
      if (!user) return res.status(404).json({ message: "User not found" });
      const quota = req.body?.quota === null ? null : quotaInput.parse(req.body?.quota);
      await setUserQuota(user.id, quota);
      await activity(req, "user_update", "Server Quota Updated", quota ? `${user.username}: ${quota.maxServers} servers, ${quota.maxRamGb} GB RAM` : `${user.username}: quota removed`);
      res.json({ quota, usage: quotaUsage(user.id, await storage.getAllServers()) });
    }),
  );

  app.get(
    "/api/me/quota",
    requireAuth,
    handle(async (req, res) => {
      const quota = getUserQuota(req.currentUser!.id);
      if (!quota) return res.json({ quota: null });
      const nodes = (await storage.getAllNodes()).filter((n) => quota.nodeIds.length === 0 || quota.nodeIds.includes(n.id));
      res.json({ quota, usage: quotaUsage(req.currentUser!.id, await storage.getAllServers()), nodes: nodes.map((n) => ({ id: n.id, name: n.name, location: n.location })) });
    }),
  );

  /* Подключение ноды одной командой: одноразовый токен → скрипт → подпись сертификата Docker TLS. */
  const panelUrlOf = (req: Request) => `${req.header("x-forwarded-proto")?.split(",")[0] || req.protocol}://${req.header("x-forwarded-host") || req.get("host")}`;

  app.post(
    "/api/nodes/enrollments",
    requireAuth,
    requirePermission("nodes.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const body = z.object({ name: z.string().trim().min(1).max(100), location: z.string().trim().max(100).default("") }).parse(req.body);
      const enrollment = await createEnrollment(body.name, body.location);
      await activity(req, "node_add", "Node Install Command Created", `${body.name}: valid for 24 hours`);
      res.status(201).json({
        command: `curl -fsSL '${panelUrlOf(req)}/api/nodes/install.sh?token=${enrollment.token}' | sudo bash`,
        expiresAt: enrollment.expiresAt,
      });
    }),
  );

  app.get("/api/nodes/install.sh", (req, res) => {
    res.type("text/x-shellscript");
    const enrollment = findEnrollment(String(req.query.token ?? ""));
    if (!enrollment) return res.status(404).send("echo 'SparkPanel: this install command expired or was already used. Create a new one in the panel.' >&2; exit 1\n");
    res.send(installScript(panelUrlOf(req), enrollment.token));
  });

  app.post(
    "/api/nodes/enroll",
    handle(async (req, res) => {
      const body = z
        .object({
          token: z.string(),
          ip: z.string().ip(),
          cpuCores: z.number().int().min(1).max(4096),
          ramTotal: z.number().int().min(1).max(1_000_000),
          diskTotal: z.number().int().min(1).max(10_000_000),
          csr: z.string().max(8000),
        })
        .parse(req.body);
      const enrollment = findEnrollment(body.token);
      if (!enrollment) return res.status(403).json({ message: "The install command expired or was already used" });
      const node = await storage.createNode({ name: enrollment.name, location: enrollment.location, ip: body.ip, port: 2376, cpuCores: body.cpuCores, ramTotal: body.ramTotal, diskTotal: body.diskTotal, status: "offline" });
      await markEnrollmentUsed(enrollment.token, node.id);
      try {
        const { ca, cert } = await signNodeCertificate(body.csr, body.ip);
        await storage.addActivity({ type: "node_add", title: "Node Added By Script", description: `${node.name} (${body.ip})`, timestamp: new Date() });
        res.json({ ca, cert });
      } catch (error) {
        await storage.deleteNode(node.id);
        throw error;
      }
    }),
  );

  app.post(
    "/api/nodes/enroll/done",
    handle(async (req, res) => {
      const token = String(req.body?.token ?? "");
      const used = settingsStore.get<{ token: string; nodeId?: string; usedAt?: string }[]>("node-enrollments", []).find((e) => e.token === token && e.usedAt);
      const node = used?.nodeId ? await storage.getNode(used.nodeId) : undefined;
      if (!node || Date.now() - new Date(used!.usedAt!).getTime() > 3600_000) return res.status(404).json({ message: "Unknown install" });
      const connected = await dockerManager.checkNodeConnection(node);
      await storage.updateNode(node.id, { status: connected ? "online" : "offline" });
      res.json({ online: connected });
    }),
  );

  /* Домены с HTTPS: прокси Caddy на ноде получает сертификаты и направляет домен на порт сервера. */
  const domainsView = async (server: Server) => {
    const node = await storage.getNode(server.nodeId);
    const domains = getServerDomains(server.id);
    const certs = await certificateStatus(server).catch(() => ({}) as Record<string, string>);
    return {
      domains: await Promise.all(domains.map(async (d) => ({ ...(node ? await dnsStatus(d, node) : { domain: d, addresses: [], pointsToNode: null }), certificate: certs[d] ?? "pending" }))),
      nodeIp: node?.ip ?? null,
      email: getProxySettings().email,
    };
  };

  app.get(
    "/api/servers/:id/domains",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    loadServer,
    handle(async (_req, res) => res.json(await domainsView(srv(res)))),
  );

  app.put(
    "/api/servers/:id/domains",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const { domains } = z.object({ domains: z.array(z.string().max(253)).max(20) }).parse(req.body);
      const previous = getServerDomains(server.id);
      const saved = await setServerDomains(server, domains);
      try {
        await syncProxy(server);
      } catch (error) {
        await setServerDomains(server, previous);
        await syncProxy(server).catch(() => {});
        throw error;
      }
      await activity(req, "server_update", "Domains Updated", `${server.name}: ${saved.join(", ") || "no domains"}`);
      res.json(await domainsView(server));
    }),
  );

  app.get("/api/settings/proxy", requireAuth, requirePermission("settings.view", "settings.manage"), (_req, res) => res.json(getProxySettings()));

  app.put(
    "/api/settings/proxy",
    requireAuth,
    requirePermission("settings.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const body = z.object({ email: z.string().trim().max(200) }).parse(req.body);
      await saveProxySettings(body);
      const servers = await storage.getAllServers();
      const seen = new Set<string>();
      for (const server of servers.filter((s) => getServerDomains(s.id).length && !seen.has(s.nodeId))) {
        seen.add(server.nodeId);
        await syncProxy(server).catch((err) => console.warn(`Proxy update on node ${server.nodeId} failed:`, err.message));
      }
      await activity(req, "settings_update", "HTTPS Settings Updated", body.email ? `Let's Encrypt email ${body.email}` : "Let's Encrypt email removed");
      res.json(getProxySettings());
    }),
  );

  /* Масштабирование сайта: копии на нодах, общая база, балансировка по домену и автомасштабирование. */
  const scalingView = async (server: Server) => {
    const { replicas: _r, ...settings } = getScaling(server);
    const domains = getServerDomains(server.id);
    return { settings, replicas: await replicaStates(server), domains, hasDatabase: Boolean(getServerDatabase(server)) };
  };

  app.get(
    "/api/servers/:id/scaling",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    loadServer,
    handle(async (_req, res) => {
      assertScalable(srv(res));
      res.json(await scalingView(srv(res)));
    }),
  );

  app.put(
    "/api/servers/:id/scaling",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const body = z
        .object({
          autoscale: z.boolean(),
          min: z.number().int(),
          max: z.number().int(),
          targetCpu: z.number().int(),
          nodeIds: z.array(z.string().uuid()).max(100),
        })
        .parse(req.body);
      const updated = await updateScalingSettings(srv(res).id, body);
      await activity(req, "server_update", "Scaling Updated", `${updated.name}: ${body.autoscale ? `autoscale ${body.min}–${body.max} copies at ${body.targetCpu}% CPU` : "autoscale off"}`);
      res.json(await scalingView(updated));
    }),
  );

  app.post(
    "/api/servers/:id/scaling/replicas",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const { nodeId } = z.object({ nodeId: z.string().uuid().optional() }).parse(req.body ?? {});
      const replica = await addReplica(srv(res).id, nodeId);
      await activity(req, "server_update", "Site Copy Added", `${srv(res).name}: copy ${replica.id.split("-r").pop()} on port ${replica.port}`);
      res.status(201).json(await scalingView((await storage.getServer(srv(res).id))!));
    }),
  );

  app.delete(
    "/api/servers/:id/scaling/replicas/:replicaId",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      await removeReplica(srv(res).id, req.params.replicaId);
      await activity(req, "server_update", "Site Copy Removed", `${srv(res).name}: copy ${req.params.replicaId.split("-r").pop()}`);
      res.json(await scalingView((await storage.getServer(srv(res).id))!));
    }),
  );

  app.post(
    "/api/servers/:id/scaling/sync",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const count = await syncReplicaFiles(srv(res).id);
      await activity(req, "file_change", "Site Copies Updated", `${srv(res).name}: files copied to ${count} copies`);
      res.json({ updated: count });
    }),
  );

  app.get(
    "/api/servers/:id/players",
    requireAuth,
    requirePermission("servers.console", "servers.command"),
    loadServer,
    handle(async (_req, res) => {
      const server = await ensureServerSecrets(srv(res));
      if (server.gameType === "minecraft") return res.json(await getPlayers(server));
      if (!isProfiledGame(server.gameType)) return res.status(400).json({ message: "Player management is not available for this server type" });
      res.json(await getGamePlayers(server));
    }),
  );

  /** Кик, бан, разбан и сообщение в чат для CS2, Rust, ARK, Garry's Mod и Terraria. */
  app.post(
    "/api/servers/:id/game-players",
    requireAuth,
    requirePermission("servers.command"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const body = z.object({ command: z.enum(["kick", "ban", "unban", "say"]), target: z.string().max(100).default(""), reason: z.string().max(200).default("") }).parse(req.body);
      const output = await gamePlayerCommand(server, body.command, body.target, body.reason);
      await activity(req, "server_update", "Player Management", `${server.name}: ${body.command}${body.target ? ` ${body.target}` : ""}`);
      res.json({ message: output || "Done" });
    }),
  );

  /** Valheim: списки администраторов, банов и разрешённых игроков (SteamID64). */
  app.put(
    "/api/servers/:id/game-players/lists",
    requireAuth,
    requirePermission("servers.command"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      if (server.gameType !== "valheim") return res.status(400).json({ message: "Lists are used by Valheim servers" });
      const body = z.object({ list: z.enum(["admins", "banned", "permitted"]), steamId: z.string().trim(), add: z.boolean() }).parse(req.body);
      const list = await updateValheimList(server, body.list, body.steamId, body.add);
      await activity(req, "server_update", "Player Management", `${server.name}: ${body.add ? "added" : "removed"} ${body.steamId} ${body.add ? "to" : "from"} ${body.list}`);
      res.json({ list });
    }),
  );

  app.post(
    "/api/servers/:id/players",
    requireAuth,
    requirePermission("servers.command"),
    requireCSRF,
    loadServer,
    requireMinecraft,
    handle(async (req, res) => {
      const body = z.object({ action: z.enum(PLAYER_ACTIONS), player: z.string().trim().max(32).optional(), reason: z.string().max(200).optional() }).parse(req.body);
      const server = srv(res);
      const output = await playerAction(server, body.action, body.player, body.reason);
      await activity(req, "server_update", "Player Management", `${server.name}: ${body.action.replace("_", " ")}${body.player ? ` ${body.player}` : ""}`);
      res.json({ message: output || "Done" });
    }),
  );

  /** Вебхук репозитория: GitHub, GitLab, Gitea или любой сервис с секретом. Без сессии — проверяется подпись. */
  app.post(
    "/api/webhooks/git/:id",
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(404).json({ message: "Not found" });
      const server = await storage.getServer(req.params.id);
      const git = server && getGitSettings(server);
      if (!server || !git || !verifyWebhook(req, git.webhookSecret)) return res.status(401).json({ message: "Invalid signature" });
      if (req.header("x-github-event") === "ping") return res.json({ message: "pong" });
      const ref = typeof req.body?.ref === "string" ? req.body.ref : null;
      if (ref && ref !== `refs/heads/${git.branch}`) return res.status(202).json({ message: `Ignored: push to ${ref}, watching ${git.branch}` });
      res.status(202).json({ message: "Deploy started" });
      deployFromGit(server, "by webhook").catch((error) => console.warn(`Webhook deploy of ${server.name} failed:`, error.message));
    }),
  );

  app.get(
    "/api/servers/:id/variables",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    loadServer,
    handle(async (_req, res) => res.json((publicServer(srv(res)).config as Record<string, any>).envVars ?? [])),
  );

  app.put(
    "/api/servers/:id/variables",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const { variables } = z
        .object({
          variables: z
            .array(z.object({ key: z.string().trim(), value: z.string().max(8192).nullable().optional(), secret: z.boolean().optional() }))
            .max(100),
        })
        .parse(req.body);
      const current = getEnvVars(server);
      const seen = new Set<string>();
      const next: EnvVar[] = [];
      for (const v of variables) {
        if (!ENV_KEY_PATTERN.test(v.key)) throw new HttpError(400, `"${v.key}" is not a valid variable name: use letters, digits and _, not starting with a digit`);
        if (RESERVED_ENV_KEYS.has(v.key)) throw new HttpError(400, `${v.key} is set by the panel and cannot be changed`);
        if (seen.has(v.key)) throw new HttpError(400, `${v.key} is listed twice`);
        seen.add(v.key);
        const previous = current.find((c) => c.key === v.key);
        const value = (v.value ?? "") === "" && v.secret && previous ? previous.value : v.value ?? "";
        next.push({ key: v.key, value, ...(v.secret ? { secret: true } : {}) });
      }
      const updated = (await storage.updateServer(server.id, { config: { ...((server.config as Record<string, any>) || {}), envVars: next } }))!;
      if (updated.status !== "running") {
        const node = await storage.getNode(updated.nodeId);
        if (node) ensureGameContainer(updated, node).catch((err) => console.warn(`Container update for ${updated.id} deferred:`, err.message));
      }
      await activity(req, "server_update", "Variables Updated", `Environment variables of '${updated.name}' were changed (${next.length} set)`);
      res.json((publicServer(updated).config as Record<string, any>).envVars ?? []);
    }),
  );

  /** Версии среды для серверов типа custom — из реестра образов, самая новая первой. */
  app.get(
    "/api/runtimes/:id/versions",
    requireAuth,
    requirePermission("servers.manage", "servers.config"),
    handle(async (req, res) => res.json(await getRuntimeVersions(req.params.id))),
  );

  /** Создавать серверы могут менеджеры серверов и пользователи с квотой (в пределах квоты). */
  const requireServerCreation = (req: Request, res: Response, next: NextFunction) =>
    hasPermission(req.currentUser!, "servers.manage") || getUserQuota(req.currentUser!.id) ? next() : res.status(403).json({ message: "Insufficient permissions" });

  app.post(
    "/api/servers",
    requireAuth,
    requireServerCreation,
    requireCSRF,
    handle(async (req, res) => {
      const data = insertServerSchema
        .extend({
          name: z.string().trim().min(1).max(100),
          gameType: z.enum(gameTypes),
          nodeId: z.string().uuid(),
          port: z.number().int().min(0).max(65535),
          cpuLimit: z.number().int().min(1).max(100),
          ramLimit: z.number().int().min(1).max(1024),
          diskLimit: z.number().int().min(1).max(100000),
        })
        .parse(req.body);
      const node = await storage.getNode(data.nodeId);
      if (!node) return res.status(400).json({ message: "Node not found" });
      if (!hasPermission(req.currentUser!, "servers.manage")) {
        assertWithinQuota(req.currentUser!, await storage.getAllServers(), data);
        data.autoStart = false;
        delete (data as Partial<InsertServer>).visibility;
        delete (data as Partial<InsertServer>).limits;
      }
      data.port = await resolveServerPort(node.id, data.port);
      if (!(await storage.checkPortAvailable(data.port)) || (await reservedPorts()).has(data.port)) return res.status(409).json({ message: `Port ${data.port} is already in use` });

      const { sftpPort: _ignored, ...config } = (data.config as Record<string, unknown>) ?? {};
      const gameSettings = checkGameSettings(data.gameType, config.gameSettings ?? {});
      if (gameSettings) config.gameSettings = gameSettings;
      const server = await createServerFor(req, node, { ...data, config });
      await activity(req, "server_create", "Server Created", `Server '${server.name}' (${server.gameType}) was created`);
      res.status(201).json(publicServer(server));
    }),
  );

  /** Копия сервера: те же настройки, переменные и (по выбору) все файлы. Новый порт и имя. */
  app.post(
    "/api/servers/:id/clone",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const source = srv(res);
      const body = z
        .object({
          name: z.string().trim().min(1).max(100),
          port: z.number().int().min(0).max(65535),
          nodeId: z.string().uuid().optional(),
          copyFiles: z.boolean().default(true),
        })
        .parse(req.body);
      const node = await storage.getNode(body.nodeId ?? source.nodeId);
      if (!node) return res.status(400).json({ message: "Node not found" });
      body.port = await resolveServerPort(node.id, body.port);
      if (!(await storage.checkPortAvailable(body.port))) return res.status(409).json({ message: `Port ${body.port} is already in use` });

      const { sftpPort: _s, rconPassword: _r, database: _d, git, ...config } = (source.config as Record<string, any>) || {};
      if (git) config.git = { ...git, webhookSecret: newWebhookSecret(), lastDeploy: undefined };
      if (config.gameSettings?.values?.gslt) config.gameSettings = { ...config.gameSettings, values: { ...config.gameSettings.values, gslt: "" } };
      const server = await createServerFor(req, node, {
        name: body.name,
        gameType: source.gameType,
        nodeId: node.id,
        port: body.port,
        cpuLimit: source.cpuLimit,
        ramLimit: source.ramLimit,
        diskLimit: source.diskLimit,
        autoStart: false,
        config,
        visibility: source.visibility,
        limits: source.limits,
      } as InsertServer);
      if (body.copyFiles) {
        try {
          await copyServerFiles(source, server);
        } catch (error: any) {
          await activity(req, "server_create", "Server Copy Incomplete", `${server.name}: files were not copied from ${source.name} (${error.message})`);
          return res.status(502).json({ message: `The copy was created, but files were not copied: ${error.message}`, server: publicServer(server) });
        }
      }
      await activity(req, "server_create", "Server Cloned", `Server '${server.name}' was created from '${source.name}'${body.copyFiles ? " with its files" : ""}`);
      res.status(201).json(publicServer(server));
    }),
  );

  /* Шаблоны серверов: сохранённые настройки (тип, ресурсы, образ, команда запуска, переменные) для быстрого создания. */
  interface ServerTemplate {
    id: string;
    name: string;
    gameType: Server["gameType"];
    cpuLimit: number;
    ramLimit: number;
    diskLimit: number;
    config: Record<string, unknown>;
    createdAt: string;
  }
  const getTemplates = () => settingsStore.get<ServerTemplate[]>("server-templates", []);

  app.get(
    "/api/server-templates",
    requireAuth,
    requirePermission("servers.manage"),
    handle(async (_req, res) => res.json(getTemplates())),
  );

  app.post(
    "/api/servers/:id/template",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(req.body);
      const templates = getTemplates();
      if (templates.some((t) => t.name.toLowerCase() === name.toLowerCase())) return res.status(409).json({ message: `A template named "${name}" already exists` });
      const { sftpPort: _s, rconPassword: _r, git: _g, database: _d, ...config } = (server.config as Record<string, any>) || {};
      if (Array.isArray(config.envVars)) config.envVars = (config.envVars as EnvVar[]).map((v) => (v.secret ? { ...v, value: "" } : v));
      if (config.gameSettings?.values?.gslt) config.gameSettings = { ...config.gameSettings, values: { ...config.gameSettings.values, gslt: "" } };
      const template: ServerTemplate = {
        id: randomBytes(8).toString("hex"),
        name,
        gameType: server.gameType,
        cpuLimit: server.cpuLimit,
        ramLimit: server.ramLimit,
        diskLimit: server.diskLimit,
        config,
        createdAt: new Date().toISOString(),
      };
      await settingsStore.set("server-templates", [...templates, template]);
      await activity(req, "settings_update", "Server Template Saved", `Template '${name}' from server '${server.name}'`);
      res.status(201).json(template);
    }),
  );

  app.delete(
    "/api/server-templates/:templateId",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const templates = getTemplates();
      const template = templates.find((t) => t.id === req.params.templateId);
      if (!template) return res.status(404).json({ message: "Template not found" });
      await settingsStore.set("server-templates", templates.filter((t) => t.id !== template.id));
      await activity(req, "settings_update", "Server Template Deleted", `Template '${template.name}'`);
      res.json({ ok: true });
    }),
  );

  app.patch(
    "/api/servers/:id",
    requireAuth,
    requirePermission("servers.config", "servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const user = req.currentUser!;
      const data = z
        .object({
          name: z.string().trim().min(1).max(100).optional(),
          port: z.number().int().min(1).max(65535).optional(),
          cpuLimit: z.number().int().min(1).max(100).optional(),
          ramLimit: z.number().int().min(1).max(1024).optional(),
          diskLimit: z.number().int().min(1).max(100000).optional(),
          autoStart: z.boolean().optional(),
          config: z.record(z.any()).optional(),
          visibility: z.record(z.boolean()).optional(),
          limits: z.record(z.number().int().min(0)).optional(),
        })
        .parse(req.body);

      const managesResources = ["cpuLimit", "ramLimit", "diskLimit", "visibility", "limits"].some(
        (k) => (data as any)[k] !== undefined && JSON.stringify((data as any)[k]) !== JSON.stringify((server as any)[k]),
      );
      if (managesResources && !hasPermission(user, "servers.manage")) {
        const changesOnlyResources = data.visibility === undefined && data.limits === undefined;
        if (!changesOnlyResources || !isServerOwner(user.id, server.id) || !getUserQuota(user.id)) {
          return res.status(403).json({ message: "Changing resource limits requires servers.manage" });
        }
        assertWithinQuota(user, await storage.getAllServers(), { nodeId: server.nodeId, ramLimit: data.ramLimit ?? server.ramLimit, cpuLimit: data.cpuLimit ?? server.cpuLimit, diskLimit: data.diskLimit ?? server.diskLimit }, server.id);
      }
      if (data.port !== undefined && data.port !== server.port) {
        assertPortInPool(server.nodeId, data.port);
        if (!(await storage.checkPortAvailable(data.port, server.id)) || (await reservedPorts()).has(data.port)) return res.status(409).json({ message: `Port ${data.port} is already in use` });
      }

      const updates: Partial<Server> = { ...data } as Partial<Server>;
      if (data.config) {
        const current = (server.config as Record<string, any>) || {};
        const incoming = { ...data.config };
        if (incoming.gameSettings !== undefined) incoming.gameSettings = checkGameSettings(server.gameType, incoming.gameSettings, current.gameSettings);
        if (incoming.crashRestart !== undefined) {
          const crash = z.object({ enabled: z.boolean(), maxAttempts: z.number().int().min(1).max(20) }).parse(incoming.crashRestart);
          incoming.crashRestart = crash;
        }
        updates.config = { ...current, ...incoming, sftpPort: current.sftpPort, rconPassword: current.rconPassword, envVars: current.envVars, git: current.git, database: current.database, scaling: current.scaling };
      }
      const updated = (await storage.updateServer(server.id, updates))!;
      if (updated.port !== server.port && getServerDomains(server.id).length) {
        await syncProxy(updated).catch((err) => console.warn(`Proxy update for ${updated.name} failed:`, err.message));
      }
      if (updated.status !== "running") {
        const node = await storage.getNode(updated.nodeId);
        if (node) ensureGameContainer(updated, node).catch((err) => console.warn(`Container update for ${updated.id} deferred:`, err.message));
      }
      await activity(req, "server_update", "Server Updated", `Server '${updated.name}' settings updated`);
      res.json(await serverResponse(updated));
    }),
  );

  app.delete(
    "/api/servers/:id",
    requireAuth,
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      if (!canOnServer(req.currentUser!, server.id, "servers.manage") && !isServerOwner(req.currentUser!.id, server.id)) {
        return res.status(403).json({ message: "Insufficient permissions" });
      }
      if (isActionInProgress(server.id)) return res.status(409).json({ message: "Wait for the current operation to finish" });
      await pluginManager.callHook("server_delete", server.id, { id: server.id, name: server.name, gameType: server.gameType, nodeId: server.nodeId });
      logStreamer.detach(server.id);
      await removeAllReplicas(server);
      const node = await storage.getNode(server.nodeId);
      if (node) {
        try {
          await removeServerResources(server, node, req.query.keepData !== "true");
        } catch (error: any) {
          if (req.query.force !== "true") {
            return res.status(502).json({ message: `Failed to remove Docker resources: ${error.message}. Use ?force=true to delete anyway.` });
          }
        }
      }
      await deleteAllServerBackups(server.id);
      await scheduler.removeForServer(server.id);
      await removeServerAccess(server.id);
      if (getServerDomains(server.id).length) {
        await forgetServerDomains(server.id);
        await syncProxy(server).catch((err) => console.warn(`Proxy update after deleting ${server.name} failed:`, err.message));
      }
      statsHistory.remove(`server:${server.id}`);
      await storage.deleteServer(server.id);
      await activity(req, "server_delete", "Server Deleted", `Server '${server.name}' was deleted`);
      res.json({ message: "Server deleted" });
    }),
  );

  for (const action of ["start", "stop", "restart", "kill"] as PowerAction[]) {
    app.post(
      `/api/servers/:id/${action}`,
      requireAuth,
      requirePermission("servers.control"),
      requireCSRF,
      loadServer,
      handle(async (req, res) => {
        const server = srv(res);
        if (action === "start" && server.status === "running") return res.status(400).json({ message: "Server is already running" });
        if ((action === "stop" || action === "kill") && server.status === "stopped") return res.status(400).json({ message: "Server is not running" });
        const { done } = await beginServerAction(server, action, req.currentUser!.id);
        done.catch(() => {});
        res.status(202).json({ message: `Server ${action} initiated`, status: (await storage.getServer(server.id))?.status });
      }),
    );
  }

  app.post(
    "/api/servers/:id/command",
    requireAuth,
    requirePermission("servers.command"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      if (!commandRateLimiter.checkLimit(`command:${req.currentUser!.id}`)) {
        return res.status(429).json({ message: "Too many commands. Please slow down." });
      }
      const command = sanitizeCommand(req.body?.command);
      await logStreamer.sendCommand(srv(res), command);
      await activity(req, "server_command", "Command Executed", `Command sent to '${srv(res).name}': ${command.slice(0, 100)}`);
      res.json({ message: "Command sent" });
    }),
  );

  app.post(
    "/api/servers/:id/migrate",
    requireAuth,
    requirePermission("servers.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const targetNodeId = String(req.body?.targetNodeId || "");
      if (!isValidUUID(targetNodeId)) return res.status(400).json({ message: "Invalid target node" });
      if (server.nodeId === targetNodeId) return res.status(400).json({ message: "Server already on target node" });
      const targetNode = await storage.getNode(targetNodeId);
      if (!targetNode) return res.status(404).json({ message: "Target node not found" });
      assertPortInPool(targetNode.id, server.port);
      if (!(await dockerManager.checkNodeConnection(targetNode))) return res.status(503).json({ message: "Target node is offline" });
      if (isActionInProgress(server.id)) return res.status(409).json({ message: "Wait for the current operation to finish" });

      const sourceNode = await storage.getNode(server.nodeId);
      const updated = await migrateServer(server, targetNode, Boolean(req.body?.keepSource));
      await logStreamer.notifyStatus(updated, `Server migrated to node '${targetNode.name}'`);
      await activity(req, "server_migrate", "Server Migrated", `Server '${server.name}' migrated from '${sourceNode?.name ?? "?"}' to '${targetNode.name}'`);
      res.json(updated);
    }),
  );

  app.get("/api/servers/:id/stats", requireAuth, requirePermission("servers.view"), loadServer, (_req, res) => {
    const stats = storage.getServerStats(srv(res).id);
    if (!stats) return res.status(404).json({ message: "Stats not available" });
    res.json(stats);
  });

  /** Нагрузка CPU серверов за последний час (12 точек по 5 минут) — для графиков на главной. */
  app.get(
    "/api/stats/servers/load",
    requireAuth,
    requirePermission("servers.view"),
    handle(async (req, res) =>
      sendCachedJson(req, res, `load:${visibilityKey(req.currentUser!)}`, 60_000, async () => {
        const visible = filterServersForUser(await storage.getAllServers(), req.currentUser!);
        return Object.fromEntries(visible.map((s) => [s.id, statsHistory.tail(`server:${s.id}`, 12)]));
      }),
    ),
  );

  app.get("/api/stats/servers", requireAuth, requirePermission("servers.view"), async (req, res) => {
    const all = storage.getAllServerStats();
    const allowed = new Set(filterServersForUser(await storage.getAllServers(), req.currentUser!).map((s) => s.id));
    res.json(Object.fromEntries(Object.entries(all).filter(([id]) => allowed.has(id))));
  });

  /* ------------------------------------------------------------------ */
  /* Файлы                                                              */
  /* ------------------------------------------------------------------ */

  const uploadServerFile = multer({
    dest: TEMP_DIR,
    limits: { fileSize: UPLOAD_MAX_BYTES },
  });

  const pathParam = (value: unknown) => {
    try {
      return normalizeVirtualPath(String(value || "/data"));
    } catch (error: any) {
      throw new HttpError(400, error.message);
    }
  };

  app.get(
    "/api/servers/:id/files",
    requireAuth,
    requirePermission("servers.files"),
    loadServer,
    handle(async (req, res) => res.json(await listFiles(srv(res), pathParam(req.query.path)))),
  );

  app.post(
    "/api/servers/:id/files/upload",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    uploadServerFile.single("file"),
    handle(async (req, res) => {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const server = srv(res);
      try {
        const usedGb = statsCollector.getDiskUsageGb(server.id);
        if (usedGb + req.file.size / 1024 ** 3 > server.diskLimit) {
          return res.status(413).json({ message: `Disk limit of ${server.diskLimit} GB would be exceeded` });
        }
        const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
        const target = await writeFileStream(server, pathParam(req.query.path), basename(fileName), createReadStream(req.file.path));
        await pluginManager.callHook("file_upload", server.id, { serverId: server.id, serverName: server.name, filePath: target, fileSize: req.file.size, uploadedBy: req.currentUser?.id });
        await activity(req, "file_change", "File Uploaded", `${server.name}: ${target}`);
        res.json({ message: "File uploaded successfully", path: target });
      } finally {
        await unlink(req.file.path).catch(() => {});
      }
    }),
  );

  app.post(
    "/api/servers/:id/files/folder",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const target = await makeDirectory(srv(res), pathParam(req.body?.path), String(req.body?.name || ""));
      await activity(req, "file_change", "Folder Created", `${srv(res).name}: ${target}`);
      res.json({ message: "Folder created successfully", path: target });
    }),
  );

  app.patch(
    "/api/servers/:id/files/rename",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const target = await renamePath(srv(res), pathParam(req.body?.fromPath), String(req.body?.newName || ""));
      await activity(req, "file_change", "File Renamed", `${srv(res).name}: ${req.body?.fromPath} → ${target}`);
      res.json({ message: "File renamed successfully", path: target });
    }),
  );

  app.delete(
    "/api/servers/:id/files",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const target = pathParam(req.query.path);
      await removePath(srv(res), target);
      await activity(req, "file_change", "File Deleted", `${srv(res).name}: ${target}`);
      res.json({ message: "File deleted successfully" });
    }),
  );

  app.get(
    "/api/servers/:id/files/search",
    requireAuth,
    requirePermission("servers.files"),
    loadServer,
    handle(async (req, res) => {
      try {
        res.json(await searchFiles(srv(res), pathParam(req.query.path), String(req.query.q ?? "")));
      } catch (error: any) {
        throw new HttpError(400, error.message);
      }
    }),
  );

  app.post(
    "/api/servers/:id/files/compress",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const body = z.object({ path: z.string(), names: z.array(z.string()).min(1).max(500), archiveName: z.string().min(1).max(255) }).parse(req.body);
      const server = srv(res);
      let target: string;
      try {
        target = await compressPaths(server, pathParam(body.path), body.names, body.archiveName);
      } catch (error: any) {
        throw new HttpError(400, error.message);
      }
      await activity(req, "file_change", "Files Compressed", `${server.name}: ${target}`);
      res.json({ message: "Archive created", path: target });
    }),
  );

  app.post(
    "/api/servers/:id/files/extract",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const target = pathParam(req.body?.path);
      let dir: string;
      try {
        dir = await extractArchive(server, target);
      } catch (error: any) {
        throw new HttpError(400, error.message);
      }
      await activity(req, "file_change", "Archive Extracted", `${server.name}: ${target}`);
      res.json({ message: "Archive extracted", path: dir });
    }),
  );

  app.get(
    "/api/servers/:id/files/download",
    requireAuth,
    requirePermission("servers.files"),
    loadServer,
    handle(async (req, res) => {
      const target = pathParam(req.query.path);
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(basename(target))}`);
      res.setHeader("Content-Type", "application/octet-stream");
      await readFileStream(srv(res), target, res);
      res.end();
    }),
  );

  app.get(
    "/api/servers/:id/files/content",
    requireAuth,
    requirePermission("servers.files"),
    loadServer,
    handle(async (req, res) => res.json({ path: pathParam(req.query.path), content: await readTextFile(srv(res), pathParam(req.query.path)) })),
  );

  app.put(
    "/api/servers/:id/files/content",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const target = pathParam(req.body?.path);
      if (typeof req.body?.content !== "string") return res.status(400).json({ message: "content must be a string" });
      if (Buffer.byteLength(req.body.content) > 2 * 1024 * 1024) return res.status(413).json({ message: "File is too large" });
      await writeTextFile(srv(res), target, req.body.content);
      await activity(req, "file_change", "File Edited", `${srv(res).name}: ${target}`);
      res.json({ message: "File saved" });
    }),
  );

  /* ------------------------------------------------------------------ */
  /* Бэкапы                                                             */
  /* ------------------------------------------------------------------ */

  const loadBackup = async (req: Request, res: Response) => {
    if (!isValidUUID(req.params.backupId)) throw new HttpError(400, "Invalid backup ID");
    const backup = await storage.getBackup(req.params.backupId);
    if (!backup || backup.serverId !== srv(res).id) throw new HttpError(404, "Backup not found");
    return backup;
  };

  app.get(
    "/api/servers/:id/backups",
    requireAuth,
    requirePermission("servers.backups", "backups.view"),
    loadServer,
    handle(async (_req, res) => {
      const backups = await storage.getBackupsByServer(srv(res).id);
      res.json(backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(({ path: _p, ...b }) => b));
    }),
  );

  app.post(
    "/api/servers/:id/backups",
    requireAuth,
    requirePermission("servers.backups", "backups.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 100) : "";
      if (!name) return res.status(400).json({ message: "Backup name is required" });
      const description = typeof req.body?.description === "string" ? req.body.description.trim().slice(0, 500) || null : null;
      const backup = await createServerBackup(server, { name, description, createdBy: req.currentUser?.id });
      await pluginManager.callHook("backup_create", server.id, { backupId: backup.id, serverId: server.id, serverName: server.name, backupName: backup.name, backupSize: backup.size, createdBy: req.currentUser?.id });
      await activity(req, "backup_create", "Backup Created", `Backup '${backup.name}' created for server '${server.name}'`);
      const { path: _p, ...safe } = backup;
      res.status(201).json(safe);
    }),
  );

  const backupTaskOf = (serverId: string) => scheduler.list().find((t) => t.serverId === serverId && t.type === "server_backup");

  app.get(
    "/api/servers/:id/backup-schedule",
    requireAuth,
    requirePermission("servers.backups", "backups.view"),
    loadServer,
    handle(async (_req, res) => {
      const task = backupTaskOf(srv(res).id);
      res.json({ enabled: Boolean(task?.enabled), cron: task?.cron ?? null, nextRunAt: task?.nextRunAt ?? null, lastRunAt: task?.lastRunAt ?? null, lastError: task?.lastError ?? null, keep: srv(res).limits?.maxBackups ?? null });
    }),
  );

  app.put(
    "/api/servers/:id/backup-schedule",
    requireAuth,
    requirePermission("servers.backups", "backups.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const { enabled, cron } = z.object({ enabled: z.boolean(), cron: z.string().trim().min(9).max(100) }).parse(req.body);
      const existing = backupTaskOf(server.id);
      const task = existing
        ? await scheduler.update(existing.id, { cron, enabled })
        : await scheduler.create({ name: `Backups of ${server.name}`, type: "server_backup", serverId: server.id, cron, enabled });
      await activity(req, "server_update", "Backup Schedule Updated", `${server.name}: ${enabled ? cron : "turned off"}`);
      res.json({ enabled: task!.enabled, cron: task!.cron, nextRunAt: task!.nextRunAt, lastRunAt: task!.lastRunAt, lastError: task!.lastError, keep: server.limits?.maxBackups ?? null });
    }),
  );

  app.get(
    "/api/servers/:id/backups/:backupId/download",
    requireAuth,
    requirePermission("servers.backups", "backups.view"),
    loadServer,
    handle(async (req, res) => {
      const backup = await loadBackup(req, res);
      const stream = await openBackupStream(backup);
      const fileName = `${srv(res).name}-${backup.name}.tar.gz`.replace(/[^\p{L}\p{N}._ -]/gu, "_");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Length", String(backup.size));
      await new Promise<void>((resolve, reject) => {
        stream.on("error", reject);
        res.on("finish", resolve);
        stream.pipe(res);
      });
    }),
  );

  app.post(
    "/api/servers/:id/backups/:backupId/restore",
    requireAuth,
    requirePermission("servers.backups", "backups.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const backup = await loadBackup(req, res);
      if (isActionInProgress(server.id)) return res.status(409).json({ message: "Wait for the current operation to finish" });
      await restoreServerBackup(server, backup);
      await pluginManager.callHook("backup_restore", server.id, { backupId: backup.id, serverId: server.id, serverName: server.name, backupName: backup.name, restoredBy: req.currentUser?.id });
      await activity(req, "backup_restore", "Backup Restored", `Backup '${backup.name}' restored for server '${server.name}'`);
      res.json({ message: "Backup restored successfully" });
    }),
  );

  app.delete(
    "/api/servers/:id/backups/:backupId",
    requireAuth,
    requirePermission("servers.backups", "backups.manage"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const backup = await loadBackup(req, res);
      await deleteServerBackup(backup);
      await pluginManager.callHook("backup_delete", srv(res).id, { backupId: backup.id, serverId: srv(res).id, backupName: backup.name, deletedBy: req.currentUser?.id });
      await activity(req, "backup_delete", "Backup Deleted", `Backup '${backup.name}' deleted`);
      res.json({ message: "Backup deleted successfully" });
    }),
  );

  /* ------------------------------------------------------------------ */
  /* Порты                                                              */
  /* ------------------------------------------------------------------ */

  app.get(
    "/api/servers/:id/ports",
    requireAuth,
    requirePermission("servers.view"),
    loadServer,
    handle(async (_req, res) => res.json(await storage.getPortsByServer(srv(res).id))),
  );

  app.post(
    "/api/servers/:id/ports",
    requireAuth,
    requirePermission("servers.ports"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const data = z
        .object({
          port: z.number().int().min(1).max(65535),
          protocol: z.enum(["tcp", "udp"]).default("tcp"),
          name: z.string().trim().max(50).optional().nullable(),
          description: z.string().trim().max(200).optional().nullable(),
          isPublic: z.boolean().optional(),
        })
        .parse(req.body);
      const ports = await storage.getPortsByServer(server.id);
      const maxPorts = server.limits?.maxPorts;
      if (maxPorts !== undefined && ports.length >= maxPorts) return res.status(403).json({ message: `Maximum port limit reached (${maxPorts})` });
      if (data.port === server.port || ports.some((p) => p.port === data.port && p.protocol === data.protocol)) {
        return res.status(409).json({ message: "Port is already assigned to this server" });
      }
      if (!(await storage.checkPortAvailable(data.port, server.id))) return res.status(409).json({ message: "Port is already in use" });
      const port = await storage.createPort({ serverId: server.id, port: data.port, protocol: data.protocol, name: data.name || null, description: data.description || null, isPublic: data.isPublic === true });
      await pluginManager.callHook("port_create", server.id, { portId: port.id, serverId: server.id, port: port.port, protocol: port.protocol });
      await activity(req, "port_create", "Port Added", `Port ${port.port}/${port.protocol} added to server '${server.name}' (applies after restart)`);
      res.status(201).json(port);
    }),
  );

  app.delete(
    "/api/servers/:id/ports/:portId",
    requireAuth,
    requirePermission("servers.ports"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.portId)) return res.status(400).json({ message: "Invalid port ID" });
      const port = await storage.getPort(req.params.portId);
      if (!port || port.serverId !== srv(res).id) return res.status(404).json({ message: "Port not found" });
      await storage.deletePort(port.id);
      await pluginManager.callHook("port_delete", srv(res).id, { portId: port.id, serverId: srv(res).id, port: port.port, protocol: port.protocol });
      await activity(req, "port_delete", "Port Removed", `Port ${port.port}/${port.protocol} removed from server '${srv(res).name}' (applies after restart)`);
      res.json({ message: "Port deleted successfully" });
    }),
  );

  /* ------------------------------------------------------------------ */
  /* SFTP                                                               */
  /* ------------------------------------------------------------------ */

  const homeDir = (value: unknown) => (value ? pathParam(value) : "/data");

  app.get(
    "/api/servers/:id/sftp",
    requireAuth,
    requirePermission("servers.files"),
    loadServer,
    handle(async (_req, res) => {
      const users = await storage.getSftpUsersByServer(srv(res).id);
      res.json(users.map(({ password: _p, ...u }) => u));
    }),
  );

  app.post(
    "/api/servers/:id/sftp",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      const existing = await storage.getSftpUsersByServer(server.id);
      const max = server.limits?.maxSftpUsers;
      if (max !== undefined && existing.length >= max) return res.status(403).json({ message: `Maximum SFTP user limit reached (${max})` });
      const username = sanitizeSftpUsername(req.body?.username);
      const password = req.body?.password;
      if (typeof password !== "string" || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
      if (existing.some((u) => u.username === username)) return res.status(409).json({ message: "Username already exists for this server" });

      const user = await storage.createSftpUser({
        serverId: server.id,
        username,
        password: await bcrypt.hash(password, 10),
        homeDirectory: homeDir(req.body?.homeDirectory),
        createdBy: req.currentUser?.id,
      });
      try {
        await syncSftp(server);
      } catch (error: any) {
        await storage.deleteSftpUser(user.id);
        throw new HttpError(502, `Failed to configure SFTP: ${error.message}`);
      }
      await pluginManager.callHook("sftp_user_create", server.id, { sftpUserId: user.id, serverId: server.id, username, createdBy: req.currentUser?.id });
      await activity(req, "sftp_user_create", "SFTP User Created", `SFTP user '${username}' created for server '${server.name}'`);
      const { password: _p, ...safe } = user;
      res.status(201).json(safe);
    }),
  );

  app.put(
    "/api/servers/:id/sftp/:userId",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      if (!isValidUUID(req.params.userId)) return res.status(400).json({ message: "Invalid ID format" });
      const sftpUser = await storage.getSftpUser(req.params.userId);
      if (!sftpUser || sftpUser.serverId !== server.id) return res.status(404).json({ message: "SFTP user not found" });

      const { username, password, homeDirectory, isActive } = req.body ?? {};
      const updates: Record<string, unknown> = {};
      if (username !== undefined) {
        const clean = sanitizeSftpUsername(username);
        const others = await storage.getSftpUsersByServer(server.id);
        if (others.some((u) => u.username === clean && u.id !== sftpUser.id)) return res.status(409).json({ message: "Username already exists for this server" });
        updates.username = clean;
      }
      if (password !== undefined && password !== "") {
        if (typeof password !== "string" || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
        updates.password = await bcrypt.hash(password, 10);
      }
      if (homeDirectory !== undefined) updates.homeDirectory = homeDir(homeDirectory);
      if (isActive !== undefined) updates.isActive = isActive === true;

      const updated = await storage.updateSftpUser(sftpUser.id, updates);
      try {
        await syncSftp(server);
      } catch (error: any) {
        await storage.updateSftpUser(sftpUser.id, sftpUser);
        throw new HttpError(502, `Failed to configure SFTP: ${error.message}`);
      }
      await pluginManager.callHook("sftp_user_update", server.id, { sftpUserId: sftpUser.id, serverId: server.id, username: updated!.username, isActive: updated!.isActive });
      await activity(req, "sftp_user_update", "SFTP User Updated", `SFTP user '${updated!.username}' updated for server '${server.name}'`);
      const { password: _p, ...safe } = updated!;
      res.json(safe);
    }),
  );

  app.delete(
    "/api/servers/:id/sftp/:userId",
    requireAuth,
    requirePermission("servers.files"),
    requireCSRF,
    loadServer,
    handle(async (req, res) => {
      const server = srv(res);
      if (!isValidUUID(req.params.userId)) return res.status(400).json({ message: "Invalid ID format" });
      const sftpUser = await storage.getSftpUser(req.params.userId);
      if (!sftpUser || sftpUser.serverId !== server.id) return res.status(404).json({ message: "SFTP user not found" });
      await storage.deleteSftpUser(sftpUser.id);
      await syncSftp(server).catch((error) => console.error("SFTP sync after delete failed:", error.message));
      await pluginManager.callHook("sftp_user_delete", server.id, { sftpUserId: sftpUser.id, serverId: server.id, username: sftpUser.username });
      await activity(req, "sftp_user_delete", "SFTP User Deleted", `SFTP user '${sftpUser.username}' deleted from server '${server.name}'`);
      res.json({ message: "SFTP user deleted successfully" });
    }),
  );

  /* ------------------------------------------------------------------ */
  /* API-ключи                                                          */
  /* ------------------------------------------------------------------ */

  app.get(
    "/api/api-keys",
    requireAuth,
    requirePermission("api.manage"),
    handle(async (_req, res) => res.json((await storage.getAllApiKeys()).map(serializeApiKey))),
  );

  app.post(
    "/api/api-keys",
    requireAuth,
    requirePermission("api.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (req.apiKeyId) return res.status(403).json({ message: "API keys cannot create other API keys" });
      const data = z
        .object({
          name: z.string().trim().min(3).max(100),
          description: z.string().trim().max(500).optional(),
          permissions: z.array(z.enum(userPermissions)).min(1),
          expiresAt: z.string().datetime().optional().nullable(),
        })
        .parse(req.body);
      assertGrantable(req.currentUser!, data.permissions);
      const key = `sp_${randomBytes(32).toString("hex")}`;
      const created = await storage.createApiKey({
        name: data.name,
        description: data.description || null,
        keyHash: hashApiKey(key),
        keyPrefix: key.slice(0, 10),
        permissions: unique(data.permissions),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        isActive: true,
        createdBy: req.currentUser!.id,
      });
      await pluginManager.callHook("api_key_create", created.id, { apiKeyId: created.id, apiKeyName: created.name, permissions: created.permissions, createdBy: req.currentUser?.id });
      await activity(req, "security_event", "API Key Created", `API key '${created.name}' created with ${created.permissions.length} permissions`);
      res.status(201).json({ ...serializeApiKey(created), key });
    }),
  );

  app.patch(
    "/api/api-keys/:id",
    requireAuth,
    requirePermission("api.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid API key ID format" });
      if (typeof req.body?.isActive !== "boolean") return res.status(400).json({ message: "isActive must be a boolean" });
      const key = await storage.getApiKey(req.params.id);
      if (!key) return res.status(404).json({ message: "API key not found" });
      const updated = await storage.updateApiKey(key.id, { isActive: req.body.isActive });
      await activity(req, "security_event", "API Key Updated", `API key '${key.name}' ${req.body.isActive ? "activated" : "deactivated"}`);
      res.json(serializeApiKey(updated!));
    }),
  );

  app.delete(
    "/api/api-keys/:id",
    requireAuth,
    requirePermission("api.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid API key ID format" });
      const key = await storage.getApiKey(req.params.id);
      if (!key) return res.status(404).json({ message: "API key not found" });
      await pluginManager.callHook("api_key_delete", key.id, { apiKeyId: key.id, apiKeyName: key.name, deletedBy: req.currentUser?.id });
      await storage.deleteApiKey(key.id);
      await activity(req, "security_event", "API Key Deleted", `API key '${key.name}' deleted`);
      res.json({ message: "API key deleted successfully" });
    }),
  );

  /* ------------------------------------------------------------------ */
  /* Ноды                                                               */
  /* ------------------------------------------------------------------ */

  app.get(
    "/api/nodes",
    requireAuth,
    requirePermission("nodes.view", "nodes.manage", "servers.manage"),
    handle(async (_req, res) => res.json(await storage.getAllNodes())),
  );

  app.get(
    "/api/nodes/:id",
    requireAuth,
    requirePermission("nodes.view", "nodes.manage", "servers.view"),
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid node ID format" });
      const node = await storage.getNode(req.params.id);
      if (!node) return res.status(404).json({ message: "Node not found" });
      res.json(node);
    }),
  );

  app.post(
    "/api/nodes",
    requireAuth,
    requirePermission("nodes.manage"),
    requireCSRF,
    handle(async (req, res) => {
      const data = insertNodeSchema
        .extend({
          name: z.string().trim().min(1).max(100),
          location: z.string().trim().min(1).max(100),
          ip: z.string().trim().min(1).max(255),
          port: z.number().int().min(1).max(65535).default(2375),
          cpuCores: z.number().int().min(1),
          ramTotal: z.number().int().min(1),
          diskTotal: z.number().int().min(1),
        })
        .parse(req.body);
      const node = await storage.createNode({ ...data, status: "offline" });
      const connected = await dockerManager.checkNodeConnection(node);
      const updated = (await storage.updateNode(node.id, { status: connected ? "online" : "offline" }))!;
      await pluginManager.callHook("node_create", node.id, { nodeId: node.id, nodeName: node.name, ip: node.ip, port: node.port, createdBy: req.currentUser?.id });
      await activity(req, "node_add", "Node Added", `Node '${node.name}' (${node.location}) was added${connected ? "" : " — Docker is not reachable yet"}`);
      res.status(201).json(updated);
    }),
  );

  app.delete(
    "/api/nodes/:id",
    requireAuth,
    requirePermission("nodes.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid node ID format" });
      const node = await storage.getNode(req.params.id);
      if (!node) return res.status(404).json({ message: "Node not found" });
      const hosted = (await storage.getAllServers()).filter((s) => s.nodeId === node.id);
      if (hosted.length > 0) {
        return res.status(409).json({ message: `Node hosts ${hosted.length} server(s). Delete or migrate them first.` });
      }
      await pluginManager.callHook("node_delete", node.id, { nodeId: node.id, nodeName: node.name, deletedBy: req.currentUser?.id });
      dockerManager.removeConnection(node.id);
      await storage.deleteNode(node.id);
      await activity(req, "node_delete", "Node Deleted", `Node '${node.name}' was deleted`);
      res.json({ message: "Node deleted" });
    }),
  );

  app.post(
    "/api/nodes/:id/check",
    requireAuth,
    requirePermission("nodes.manage"),
    requireCSRF,
    handle(async (req, res) => {
      if (!isValidUUID(req.params.id)) return res.status(400).json({ message: "Invalid node ID format" });
      const node = await storage.getNode(req.params.id);
      if (!node) return res.status(404).json({ message: "Node not found" });
      const connected = await dockerManager.checkNodeConnection(node);
      await storage.updateNode(node.id, { status: connected ? "online" : "offline" });
      res.json({ connected, status: connected ? "online" : "offline" });
    }),
  );

  app.get("/api/stats/nodes", requireAuth, requirePermission("nodes.view", "nodes.manage"), (_req, res) => res.json(storage.getAllNodeStats()));

  /* ------------------------------------------------------------------ */
  /* Журнал                                                             */
  /* ------------------------------------------------------------------ */

  app.get(
    "/api/activity",
    requireAuth,
    requirePermission("activity.view"),
    handle(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
      await sendCachedJson(req, res, `activity:${limit}`, 2000, async () => {
        const [activities, users] = await Promise.all([storage.getRecentActivities(limit), storage.getAllUsers()]);
        const names = new Map(users.map((u) => [u.id, u.username]));
        return activities.map((a) => ({
          ...a,
          timestamp: new Date(a.timestamp).toISOString(),
          performedBy: a.userId ? (names.get(a.userId) ?? "Deleted user") : "System",
        }));
      });
    }),
  );

  registerDdosRoutes(app, requireAuth, requirePermission, requireCSRF);

  app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

  /* ------------------------------------------------------------------ */
  /* WebSocket: консоль серверов и терминал VDS                           */
  /* ------------------------------------------------------------------ */

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/ws")) return;
    sessionMiddleware(req as any, {} as any, async () => {
      const sess = (req as any).session as Request["session"] | undefined;
      if (!sess?.userId || sess.require2FA) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const user = await storage.getUser(sess.userId).catch(() => undefined);
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req, user.id));
    });
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage, userId: string) => {
    const ip = clientIp(req);
    const reply = (payload: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(payload));
    const alive = { value: true };
    ws.on("pong", () => (alive.value = true));
    const heartbeat = setInterval(() => {
      if (!alive.value) return ws.terminate();
      alive.value = false;
      ws.ping();
    }, 30_000);

    ws.on("message", async (raw) => {
      let data: any;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      try {
        const user = await storage.getUser(userId);
        if (!user || (user.accessExpiresAt && new Date(user.accessExpiresAt).getTime() <= Date.now())) {
          ws.close(1008, "Unauthorized");
          return;
        }

        if ((data.type === "subscribe" || data.type === "command") && !isValidUUID(data.serverId)) {
          return reply({ type: "command_error", serverId: data.serverId, error: "Invalid server ID" });
        }

        if (data.type === "subscribe") {
          const server = await storage.getServer(data.serverId);
          if (!server || !canOnServer(user, server.id, "servers.console")) {
            await logSecurityEvent({ type: "unauthorized_access", ip, userId: user.id, details: `WebSocket subscribe denied for server ${data.serverId}`, timestamp: new Date() });
            return reply({ type: "command_error", serverId: data.serverId, error: "Access denied" });
          }
          await logStreamer.subscribe(server, ws);
        } else if (data.type === "unsubscribe" && isValidUUID(data.serverId)) {
          logStreamer.unsubscribe(data.serverId, ws);
        } else if (data.type === "command") {
          const server = await storage.getServer(data.serverId);
          if (!server || !canOnServer(user, server.id, "servers.command")) {
            return reply({ type: "command_error", serverId: data.serverId, error: "Insufficient permissions" });
          }
          if (!commandRateLimiter.checkLimit(`command:${user.id}`)) {
            return reply({ type: "command_error", serverId: data.serverId, error: "Too many commands. Please slow down." });
          }
          const command = sanitizeCommand(data.command);
          await logStreamer.sendCommand(server, command);
          await storage.addActivity({ type: "server_command", title: "Command Executed", description: `Command sent to '${server.name}': ${command.slice(0, 100)}`, timestamp: new Date(), userId: user.id });
          reply({ type: "command_sent", serverId: server.id, command });
        } else if (data.type === "vds_terminal_connect") {
          await vdsTerminal.connect(user.id, ws);
        } else if (data.type === "vds_terminal_command" && typeof data.command === "string") {
          await vdsTerminal.executeCommand(user.id, data.command, ws);
        } else if (data.type === "vds_terminal_disconnect") {
          vdsTerminal.disconnect(user.id, ws);
        }
      } catch (error: any) {
        reply({ type: "command_error", serverId: data?.serverId, error: error?.message || "Request failed" });
      }
    });

    ws.on("close", () => {
      clearInterval(heartbeat);
      logStreamer.unsubscribeAll(ws);
      vdsTerminal.disconnect(userId, ws);
    });
    ws.on("error", (error) => console.error("WebSocket error:", error.message));
  });

  /* ------------------------------------------------------------------ */
  /* Фоновые задачи                                                     */
  /* ------------------------------------------------------------------ */

  let collecting = false;
  const statsInterval = setInterval(async () => {
    if (collecting) return;
    collecting = true;
    try {
      await statsCollector.updateAllServerStats();
      await statsCollector.updateAllNodeStats();
    } catch (error) {
      console.error("Stats update error:", (error as Error).message);
    } finally {
      collecting = false;
    }
  }, 5000);

  const nodeCheckInterval = setInterval(async () => {
    try {
      const nodes = await storage.getAllNodes();
      const results = await dockerManager.checkAllNodes(nodes);
      for (const node of nodes) {
        const status = results.get(node.id) ? "online" : "offline";
        if (node.status !== status) {
          await storage.updateNode(node.id, { status });
          notify(
            "node_offline",
            status === "offline" ? `Node ${node.name} is offline` : `Node ${node.name} is back online`,
            status === "offline" ? `The panel cannot reach Docker at ${node.ip}:${node.port}. Servers on this node cannot be controlled.` : `Docker at ${node.ip}:${node.port} answers again.`,
          );
        }
      }
    } catch (error) {
      console.error("Node connection check error:", (error as Error).message);
    }
  }, 30_000);

  scheduler.start();

  httpServer.on("close", () => {
    clearInterval(statsInterval);
    clearInterval(nodeCheckInterval);
    scheduler.stop();
    wss.clients.forEach((client) => client.terminate());
  });

  return httpServer;
}
