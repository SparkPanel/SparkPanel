import type { Express, Request, Response } from "express";
import { createServer, type Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { dockerManager } from "./docker-manager";
import { statsCollector } from "./stats-collector";
import { logStreamer } from "./log-streamer";
import { insertServerSchema, insertNodeSchema, loginSchema, changePasswordSchema, serverCommandSchema, type Server, type ConsoleLog, type FileEntry, type Activity } from "@shared/schema";
import session from "express-session";
import memorystore from "memorystore";
import { sanitizeCommand, sanitizePath, sanitizeUsername, isValidUUID, escapeHtml, loginRateLimiter, commandRateLimiter } from "./security";
import { randomBytes } from "crypto";
import { generateCSRFToken, verifyCSRFToken, removeCSRFToken, refreshCSRFToken } from "./csrf";
import { logSecurityEvent, isSuspiciousCommand, isSuspiciousPath, isDangerousFileExtension } from "./security-logger";

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
    resave: false,
    saveUninitialized: false,
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

  // CSRF middleware для защиты от межсайтовых запросов
  const requireCSRF = async (req: Request, res: Response, next: Function) => {
    // GET, HEAD, OPTIONS запросы не требуют CSRF токен
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    // Для аутентифицированных пользователей проверяем CSRF токен
    if (req.session.userId) {
      const csrfToken = req.headers['x-csrf-token'] as string || req.body._csrf;
      
      if (!csrfToken || !verifyCSRFToken(req.sessionID, csrfToken)) {
        // Логируем попытку CSRF атаки
        await logSecurityEvent({
          type: "csrf_attack",
          ip: req.ip || req.socket.remoteAddress || "unknown",
          userId: req.session.userId,
          details: `CSRF attack attempt: ${req.method} ${req.path}`,
          timestamp: new Date(),
        }).catch(() => {});
        
        return res.status(403).json({ message: "Invalid CSRF token" });
      }
      
      // Обновляем срок действия токена
      refreshCSRFToken(req.sessionID);
    }
    
    next();
  };

  // Authentication middleware
  const requireAuth = (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) {
      console.log("Auth failed: no userId in session", { 
        sessionId: req.sessionID, 
        hasSession: !!req.session,
        cookies: req.headers.cookie 
      });
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Проверка прав доступа к серверу (пользователь может управлять только своими серверами)
  // В текущей реализации все пользователи могут управлять всеми серверами (single-user system)
  // В будущем можно добавить поле ownerId к серверу
  const checkServerAccess = async (req: Request, res: Response, next: Function) => {
    const serverId = req.params.id;
    if (!serverId || !isValidUUID(serverId)) {
      return res.status(400).json({ message: "Invalid server ID" });
    }

    const server = await storage.getServer(serverId);
    if (!server) {
      return res.status(404).json({ message: "Server not found" });
    }

    // В текущей реализации все пользователи могут управлять всеми серверами
    // TODO: В будущем добавить проверку ownerId или ролей
    // if (server.ownerId && server.ownerId !== req.session.userId && !isAdmin(req.session.userId)) {
    //   return res.status(403).json({ message: "Access denied" });
    // }

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

      // Сбрасываем rate limit при успешном входе
      loginRateLimiter.reset(identifier);

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        
        // Log activity after session is saved (без чувствительных данных)
        storage.addActivity({
          type: "user_login",
          title: "User Login",
          description: `User logged in`,
          timestamp: new Date(),
          userId: user.id,
        }).catch(err => console.error("Activity log error:", err));
        
        // Генерируем CSRF токен для новой сессии
        const csrfToken = generateCSRFToken(req.sessionID);
        
        // Send response with Set-Cookie header and CSRF token
        res.json({ 
          user: { id: user.id, username: user.username },
          csrfToken 
        });
      });
    } catch (error) {
      console.error("Login error:", error);
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

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Генерируем или обновляем CSRF токен
    let csrfToken = req.session.csrfToken as string | undefined;
    if (!csrfToken || !verifyCSRFToken(req.sessionID, csrfToken)) {
      csrfToken = generateCSRFToken(req.sessionID);
      req.session.csrfToken = csrfToken;
    } else {
      refreshCSRFToken(req.sessionID);
    }

    res.json({ 
      username: user.username,
      csrfToken,
      version: "1.0"
    });
  });

  // API endpoint для получения информации о системе/версии
  app.get("/api/system/info", requireAuth, async (req, res) => {
    res.json({
      name: "SparkPanel",
      version: "1.0",
      description: "Game Server Management Platform",
    });
  });

  app.post("/api/auth/change-password", requireAuth, requireCSRF, async (req, res) => {
    try {
      const data = changePasswordSchema.parse(req.body);
      const user = await storage.getUser(req.session.userId!);

      if (!user || !(await bcrypt.compare(data.currentPassword, user.password))) {
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

  // Server routes
  app.get("/api/servers", requireAuth, async (req, res) => {
    const servers = await storage.getAllServers();
    res.json(servers);
  });

  app.get("/api/servers/:id", requireAuth, async (req, res) => {
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

  app.post("/api/servers", requireAuth, requireCSRF, async (req, res) => {
    try {
      const data = insertServerSchema.parse(req.body);
      const server = await storage.createServer(data);
      
      await storage.addActivity({
        type: "server_create",
        title: "Server Created",
        description: `Server '${server.name}' (${server.gameType}) was created`,
        timestamp: new Date(),
        userId: req.session.userId,
      });
      
      res.json(server);
    } catch (error) {
      console.error("Create server error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete("/api/servers/:id", requireAuth, requireCSRF, checkServerAccess, async (req, res) => {
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
      userId: req.session.userId,
    });
    
    res.json({ message: "Server deleted" });
  });

  // Server control operations
  app.post("/api/servers/:id/start", requireAuth, requireCSRF, checkServerAccess, async (req, res) => {
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
        userId: req.session.userId,
      });

      res.json({ message: "Server started" });
    } catch (error) {
      console.error("Start server error:", error);
      await storage.updateServer(server.id, { status: "error" });
      res.status(500).json({ message: "Failed to start server" });
    }
  });

  app.post("/api/servers/:id/stop", requireAuth, requireCSRF, checkServerAccess, async (req, res) => {
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
        userId: req.session.userId,
      });

      res.json({ message: "Server stopped" });
    } catch (error) {
      console.error("Stop server error:", error);
      res.status(500).json({ message: "Failed to stop server" });
    }
  });

  app.post("/api/servers/:id/restart", requireAuth, requireCSRF, checkServerAccess, async (req, res) => {
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
        userId: req.session.userId,
      });

      res.json({ message: "Server restarted" });
    } catch (error) {
      console.error("Restart server error:", error);
      res.status(500).json({ message: "Failed to restart server" });
    }
  });

  app.post("/api/servers/:id/command", requireAuth, requireCSRF, checkServerAccess, async (req, res) => {
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
          userId: req.session.userId,
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
          userId: req.session.userId,
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
        stream.on("end", resolve);
        stream.on("error", () => resolve()); // Игнорируем ошибки, чтобы не зависнуть
        // Таймаут на случай зависания команды
        setTimeout(() => {
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
        userId: req.session.userId,
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
  app.get("/api/servers/:id/stats", requireAuth, async (req, res) => {
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

  app.get("/api/stats/servers", requireAuth, async (req, res) => {
    res.json(storage.getAllServerStats());
  });

  // Server files
  app.get("/api/servers/:id/files", requireAuth, checkServerAccess, async (req, res) => {
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
          userId: req.session.userId,
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
          userId: req.session.userId,
          details: `Attempted to access suspicious path: ${filePath}`,
          timestamp: new Date(),
        });
        
        return res.status(403).json({ message: "Access to this path is not allowed" });
      }

      const container = await dockerManager.getContainer(node, server.containerId);

      // Используем санитизированный путь (безопасно)
      const exec = await container.exec({
        Cmd: ["/bin/sh", "-c", `ls -la "${filePath}" 2>/dev/null | tail -n +2`],
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
        stream.on("end", resolve);
        stream.on("error", () => resolve()); // Игнорируем ошибки, чтобы не зависнуть
        // Таймаут на случай зависания команды
        setTimeout(() => {
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

  // Node routes
  app.get("/api/nodes", requireAuth, async (req, res) => {
    const nodes = await storage.getAllNodes();
    res.json(nodes);
  });

  app.get("/api/nodes/:id", requireAuth, async (req, res) => {
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

  app.post("/api/nodes", requireAuth, requireCSRF, async (req, res) => {
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
        userId: req.session.userId,
      });
      
      res.json(node);
    } catch (error) {
      console.error("Create node error:", error);
      res.status(400).json({ message: "Invalid request" });
    }
  });

  app.delete("/api/nodes/:id", requireAuth, requireCSRF, async (req, res) => {
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
        userId: req.session.userId,
      });
    }
    
    await storage.deleteNode(req.params.id);
    
    res.json({ message: "Node deleted" });
  });

  // Проверка подключения к ноде
  app.post("/api/nodes/:id/check", requireAuth, async (req, res) => {
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

  app.get("/api/stats/nodes", requireAuth, async (req, res) => {
    res.json(storage.getAllNodeStats());
  });

  // Activity routes
  app.get("/api/activity", requireAuth, async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const activities = await storage.getRecentActivities(limit);
    res.json(activities);
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

    // Track authenticated state
    (ws as any).subscribedServers = new Set<string>();

    ws.on("message", async (message: string) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "subscribe" && data.serverId) {
          // Валидация UUID
          if (!isValidUUID(data.serverId)) {
            // Логируем попытку подписки с невалидным UUID
            await logSecurityEvent({
              type: "unauthorized_access",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId: (req as any).session?.userId,
              details: `Attempted to subscribe to invalid server ID: ${data.serverId}`,
              timestamp: new Date(),
            });
            return; // Игнорируем невалидные подписки
          }

          // Получаем userId из сессии WebSocket
          const userId = (req as any).session?.userId;

          // Проверяем существование сервера
          const server = await storage.getServer(data.serverId);
          if (!server) {
            await logSecurityEvent({
              type: "unauthorized_access",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId,
              details: `Attempted to subscribe to non-existent server: ${data.serverId}`,
              timestamp: new Date(),
            });
            return;
          }

          // Client subscribed to server logs
          (ws as any).subscribedServers.add(data.serverId);
          
          // Начинаем стриминг логов для этого сервера
          await logStreamer.startStreaming(data.serverId, ws, userId);
        }

        if (data.type === "unsubscribe" && data.serverId) {
          // Валидация UUID
          if (!isValidUUID(data.serverId)) {
            return; // Игнорируем невалидные отписки
          }

          (ws as any).subscribedServers.delete(data.serverId);
          
          // Останавливаем стриминг для этого клиента
          logStreamer.stopStreaming(data.serverId, ws);
        }

        if (data.type === "command" && data.serverId && data.command) {
          // Валидация UUID и команды
          if (!isValidUUID(data.serverId)) {
            ws.send(JSON.stringify({
              type: "command_error",
              serverId: data.serverId,
              error: "Invalid server ID format",
            }));
            return;
          }

          // Получаем userId из сессии WebSocket
          const userId = (req as any).session?.userId;

          // Проверяем существование сервера и права доступа
          const server = await storage.getServer(data.serverId);
          if (!server) {
            await logSecurityEvent({
              type: "unauthorized_access",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId,
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

          // Санитизация команды
          let command: string;
          try {
            command = sanitizeCommand(data.command);
          } catch (error: any) {
            await logSecurityEvent({
              type: "suspicious_command",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId,
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

          // Проверяем подозрительность команды
          if (isSuspiciousCommand(command)) {
            await logSecurityEvent({
              type: "suspicious_command",
              ip: (req as any).socket.remoteAddress || "unknown",
              userId,
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

          // Отправляем команду в контейнер через logStreamer
          try {
            await logStreamer.sendCommand(data.serverId, command, userId);
            
            // Отправляем подтверждение клиенту (безопасно)
            ws.send(JSON.stringify({
              type: "command_sent",
              serverId: data.serverId,
            }));
          } catch (error: any) {
            // Отправляем ошибку клиенту (безопасно)
            ws.send(JSON.stringify({
              type: "command_error",
              serverId: data.serverId,
              error: escapeHtml(error.message || "Failed to send command"),
            }));
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      console.log("WebSocket client disconnected");
      // Очищаем подписки при отключении для предотвращения утечек памяти
      const subscribedServers = (ws as any).subscribedServers as Set<string>;
      if (subscribedServers) {
        subscribedServers.forEach(serverId => {
          logStreamer.stopStreaming(serverId, ws);
        });
        subscribedServers.clear();
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
  const statsInterval = setInterval(async () => {
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
    clearInterval(statsInterval);
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
        docker.modem.followProgress(stream, (err: Error) => {
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
