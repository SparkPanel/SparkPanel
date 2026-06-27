import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pluginManager } from "./plugins/plugin-manager";

const app = express();


app.set('trust proxy', 1);


const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : []; 

app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  
  if (!origin) {
    return next();
  }
  
  
  if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.header('Access-Control-Max-Age', '86400');
  } else if (allowedOrigins.length === 0) {
    
  }
  
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  
  const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
  };

  if (process.env.NODE_ENV === "production") {
    console.log(`\n${COLORS.blue}╔════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.blue}║     SparkPanel Initializing...        ║${COLORS.reset}`);
    console.log(`${COLORS.blue}║   Game Server Management Platform    ║${COLORS.reset}`);
    console.log(`${COLORS.blue}╚════════════════════════════════════════╝${COLORS.reset}\n`);
  }

  
  try {
    await pluginManager.initialize();
    log("✓ Plugin system initialized");
  } catch (error) {
    console.error("Failed to initialize plugin system:", error);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    
    console.error("Unhandled error:", {
      status,
      message,
      stack: err.stack,
      path: _req.path,
      method: _req.method,
    });

    
    const errorMessage = process.env.NODE_ENV === "production" && status === 500
      ? "Internal Server Error"
      : message;

    res.status(status).json({ message: errorMessage });
    
    
  });

  
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`✓ serving on port ${port}`);
    if (process.env.NODE_ENV === "production") {
      const COLORS = { green: '\x1b[32m', reset: '\x1b[0m' };
      console.log(`\n${COLORS.green}✓ SparkPanel is ready!${COLORS.reset}`);
      console.log(`  Access: http://localhost:${port}\n`);
    }
  });
})();
