import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { isValidUUID } from "./security";
import type { UserPermission, User } from "@shared/schema";
import https from "https";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const CREDS_FILE = join(process.cwd(), "ddos-credentials.json");

interface DdosCredentials {
  cloudflare?: { zoneId: string; apiToken: string; connectedAt: string };
  tcpshield?: { apiKey: string; connectedAt: string };
}

async function loadCreds(): Promise<DdosCredentials> {
  try {
    return JSON.parse(await readFile(CREDS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

async function saveCreds(creds: DdosCredentials): Promise<void> {
  await writeFile(CREDS_FILE, JSON.stringify(creds, null, 2), "utf-8");
}

function httpsGet(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers: { "Content-Type": "application/json", ...headers },
      timeout: 10000,
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.end();
  });
}

export function registerDdosRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: Function) => void,
  requirePermission: (permission: UserPermission) => (req: Request, res: Response, next: Function) => void,
  requireCSRF: (req: Request, res: Response, next: Function) => Promise<void>,
) {
  
  app.get("/api/ddos-settings/panel", requireAuth, requirePermission("servers.manage"), async (req, res) => {
    try {
      const settings = await storage.getDdosSettings("panel");
      return res.json(settings || {
        id: "panel-default",
        targetType: "panel",
        targetId: null,
        l3Enabled: false,
        l3MaxPacketsPerSecond: null,
        l3BlockDuration: null,
        l4Enabled: false,
        l4MaxConnectionsPerIp: null,
        l4SynFloodProtection: false,
        l7Enabled: false,
        l7MaxRequestsPerMinute: null,
        l7ChallengeMode: false,
        l7UserAgentBlocking: false,
        updatedAt: new Date(),
        updatedBy: null,
      });
    } catch (error: any) {
      console.error("Get DDoS settings error:", error);
      res.status(500).json({ message: "Failed to get DDoS settings" });
    }
  });

  
  app.get("/api/ddos-settings/server/:serverId", requireAuth, requirePermission("servers.manage"), async (req, res) => {
    try {
      const { serverId } = req.params;
      
      if (!isValidUUID(serverId)) {
        return res.status(400).json({ message: "Invalid server ID format" });
      }
      
      const server = await storage.getServer(serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }
      
      const settings = await storage.getDdosSettings("server", serverId);
      return res.json(settings || {
        id: `server-${serverId}-default`,
        targetType: "server",
        targetId: serverId,
        l3Enabled: false,
        l3MaxPacketsPerSecond: null,
        l3BlockDuration: null,
        l4Enabled: false,
        l4MaxConnectionsPerIp: null,
        l4SynFloodProtection: false,
        l7Enabled: false,
        l7MaxRequestsPerMinute: null,
        l7ChallengeMode: false,
        l7UserAgentBlocking: false,
        updatedAt: new Date(),
        updatedBy: null,
      });
    } catch (error: any) {
      console.error("Get server DDoS settings error:", error);
      res.status(500).json({ message: "Failed to get DDoS settings" });
    }
  });

  
  app.put("/api/ddos-settings/panel", requireAuth, requirePermission("servers.manage"), requireCSRF, async (req, res) => {
    try {
      const settings = await storage.updateDdosSettings("panel", null, {
        l3Enabled: req.body.l3Enabled,
        l3MaxPacketsPerSecond: req.body.l3MaxPacketsPerSecond,
        l3BlockDuration: req.body.l3BlockDuration,
        l4Enabled: req.body.l4Enabled,
        l4MaxConnectionsPerIp: req.body.l4MaxConnectionsPerIp,
        l4SynFloodProtection: req.body.l4SynFloodProtection,
        l7Enabled: req.body.l7Enabled,
        l7MaxRequestsPerMinute: req.body.l7MaxRequestsPerMinute,
        l7ChallengeMode: req.body.l7ChallengeMode,
        l7UserAgentBlocking: req.body.l7UserAgentBlocking,
        updatedBy: (req as any).currentUser?.id,
      });

      await storage.addActivity({
        type: "settings_update",
        title: "DDoS Settings Updated",
        description: "Panel DDoS protection settings were updated",
        timestamp: new Date(),
        userId: (req as any).currentUser?.id,
      });

      res.json(settings);
    } catch (error: any) {
      console.error("Update DDoS settings error:", error);
      res.status(500).json({ message: "Failed to update DDoS settings" });
    }
  });

  
  app.put("/api/ddos-settings/server/:serverId", requireAuth, requirePermission("servers.manage"), requireCSRF, async (req, res) => {
    try {
      const { serverId } = req.params;
      
      if (!isValidUUID(serverId)) {
        return res.status(400).json({ message: "Invalid server ID format" });
      }
      
      const server = await storage.getServer(serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      const settings = await storage.updateDdosSettings("server", serverId, {
        l3Enabled: req.body.l3Enabled,
        l3MaxPacketsPerSecond: req.body.l3MaxPacketsPerSecond,
        l3BlockDuration: req.body.l3BlockDuration,
        l4Enabled: req.body.l4Enabled,
        l4MaxConnectionsPerIp: req.body.l4MaxConnectionsPerIp,
        l4SynFloodProtection: req.body.l4SynFloodProtection,
        l7Enabled: req.body.l7Enabled,
        l7MaxRequestsPerMinute: req.body.l7MaxRequestsPerMinute,
        l7ChallengeMode: req.body.l7ChallengeMode,
        l7UserAgentBlocking: req.body.l7UserAgentBlocking,
        updatedBy: (req as any).currentUser?.id,
      });

      await storage.addActivity({
        type: "settings_update",
        title: "Server DDoS Settings Updated",
        description: `DDoS protection settings updated for server '${server.name}'`,
        timestamp: new Date(),
        userId: (req as any).currentUser?.id,
      });

      res.json(settings);
    } catch (error: any) {
      console.error("Update server DDoS settings error:", error);
      res.status(500).json({ message: "Failed to update DDoS settings" });
    }
  });


  app.get("/api/ddos/cloudflare/status", requireAuth, requirePermission("ddos.view"), async (_req, res) => {
    try {
      const creds = await loadCreds();
      if (!creds.cloudflare) return res.json({ connected: false });

      const { zoneId, apiToken, connectedAt } = creds.cloudflare;
      const r = await httpsGet(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}`,
        { Authorization: `Bearer ${apiToken}` }
      );

      if (r.status === 200 && r.body?.success) {
        const z = r.body.result;
        return res.json({
          connected: true,
          connectedAt,
          zone: { name: z.name, status: z.status, plan: z.plan?.name, id: z.id },
        });
      }

      return res.json({ connected: false, error: r.body?.errors?.[0]?.message || "Token invalid" });
    } catch (e: any) {
      res.status(500).json({ connected: false, error: e.message });
    }
  });

  app.post("/api/ddos/cloudflare/connect", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    try {
      const { zoneId, apiToken } = req.body as { zoneId: string; apiToken: string };
      if (!zoneId || !apiToken) return res.status(400).json({ message: "zoneId and apiToken are required" });

      const r = await httpsGet(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}`,
        { Authorization: `Bearer ${apiToken}` }
      );

      if (r.status !== 200 || !r.body?.success) {
        const msg = r.body?.errors?.[0]?.message || "Invalid Zone ID or API token";
        return res.status(400).json({ message: msg });
      }

      const creds = await loadCreds();
      creds.cloudflare = { zoneId, apiToken, connectedAt: new Date().toISOString() };
      await saveCreds(creds);

      const z = r.body.result;
      await storage.addActivity({
        type: "settings_update",
        title: "Cloudflare подключён",
        description: `Zone: ${z.name}`,
        timestamp: new Date(),
        userId: (req as any).currentUser?.id,
      }).catch(() => {});

      res.json({ connected: true, zone: { name: z.name, status: z.status, plan: z.plan?.name, id: z.id } });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/ddos/cloudflare/disconnect", requireAuth, requirePermission("ddos.manage"), async (req, res) => {
    try {
      const creds = await loadCreds();
      delete creds.cloudflare;
      await saveCreds(creds);
      await storage.addActivity({
        type: "settings_update",
        title: "Cloudflare отключён",
        description: "Cloudflare интеграция удалена",
        timestamp: new Date(),
        userId: (req as any).currentUser?.id,
      }).catch(() => {});
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });


  app.get("/api/ddos/tcpshield/status", requireAuth, requirePermission("ddos.view"), async (_req, res) => {
    try {
      const creds = await loadCreds();
      if (!creds.tcpshield) return res.json({ connected: false });

      const { apiKey, connectedAt } = creds.tcpshield;
      const r = await httpsGet("https://api.tcpshield.com/networks", { "X-API-Key": apiKey });

      if (r.status === 200 && Array.isArray(r.body)) {
        return res.json({ connected: true, connectedAt, networks: r.body });
      }

      return res.json({ connected: false, error: "API key invalid or TCPShield unreachable" });
    } catch (e: any) {
      res.status(500).json({ connected: false, error: e.message });
    }
  });

  app.post("/api/ddos/tcpshield/connect", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    try {
      const { apiKey } = req.body as { apiKey: string };
      if (!apiKey) return res.status(400).json({ message: "apiKey is required" });

      const r = await httpsGet("https://api.tcpshield.com/networks", { "X-API-Key": apiKey });

      if (r.status !== 200 || !Array.isArray(r.body)) {
        return res.status(400).json({ message: "Invalid API key or TCPShield unreachable" });
      }

      const creds = await loadCreds();
      creds.tcpshield = { apiKey, connectedAt: new Date().toISOString() };
      await saveCreds(creds);

      await storage.addActivity({
        type: "settings_update",
        title: "TCPShield подключён",
        description: `Сетей: ${r.body.length}`,
        timestamp: new Date(),
        userId: (req as any).currentUser?.id,
      }).catch(() => {});

      res.json({ connected: true, networks: r.body });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/ddos/tcpshield/disconnect", requireAuth, requirePermission("ddos.manage"), async (req, res) => {
    try {
      const creds = await loadCreds();
      delete creds.tcpshield;
      await saveCreds(creds);
      await storage.addActivity({
        type: "settings_update",
        title: "TCPShield отключён",
        description: "TCPShield интеграция удалена",
        timestamp: new Date(),
        userId: (req as any).currentUser?.id,
      }).catch(() => {});
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/ddos/tcpshield/ips", requireAuth, requirePermission("ddos.view"), async (_req, res) => {
    try {
      const creds = await loadCreds();
      if (!creds.tcpshield) return res.status(400).json({ message: "TCPShield not connected" });
      const r = await httpsGet("https://api.tcpshield.com/ips", { "X-API-Key": creds.tcpshield.apiKey });
      res.json(r.body);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
