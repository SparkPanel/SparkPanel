import type { Express, Request, Response, NextFunction } from "express";
import https from "https";
import { storage } from "./storage";
import { isValidUUID } from "./security";
import { ddosProtection } from "./ddos-protection";
import { dataPath, readJsonSync, writeJsonAtomic } from "./data-dir";
import type { UserPermission } from "@shared/schema";

type Middleware = (req: Request, res: Response, next: NextFunction) => unknown;

const CREDS_FILE = dataPath("ddos-credentials.json");

interface DdosCredentials {
  cloudflare?: { zoneId: string; apiToken: string; connectedAt: string };
  tcpshield?: { apiKey: string; connectedAt: string };
}

const loadCreds = (): DdosCredentials => readJsonSync<DdosCredentials>(CREDS_FILE, {});
const saveCreds = (creds: DdosCredentials) => writeJsonAtomic(CREDS_FILE, creds);

function httpsGet(url: string, headers: Record<string, string>): Promise<{ status?: number; body: any }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: { "Content-Type": "application/json", ...headers },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

export function registerDdosRoutes(
  app: Express,
  requireAuth: Middleware,
  requirePermission: (permission: UserPermission) => Middleware,
  requireCSRF: Middleware,
) {
  const activity = (req: Request, title: string, description: string) =>
    storage
      .addActivity({ type: "settings_update", title, description, timestamp: new Date(), userId: req.currentUser?.id })
      .catch(() => {});

  /* Встроенная защита панели и серверов */

  app.get("/api/ddos-settings/panel", requireAuth, requirePermission("ddos.view"), async (_req, res) => {
    try {
      const settings = (await storage.getDdosSettings("panel", null)) ?? (await storage.upsertDdosSettings("panel", null, {}));
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get DDoS settings" });
    }
  });

  app.put("/api/ddos-settings/panel", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    try {
      const settings = await storage.upsertDdosSettings("panel", null, { ...req.body, updatedBy: req.currentUser?.id });
      ddosProtection.invalidateSettings();
      await activity(req, "DDoS Settings Updated", "Panel DDoS protection settings were updated");
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update DDoS settings" });
    }
  });

  app.get("/api/ddos-settings/server/:serverId", requireAuth, requirePermission("ddos.view"), async (req, res) => {
    const { serverId } = req.params;
    if (!isValidUUID(serverId)) return res.status(400).json({ message: "Invalid server ID format" });
    if (!(await storage.getServer(serverId))) return res.status(404).json({ message: "Server not found" });
    const settings = (await storage.getDdosSettings("server", serverId)) ?? (await storage.upsertDdosSettings("server", serverId, {}));
    res.json(settings);
  });

  app.put("/api/ddos-settings/server/:serverId", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    const { serverId } = req.params;
    if (!isValidUUID(serverId)) return res.status(400).json({ message: "Invalid server ID format" });
    const server = await storage.getServer(serverId);
    if (!server) return res.status(404).json({ message: "Server not found" });
    const settings = await storage.upsertDdosSettings("server", serverId, { ...req.body, updatedBy: req.currentUser?.id });
    await activity(req, "Server DDoS Settings Updated", `DDoS protection settings updated for server '${server.name}'`);
    res.json(settings);
  });

  app.get("/api/ddos/stats", requireAuth, requirePermission("ddos.view"), (_req, res) => {
    res.json(ddosProtection.getStats());
  });

  app.delete("/api/ddos/blocked/:ip", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    const removed = ddosProtection.unblock(req.params.ip);
    if (!removed) return res.status(404).json({ message: "IP is not blocked" });
    await activity(req, "IP Unblocked", `IP ${req.params.ip} was unblocked`);
    res.json({ ok: true });
  });

  /* Cloudflare */

  app.get("/api/ddos/cloudflare/status", requireAuth, requirePermission("ddos.view"), async (_req, res) => {
    try {
      const creds = loadCreds();
      if (!creds.cloudflare) return res.json({ connected: false });
      const { zoneId, apiToken, connectedAt } = creds.cloudflare;
      const r = await httpsGet(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}`, { Authorization: `Bearer ${apiToken}` });
      if (r.status === 200 && r.body?.success) {
        const z = r.body.result;
        return res.json({ connected: true, connectedAt, zone: { name: z.name, status: z.status, plan: z.plan?.name, id: z.id } });
      }
      return res.json({ connected: false, error: r.body?.errors?.[0]?.message || "Token invalid" });
    } catch (e: any) {
      res.status(502).json({ connected: false, error: e.message });
    }
  });

  app.post("/api/ddos/cloudflare/connect", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    try {
      const { zoneId, apiToken } = (req.body ?? {}) as { zoneId?: string; apiToken?: string };
      if (!zoneId || !apiToken) return res.status(400).json({ message: "zoneId and apiToken are required" });
      const r = await httpsGet(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}`, { Authorization: `Bearer ${apiToken}` });
      if (r.status !== 200 || !r.body?.success) {
        return res.status(400).json({ message: r.body?.errors?.[0]?.message || "Invalid Zone ID or API token" });
      }
      const creds = loadCreds();
      creds.cloudflare = { zoneId, apiToken, connectedAt: new Date().toISOString() };
      await saveCreds(creds);
      const z = r.body.result;
      await activity(req, "Cloudflare connected", `Zone: ${z.name}`);
      res.json({ connected: true, zone: { name: z.name, status: z.status, plan: z.plan?.name, id: z.id } });
    } catch (e: any) {
      res.status(502).json({ message: e.message });
    }
  });

  app.delete("/api/ddos/cloudflare/disconnect", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    const creds = loadCreds();
    delete creds.cloudflare;
    await saveCreds(creds);
    await activity(req, "Cloudflare disconnected", "Cloudflare integration removed");
    res.json({ ok: true });
  });

  /* TCPShield (API: https://api.tcpshield.com, заголовок X-API-Key, доступен на тарифе Pro и выше) */

  /** Сети аккаунта с их доменами и защищённым CNAME (домены у TCPShield — отдельный ресурс сети). */
  const fetchTcpShieldNetworks = async (apiKey: string) => {
    const r = await httpsGet("https://api.tcpshield.com/networks", { "X-API-Key": apiKey });
    if (r.status !== 200 || !Array.isArray(r.body)) return null;
    return Promise.all(
      r.body.map(async (n: any) => {
        const d = await httpsGet(`https://api.tcpshield.com/networks/${encodeURIComponent(n.id)}/domains`, { "X-API-Key": apiKey }).catch(() => null);
        const domains = d?.status === 200 && Array.isArray(d.body) ? d.body.map((x: any) => ({ name: x.name, verified: Boolean(x.verified) })) : [];
        return { id: n.id, name: n.name, protectedCname: n.protected_cname, domains };
      }),
    );
  };

  app.get("/api/ddos/tcpshield/status", requireAuth, requirePermission("ddos.view"), async (_req, res) => {
    try {
      const creds = loadCreds();
      if (!creds.tcpshield) return res.json({ connected: false });
      const { apiKey, connectedAt } = creds.tcpshield;
      const networks = await fetchTcpShieldNetworks(apiKey);
      if (networks) return res.json({ connected: true, connectedAt, networks });
      return res.json({ connected: false, error: "API key invalid or TCPShield unreachable" });
    } catch (e: any) {
      res.status(502).json({ connected: false, error: e.message });
    }
  });

  app.post("/api/ddos/tcpshield/connect", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    try {
      const { apiKey } = (req.body ?? {}) as { apiKey?: string };
      if (!apiKey) return res.status(400).json({ message: "apiKey is required" });
      const networks = await fetchTcpShieldNetworks(apiKey);
      if (!networks) {
        return res.status(400).json({ message: "Invalid API key, no API access on your plan, or TCPShield unreachable" });
      }
      const creds = loadCreds();
      creds.tcpshield = { apiKey, connectedAt: new Date().toISOString() };
      await saveCreds(creds);
      await activity(req, "TCPShield connected", `Networks:${networks.length}`);
      res.json({ connected: true, networks });
    } catch (e: any) {
      res.status(502).json({ message: e.message });
    }
  });

  app.delete("/api/ddos/tcpshield/disconnect", requireAuth, requirePermission("ddos.manage"), requireCSRF, async (req, res) => {
    const creds = loadCreds();
    delete creds.tcpshield;
    await saveCreds(creds);
    await activity(req, "TCPShield disconnected", "TCPShield integration removed");
    res.json({ ok: true });
  });

  app.get("/api/ddos/tcpshield/ips", requireAuth, requirePermission("ddos.view"), async (_req, res) => {
    try {
      const r = await httpsGet("https://tcpshield.com/v4/", {});
      const ranges = r.status === 200 && typeof r.body === "string"
        ? r.body.split(/\s+/).filter((line) => /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(line))
        : [];
      if (ranges.length === 0) return res.status(502).json({ message: "Failed to load TCPShield IP list" });
      res.json(ranges);
    } catch (e: any) {
      res.status(502).json({ message: e.message });
    }
  });
}
