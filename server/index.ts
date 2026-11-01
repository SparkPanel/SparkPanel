import "./env";
import express, { type Request, type Response, type NextFunction } from "express";
import { statfs } from "fs/promises";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pluginManager } from "./plugins/plugin-manager";
import { statsHistory } from "./stats-history";
import { storage } from "./storage";
import { dockerManager } from "./docker-manager";
import { DATA_DIR } from "./data-dir";
import { autoStartServers } from "./server-actions";
import { startAutoscaler } from "./scaling";
import { APP_VERSION } from "@shared/version";
import compression from "compression";

const app = express();

const trustProxy = process.env.TRUST_PROXY;
app.set("trust proxy", trustProxy === undefined || trustProxy === "" ? false : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "true" ? true : trustProxy);
app.disable("x-powered-by");

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token, X-API-Key");
    res.header("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});

app.use((_req, res, next) => {
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "SAMEORIGIN");
  res.header("Referrer-Policy", "same-origin");
  next();
});

/* Сжатие ответов и файлов интерфейса. Уже сжатые ответы (кеш списков, архивы бэкапов) повторно не сжимаются. */
app.use(compression({ threshold: 1024 }));

app.use(express.json({ limit: "5mb", verify: (req, _res, buf) => ((req as express.Request).rawBody = buf) }));
app.use(express.urlencoded({ extended: false }));

/**
 * Журнал запросов к API. Писать каждый успешный запрос под нагрузкой дорого (до трети процессора уходило на вывод),
 * поэтому в продакшене пишутся только ошибки сервера и медленные запросы; LOG_REQUESTS=all включает полный журнал.
 */
const logAllRequests = process.env.LOG_REQUESTS === "all" || (process.env.NODE_ENV !== "production" && process.env.LOG_REQUESTS !== "errors");
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    if (logAllRequests || res.statusCode >= 500 || ms >= 1000) log(`${req.method} ${req.path} ${res.statusCode} in ${ms}ms`);
  });
  next();
});

/** Если нод ещё нет и локальный Docker доступен — регистрируем его как ноду "Local". */
async function ensureLocalNode(): Promise<void> {
  if ((await storage.getAllNodes()).length > 0) return;
  const docker = dockerManager.getLocalDocker();
  try {
    const info = await docker.info();
    let diskTotal = 100;
    try {
      const fs = await statfs(DATA_DIR);
      diskTotal = Math.max(1, Math.round((fs.blocks * fs.bsize) / 1024 ** 3));
    } catch {
    }
    await storage.createNode({
      name: "Local",
      location: info.Name || "localhost",
      ip: "127.0.0.1",
      port: 2375,
      status: "online",
      cpuCores: info.NCPU || 1,
      ramTotal: Math.max(1, Math.round((info.MemTotal || 0) / 1024 ** 3)),
      diskTotal,
    });
    log(`✓ Local Docker node registered (Docker ${info.ServerVersion})`);
  } catch (error) {
    console.warn("Local Docker is not available — add a node manually in the Nodes section.", (error as Error).message);
  }
}

(async () => {
  console.log(`\nSparkPanel ${APP_VERSION} — Game Server Management Platform\n`);

  await storage.init();
  log(`✓ Storage ready (${process.env.DATABASE_URL ? "PostgreSQL" : `file storage in ${DATA_DIR}`})`);

  try {
    await pluginManager.initialize();
    log("✓ Plugin system initialized");
  } catch (error) {
    console.error("Failed to initialize plugin system:", error);
  }

  await ensureLocalNode();

  const server = await registerRoutes(app);

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || (err.code === "LIMIT_FILE_SIZE" ? 413 : 500);
    if (status >= 500) console.error("Unhandled error:", { message: err.message, stack: err.stack, path: req.path, method: req.method });
    if (res.headersSent) return;
    res.status(status).json({ message: process.env.NODE_ENV === "production" && status >= 500 ? "Internal Server Error" : err.message || "Error" });
  });

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () => {
    log(`✓ serving on http://${host}:${port}`);
    autoStartServers().catch((error) => console.error("Auto-start failed:", error));
    startAutoscaler();
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`${signal} received, shutting down...`);
    server.close();
    await pluginManager.shutdown().catch(() => {});
    await statsHistory.close().catch(() => {});
    await storage.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
})().catch((error) => {
  console.error("Fatal startup error:", error);
  process.exit(1);
});
