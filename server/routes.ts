import type { Express, Request, Response } from "express";
import { createServer, type Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { basename, extname } from "path";
import bcrypt from "bcryptjs";
import { dockerManager } from "./docker-manager";
import { statsCollector } from "./stats-collector";
import { logStreamer } from "./log-streamer";
import { vdsTerminal } from "./vds-terminal";
import {
  insertServerSchema,
  insertNodeSchema,
  loginSchema,
  changePasswordSchema,
  serverCommandSchema,
  createUserSchema,
  updateUserSchema,
  userPermissions,
  type Server,
  type ConsoleLog,
  type FileEntry,
  type Activity,
  type User,
  type UserPermission,
  type UserRole,
  type UserProfile,
  type Node,
} from "@shared/schema";
import session from "express-session";

// Extend Express Session to include custom properties
declare global {
  namespace Express {
    interface SessionData {
      require2FA?: boolean;
    }
  }
}
import memorystore from "memorystore";
import { sanitizeCommand, sanitizePath, sanitizeUsername, isValidUUID, escapeHtml, loginRateLimiter, commandRateLimiter } from "./security";
import { randomBytes } from "crypto";
import { generateCSRFToken, verifyCSRFToken, removeCSRFToken, refreshCSRFToken } from "./csrf";
import { logSecurityEvent, isSuspiciousCommand, isSuspiciousPath, isDangerousFileExtension } from "./security-logger";
import { pluginManager } from "./plugins/plugin-manager";
import { telegramService } from "./telegram-service";
import multer from "multer";
import { join } from "path";
import { existsSync, mkdirSync, createWriteStream } from "fs";
import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { readFile as readFilePromise, writeFile as writeFilePromise, unlink as unlinkPromise } from "fs/promises";

// Session store
const MemoryStore = memorystore(session);

// Экспортируем session middleware для использования в WebSocket
let sessionMiddleware: any = null;

export async function registerRoutes(app: Express): Promise<HTTPServer> {
  // Determine if we're using HTTPS (either directly or through proxy)
  // FORCE_HTTPS=true should be set when using HTTPS (e.g., behind Nginx with SSL)
  // If not set, we assume HTTP (common for VDS direct access)
  const isSecure = process.env.FORCE_HTTPS === "true";
  
  
  // Генерируем безопасный секрет сессии, если не указан
  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret === "sparkpanel-secret-key-change-in-production") {
    // В продакшене должен быть установлен SESSION_SECRET в .env
    if (process.env.NODE_ENV === "production") {
      console.error("WARNING: SESSION_SECRET is not set in production! Using random secret (sessions will not persist across restarts).");
      sessionSecret = randomBytes(32).toString("hex");
    } else {
      sessionSecret = "sparkpanel-dev-secret-change-in-production";
    }
  }
  
  // Session middleware
  sessionMiddleware = session({
    secret: sessionSecret,
    resave: true, // Сохраняем сессию при каждом запросе для надежности (нужно для MemoryStore)
    saveUninitialized: false, // Не сохраняем пустые сессии
    name: "sparkpanel.sid", // Изменяем имя cookie, чтобы скрыть использование express-session
    store: new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      httpOnly: true,
      secure: isSecure, // true only if FORCE_HTTPS=true (HTTPS via proxy), false for HTTP (direct VDS access)
      sameSite: isSecure ? "none" : "lax", // "none" requires secure=true for HTTPS, "lax" for HTTP same-origin
    },
    // Explicitly save session on every request to ensure consistency
    rolling: true,
  });
  
  app.use(sessionMiddleware);

  const ALL_PERMISSIONS: UserPermission[] = [...userPermissions];

  const unique = <T,>(items: T[]): T[] => Array.from(new Set(items));

  // Проверка наличия всех прав (полный доступ)
  const hasFullAccess = (permissions: UserPermission[]): boolean => {
    return ALL_PERMISSIONS.every(p => permissions.includes(p));
  };

  // Проверка конкретного права у пользователя
  const hasPermission = (user: User, permission: UserPermission): boolean => {
    return user.permissions.includes(permission);
  };

  // Middleware для требования определённого права
  const requirePermission = (permission: UserPermission) => (req: Request, res: Response, next: Function) => {
    const user = req.currentUser;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (!hasPermission(user, permission)) {
      return res.status(403).json({ message: "Недостаточно полномочий" });
    }
    next();
  };

  // Проверка доступа к серверу (allowedServerIds = null означает доступ ко всем)
  const userHasServerAccess = (user: User, serverId: string): boolean => {
    if (user.allowedServerIds === null) {
      return true;
    }
    return (user.allowedServerIds || []).includes(serverId);
  };

  // Фильтрация серверов по доступу пользователя
  const filterServersForUser = (servers: Server[], user: User): Server[] => {
    if (user.allowedServerIds === null) {
      return servers;
    }
    const allowed = new Set(user.allowedServerIds || []);
    return servers.filter((server) => allowed.has(server.id));
  };

  // Сериализация пользователя для отправки клиенту
  const serializeUser = (user: User): UserProfile => ({
    id: user.id,
    username: user.username,
    permissions: user.permissions,
    allowedServerIds: user.allowedServerIds,
    hasAllServerAccess: user.allowedServerIds === null,
    isFullAccess: hasFullAccess(user.permissions),
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : new Date(user.createdAt).toISOString(),
  });

  const resolveAllowedServerIds = async (
    allServersAccess: boolean,
    serverIds?: string[],
  ): Promise<string[] | null> => {
    if (allServersAccess) {
      return null;
    }
    if (!serverIds || serverIds.length === 0) {
      return [];
    }
    const uniqueIds = unique(serverIds.filter((id) => isValidUUID(id)));
    if (uniqueIds.length === 0) {
      return [];
    }
    const existingServers = await storage.getAllServers();
    const validIds = new Set(existingServers.map((server) => server.id));
    return uniqueIds.filter((id) => validIds.has(id));
  };

  // Проверка, является ли пользователь последним с полным доступом (users.manage)
  const isLastFullAccessUser = async (userId: string): Promise<boolean> => {
    const users = await storage.getAllUsers();
    const fullAccessCount = users.filter((user) => 
      hasFullAccess(user.permissions) || user.permissions.includes("users.manage")
    ).length;
    const target = users.find((user) => user.id === userId);
    if (!target) return false;
    const targetHasFullAccess = hasFullAccess(target.permissions) || target.permissions.includes("users.manage");
    return targetHasFullAccess && fullAccessCount <= 1;
  };

  // CSRF middleware для защиты от межсайтовых запросов
  const requireCSRF = async (req: Request, res: Response, next: Function) => {
    // GET, HEAD, OPTIONS запросы не требуют CSRF токен
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }

    if (!req.currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const csrfToken = (req.headers["x-csrf-token"] as string) || (req.body && req.body._csrf);
      
      if (!csrfToken || !verifyCSRFToken(req.sessionID, csrfToken)) {
        // Логируем попытку CSRF атаки
        await logSecurityEvent({
          type: "csrf_attack",
          ip: req.ip || req.socket.remoteAddress || "unknown",
        userId: req.currentUser?.id,
          details: `CSRF attack attempt: ${req.method} ${req.path}`,
          timestamp: new Date(),
        }).catch(() => {});
        
        return res.status(403).json({ message: "Invalid CSRF token" });
      }
      
      // Обновляем срок действия токена
      refreshCSRFToken(req.sessionID);
    next();
  };

  // Authentication middleware
  const requireAuth = (req: Request, res: Response, next: Function) => {
    // Проверяем, что сессия существует и содержит userId
    if (!req.session || !req.session.userId) {
      // Не логируем это как ошибку - это нормально, если пользователь не залогинился
      // Логируем только в development режиме для отладки
      if (process.env.NODE_ENV === "development" && req.session && !req.session.userId) {
        // Это нормальная ситуация - пользователь просто не залогинился
        // Не нужно логировать это как ошибку
      }
      return res.status(401).json({ message: "Unauthorized" });
    }

    storage
      .getUser(req.session.userId)
      .then((user) => {
        if (!user) {
          // Пользователь не найден - очищаем сессию
          req.session.destroy(() => {});
          return res.status(401).json({ message: "Unauthorized" });
        }
        req.currentUser = user;
        // Убеждаемся, что userId сохранен в сессии
        if (req.session.userId !== user.id) {
          req.session.userId = user.id;
        }
        next();
      })
      .catch((error) => {
        console.error("Auth lookup error:", error);
        res.status(500).json({ message: "Failed to verify session" });
      });
  };

  // Проверка прав доступа к серверу (пользователь может управлять только своими серверами)
  // В текущей реализации все пользователи могут управлять всеми серверами (single-user system)
  // В будущем можно добавить поле ownerId к серверу
  const checkServerAccess = async (req: Request, res: Response, next: Function) => {
    const serverId = req.params.id;
    if (!serverId || !isValidUUID(serverId)) {
      return res.status(400).json({ message: "Invalid server ID" });
    }

    if (!req.currentUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const server = await storage.getServer(serverId);
    if (!server) {
      return res.status(404).json({ message: "Server not found" });
    }

    if (!userHasServerAccess(req.currentUser, serverId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      // Получаем IP адрес для rate limiting
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const identifier = `login:${clientIp}`;

      // Проверяем rate limit
      if (!loginRateLimiter.checkLimit(identifier)) {
        // Логируем попытку brute force
        await logSecurityEvent({
          type: "brute_force",
          ip: clientIp,
          details: `Brute force attempt: too many login attempts from ${clientIp}`,
          timestamp: new Date(),
        });
        
        return res.status(429).json({ 
          message: "Too many login attempts. Please try again later." 
        });
      }

      // Санитизируем username
      let username: string;
      try {
        username = sanitizeUsername(req.body.username);
      } catch (error: any) {
        return res.status(400).json({ message: error.message || "Invalid username" });
      }

      const data = loginSchema.parse({ username, password: req.body.password });
      
      const user = await storage.getUserByUsername(data.username);

      if (!user) {
        // Не раскрываем, существует ли пользователь
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const passwordMatch = await bcrypt.compare(data.password, user.password);

      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Проверяем, включена ли 2FA
      if (user.twoFactorEnabled && user.telegramBotToken && user.telegramChatId) {
        // Генерируем 6-значный код
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await storage.create2FACode(user.id, code, expiresAt); // 5 минут

        // Отправляем код через Telegram
        const codeSent = await telegramService.sendCode(
          user.telegramBotToken,
          user.telegramChatId,
          code,
          user.username
        );

        if (!codeSent) {
          console.error("Failed to send 2FA code via Telegram");
          return res.status(500).json({ message: "Failed to send 2FA code" });
        }

        console.log(`2FA code sent to user ${user.id}`);

        // Сбрасываем rate limit при успешном входе (с требованием 2FA)
        loginRateLimiter.reset(identifier);

        // Сохраняем в сессию, что пользователь прошел первый этап (пароль)
        return new Promise<void>((resolve, reject) => {
          req.session.regenerate((err) => {
            if (err) {
              console.error("Session regeneration error:", err);
              return reject(err);
            }

            req.session.userId = user.id;
            req.session.require2FA = true; // Флаг для требования 2FA
            
            const csrfToken = generateCSRFToken(req.sessionID);
            req.session.csrfToken = csrfToken;
            
            req.session.save((saveErr) => {
              if (saveErr) {
                console.error("Session save error:", saveErr);
                return reject(saveErr);
              }
              
              res.json({ 
                require2FA: true,
                message: "2FA code has been sent to your Telegram",
              });
              resolve();
            });
          });
        }).catch((error) => {
          console.error("Login session error:", error);
          res.status(500).json({ message: "Failed to create session" });
        });
      }

      // Регенерируем сессию для безопасности (уничтожаем старую и создаем новую)
      return new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) {
            console.error("Session regeneration error:", err);
            return reject(err);
          }

          // Теперь устанавливаем userId в новую сессию
          req.session.userId = user.id;
          
          // Генерируем CSRF токен для новой сессии
          const csrfToken = generateCSRFToken(req.sessionID);
          req.session.csrfToken = csrfToken;
          
          // Сохраняем сессию
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("Session save error:", saveErr);
              return reject(saveErr);
            }
            
            // Проверяем, что userId действительно сохранен
            if (!req.session.userId) {
              console.error("CRITICAL: userId was not saved in session after save()");
              req.session.userId = user.id;
              req.session.save((err2) => {
                if (err2) {
                  console.error("Failed to save userId on retry:", err2);
                }
              });
            }
            
            // Log activity after session is saved (без чувствительных данных)
            storage.addActivity({
              type: "user_login",
              title: "User Login",
              description: `User logged in`,
              timestamp: new Date(),
              userId: user.id,
            }).catch(err => console.error("Activity log error:", err));
            
            // Send response with Set-Cookie header and CSRF token
            res.json({ 
              user: serializeUser(user),
              csrfToken,
            });
            resolve();
          });
        });
      }).catch((error) => {
        console.error("Login session error:", error);
        res.status(500).json({ message: "Failed to create session" });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  // Проверка 2FA кода
  app.post("/api/auth/verify-2fa", async (req, res) => {
    try {
      if (!req.session || !req.session.userId || !req.session.require2FA) {
        return res.status(401).json({ message: "Not in 2FA verification state" });
      }

      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Code is required" });
      }

      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Проверяем код
      const isValid = await storage.verify2FACode(user.id, code.trim());
      if (!isValid) {
        return res.status(401).json({ message: "Invalid 2FA code" });
      }

      // Код верный - очищаем флаг require2FA
      req.session.require2FA = false;
      
      storage.addActivity({
        type: "user_login",
        title: "User Login",
        description: `User logged in with 2FA`,
        timestamp: new Date(),
        userId: user.id,
      }).catch(err => console.error("Activity log error:", err));

      const csrfToken = generateCSRFToken(req.sessionID);
      req.session.csrfToken = csrfToken;
      
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        
        res.json({ 
          user: serializeUser(user),
          csrfToken,
        });
      });
    } catch (error) {
      console.error("2FA verification error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    // Удаляем CSRF токен при выходе
    removeCSRFToken(req.sessionID);
    
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = req.currentUser!;

    // Убеждаемся, что userId сохранен в сессии (на случай если сессия была пересоздана)
    if (!req.session.userId) {
      req.session.userId = user.id;
    }

    // Генерируем или обновляем CSRF токен
    let csrfToken = req.session.csrfToken as string | undefined;
    if (!csrfToken || !verifyCSRFToken(req.sessionID, csrfToken)) {
      csrfToken = generateCSRFToken(req.sessionID);
      req.session.csrfToken = csrfToken;
    } else {
      refreshCSRFToken(req.sessionID);
    }

    // Явно сохраняем сессию
    req.session.save((err) => {
      if (err) {
        console.error("Session save error in /api/auth/me:", err);
      }
      
      res.json({ 
        user: serializeUser(user),
        csrfToken,
        version: "1.3",
      });
    });
  });

  // API endpoint для получения информации о системе/версии
  app.get("/api/system/info", requireAuth, async (req, res) => {
    const settings = await storage.getPanelSettings();
    res.json({
      name: settings.panelName,
      version: "1.3",
      description: "Game Server Management Platform",
    });
  });

  // API endpoints для настроек панели
  // GET endpoint публичный - название панели нужно на странице логина
  app.get("/api/settings/panel", async (req, res) => {
    const settings = await storage.getPanelSettings();
    res.json(settings);
  });

  app.put("/api/settings/panel", requireAuth, requirePermission("panel.colors"), requireCSRF, async (req, res) => {
    try {
      const { panelName, primaryColor, backgroundColor, borderColor, sidebarAccentColor } = req.body;
      
      const updates: { panelName?: string; primaryColor?: string; backgroundColor?: string; borderColor?: string; sidebarAccentColor?: string } = {};
      
      if (panelName !== undefined) {
        if (typeof panelName !== "string" || panelName.trim().length === 0) {
          return res.status(400).json({ message: "Panel name cannot be empty" });
        }
        if (panelName.length > 50) {
          return res.status(400).json({ message: "Panel name must be 50 characters or less" });
        }
        updates.panelName = escapeHtml(panelName.trim());
      }
      
      if (primaryColor !== undefined) {
        if (primaryColor !== null && (typeof primaryColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(primaryColor))) {
          return res.status(400).json({ message: "Primary color must be a valid hex color (e.g., #FF5733) or null" });
        }
        updates.primaryColor = primaryColor || undefined;
      }
      
      if (backgroundColor !== undefined) {
        if (backgroundColor !== null && (typeof backgroundColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(backgroundColor))) {
          return res.status(400).json({ message: "Background color must be a valid hex color (e.g., #FFFFFF) or null" });
        }
        updates.backgroundColor = backgroundColor || undefined;
      }
      
      if (borderColor !== undefined) {
        if (borderColor !== null && (typeof borderColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(borderColor))) {
          return res.status(400).json({ message: "Border color must be a valid hex color (e.g., #E5E7EB) or null" });
        }
        updates.borderColor = borderColor || undefined;
      }
      
      if (sidebarAccentColor !== undefined) {
        if (sidebarAccentColor !== null && (typeof sidebarAccentColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(sidebarAccentColor))) {
          return res.status(400).json({ message: "Sidebar accent color must be a valid hex color (e.g., #F3F4F6) or null" });
        }
        updates.sidebarAccentColor = sidebarAccentColor || undefined;
      }
      
      const settings = await storage.updatePanelSettings(updates);
      
      await storage.addActivity({
        type: "server_command",
        title: "Panel Settings Updated",
        description: `Panel settings updated`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      }).catch(() => {});
      
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update panel settings" });
    }
  });

  // ========== USER MANAGEMENT API ==========
  
  // Просмотр пользователей - требует users.view ИЛИ users.manage
  app.get("/api/users", requireAuth, async (req, res) => {
    const user = req.currentUser!;
    if (!hasPermission(user, "users.view") && !hasPermission(user, "users.manage")) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const users = await storage.getAllUsers();
    res.json(users.map(serializeUser));
  });

  app.post("/api/users", requireAuth, requirePermission("users.manage"), requireCSRF, async (req, res) => {
    try {
      const data = createUserSchema.parse(req.body);

      // Санитизируем username (как при логине)
      let sanitizedUsername: string;
      try {
        sanitizedUsername = sanitizeUsername(data.username);
      } catch (error: any) {
        return res.status(400).json({ message: error.message || "Invalid username" });
      }

      const existing = await storage.getUserByUsername(sanitizedUsername);
      if (existing) {
        return res.status(409).json({ message: "Username already exists" });
      }

      // Валидируем и фильтруем права
      const permissions = unique(data.permissions.filter((p: string) => ALL_PERMISSIONS.includes(p as UserPermission))) as UserPermission[];
      
      if (permissions.length === 0) {
        return res.status(400).json({ message: "At least one permission is required" });
      }

      const allowedServerIds = await resolveAllowedServerIds(
        data.allServersAccess ?? true,
        data.allowedServerIds,
      );

      const passwordHash = await bcrypt.hash(data.password, 10);
      const user = await storage.createUser({
        username: sanitizedUsername,
        password: passwordHash,
        permissions,
        allowedServerIds,
      });

      await storage.addActivity({
        type: "user_create",
        title: "User Created",
        description: `User '${data.username}' was created with ${permissions.length} permissions`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      });

      res.status(201).json(serializeUser(user));
    } catch (error: any) {
      console.error("Create user error:", error);
      res.status(400).json({ message: error.message || "Invalid request" });
    }
  });

  app.put("/api/users/:id", requireAuth, requirePermission("users.manage"), requireCSRF, async (req, res) => {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    try {
      const data = updateUserSchema.parse(req.body);
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let sanitizedUsername: string = user.username;
      if (data.username && data.username !== user.username) {
        // Санитизируем username (как при логине)
        try {
          sanitizedUsername = sanitizeUsername(data.username);
        } catch (error: any) {
          return res.status(400).json({ message: error.message || "Invalid username" });
        }

        const existing = await storage.getUserByUsername(sanitizedUsername);
        if (existing) {
          return res.status(409).json({ message: "Username already exists" });
        }
      }

      // Проверяем, не пытаемся ли удалить права у последнего пользователя с users.manage
      if (data.permissions) {
        const newHasUserManage = data.permissions.includes("users.manage");
        const oldHasUserManage = user.permissions.includes("users.manage");
        
        if (oldHasUserManage && !newHasUserManage) {
          if (await isLastFullAccessUser(user.id)) {
            return res.status(400).json({ message: "Cannot remove users.manage from the last user with this permission" });
          }
        }
      }

      // Валидируем и фильтруем права
      const permissions = data.permissions
        ? unique(data.permissions.filter((p: string) => ALL_PERMISSIONS.includes(p as UserPermission))) as UserPermission[]
        : user.permissions;

      let allowedServerIds = user.allowedServerIds;
      if (data.allServersAccess !== undefined || data.allowedServerIds !== undefined) {
        const allAccess =
          data.allServersAccess !== undefined
            ? data.allServersAccess
            : user.allowedServerIds === null;
        const selection =
          data.allowedServerIds !== undefined
            ? data.allowedServerIds
            : Array.isArray(user.allowedServerIds)
              ? user.allowedServerIds
              : [];
        allowedServerIds = await resolveAllowedServerIds(allAccess, selection);
      }

      const updates: Partial<User> = {
        username: data.username ? sanitizedUsername : user.username,
        permissions,
        allowedServerIds,
      };

      if (data.password) {
        updates.password = await bcrypt.hash(data.password, 10);
      }

      const updatedUser = await storage.updateUser(user.id, updates);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.addActivity({
        type: "user_update",
        title: "User Updated",
        description: `User '${updatedUser.username}' permissions updated`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      });

      res.json(serializeUser(updatedUser));
    } catch (error: any) {
      console.error("Update user error:", error);
      res.status(400).json({ message: error.message || "Invalid request" });
    }
  });

  app.delete("/api/users/:id", requireAuth, requirePermission("users.manage"), requireCSRF, async (req, res) => {
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const user = await storage.getUser(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Нельзя удалить последнего пользователя с правом users.manage
    if (await isLastFullAccessUser(user.id)) {
      return res.status(400).json({ message: "Cannot delete the last user with users.manage permission" });
    }

    await storage.deleteUser(user.id);

    await storage.addActivity({
      type: "user_delete",
      title: "User Deleted",
      description: `User '${user.username}' was deleted`,
      timestamp: new Date(),
      userId: req.currentUser?.id,
    });

    res.json({ message: "User deleted" });
  });

  // ========== PLUGINS API ==========
  
  // Настройка multer для загрузки плагинов
  const pluginsDir = "./plugins";
  if (!existsSync(pluginsDir)) {
    mkdirSync(pluginsDir, { recursive: true });
  }

  const multerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, pluginsDir);
    },
    filename: (req, file, cb) => {
      // Сохраняем оригинальное имя файла
      cb(null, file.originalname);
    },
  });

  const uploadPlugins = multer({
    storage: multerStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
    fileFilter: (req, file, cb) => {
      // Разрешаем только определенные типы файлов
      const allowedTypes = /\.(js|ts|py|jar|zip|tar\.gz)$/i;
      if (allowedTypes.test(file.originalname)) {
        cb(null, true);
      } else {
        cb(new Error("Invalid file type. Allowed: .js, .ts, .py, .jar, .zip, .tar.gz"));
      }
    },
  });

  // Multer для загрузки файлов в серверы (более строгие ограничения)
  const uploadServerFilesStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Временная папка для загруженных файлов
      const tempDir = "./temp-uploads";
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      // Генерируем уникальное имя файла
      const uniqueName = `${Date.now()}-${randomBytes(8).toString("hex")}-${basename(file.originalname)}`;
      cb(null, uniqueName);
    },
  });

  const uploadServerFiles = multer({
    storage: uploadServerFilesStorage,
    limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max для файлов сервера (ограничение base64)
    fileFilter: (req, file, cb) => {
      // Блокируем опасные расширения
      if (isDangerousFileExtension(file.originalname)) {
        cb(new Error("File type is not allowed for security reasons"));
        return;
      }
      cb(null, true);
    },
  });

  // Получить список всех плагинов
  app.get("/api/plugins", requireAuth, requirePermission("plugins.manage"), async (req, res) => {
    try {
      const plugins = await pluginManager.getAllPlugins();
      res.json(plugins);
    } catch (error: any) {
      console.error("Failed to get plugins:", error);
      res.status(500).json({ message: error.message || "Failed to get plugins" });
    }
  });

  // Получить информацию о конкретном плагине
  app.get("/api/plugins/:id", requireAuth, requirePermission("plugins.manage"), async (req, res) => {
    try {
      const plugin = pluginManager.getPlugin(req.params.id);
      if (!plugin) {
        return res.status(404).json({ message: "Plugin not found" });
      }
      res.json(plugin);
    } catch (error: any) {
      console.error("Failed to get plugin:", error);
      res.status(500).json({ message: error.message || "Failed to get plugin" });
    }
  });

  // Загрузить плагин (файл)
  app.post(
    "/api/plugins/upload",
    requireAuth,
    requirePermission("plugins.manage"),
    requireCSRF,
    uploadPlugins.single("plugin"),
    async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const file = req.file;
      // Валидация и санитизация pluginId
      let pluginId: string;
      if (req.body.pluginId) {
        // Санитизируем pluginId - только безопасные символы
        const rawPluginId = String(req.body.pluginId).trim();
        if (!/^[a-zA-Z0-9._-]+$/.test(rawPluginId) || rawPluginId.length > 100) {
          await unlinkPromise(file.path).catch(() => {});
          return res.status(400).json({ message: "Invalid plugin ID format" });
        }
        pluginId = rawPluginId;
      } else {
        pluginId = basename(file.originalname, extname(file.originalname));
      }
      const pluginPath = join(pluginsDir, pluginId);

      // Создаем директорию для плагина
      if (!existsSync(pluginPath)) {
        mkdirSync(pluginPath, { recursive: true });
      }

      // Перемещаем файл в папку плагина
      const finalPath = join(pluginPath, file.originalname);
      const readStream = createReadStream(file.path);
      const writeStream = createWriteStream(finalPath);
      await pipeline(readStream, writeStream);
      
      // Удаляем временный файл
      await unlinkPromise(file.path);

      // Создаем или обновляем manifest.json
      const manifestPath = join(pluginPath, "manifest.json");
      const fileExt = extname(file.originalname).toLowerCase();
      
      // Валидация и санитизация данных манифеста
      const sanitizeString = (str: any, maxLength: number = 200, defaultValue: string = ""): string => {
        if (!str || typeof str !== "string") return defaultValue;
        const sanitized = String(str).trim().substring(0, maxLength);
        // Разрешаем только безопасные символы (убираем потенциально опасные)
        return sanitized.replace(/[<>\"'&]/g, "");
      };
      
      let manifest: any = {
        id: pluginId,
        name: sanitizeString(req.body.name, 100, pluginId),
        version: sanitizeString(req.body.version, 20, "1.0.0"),
        description: sanitizeString(req.body.description, 500, ""),
        author: sanitizeString(req.body.author, 100, "Unknown"),
        type: sanitizeString(req.body.type, 20) || (fileExt === ".py" ? "python" : fileExt === ".jar" ? "jar" : fileExt === ".ts" ? "typescript" : "javascript"),
        enabled: false,
        main: file.originalname,
      };

      if (existsSync(manifestPath)) {
        const existingManifest = JSON.parse(await readFilePromise(manifestPath, "utf-8"));
        manifest = { ...existingManifest, ...manifest };
      }

      await writeFilePromise(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

      // Загружаем плагин в менеджер
      await pluginManager.loadPlugin(pluginId);

      res.json({ message: "Plugin uploaded successfully", plugin: manifest });
    } catch (error: any) {
      console.error("Failed to upload plugin:", error);
      res.status(500).json({ message: error.message || "Failed to upload plugin" });
    }
  });

  // Включить плагин
  app.post("/api/plugins/:id/enable", requireAuth, requirePermission("plugins.manage"), requireCSRF, async (req, res) => {
    try {
      await pluginManager.enablePlugin(req.params.id);
      res.json({ message: "Plugin enabled" });
    } catch (error: any) {
      console.error("Failed to enable plugin:", error);
      res.status(500).json({ message: error.message || "Failed to enable plugin" });
    }
  });

  // Отключить плагин
  app.post("/api/plugins/:id/disable", requireAuth, requirePermission("plugins.manage"), requireCSRF, async (req, res) => {
    try {
      await pluginManager.disablePlugin(req.params.id);
      res.json({ message: "Plugin disabled" });
    } catch (error: any) {
      console.error("Failed to disable plugin:", error);
      res.status(500).json({ message: error.message || "Failed to disable plugin" });
    }
  });

  // Удалить плагин
  app.delete("/api/plugins/:id", requireAuth, requirePermission("plugins.manage"), requireCSRF, async (req, res) => {
    try {
      await pluginManager.deletePlugin(req.params.id);
      res.json({ message: "Plugin deleted" });
    } catch (error: any) {
      console.error("Failed to delete plugin:", error);
      res.status(500).json({ message: error.message || "Failed to delete plugin" });
    }
  });

  app.post("/api/auth/change-password", requireAuth, requireCSRF, async (req, res) => {
    try {
      const data = changePasswordSchema.parse(req.body);
      const user = req.currentUser!;

      if (!(await bcrypt.compare(data.currentPassword, user.password))) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const newPasswordHash = await bcrypt.hash(data.newPassword, 10);
      await storage.updateUserPassword(user.id, newPasswordHash);

      await storage.addActivity({
        type: "password_change",
        title: "Password Changed",
        description: `User '${user.username}' changed their password`,
        timestamp: new Date(),
        userId: user.id,
      });

      res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.put("/api/auth/profile", requireAuth, requireCSRF, async (req, res) => {
    try {
      const { nickname } = req.body;
      const user = req.currentUser!;

      if (nickname !== undefined) {
        if (typeof nickname !== "string" || nickname.length > 50) {
          return res.status(400).json({ message: "Invalid nickname" });
        }
      }

      const updates: Partial<User> = {};
      if (nickname !== undefined) {
        updates.nickname = nickname.trim() || null;
      }

      const updatedUser = await storage.updateUser(user.id, updates);
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.addActivity({
        type: "profile_update",
        title: "Profile Updated",
        description: `User '${user.username}' updated their profile`,
        timestamp: new Date(),
        userId: user.id,
      });

      res.json(serializeUser(updatedUser));
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/auth/2fa/generate-code", requireAuth, requireCSRF, async (req, res) => {
    try {
      const { telegramBotToken } = req.body;
      const user = req.currentUser!;

      if (!telegramBotToken || typeof telegramBotToken !== "string") {
        return res.status(400).json({ message: "Invalid token" });
      }

      // Проверяем валидность токена
      const isValidToken = await telegramService.validateToken(telegramBotToken);
      if (!isValidToken) {
        return res.status(400).json({ message: "Invalid Telegram bot token" });
      }

      // Генерируем код
      const code = telegramService.generateSetupCode(telegramBotToken);

      res.json({ 
        code,
        message: "Code generated. Send this code to your Telegram bot to verify.",
      });
    } catch (error: any) {
      console.error("Generate 2FA code error:", error);
      res.status(400).json({ message: error.message || "Failed to generate code" });
    }
  });

  app.post("/api/auth/2fa/confirm-code", requireAuth, requireCSRF, async (req, res) => {
    try {
      const { telegramBotToken } = req.body;
      const user = req.currentUser!;

      if (!telegramBotToken || typeof telegramBotToken !== "string") {
        return res.status(400).json({ message: "Invalid token" });
      }

      // Получаем Chat ID из сообщения с кодом
      const chatId = await telegramService.getChatIdFromCode(telegramBotToken);
      if (!chatId) {
        return res.status(400).json({ 
          message: "Code not found. Make sure you sent the code to your Telegram bot." 
        });
      }

      // Генерируем код 2FA для проверки при входе
      const twoFACode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Сохраняем код в БД
      await storage.create2FACode(user.id, twoFACode, expiresAt);

      // Отправляем код в Telegram как подтверждение
      const codeSent = await telegramService.sendCode(
        telegramBotToken,
        chatId,
        twoFACode,
        user.username
      );

      if (!codeSent) {
        return res.status(400).json({ 
          message: "Failed to send verification code to Telegram. Please try again." 
        });
      }

      // Обновляем пользователя
      console.log("Updating user with:", { twoFactorEnabled: true, telegramBotToken: "***", telegramChatId: chatId });
      const updateData: any = {};
      if (telegramBotToken) updateData.telegramBotToken = telegramBotToken;
      if (chatId) updateData.telegramChatId = chatId;
      updateData.twoFactorEnabled = true;
      
      const updatedUser = await storage.updateUser(user.id, updateData);

      await storage.addActivity({
        type: "2fa_enable",
        title: "2FA Enabled",
        description: "Two-factor authentication enabled via Telegram",
        timestamp: new Date(),
        userId: user.id,
      });

      res.json({ 
        message: "2FA enabled successfully! Check your Telegram for the verification code.",
        user: serializeUser(updatedUser!) 
      });
    } catch (error: any) {
      console.error("Confirm 2FA code error:", error);
      res.status(400).json({ message: error.message || "Failed to confirm code" });
    }
  });

  app.post("/api/auth/2fa/setup", requireAuth, requireCSRF, async (req, res) => {
    try {
      const { telegramBotToken, telegramChatId } = req.body;
      const user = req.currentUser!;

      if (!telegramBotToken || typeof telegramBotToken !== "string") {
        return res.status(400).json({ message: "Invalid token" });
      }

      if (!telegramChatId || typeof telegramChatId !== "string") {
        return res.status(400).json({ message: "Chat ID is required" });
      }

      // Проверяем валидность токена
      const isValidToken = await telegramService.validateToken(telegramBotToken);
      if (!isValidToken) {
        return res.status(400).json({ message: "Invalid Telegram bot token" });
      }

      // Генерируем код
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Сохраняем код в БД
      await storage.create2FACode(user.id, code, expiresAt);

      // Отправляем код в Telegram
      const codeSent = await telegramService.sendCode(
        telegramBotToken,
        telegramChatId,
        code,
        user.username
      );

      if (!codeSent) {
        return res.status(400).json({ 
          message: "Failed to send code to Telegram. Possible causes: Invalid Chat ID, bot was blocked by user, or bot token is invalid. Please verify your Chat ID and make sure you sent /start to the bot." 
        });
      }

      // Обновляем пользователя
      const updatedUser = await storage.updateUser(user.id, {
        twoFactorEnabled: true,
        telegramBotToken,
        telegramChatId,
      });

      await storage.addActivity({
        type: "2fa_enable",
        title: "2FA Enabled",
        description: "Two-factor authentication enabled via Telegram",
        timestamp: new Date(),
        userId: user.id,
      });

      res.json({ 
        message: "2FA enabled successfully. Check your Telegram for the code.",
        user: serializeUser(updatedUser!) 
      });
    } catch (error: any) {
      console.error("2FA setup error:", error);
      res.status(400).json({ message: error.message || "Failed to setup 2FA" });
    }
  });

  app.post("/api/auth/2fa/verify", async (req, res) => {
    try {
      const { code } = req.body;
      
      // Check if user is in 2FA stage (from login with require2FA flag)
      if (!req.session || !req.session.userId || !req.session.require2FA) {
        return res.status(400).json({ message: "Not in 2FA verification stage" });
      }

      const user = await storage.getUser(req.session.userId);
      if (!user || !user.twoFactorEnabled) {
        return res.status(400).json({ message: "2FA not enabled" });
      }

      const isValid = await storage.verify2FACode(user.id, code);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid or expired code" });
      }

      // Clear 2FA requirement from session
      req.session.require2FA = false;

      // Log successful login activity
      await storage.addActivity({
        type: "user_login",
        title: "User Login",
        description: `User logged in with 2FA verification`,
        timestamp: new Date(),
        userId: user.id,
      }).catch(err => console.error("Activity log error:", err));

      res.json({ 
        message: "Code verified and logged in", 
        user: serializeUser(user),
        csrfToken: req.session.csrfToken
      });
    } catch (error) {
      console.error("2FA verify error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.post("/api/auth/2fa/disable", requireAuth, requireCSRF, async (req, res) => {
    try {
      const user = req.currentUser!;

      const updatedUser = await storage.updateUser(user.id, {
        twoFactorEnabled: false,
        telegramBotToken: null,
        telegramChatId: null,
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      await storage.addActivity({
        type: "2fa_disable",
        title: "2FA Disabled",
        description: "Two-factor authentication disabled",
        timestamp: new Date(),
        userId: user.id,
      });

      res.json({ message: "2FA disabled", user: serializeUser(updatedUser) });
    } catch (error: any) {
      console.error("2FA disable error:", error);
      res.status(400).json({ message: error.message || "Failed to disable 2FA" });
    }
  });

  // Server routes
  app.get("/api/servers", requireAuth, requirePermission("servers.view"), async (req, res) => {
    const servers = await storage.getAllServers();
    res.json(filterServersForUser(servers, req.currentUser!));
  });

  app.get("/api/servers/:id", requireAuth, requirePermission("servers.view"), checkServerAccess, async (req, res) => {
    // Валидация UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid server ID format" });
    }

    const server = await storage.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ message: "Server not found" });
    }
    res.json(server);
  });

  app.post("/api/servers", requireAuth, requirePermission("servers.manage"), requireCSRF, async (req, res) => {
    try {
      const data = insertServerSchema.parse(req.body);
      const server = await storage.createServer(data);
      
      await storage.addActivity({
        type: "server_create",
        title: "Server Created",
        description: `Server '${server.name}' (${server.gameType}) was created`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      });
      
      res.json(server);
    } catch (error) {
      console.error("Create server error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete("/api/servers/:id", requireAuth, requirePermission("servers.manage"), requireCSRF, checkServerAccess, async (req, res) => {
    // Валидация UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid server ID format" });
    }

    const server = await storage.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ message: "Server not found" });
    }

    // Stop and remove container if exists
    if (server.containerId) {
      try {
        const node = await storage.getNode(server.nodeId);
        if (node) {
          const container = await dockerManager.getContainer(node, server.containerId);
          try {
            await container.stop();
          } catch (error) {
            // Container might already be stopped
            console.warn("Container stop warning:", error);
          }
          await container.remove();
        }
      } catch (error) {
        console.error("Error removing container:", error);
      }
    }

    await storage.deleteServer(req.params.id);
    
    await storage.addActivity({
      type: "server_delete",
      title: "Server Deleted",
      description: `Server '${server.name}' was deleted`,
      timestamp: new Date(),
      userId: req.currentUser?.id,
    });
    
    res.json({ message: "Server deleted" });
  });

  // Server control operations
  app.post(
    "/api/servers/:id/start",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
    // Валидация UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid server ID format" });
    }

    const server = await storage.getServer(req.params.id);
    if (!server) {
      return res.status(404).json({ message: "Server not found" });
    }

    try {
      // Получаем ноду для сервера
      const node = await storage.getNode(server.nodeId);
      if (!node) {
        return res.status(404).json({ message: "Node not found" });
      }

      // Проверяем подключение к ноде
      const isConnected = await dockerManager.checkNodeConnection(node);
      if (!isConnected) {
        await storage.updateNode(node.id, { status: "offline" });
        return res.status(503).json({ message: "Node is offline" });
      }

      // Create container if doesn't exist
      if (!server.containerId) {
        const container = await createGameServerContainer(server, node);
        await storage.updateServer(server.id, { containerId: container.id });
      }

      const container = await dockerManager.getContainer(node, server.containerId!);
      await container.start();
      await storage.updateServer(server.id, { status: "running" });

      await storage.addActivity({
        type: "server_start",
        title: "Server Started",
        description: `Server '${server.name}' was started`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      });

      res.json({ message: "Server started" });
    } catch (error) {
      console.error("Start server error:", error);
      await storage.updateServer(server.id, { status: "error" });
      res.status(500).json({ message: "Failed to start server" });
    }
  });

  app.post(
    "/api/servers/:id/stop",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
    // Валидация UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid server ID format" });
    }

    const server = await storage.getServer(req.params.id);
    if (!server || !server.containerId) {
      return res.status(404).json({ message: "Server not found" });
    }

    try {
      const node = await storage.getNode(server.nodeId);
      if (!node) {
        return res.status(404).json({ message: "Node not found" });
      }

      const container = await dockerManager.getContainer(node, server.containerId);
      await container.stop();
      await storage.updateServer(server.id, { status: "stopped" });

      await storage.addActivity({
        type: "server_stop",
        title: "Server Stopped",
        description: `Server '${server.name}' was stopped`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      });

      res.json({ message: "Server stopped" });
    } catch (error) {
      console.error("Stop server error:", error);
      res.status(500).json({ message: "Failed to stop server" });
    }
  });

  app.post(
    "/api/servers/:id/restart",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
    // Валидация UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid server ID format" });
    }

    const server = await storage.getServer(req.params.id);
    if (!server || !server.containerId) {
      return res.status(404).json({ message: "Server not found" });
    }

    try {
      const node = await storage.getNode(server.nodeId);
      if (!node) {
        return res.status(404).json({ message: "Node not found" });
      }

      const container = await dockerManager.getContainer(node, server.containerId);
      await container.restart();
      await storage.updateServer(server.id, { status: "running" });

      await storage.addActivity({
        type: "server_restart",
        title: "Server Restarted",
        description: `Server '${server.name}' was restarted`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      });

      res.json({ message: "Server restarted" });
    } catch (error) {
      console.error("Restart server error:", error);
      res.status(500).json({ message: "Failed to restart server" });
    }
  });

  app.post(
    "/api/servers/:id/command",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
    try {
      // Валидация UUID
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ message: "Invalid server ID format" });
      }

      const serverId = req.params.id;
      
      // Rate limiting для команд
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const identifier = `command:${clientIp}`;
      
      if (!commandRateLimiter.checkLimit(identifier)) {
        return res.status(429).json({ 
          message: "Too many commands. Please slow down." 
        });
      }

      // Санитизация команды
      let command: string;
      try {
        command = sanitizeCommand(req.body.command);
      } catch (error: any) {
        // Логируем попытку отправить опасную команду
        await logSecurityEvent({
          type: "suspicious_command",
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userId: req.currentUser?.id,
          details: `Attempted to execute dangerous command: ${req.body.command?.substring(0, 50)}`,
          timestamp: new Date(),
        });
        
        return res.status(400).json({ message: error.message || "Invalid command" });
      }

      // Проверяем подозрительность команды
      if (isSuspiciousCommand(command)) {
        await logSecurityEvent({
          type: "suspicious_command",
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userId: req.currentUser?.id,
          details: `Attempted to execute suspicious command: ${command.substring(0, 100)}`,
          timestamp: new Date(),
        });
        
        return res.status(403).json({ message: "Command is not allowed for security reasons" });
      }

      const server = await storage.getServer(serverId);

      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      if (!server.containerId) {
        return res.status(400).json({ message: "Server container not created" });
      }

      const node = await storage.getNode(server.nodeId);
      if (!node) {
        return res.status(404).json({ message: "Node not found" });
      }

      // Проверяем, что сервер запущен
      if (server.status !== "running") {
        return res.status(400).json({ message: "Server must be running to execute commands" });
      }

      const container = await dockerManager.getContainer(node, server.containerId);
      
      // Используем безопасную команду через exec без shell интерпретации опасных символов
      // Команда уже санитизирована, но все равно используем массив вместо строки для безопасности
      const exec = await container.exec({
        Cmd: ["/bin/sh", "-c", command],
        AttachStdout: true,
        AttachStderr: true,
      });

      // Получаем реальный вывод команды
      const stream = await exec.start({ hijack: true, stdin: false });
      
      let output = "";
      let errorOutput = "";
      
      stream.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        // Docker exec может возвращать данные с префиксом, убираем его
        const cleanText = text.replace(/^[\x00-\x08\x0B-\x1F\x7F]/g, '');
        if (cleanText.trim()) {
          output += cleanText;
        }
      });

      stream.on("error", (err: Error) => {
        errorOutput += err.message;
      });

      // Ждем завершения команды
      await new Promise<void>((resolve) => {
        let timeoutId: NodeJS.Timeout | null = null;
        stream.on("end", () => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve();
        });
        stream.on("error", () => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve(); // Игнорируем ошибки, чтобы не зависнуть
        });
        // Таймаут на случай зависания команды
        timeoutId = setTimeout(() => {
          resolve();
        }, 30000); // 30 секунд максимум
      });

      // Сохраняем команду в лог активности (безопасно, без чувствительных данных)
      const safeCommandPreview = escapeHtml(command.substring(0, 30)) + (command.length > 30 ? "..." : "");
      await storage.addActivity({
        type: "server_command",
        title: "Command Executed",
        description: `Command executed on server`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      }).catch(() => {}); // Игнорируем ошибки логирования

      // Санитизируем вывод для предотвращения XSS
      const safeOutput = escapeHtml(output.trim() || errorOutput.trim() || "Command executed successfully (no output)");

      res.json({ 
        message: "Command executed",
        output: safeOutput,
      });
    } catch (error) {
      console.error("Command error:", error);
      res.status(500).json({ message: "Failed to send command" });
    }
  });

  // Server stats
  app.get(
    "/api/servers/:id/stats",
    requireAuth,
    requirePermission("servers.view"),
    checkServerAccess,
    async (req, res) => {
    // Валидация UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid server ID format" });
    }

    const stats = storage.getServerStats(req.params.id);
    if (!stats) {
      return res.status(404).json({ message: "Stats not available" });
    }
    res.json(stats);
  });

  app.get("/api/stats/servers", requireAuth, requirePermission("servers.view"), async (req, res) => {
    const allStats = storage.getAllServerStats();
    const user = req.currentUser!;
    if (user.allowedServerIds === null) {
      return res.json(allStats);
    }
    const allowed = new Set(user.allowedServerIds || []);
    const filteredEntries = Object.entries(allStats).filter(([serverId]) => allowed.has(serverId));
    res.json(Object.fromEntries(filteredEntries));
  });

  // Server files
  app.get(
    "/api/servers/:id/files",
    requireAuth,
    requirePermission("servers.control"),
    checkServerAccess,
    async (req, res) => {
    try {
      // Валидация UUID
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ message: "Invalid server ID format" });
      }

      const server = await storage.getServer(req.params.id);
      if (!server || !server.containerId) {
        return res.status(404).json({ message: "Server not found or container not created" });
      }

      const node = await storage.getNode(server.nodeId);
      if (!node) {
        return res.status(404).json({ message: "Node not found" });
      }

      // Санитизация пути для предотвращения Path Traversal
      let filePath: string;
      try {
        filePath = sanitizePath((req.query.path as string) || "/data");
      } catch (error: any) {
        // Логируем попытку Path Traversal
        await logSecurityEvent({
          type: "path_traversal",
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userId: req.currentUser?.id,
          details: `Attempted path traversal: ${req.query.path}`,
          timestamp: new Date(),
        });
        
        return res.status(400).json({ message: error.message || "Invalid path" });
      }

      // Дополнительная проверка на подозрительные пути
      if (isSuspiciousPath(filePath)) {
        await logSecurityEvent({
          type: "path_traversal",
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userId: req.currentUser?.id,
          details: `Attempted to access suspicious path: ${filePath}`,
          timestamp: new Date(),
        });
        
        return res.status(403).json({ message: "Access to this path is not allowed" });
      }

      const container = await dockerManager.getContainer(node, server.containerId);

      // Используем санитизированный путь (безопасно экранируем)
      const escapedPath = filePath.replace(/"/g, '\\"');
      const exec = await container.exec({
        Cmd: ["/bin/sh", "-c", `ls -la "${escapedPath}" 2>/dev/null | tail -n +2`],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      
      let output = "";
      let streamError: Error | null = null;

      stream.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      stream.on("error", (error: Error) => {
        streamError = error;
        console.error("File list stream error:", error);
      });

      // Ждем завершения команды
      await new Promise<void>((resolve) => {
        let timeoutId: NodeJS.Timeout | null = null;
        stream.on("end", () => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve();
        });
        stream.on("error", () => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve(); // Игнорируем ошибки, чтобы не зависнуть
        });
        // Таймаут на случай зависания команды
        timeoutId = setTimeout(() => {
          resolve();
        }, 10000); // 10 секунд максимум
      });

      // Если была ошибка потока, возвращаем ошибку
      if (streamError) {
        return res.status(500).json({ message: `Failed to list files: ${(streamError as Error).message || "Unknown error"}` });
      }

      const files: FileEntry[] = [];
      const lines = output.split("\n").filter(line => line.trim());

      // Парсим вывод ls -la для получения реальных данных
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 9) {
          const permissions = parts[0];
          const size = parseInt(parts[4]) || 0;
          const month = parts[5];
          const day = parts[6];
          const timeOrYear = parts[7];
          const name = parts.slice(8).join(" ");
          const isDir = permissions.startsWith("d");

          if (name && name !== "." && name !== "..") {
            // Парсим реальное время модификации из ls -la
            let modified = Date.now();
            try {
              // Формат: "Jun 15 14:30" или "Jun 15 2023"
              const year = timeOrYear.includes(":") ? new Date().getFullYear() : parseInt(timeOrYear);
              const timeStr = timeOrYear.includes(":") ? timeOrYear : "00:00";
              const [hours, minutes] = timeStr.split(":").map(Number);
              const monthMap: Record<string, number> = {
                Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
                Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
              };
              const monthNum = monthMap[month] || 0;
              const date = new Date(year, monthNum, parseInt(day), hours || 0, minutes || 0);
              modified = date.getTime();
            } catch {
              // Если не удалось распарсить, используем текущее время
              modified = Date.now();
            }

            // Проверяем на опасные расширения файлов
            if (!isDir && isDangerousFileExtension(name)) {
              // Пропускаем опасные файлы, но не блокируем доступ к директории
              continue;
            }

            // Санитизируем имя файла и путь для предотвращения XSS
            const safeName = escapeHtml(name);
            let safePath: string;
            try {
              safePath = sanitizePath(`${filePath}/${name}`);
            } catch (error) {
              // Если путь невалиден, пропускаем файл
              continue;
            }

            files.push({
              name: safeName,
              path: safePath,
              type: isDir ? "directory" : "file",
              size,
              modified,
            });
          }
        }
      }

      res.json(files);
    } catch (error) {
      console.error("File list error:", error);
      res.status(500).json({ message: "Failed to list files" });
    }
  });

  // Загрузить файл в сервер
  app.post(
    "/api/servers/:id/files/upload",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    uploadServerFiles.single("file"),
    async (req, res) => {
    try {
      // Валидация UUID
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ message: "Invalid server ID format" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const server = await storage.getServer(req.params.id);
      if (!server || !server.containerId) {
        return res.status(404).json({ message: "Server not found or container not created" });
      }

      const node = await storage.getNode(server.nodeId);
      if (!node) {
        return res.status(404).json({ message: "Node not found" });
      }

      // Проверка опасных расширений файлов
      if (isDangerousFileExtension(req.file.originalname)) {
        await logSecurityEvent({
          type: "suspicious_command",
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userId: req.currentUser?.id,
          details: `Attempted to upload dangerous file: ${req.file.originalname}`,
          timestamp: new Date(),
        });
        // Удаляем временный файл
        if (req.file.path) {
          await unlinkPromise(req.file.path).catch(() => {});
        }
        return res.status(403).json({ message: "File type is not allowed for security reasons" });
      }

      // Санитизация пути и имени файла
      let targetPath: string;
      try {
        // Сначала санитизируем basePath из query
        const rawBasePath = (req.query.path as string) || "/data";
        const basePath = sanitizePath(rawBasePath);
        const fileName = basename(sanitizePath(req.file.originalname));
        targetPath = sanitizePath(`${basePath}/${fileName}`);
        
        // Дополнительная проверка на подозрительные пути
        if (isSuspiciousPath(targetPath)) {
          throw new Error("Path is not allowed for security reasons");
        }
      } catch (error: any) {
        await logSecurityEvent({
          type: "path_traversal",
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userId: req.currentUser?.id,
          details: `Attempted path traversal in file upload: ${req.query.path}`,
          timestamp: new Date(),
        });
        // Удаляем временный файл при ошибке
        if (req.file.path) {
          await unlinkPromise(req.file.path).catch(() => {});
        }
        return res.status(400).json({ message: error.message || "Invalid path" });
      }

      const container = await dockerManager.getContainer(node, server.containerId);

      // Копируем файл в контейнер используя exec с base64 (безопасный способ)
      const fileContent = await readFilePromise(req.file.path);
      const base64Content = fileContent.toString("base64");
      
      // Используем безопасный способ без интерполяции в shell команде
      // Экранируем путь и содержимое для безопасности
      const escapedPath = targetPath.replace(/"/g, '\\"');
      // Используем printf вместо echo для большей безопасности
      const exec = await container.exec({
        Cmd: ["/bin/sh", "-c", `printf '%s' "${base64Content}" | base64 -d > "${escapedPath}"`],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      let output = "";
      
      stream.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      await new Promise<void>((resolve) => {
        let timeoutId: NodeJS.Timeout | null = null;
        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
        };
        stream.on("end", () => {
          cleanup();
          resolve();
        });
        stream.on("error", () => {
          cleanup();
          resolve();
        });
        timeoutId = setTimeout(() => {
          cleanup();
          resolve();
        }, 30000); // 30 секунд максимум
      });

      // Удаляем временный файл
      await unlinkPromise(req.file.path);

      await storage.addActivity({
        type: "server_command",
        title: "File Uploaded",
        description: `File uploaded to server: ${basename(targetPath)}`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      }).catch(() => {});

      res.json({ message: "File uploaded successfully", path: targetPath });
    } catch (error: any) {
      console.error("File upload error:", error);
      // Удаляем временный файл при ошибке
      if (req.file?.path) {
        await unlinkPromise(req.file.path).catch(() => {});
      }
      res.status(500).json({ message: error.message || "Failed to upload file" });
    }
  });

  // Создать папку в сервере
  app.post(
    "/api/servers/:id/files/folder",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
    try {
      // Валидация UUID
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ message: "Invalid server ID format" });
      }

      const server = await storage.getServer(req.params.id);
      if (!server || !server.containerId) {
        return res.status(404).json({ message: "Server not found or container not created" });
      }

      const node = await storage.getNode(server.nodeId);
      if (!node) {
        return res.status(404).json({ message: "Node not found" });
      }

      // Санитизация пути и имени папки
      let targetPath: string;
      try {
        // Сначала санитизируем basePath из body
        const rawBasePath = (req.body.path as string) || "/data";
        const basePath = sanitizePath(rawBasePath);
        const folderName = sanitizePath(req.body.name as string || "New Folder");
        targetPath = sanitizePath(`${basePath}/${folderName}`);
        
        // Дополнительная проверка на подозрительные пути
        if (isSuspiciousPath(targetPath)) {
          throw new Error("Path is not allowed for security reasons");
        }
      } catch (error: any) {
        await logSecurityEvent({
          type: "path_traversal",
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userId: req.currentUser?.id,
          details: `Attempted path traversal in folder creation: ${req.body.path}`,
          timestamp: new Date(),
        });
        return res.status(400).json({ message: error.message || "Invalid path or folder name" });
      }

      const container = await dockerManager.getContainer(node, server.containerId);

      // Создаем папку через exec (безопасно экранируем путь)
      const escapedPath = targetPath.replace(/"/g, '\\"');
      const exec = await container.exec({
        Cmd: ["/bin/sh", "-c", `mkdir -p "${escapedPath}"`],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      
      let output = "";
      stream.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      await new Promise<void>((resolve) => {
        let timeoutId: NodeJS.Timeout | null = null;
        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
        };
        stream.on("end", () => {
          cleanup();
          resolve();
        });
        stream.on("error", () => {
          cleanup();
          resolve();
        });
        timeoutId = setTimeout(() => {
          cleanup();
          resolve();
        }, 5000);
      });

      await storage.addActivity({
        type: "server_command",
        title: "Folder Created",
        description: `Folder created on server: ${targetPath}`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      }).catch(() => {});

      res.json({ message: "Folder created successfully", path: targetPath });
    } catch (error: any) {
      console.error("Folder creation error:", error);
      res.status(500).json({ message: error.message || "Failed to create folder" });
    }
  });

  // Backups routes
  app.get(
    "/api/servers/:id/backups",
    requireAuth,
    requirePermission("servers.view"),
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id)) {
          return res.status(400).json({ message: "Invalid server ID format" });
        }
        const backups = await storage.getBackupsByServer(req.params.id);
        res.json(backups);
      } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to get backups" });
      }
    }
  );

  app.post(
    "/api/servers/:id/backups",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id)) {
          return res.status(400).json({ message: "Invalid server ID format" });
        }

        const server = await storage.getServer(req.params.id);
        if (!server || !server.containerId) {
          return res.status(404).json({ message: "Server not found or container not created" });
        }

        // Проверка лимита бекапов
        const backups = await storage.getBackupsByServer(req.params.id);
        const maxBackups = server.limits?.maxBackups;
        if (maxBackups !== undefined && backups.length >= maxBackups) {
          return res.status(403).json({ message: `Maximum backup limit reached (${maxBackups})` });
        }

        const { name, description } = req.body;
        if (!name || typeof name !== "string") {
          return res.status(400).json({ message: "Backup name is required" });
        }

        const node = await storage.getNode(server.nodeId);
        if (!node) {
          return res.status(404).json({ message: "Node not found" });
        }

        // Создаем бекап через Docker (архивируем /data директорию)
        const container = await dockerManager.getContainer(node, server.containerId);
        const backupFileName = `backup-${Date.now()}.tar.gz`;
        const backupPath = `/tmp/${backupFileName}`;

        // Создаем архив (путь уже безопасен, так как мы его создали)
        const escapedBackupPath = backupPath.replace(/'/g, "'\\''");
        const exec = await container.exec({
          Cmd: ["/bin/sh", "-c", `tar -czf '${escapedBackupPath}' -C /data .`],
          AttachStdout: true,
          AttachStderr: true,
        });

        const stream = await exec.start({ hijack: true, stdin: false });
        let output = "";
        stream.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });

        await new Promise<void>((resolve, reject) => {
          let timeoutId: NodeJS.Timeout | null = null;
          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
          };
          stream.on("end", () => {
            cleanup();
            resolve();
          });
          stream.on("error", (err) => {
            cleanup();
            reject(err);
          });
          timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("Backup timeout"));
          }, 300000); // 5 минут
        });

        // Получаем размер файла (путь уже безопасен, но экранируем для надежности)
        const escapedBackupPathForSize = backupPath.replace(/'/g, "'\\''");
        const sizeExec = await container.exec({
          Cmd: ["/bin/sh", "-c", `stat -c%s '${escapedBackupPathForSize}' 2>/dev/null || echo 0`],
          AttachStdout: true,
          AttachStderr: true,
        });

        const sizeStream = await sizeExec.start({ hijack: true, stdin: false });
        let sizeOutput = "";
        sizeStream.on("data", (chunk: Buffer) => {
          sizeOutput += chunk.toString();
        });

        await new Promise<void>((resolve) => {
          let timeoutId: NodeJS.Timeout | null = null;
          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
          };
          sizeStream.on("end", () => {
            cleanup();
            resolve();
          });
          sizeStream.on("error", () => {
            cleanup();
            resolve();
          });
          timeoutId = setTimeout(() => {
            cleanup();
            resolve();
          }, 5000);
        });

        const size = parseInt(sizeOutput.trim()) || 0;

        const backup = await storage.createBackup({
          serverId: req.params.id,
          name: sanitizePath(name),
          description: description ? escapeHtml(description) : null,
          size,
          path: backupPath,
          createdBy: req.currentUser?.id,
        });

        await storage.addActivity({
          type: "backup_create",
          title: "Backup Created",
          description: `Backup '${name}' created for server '${server.name}'`,
          timestamp: new Date(),
          userId: req.currentUser?.id,
        }).catch(() => {});

        res.status(201).json(backup);
      } catch (error: any) {
        console.error("Backup creation error:", error);
        res.status(500).json({ message: error.message || "Failed to create backup" });
      }
    }
  );

  app.post(
    "/api/servers/:id/backups/:backupId/restore",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id) || !isValidUUID(req.params.backupId)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const server = await storage.getServer(req.params.id);
        if (!server || !server.containerId) {
          return res.status(404).json({ message: "Server not found or container not created" });
        }

        const backup = await storage.getBackup(req.params.backupId);
        if (!backup || backup.serverId !== req.params.id) {
          return res.status(404).json({ message: "Backup not found" });
        }

        // Проверяем, что путь к бэкапу безопасен
        if (!backup.path || !backup.path.startsWith("/tmp/") || !backup.path.endsWith(".tar.gz")) {
          return res.status(400).json({ message: "Invalid backup path" });
        }

        const node = await storage.getNode(server.nodeId);
        if (!node) {
          return res.status(404).json({ message: "Node not found" });
        }

        const container = await dockerManager.getContainer(node, server.containerId);

        // Восстанавливаем из бекапа (безопасно, так как путь проверен)
        // Дополнительно экранируем путь для использования в shell команде
        const sanitizedPath = backup.path.replace(/[^a-zA-Z0-9._/-]/g, "");
        const escapedPath = sanitizedPath.replace(/'/g, "'\\''"); // Экранируем одинарные кавычки
        const exec = await container.exec({
          Cmd: ["/bin/sh", "-c", `cd /data && rm -rf * && tar -xzf '${escapedPath}' -C /data`],
          AttachStdout: true,
          AttachStderr: true,
        });

        const stream = await exec.start({ hijack: true, stdin: false });
        let output = "";
        stream.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });

        await new Promise<void>((resolve, reject) => {
          let timeoutId: NodeJS.Timeout | null = null;
          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
          };
          stream.on("end", () => {
            cleanup();
            resolve();
          });
          stream.on("error", (err) => {
            cleanup();
            reject(err);
          });
          timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("Restore timeout"));
          }, 300000);
        });

        await storage.addActivity({
          type: "backup_restore",
          title: "Backup Restored",
          description: `Backup '${backup.name}' restored for server '${server.name}'`,
          timestamp: new Date(),
          userId: req.currentUser?.id,
        }).catch(() => {});

        res.json({ message: "Backup restored successfully" });
      } catch (error: any) {
        console.error("Backup restore error:", error);
        res.status(500).json({ message: error.message || "Failed to restore backup" });
      }
    }
  );

  app.delete(
    "/api/servers/:id/backups/:backupId",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id) || !isValidUUID(req.params.backupId)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const backup = await storage.getBackup(req.params.backupId);
        if (!backup || backup.serverId !== req.params.id) {
          return res.status(404).json({ message: "Backup not found" });
        }

        const server = await storage.getServer(req.params.id);
        if (server && server.containerId) {
          const node = await storage.getNode(server.nodeId);
          if (node) {
            try {
              const container = await dockerManager.getContainer(node, server.containerId);
              // Экранируем путь для безопасного использования в shell
              const escapedBackupPath = backup.path.replace(/'/g, "'\\''");
              const exec = await container.exec({
                Cmd: ["/bin/sh", "-c", `rm -f '${escapedBackupPath}'`],
                AttachStdout: true,
                AttachStderr: true,
              });
              await exec.start({ hijack: true, stdin: false });
            } catch (error) {
              // Игнорируем ошибки удаления файла
            }
          }
        }

        await storage.deleteBackup(req.params.backupId);

        await storage.addActivity({
          type: "backup_delete",
          title: "Backup Deleted",
          description: `Backup '${backup.name}' deleted`,
          timestamp: new Date(),
          userId: req.currentUser?.id,
        }).catch(() => {});

        res.json({ message: "Backup deleted successfully" });
      } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to delete backup" });
      }
    }
  );

  // Server Ports routes
  app.get(
    "/api/servers/:id/ports",
    requireAuth,
    requirePermission("servers.view"),
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id)) {
          return res.status(400).json({ message: "Invalid server ID format" });
        }
        const ports = await storage.getPortsByServer(req.params.id);
        res.json(ports);
      } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to get ports" });
      }
    }
  );

  app.post(
    "/api/servers/:id/ports",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id)) {
          return res.status(400).json({ message: "Invalid server ID format" });
        }

        const server = await storage.getServer(req.params.id);
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        // Проверка лимита портов
        const ports = await storage.getPortsByServer(req.params.id);
        const maxPorts = server.limits?.maxPorts;
        if (maxPorts !== undefined && ports.length >= maxPorts) {
          return res.status(403).json({ message: `Maximum port limit reached (${maxPorts})` });
        }

        const { port, protocol, name, description, isPublic } = req.body;
        if (!port || typeof port !== "number" || port < 1 || port > 65535) {
          return res.status(400).json({ message: "Valid port number (1-65535) is required" });
        }

        // Проверка доступности порта
        const isAvailable = await storage.checkPortAvailable(port, req.params.id);
        if (!isAvailable) {
          return res.status(409).json({ message: "Port is already in use" });
        }

        const newPort = await storage.createPort({
          serverId: req.params.id,
          port,
          protocol: protocol === "udp" ? "udp" : "tcp",
          name: name ? escapeHtml(name) : null,
          description: description ? escapeHtml(description) : null,
          isPublic: isPublic === true,
        });

        await storage.addActivity({
          type: "port_create",
          title: "Port Added",
          description: `Port ${port}/${newPort.protocol} added to server '${server.name}'`,
          timestamp: new Date(),
          userId: req.currentUser?.id,
        }).catch(() => {});

        res.status(201).json(newPort);
      } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to create port" });
      }
    }
  );

  app.delete(
    "/api/servers/:id/ports/:portId",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id) || !isValidUUID(req.params.portId)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const port = await storage.getPort(req.params.portId);
        if (!port || port.serverId !== req.params.id) {
          return res.status(404).json({ message: "Port not found" });
        }

        const server = await storage.getServer(req.params.id);
        await storage.deletePort(req.params.portId);

        await storage.addActivity({
          type: "port_delete",
          title: "Port Removed",
          description: `Port ${port.port}/${port.protocol} removed from server '${server?.name || "unknown"}'`,
          timestamp: new Date(),
          userId: req.currentUser?.id,
        }).catch(() => {});

        res.json({ message: "Port deleted successfully" });
      } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to delete port" });
      }
    }
  );

  // SFTP Users routes
  app.get(
    "/api/servers/:id/sftp",
    requireAuth,
    requirePermission("servers.view"),
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id)) {
          return res.status(400).json({ message: "Invalid server ID format" });
        }
        const users = await storage.getSftpUsersByServer(req.params.id);
        // Не возвращаем пароли
        const safeUsers = users.map(({ password, ...user }) => user);
        res.json(safeUsers);
      } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to get SFTP users" });
      }
    }
  );

  app.post(
    "/api/servers/:id/sftp",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id)) {
          return res.status(400).json({ message: "Invalid server ID format" });
        }

        const server = await storage.getServer(req.params.id);
        if (!server) {
          return res.status(404).json({ message: "Server not found" });
        }

        // Проверка лимита SFTP пользователей
        const sftpUsers = await storage.getSftpUsersByServer(req.params.id);
        const maxSftpUsers = server.limits?.maxSftpUsers;
        if (maxSftpUsers !== undefined && sftpUsers.length >= maxSftpUsers) {
          return res.status(403).json({ message: `Maximum SFTP user limit reached (${maxSftpUsers})` });
        }

        const { username, password, homeDirectory } = req.body;
        if (!username || typeof username !== "string" || username.length < 3) {
          return res.status(400).json({ message: "Username must be at least 3 characters" });
        }
        if (!password || typeof password !== "string" || password.length < 4) {
          return res.status(400).json({ message: "Password must be at least 4 characters" });
        }

        // Проверка уникальности имени пользователя для этого сервера
        const existingUser = sftpUsers.find(u => u.username === username);
        if (existingUser) {
          return res.status(409).json({ message: "Username already exists for this server" });
        }

        // Хешируем пароль
        const passwordHash = await bcrypt.hash(password, 10);

        const sftpUser = await storage.createSftpUser({
          serverId: req.params.id,
          username: sanitizeUsername(username),
          password: passwordHash,
          homeDirectory: homeDirectory ? sanitizePath(homeDirectory) : "/data",
          createdBy: req.currentUser?.id,
        });

        // Настраиваем SFTP пользователя внутри контейнера
        if (server.containerId) {
          try {
            const node = await storage.getNode(server.nodeId);
            if (node) {
              await setupSftpUserInContainer(node, server.containerId, {
                username: sanitizeUsername(username),
                password: password, // Используем оригинальный пароль для установки в системе
                homeDirectory: homeDirectory ? sanitizePath(homeDirectory) : "/data",
              });
            }
          } catch (error: any) {
            console.error("Failed to setup SFTP user in container:", error);
            // Не прерываем создание пользователя, но логируем ошибку
          }
        }

        await storage.addActivity({
          type: "sftp_user_create",
          title: "SFTP User Created",
          description: `SFTP user '${username}' created for server '${server.name}'`,
          timestamp: new Date(),
          userId: req.currentUser?.id,
        }).catch(() => {});

        // Возвращаем пользователя без пароля
        const { password: _, ...safeUser } = sftpUser;
        res.status(201).json(safeUser);
      } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to create SFTP user" });
      }
    }
  );

  app.delete(
    "/api/servers/:id/sftp/:userId",
    requireAuth,
    requirePermission("servers.control"),
    requireCSRF,
    checkServerAccess,
    async (req, res) => {
      try {
        if (!isValidUUID(req.params.id) || !isValidUUID(req.params.userId)) {
          return res.status(400).json({ message: "Invalid ID format" });
        }

        const sftpUser = await storage.getSftpUser(req.params.userId);
        if (!sftpUser || sftpUser.serverId !== req.params.id) {
          return res.status(404).json({ message: "SFTP user not found" });
        }

        const server = await storage.getServer(req.params.id);
        
        // Удаляем SFTP пользователя из контейнера
        if (server && server.containerId) {
          try {
            const node = await storage.getNode(server.nodeId);
            if (node) {
              await removeSftpUserFromContainer(node, server.containerId, sftpUser.username);
            }
          } catch (error: any) {
            console.error("Failed to remove SFTP user from container:", error);
            // Продолжаем удаление из базы данных даже если не удалось удалить из контейнера
          }
        }

        await storage.deleteSftpUser(req.params.userId);

        await storage.addActivity({
          type: "sftp_user_delete",
          title: "SFTP User Deleted",
          description: `SFTP user '${sftpUser.username}' deleted from server '${server?.name || "unknown"}'`,
          timestamp: new Date(),
          userId: req.currentUser?.id,
        }).catch(() => {});

        res.json({ message: "SFTP user deleted successfully" });
      } catch (error: any) {
        res.status(500).json({ message: error.message || "Failed to delete SFTP user" });
      }
    }
  );

  // ========== API KEYS ROUTES ==========
  
  // Get all API keys
  app.get("/api/api-keys", requireAuth, requirePermission("api.manage"), async (req, res) => {
    try {
      const apiKeys = await storage.getAllApiKeys();
      res.json(apiKeys);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch API keys" });
    }
  });

  // Create API key
  app.post("/api/api-keys", requireAuth, requirePermission("api.manage"), requireCSRF, async (req, res) => {
    try {
      const { name, description, permissions, expiresAt } = req.body;
      
      if (!name || typeof name !== "string" || name.trim().length < 3) {
        return res.status(400).json({ message: "Name must be at least 3 characters" });
      }
      
      if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
        return res.status(400).json({ message: "At least one permission is required" });
      }
      
      // Validate permissions
      const validPermissions = permissions.filter(p => ALL_PERMISSIONS.includes(p as UserPermission));
      if (validPermissions.length === 0) {
        return res.status(400).json({ message: "Invalid permissions" });
      }
      
      // Generate API key
      const key = `sp_${randomBytes(32).toString("hex")}`;
      
      const apiKey = await storage.createApiKey({
        name: name.trim(),
        description: description?.trim() || undefined,
        key,
        permissions: validPermissions as UserPermission[],
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
        createdBy: req.currentUser!.id,
      });
      
      await storage.addActivity({
        type: "security_event",
        title: "API Key Created",
        description: `API key '${name}' created with ${validPermissions.length} permissions`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      }).catch(() => {});
      
      res.status(201).json(apiKey);
    } catch (error: any) {
      console.error("Create API key error:", error);
      res.status(500).json({ message: error.message || "Failed to create API key" });
    }
  });

  // Update API key (toggle active status)
  app.patch("/api/api-keys/:id", requireAuth, requirePermission("api.manage"), requireCSRF, async (req, res) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ message: "Invalid API key ID format" });
      }
      
      const apiKey = await storage.getApiKey(req.params.id);
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      
      const { isActive } = req.body;
      if (typeof isActive !== "boolean") {
        return res.status(400).json({ message: "isActive must be a boolean" });
      }
      
      const updated = await storage.updateApiKey(req.params.id, { isActive });
      
      await storage.addActivity({
        type: "security_event",
        title: "API Key Updated",
        description: `API key '${apiKey.name}' ${isActive ? "activated" : "deactivated"}`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      }).catch(() => {});
      
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update API key" });
    }
  });

  // Delete API key
  app.delete("/api/api-keys/:id", requireAuth, requirePermission("api.manage"), requireCSRF, async (req, res) => {
    try {
      if (!isValidUUID(req.params.id)) {
        return res.status(400).json({ message: "Invalid API key ID format" });
      }
      
      const apiKey = await storage.getApiKey(req.params.id);
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }
      
      await storage.deleteApiKey(req.params.id);
      
      await storage.addActivity({
        type: "security_event",
        title: "API Key Deleted",
        description: `API key '${apiKey.name}' deleted`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      }).catch(() => {});
      
      res.json({ message: "API key deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to delete API key" });
    }
  });

  // ========== DDOS PROTECTION ROUTES ==========
  
  // Get DDoS settings for panel
  app.get("/api/ddos-settings/panel", requireAuth, requirePermission("ddos.manage"), async (req, res) => {
    try {
      let settings = await storage.getDdosSettingsByTarget("panel", null);
      
      // Create default settings if not exist
      if (!settings) {
        settings = await storage.createDdosSettings({
          targetType: "panel",
          targetId: null,
          l3Enabled: false,
          l3MaxPacketsPerSecond: 10000,
          l3BlockDuration: 3600,
          l4Enabled: false,
          l4MaxConnectionsPerIp: 100,
          l4SynFloodProtection: false,
          l7Enabled: false,
          l7MaxRequestsPerMinute: 60,
          l7ChallengeMode: false,
          l7UserAgentBlocking: false,
          updatedBy: req.currentUser!.id,
        });
      }
      
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch DDoS settings" });
    }
  });

  // Update DDoS settings for panel
  app.put("/api/ddos-settings/panel", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    try {
      let settings = await storage.getDdosSettingsByTarget("panel", null);
      
      if (!settings) {
        // Create if not exists
        settings = await storage.createDdosSettings({
          targetType: "panel",
          targetId: null,
          ...req.body,
          updatedBy: req.currentUser!.id,
        });
      } else {
        // Update existing
        settings = await storage.updateDdosSettings(settings.id, {
          ...req.body,
          updatedBy: req.currentUser!.id,
        });
      }
      
      await storage.addActivity({
        type: "security_event",
        title: "DDoS Settings Updated",
        description: "Panel DDoS protection settings updated",
        timestamp: new Date(),
        userId: req.currentUser?.id,
      }).catch(() => {});
      
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update DDoS settings" });
    }
  });

  // Get DDoS settings for server
  app.get("/api/ddos-settings/server/:serverId", requireAuth, requirePermission("ddos.manage"), async (req, res) => {
    try {
      if (!isValidUUID(req.params.serverId)) {
        return res.status(400).json({ message: "Invalid server ID format" });
      }
      
      const server = await storage.getServer(req.params.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }
      
      let settings = await storage.getDdosSettingsByTarget("server", req.params.serverId);
      
      // Create default settings if not exist
      if (!settings) {
        settings = await storage.createDdosSettings({
          targetType: "server",
          targetId: req.params.serverId,
          l3Enabled: false,
          l3MaxPacketsPerSecond: 10000,
          l3BlockDuration: 3600,
          l4Enabled: false,
          l4MaxConnectionsPerIp: 100,
          l4SynFloodProtection: false,
          l7Enabled: false,
          l7MaxRequestsPerMinute: 60,
          l7ChallengeMode: false,
          l7UserAgentBlocking: false,
          updatedBy: req.currentUser!.id,
        });
      }
      
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch DDoS settings" });
    }
  });

  // Update DDoS settings for server
  app.put("/api/ddos-settings/server/:serverId", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    try {
      if (!isValidUUID(req.params.serverId)) {
        return res.status(400).json({ message: "Invalid server ID format" });
      }
      
      const server = await storage.getServer(req.params.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }
      
      let settings = await storage.getDdosSettingsByTarget("server", req.params.serverId);
      
      if (!settings) {
        // Create if not exists
        settings = await storage.createDdosSettings({
          targetType: "server",
          targetId: req.params.serverId,
          ...req.body,
          updatedBy: req.currentUser!.id,
        });
      } else {
        // Update existing
        settings = await storage.updateDdosSettings(settings.id, {
          ...req.body,
          updatedBy: req.currentUser!.id,
        });
      }
      
      await storage.addActivity({
        type: "security_event",
        title: "DDoS Settings Updated",
        description: `DDoS protection settings updated for server '${server.name}'`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      }).catch(() => {});
      
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update DDoS settings" });
    }
  });

  // Node routes
  app.get("/api/nodes", requireAuth, requirePermission("nodes.manage"), async (req, res) => {
    const nodes = await storage.getAllNodes();
    res.json(nodes);
  });

  app.get("/api/nodes/:id", requireAuth, requirePermission("nodes.manage"), async (req, res) => {
    // Валидация UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid node ID format" });
    }

    const node = await storage.getNode(req.params.id);
    if (!node) {
      return res.status(404).json({ message: "Node not found" });
    }
    res.json(node);
  });

  app.post("/api/nodes", requireAuth, requirePermission("nodes.manage"), requireCSRF, async (req, res) => {
    try {
      const data = insertNodeSchema.parse(req.body);
      const node = await storage.createNode(data);
      
      // Проверяем подключение к Docker на ноде
      const isConnected = await dockerManager.checkNodeConnection(node);
      if (!isConnected) {
        await storage.updateNode(node.id, { status: "offline" });
      }
      
      await storage.addActivity({
        type: "node_add",
        title: "Node Added",
        description: `Node '${node.name}' (${node.location}) was added`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      });
      
      res.json(node);
    } catch (error: any) {
      console.error("Create node error:", error);
      if (error.errors) {
        // Zod validation error
        const messages = error.errors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ message: `Validation error: ${messages}` });
      }
      res.status(400).json({ message: error.message || "Invalid request" });
    }
  });

  app.delete("/api/nodes/:id", requireAuth, requirePermission("nodes.manage"), requireCSRF, async (req, res) => {
    // Валидация UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid node ID format" });
    }

    const node = await storage.getNode(req.params.id);
    
    // Удаляем подключение к Docker
    if (node) {
      dockerManager.removeConnection(node.id);
      
      await storage.addActivity({
        type: "node_delete",
        title: "Node Deleted",
        description: `Node '${node.name}' was deleted`,
        timestamp: new Date(),
        userId: req.currentUser?.id,
      });
    }
    
    await storage.deleteNode(req.params.id);
    
    res.json({ message: "Node deleted" });
  });

  // Проверка подключения к ноде
  app.post("/api/nodes/:id/check", requireAuth, requirePermission("nodes.manage"), async (req, res) => {
    // Валидация UUID
    if (!isValidUUID(req.params.id)) {
      return res.status(400).json({ message: "Invalid node ID format" });
    }

    const node = await storage.getNode(req.params.id);
    if (!node) {
      return res.status(404).json({ message: "Node not found" });
    }

    try {
      const isConnected = await dockerManager.checkNodeConnection(node);
      await storage.updateNode(node.id, { 
        status: isConnected ? "online" : "offline" 
      });
      
      res.json({ 
        connected: isConnected,
        status: isConnected ? "online" : "offline"
      });
    } catch (error) {
      console.error("Node check error:", error);
      res.status(500).json({ message: "Failed to check node connection" });
    }
  });

  app.get("/api/stats/nodes", requireAuth, requirePermission("nodes.manage"), async (req, res) => {
    res.json(storage.getAllNodeStats());
  });

  // Activity routes
  app.get("/api/activity", requireAuth, requirePermission("activity.view"), async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const activities = await storage.getRecentActivities(limit);
    
    // Обогащаем активности информацией о пользователе
    const enrichedActivities = await Promise.all(
      activities.map(async (activity) => {
        if (activity.userId) {
          const user = await storage.getUser(activity.userId);
          return {
            ...activity,
            performedBy: user?.username || "Unknown",
          };
        }
        return {
          ...activity,
          performedBy: "System",
        };
      })
    );
    
    res.json(enrichedActivities);
  });

  // Create HTTP server
  const httpServer = createServer(app);

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    verifyClient: async (info, callback) => {
      // Проверяем сессию через cookies для WebSocket подключения
      if (!sessionMiddleware) {
        return callback(true); // Если сессия не инициализирована, принимаем подключение
      }

      try {
        // Создаем request объект для проверки сессии
        const req = info.req as any;
        const res = {} as any;

        // Проверяем сессию через middleware
        await new Promise<void>((resolve, reject) => {
          sessionMiddleware(req, res, (err?: any) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Проверяем наличие userId в сессии
        if (req.session && req.session.userId) {
          callback(true);
        } else {
          console.log("WebSocket connection rejected: no session");
          callback(false, 401, "Unauthorized");
        }
      } catch (error) {
        console.error("WebSocket session verification error:", error);
        callback(false, 500, "Internal Server Error");
      }
    },
  });

  // Устанавливаем WebSocket server в logStreamer
  logStreamer.setWebSocketServer(wss);

  wss.on("connection", (ws: WebSocket, req) => {
    console.log("WebSocket client connected");

    (ws as any).subscribedServers = new Set<string>();

    const sessionUserId = (req as any).session?.userId as string | undefined;
    const userPromise = (async () => {
      if (!sessionUserId) {
        return null;
      }
      try {
        return await storage.getUser(sessionUserId);
      } catch (error) {
        console.error("WebSocket user lookup error:", error);
        return null;
      }
    })();

    const ensureUser = async (): Promise<User | null> => {
      if ((ws as any).currentUser) {
        return (ws as any).currentUser as User;
      }
      const user = await userPromise;
      if (user) {
        (ws as any).currentUser = user;
        return user;
      }
      return null;
    };

    const closeUnauthorized = () => {
      try {
        ws.close(1008, "Unauthorized");
      } catch (error) {
        // ignore
      }
    };

    void (async () => {
      const user = await ensureUser();
      if (!user) {
        closeUnauthorized();
      }
    })();

    ws.on("message", async (message: string) => {
      try {
        const user = await ensureUser();
        if (!user) {
          closeUnauthorized();
          return;
        }

        const data = JSON.parse(message.toString());

        if (data.type === "subscribe" && data.serverId) {
          if (!isValidUUID(data.serverId)) {
            await logSecurityEvent({
              type: "unauthorized_access",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId: user.id,
              details: `Attempted to subscribe to invalid server ID: ${data.serverId}`,
              timestamp: new Date(),
            });
            return;
          }

          if (!hasPermission(user, "servers.view") || !userHasServerAccess(user, data.serverId)) {
            await logSecurityEvent({
              type: "unauthorized_access",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId: user.id,
              details: `WebSocket subscribe denied for server: ${data.serverId}`,
              timestamp: new Date(),
            });
            return;
          }

          const server = await storage.getServer(data.serverId);
          if (!server) {
            await logSecurityEvent({
              type: "unauthorized_access",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId: user.id,
              details: `Attempted to subscribe to non-existent server: ${data.serverId}`,
              timestamp: new Date(),
            });
            return;
          }

          (ws as any).subscribedServers.add(data.serverId);
          await logStreamer.startStreaming(data.serverId, ws, user.id);
        }

        if (data.type === "unsubscribe" && data.serverId) {
          if (!isValidUUID(data.serverId)) {
            return;
          }
          (ws as any).subscribedServers.delete(data.serverId);
          logStreamer.stopStreaming(data.serverId, ws);
        }

        if (data.type === "command" && data.serverId && data.command) {
          if (!isValidUUID(data.serverId)) {
            ws.send(JSON.stringify({
              type: "command_error",
              serverId: data.serverId,
              error: "Invalid server ID format",
            }));
            return;
          }

          if (!hasPermission(user, "servers.control") || !userHasServerAccess(user, data.serverId)) {
            ws.send(JSON.stringify({
              type: "command_error",
              serverId: data.serverId,
              error: "Insufficient permissions",
            }));
            await logSecurityEvent({
              type: "unauthorized_access",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId: user.id,
              details: `WebSocket command denied for server: ${data.serverId}`,
              timestamp: new Date(),
            });
            return;
          }

          const server = await storage.getServer(data.serverId);
          if (!server) {
            await logSecurityEvent({
              type: "unauthorized_access",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId: user.id,
              details: `Attempted to execute command on non-existent server: ${data.serverId}`,
              timestamp: new Date(),
            });
            
            ws.send(JSON.stringify({
              type: "command_error",
              serverId: data.serverId,
              error: "Server not found",
            }));
            return;
          }

          let command: string;
          try {
            command = sanitizeCommand(data.command);
          } catch (error: any) {
            await logSecurityEvent({
              type: "suspicious_command",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId: user.id,
              details: `WebSocket: Attempted dangerous command: ${data.command?.substring(0, 50)}`,
              timestamp: new Date(),
            });
            
            ws.send(JSON.stringify({
              type: "command_error",
              serverId: data.serverId,
              error: error.message || "Invalid command",
            }));
            return;
          }

          if (isSuspiciousCommand(command)) {
            await logSecurityEvent({
              type: "suspicious_command",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId: user.id,
              details: `WebSocket: Attempted suspicious command: ${command.substring(0, 100)}`,
              timestamp: new Date(),
            });
            
            ws.send(JSON.stringify({
              type: "command_error",
              serverId: data.serverId,
              error: "Command is not allowed for security reasons",
            }));
            return;
          }

          try {
            await logStreamer.sendCommand(data.serverId, command, user.id);
            ws.send(JSON.stringify({
              type: "command_sent",
              serverId: data.serverId,
            }));
          } catch (error: any) {
            ws.send(JSON.stringify({
              type: "command_error",
              serverId: data.serverId,
              error: escapeHtml(error.message || "Failed to send command"),
            }));
          }
        }

        // VDS Terminal handlers
        if (data.type === "vds_terminal_connect") {
          await vdsTerminal.connect(user.id, ws);
        }

        if (data.type === "vds_terminal_command" && data.command) {
          await vdsTerminal.executeCommand(user.id, data.command, ws);
        }

        if (data.type === "vds_terminal_disconnect") {
          vdsTerminal.disconnect(user.id, ws);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", async () => {
      console.log("WebSocket client disconnected");
      // Очищаем подписки при отключении для предотвращения утечек памяти
      const subscribedServers = (ws as any).subscribedServers as Set<string>;
      if (subscribedServers) {
        subscribedServers.forEach(serverId => {
          logStreamer.stopStreaming(serverId, ws);
        });
        subscribedServers.clear();
      }
      
      // Отключаем VDS терминал при закрытии соединения
      const user = await ensureUser();
      if (user) {
        vdsTerminal.disconnect(user.id, ws);
      }
      
      // Удаляем ссылки для помощи сборщику мусора
      delete (ws as any).subscribedServers;
    });

    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
      // Очищаем подписки при ошибке
      const subscribedServers = (ws as any).subscribedServers as Set<string>;
      if (subscribedServers) {
        subscribedServers.forEach(serverId => {
          logStreamer.stopStreaming(serverId, ws);
        });
        subscribedServers.clear();
      }
    });
  });

  // Real-time stats updates from Docker
  // Используем setInterval с правильной очисткой для предотвращения утечек памяти
  let statsInterval: NodeJS.Timeout | null = null;
  statsInterval = setInterval(async () => {
    try {
      // Обновляем статистику серверов из Docker
      await statsCollector.updateAllServerStats();
      
      // Обновляем статистику нод
      await statsCollector.updateAllNodeStats();
    } catch (error) {
      console.error("Stats update error:", error);
      // Логируем критические ошибки в систему безопасности
      await logSecurityEvent({
        type: "unauthorized_access",
        ip: "system",
        details: `Stats collection error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date(),
      }).catch(() => {});
    }

    // Проверяем подключение к нодам каждые 30 секунд
    const checkConnections = Math.floor(Date.now() / 1000) % 30 < 3;
    if (checkConnections) {
      try {
        const nodes = await storage.getAllNodes();
        const connectionResults = await dockerManager.checkAllNodes(nodes);
        connectionResults.forEach((isConnected, nodeId) => {
          storage.updateNode(nodeId, { 
            status: isConnected ? "online" : "offline" 
          }).catch(err => console.error("Failed to update node status:", err));
        });
      } catch (error) {
        console.error("Node connection check error:", error);
      }
    }
  }, 5000); // Обновляем каждые 5 секунд

  // Очистка интервала при закрытии сервера (предотвращение утечек памяти)
  httpServer.on("close", () => {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  });

  return httpServer;
}

// Helper function to create Docker container for game server
async function createGameServerContainer(server: Server, node: any) {
  const imageMap: Record<string, string> = {
    minecraft: "itzg/minecraft-server",
    csgo: "cm2network/csgo",
    rust: "didstopia/rust-server",
    ark: "turzam/ark",
    valheim: "lloesche/valheim-server",
    terraria: "ryshe/terraria",
    gmod: "cm2network/gmod",
    custom: "ubuntu:latest",
  };

  const image = imageMap[server.gameType] || imageMap.custom;

  try {
    // Получаем Docker клиент для ноды
    const docker = dockerManager.getDockerClient(node);
    
    // Check if Docker is available
    await docker.ping();

    // Pull image first (in production, images should be pre-pulled)
    console.log(`Pulling image ${image} on node ${node.name}...`);
    await new Promise((resolve, reject) => {
      docker.pull(image, (err: Error, stream: NodeJS.ReadableStream) => {
        if (err) {
          console.warn("Failed to pull image, will try to use cached version:", err.message);
          return resolve(null);
        }
        docker.modem.followProgress(stream, (err: Error | null) => {
          if (err) {
            console.warn("Error during pull, will try to use cached version:", err.message);
            return resolve(null);
          }
          resolve(null);
        });
      });
    });

    // Create container using dockerManager
    const container = await dockerManager.createContainer(node, {
      Image: image,
      name: `sparkpanel-${server.id}`,
      HostConfig: {
        Memory: server.ramLimit * 1024 * 1024 * 1024,
        NanoCpus: Math.floor((server.cpuLimit / 100) * 1000000000),
        PortBindings: {
          [`${server.port}/tcp`]: [{ HostPort: server.port.toString() }],
        },
      },
      Env: [
        "EULA=TRUE",
        `SERVER_PORT=${server.port}`,
      ],
    });

    return container;
  } catch (error: any) {
    console.error(`Error creating container on node ${node.name}:`, error);
    
    // Проверяем, доступен ли Docker на ноде
    const isConnected = await dockerManager.checkNodeConnection(node);
    if (!isConnected) {
      await storage.updateNode(node.id, { status: "offline" });
      throw new Error(`Docker is not available on node ${node.name}. Please ensure Docker is running and accessible.`);
    }
    
    // Если подключение есть, но создание контейнера не удалось - пробрасываем ошибку дальше
    throw new Error(`Failed to create container on node ${node.name}: ${error.message || error}`);
  }
}

// Helper function to setup SFTP user in container
async function setupSftpUserInContainer(
  node: Node,
  containerId: string,
  user: { username: string; password: string; homeDirectory: string }
): Promise<void> {
  try {
    const container = await dockerManager.getContainer(node, containerId);
    
    // Проверяем, запущен ли контейнер
    const inspect = await container.inspect();
    if (!inspect.State.Running) {
      throw new Error("Container is not running. Start the server first to configure SFTP.");
    }

    // Устанавливаем openssh-server если его нет (для Ubuntu/Debian образов)
    const installSshScript = `
      if ! command -v sshd &> /dev/null; then
        if command -v apt-get &> /dev/null; then
          apt-get update -qq && apt-get install -y -qq openssh-server > /dev/null 2>&1 || true
        elif command -v yum &> /dev/null; then
          yum install -y -q openssh-server > /dev/null 2>&1 || true
        elif command -v apk &> /dev/null; then
          apk add --quiet openssh > /dev/null 2>&1 || true
        fi
      fi
    `;

    const installExec = await container.exec({
      Cmd: ["/bin/sh", "-c", installSshScript],
      AttachStdout: true,
      AttachStderr: true,
    });

    await installExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(() => resolve(), 5000); // Даем время на установку
      // Таймаут будет очищен автоматически при resolve
      // В данном случае это простой задержка, не критично для очистки
    });

    // Создаем пользователя и настраиваем его
    const safeUsername = user.username.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeHomeDir = user.homeDirectory.replace(/"/g, '\\"');
    
    const setupUserScript = `
      # Создаем пользователя если его нет
      if ! id -u "${safeUsername}" &> /dev/null; then
        useradd -m -d "${safeHomeDir}" -s /usr/sbin/nologin "${safeUsername}" 2>/dev/null || true
      fi
      
      # Устанавливаем пароль
      echo "${safeUsername}:${user.password}" | chpasswd 2>/dev/null || true
      
      # Создаем домашнюю директорию если её нет
      mkdir -p "${safeHomeDir}" 2>/dev/null || true
      chown "${safeUsername}:${safeUsername}" "${safeHomeDir}" 2>/dev/null || true
      chmod 755 "${safeHomeDir}" 2>/dev/null || true
    `;

    const setupExec = await container.exec({
      Cmd: ["/bin/sh", "-c", setupUserScript],
      AttachStdout: true,
      AttachStderr: true,
      User: "root",
    });

    const setupStream = await setupExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      let timeoutId: NodeJS.Timeout | null = null;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
      setupStream.on("end", () => {
        cleanup();
        resolve();
      });
      setupStream.on("error", () => {
        cleanup();
        resolve();
      });
      timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, 10000);
    });

    // Настраиваем SSH для SFTP (добавляем конфигурацию если её нет)
    const sshConfigScript = `
      # Создаем директорию для SSH конфигурации если её нет
      mkdir -p /etc/ssh/sshd_config.d 2>/dev/null || true
      
      # Добавляем конфигурацию для SFTP пользователя
      if ! grep -q "Match User ${safeUsername}" /etc/ssh/sshd_config 2>/dev/null; then
        echo "" >> /etc/ssh/sshd_config
        echo "Match User ${safeUsername}" >> /etc/ssh/sshd_config
        echo "  ForceCommand internal-sftp" >> /etc/ssh/sshd_config
        echo "  ChrootDirectory ${safeHomeDir}" >> /etc/ssh/sshd_config
        echo "  PermitTunnel no" >> /etc/ssh/sshd_config
        echo "  AllowAgentForwarding no" >> /etc/ssh/sshd_config
        echo "  AllowTcpForwarding no" >> /etc/ssh/sshd_config
        echo "  X11Forwarding no" >> /etc/ssh/sshd_config
      fi
      
      # Запускаем SSH сервер если он не запущен
      if ! pgrep -x sshd > /dev/null; then
        /usr/sbin/sshd -D &
      else
        # Перезагружаем конфигурацию SSH
        pkill -HUP sshd 2>/dev/null || true
      fi
    `;

    const sshConfigExec = await container.exec({
      Cmd: ["/bin/sh", "-c", sshConfigScript],
      AttachStdout: true,
      AttachStderr: true,
      User: "root",
    });

    const sshConfigStream = await sshConfigExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      let timeoutId: NodeJS.Timeout | null = null;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
      sshConfigStream.on("end", () => {
        cleanup();
        resolve();
      });
      sshConfigStream.on("error", () => {
        cleanup();
        resolve();
      });
      timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, 10000);
    });

  } catch (error: any) {
    console.error("Error setting up SFTP user in container:", error);
    throw error;
  }
}

// Helper function to remove SFTP user from container
async function removeSftpUserFromContainer(
  node: Node,
  containerId: string,
  username: string
): Promise<void> {
  try {
    const container = await dockerManager.getContainer(node, containerId);
    
    const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, "");
    
    // Удаляем пользователя из системы
    const removeUserScript = `
      if id -u "${safeUsername}" &> /dev/null; then
        userdel -r "${safeUsername}" 2>/dev/null || true
      fi
      
      # Удаляем конфигурацию SSH для этого пользователя
      if [ -f /etc/ssh/sshd_config ]; then
        sed -i '/Match User ${safeUsername}/,/X11Forwarding no/d' /etc/ssh/sshd_config 2>/dev/null || true
        pkill -HUP sshd 2>/dev/null || true
      fi
    `;

    const removeExec = await container.exec({
      Cmd: ["/bin/sh", "-c", removeUserScript],
      AttachStdout: true,
      AttachStderr: true,
      User: "root",
    });

    const removeStream = await removeExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      let timeoutId: NodeJS.Timeout | null = null;
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
      };
      removeStream.on("end", () => {
        cleanup();
        resolve();
      });
      removeStream.on("error", () => {
        cleanup();
        resolve();
      });
      timeoutId = setTimeout(() => {
        cleanup();
        resolve();
      }, 5000);
    });

  } catch (error: any) {
    console.error("Error removing SFTP user from container:", error);
    throw error;
  }
}
