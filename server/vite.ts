import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type Server } from "http";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  grey: "\x1b[90m",
};

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });

export function log(message: string, source = "express") {
  const formattedTime = timeFormat.format(new Date());

  let color = COLORS.blue;
  if (/error|failed/i.test(message) || / [45]\d\d in /.test(message)) color = COLORS.yellow;
  if (message.includes("✓")) color = COLORS.green;

  console.log(`${COLORS.grey}${formattedTime}${COLORS.reset} ${color}[${source}]${COLORS.reset} ${message}`);
}

/** Dev-сервер Vite. Импортируется лениво: в продакшене vite (devDependency) не устанавливается. */
export async function setupVite(app: Express, _server: Server) {
  const { createServer: createViteServer, createLogger } = await import("vite");
  const viteLogger = createLogger();
  const clientRoot = path.resolve(__dirname, "..", "client");

  const vite = await createViteServer({
    configFile: path.resolve(__dirname, "..", "vite.config.ts"),
    root: clientRoot,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: false,
      allowedHosts: true as const,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template = await fs.promises.readFile(path.resolve(clientRoot, "index.html"), "utf-8");
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "..", "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }

  app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }));
  app.use(express.static(distPath, { index: false }));
  app.use("*", (_req, res) => {
    res.set("Cache-Control", "no-cache").sendFile(path.resolve(distPath, "index.html"));
  });
}
