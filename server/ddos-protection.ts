import type { Request, Response, NextFunction } from "express";
import type { Socket } from "net";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { storage } from "./storage";
import { logSecurityEvent } from "./security-logger";
import type { DdosSettings } from "@shared/schema";

export const CHALLENGE_PATH = "/__sparkpanel/challenge";
const CHALLENGE_COOKIE = "sp_challenge";
const CHALLENGE_TTL_MS = 24 * 60 * 60 * 1000;
const SETTINGS_CACHE_MS = 5000;

const MACHINE_PATHS = ["/api/nodes/install.sh", "/api/nodes/enroll", "/api/webhooks/", "/api/public/"];
const SUSPICIOUS_AGENTS = [/bot/i, /crawler/i, /spider/i, /scraper/i, /curl/i, /wget/i, /python/i, /java\//i, /go-http/i, /httpclient/i, /^$/];
const BROWSER_AGENTS = /mozilla|chrome|firefox|safari|edge/i;

interface Counter {
  count: number;
  resetTime: number;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Защита панели от флуда на уровне приложения:
 *  - L3: лимит запросов в секунду с одного IP;
 *  - L4: лимит одновременных TCP-соединений и частоты новых соединений с одного IP;
 *  - L7: лимит запросов в минуту, блокировка ботов по User-Agent и проверка-челлендж,
 *        ответ на которую проверяется на сервере и подтверждается подписанной cookie.
 */
export class DdosProtection {
  private l3Counts = new Map<string, Counter>();
  private l7Counts = new Map<string, Counter>();
  private newConnections = new Map<string, Counter>();
  private openSockets = new Map<string, Set<Socket>>();
  private trackedSockets = new WeakSet<Socket>();
  private blockedIPs = new Map<string, { until: number; reason: string }>();
  private challenges = new Map<string, { answer: number; ip: string; expires: number }>();
  private readonly secret = randomBytes(32);
  private settingsCache: { value: DdosSettings | undefined; at: number } | null = null;

  invalidateSettings(): void {
    this.settingsCache = null;
  }

  private async getSettings(): Promise<DdosSettings | undefined> {
    if (this.settingsCache && Date.now() - this.settingsCache.at < SETTINGS_CACHE_MS) {
      return this.settingsCache.value;
    }
    const value = await storage.getDdosSettings("panel", null);
    this.settingsCache = { value, at: Date.now() };
    return value;
  }

  /** IP клиента с учётом настройки trust proxy Express (X-Forwarded-For принимается только от доверенного прокси). */
  private getClientIP(req: Request): string {
    return (req.ip || req.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
  }

  private hit(map: Map<string, Counter>, key: string, windowMs: number): number {
    const now = Date.now();
    const record = map.get(key);
    if (!record || now > record.resetTime) {
      map.set(key, { count: 1, resetTime: now + windowMs });
      return 1;
    }
    record.count += 1;
    return record.count;
  }

  private async block(ip: string, settings: DdosSettings, reason: string): Promise<void> {
    const duration = settings.l3BlockDuration || 3600;
    this.blockedIPs.set(ip, { until: Date.now() + duration * 1000, reason });
    await logSecurityEvent({ type: "unauthorized_access", ip, details: `DDoS protection: ${reason}`, timestamp: new Date() });
  }

  private sign(ip: string, expires: number): string {
    return createHmac("sha256", this.secret).update(`${ip}|${expires}`).digest("hex");
  }

  private hasValidPass(req: Request, ip: string): boolean {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${CHALLENGE_COOKIE}=`));
    if (!cookie) return false;
    const [expiresRaw, signature] = decodeURIComponent(cookie.slice(CHALLENGE_COOKIE.length + 1)).split(".");
    const expires = Number(expiresRaw);
    if (!expires || expires < Date.now() || !signature) return false;
    const expected = Buffer.from(this.sign(ip, expires));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private renderChallenge(req: Request, res: Response, ip: string, redirect: string, error = false): void {
    /* Страница показывается до входа, когда переключатель языка панели ещё не загружен, — язык берётся из браузера. */
    const ru = /^ru/i.test(String(req.headers["accept-language"] ?? ""));
    const t = ru
      ? { lang: "ru", title: "Проверка безопасности", ask: "Решите пример, чтобы продолжить:", go: "Продолжить", wrong: "Неверный ответ, попробуйте ещё раз" }
      : { lang: "en", title: "Security check", ask: "Solve the sum to continue:", go: "Continue", wrong: "Wrong answer, try again" };
    const a = randomInt(10, 60);
    const b = randomInt(1, 40);
    const id = randomBytes(16).toString("hex");
    this.challenges.set(id, { answer: a + b, ip, expires: Date.now() + 5 * 60 * 1000 });
    res
      .status(error ? 403 : 429)
      .set("Cache-Control", "no-store")
      .type("html")
      .send(`<!DOCTYPE html>
<html lang="${t.lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t.title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0}
.box{background:#1e293b;padding:32px;border-radius:12px;text-align:center;max-width:360px}input{padding:10px;font-size:18px;width:120px;text-align:center;border-radius:6px;border:1px solid #475569;background:#0f172a;color:#e2e8f0}
button{margin-top:16px;padding:10px 28px;font-size:16px;border:0;border-radius:6px;background:#3b82f6;color:#fff;cursor:pointer}.err{color:#f87171;margin-top:12px}</style></head>
<body><form class="box" method="POST" action="${CHALLENGE_PATH}">
<h2>${t.title}</h2><p>${t.ask}</p>
<p style="font-size:26px">${a} + ${b} = ?</p>
<input type="hidden" name="id" value="${id}"><input type="hidden" name="redirect" value="${escapeAttr(redirect)}">
<input name="answer" type="number" required autofocus><br><button type="submit">${t.go}</button>
${error ? `<div class="err">${t.wrong}</div>` : ""}
</form></body></html>`);
  }

  /** Обработчик отправки формы проверки. */
  handleChallengeSubmit = (req: Request, res: Response): void => {
    const ip = this.getClientIP(req);
    const { id, answer, redirect } = (req.body ?? {}) as Record<string, string>;
    const safeRedirect = typeof redirect === "string" && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/";
    const challenge = id ? this.challenges.get(String(id)) : undefined;
    if (id) this.challenges.delete(String(id));

    if (!challenge || challenge.ip !== ip || challenge.expires < Date.now() || Number(answer) !== challenge.answer) {
      this.renderChallenge(req, res, ip, safeRedirect, true);
      return;
    }
    const expires = Date.now() + CHALLENGE_TTL_MS;
    res.cookie(CHALLENGE_COOKIE, `${expires}.${this.sign(ip, expires)}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.FORCE_HTTPS === "true",
      maxAge: CHALLENGE_TTL_MS,
    });
    res.redirect(303, safeRedirect);
  };

  private trackSocket(ip: string, socket: Socket): number {
    let set = this.openSockets.get(ip);
    if (!set) {
      set = new Set();
      this.openSockets.set(ip, set);
    }
    if (!this.trackedSockets.has(socket)) {
      this.trackedSockets.add(socket);
      set.add(socket);
      this.hit(this.newConnections, ip, 1000);
      socket.once("close", () => {
        const current = this.openSockets.get(ip);
        current?.delete(socket);
        if (current && current.size === 0) this.openSockets.delete(ip);
      });
    }
    return set.size;
  }

  applyProtection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = this.getClientIP(req);
      const blocked = this.blockedIPs.get(ip);
      if (blocked) {
        if (Date.now() < blocked.until) {
          res.status(403).json({
            message: "IP address is blocked",
            reason: blocked.reason,
            retryAfter: Math.ceil((blocked.until - Date.now()) / 1000),
          });
          return;
        }
        this.blockedIPs.delete(ip);
      }

      const settings = await this.getSettings();
      if (!settings) return next();

      if (settings.l3Enabled && settings.l3MaxPacketsPerSecond) {
        const count = this.hit(this.l3Counts, ip, 1000);
        if (count > settings.l3MaxPacketsPerSecond) {
          await this.block(ip, settings, `request rate ${count}/s exceeded`);
          res.status(429).json({ message: "Request blocked by DDoS protection", reason: "Packet rate limit exceeded" });
          return;
        }
      }

      if (settings.l4Enabled) {
        const open = this.trackSocket(ip, req.socket);
        if (settings.l4MaxConnectionsPerIp && open > settings.l4MaxConnectionsPerIp) {
          await this.block(ip, settings, `${open} concurrent connections`);
          req.socket.destroy();
          return;
        }
        const fresh = this.newConnections.get(ip)?.count ?? 0;
        if (settings.l4SynFloodProtection && fresh > 20) {
          await this.block(ip, settings, `${fresh} new connections/s`);
          req.socket.destroy();
          return;
        }
      }

      if (settings.l7Enabled) {
        const isMachineEndpoint = MACHINE_PATHS.some((p) => req.path.startsWith(p));
        const isApiKeyRequest = isMachineEndpoint || Boolean(req.headers["x-api-key"] || String(req.headers.authorization || "").startsWith("Bearer "));
        const userAgent = String(req.headers["user-agent"] || "");
        if (settings.l7UserAgentBlocking && !isApiKeyRequest && SUSPICIOUS_AGENTS.some((p) => p.test(userAgent)) && !BROWSER_AGENTS.test(userAgent)) {
          await logSecurityEvent({ type: "unauthorized_access", ip, details: `Blocked User-Agent: ${userAgent.slice(0, 100)}`, timestamp: new Date() });
          res.status(403).json({ message: "Request blocked by DDoS protection", reason: "Suspicious User-Agent blocked" });
          return;
        }

        if (settings.l7MaxRequestsPerMinute) {
          const count = this.hit(this.l7Counts, ip, 60_000);
          if (count > settings.l7MaxRequestsPerMinute) {
            await this.block(ip, settings, `${count} requests/min`);
            res.status(429).json({ message: "Request blocked by DDoS protection", reason: "Rate limit exceeded" });
            return;
          }
        }

        if (settings.l7ChallengeMode && !isApiKeyRequest && !this.hasValidPass(req, ip)) {
          if (req.path.startsWith("/api/")) {
            res.status(429).json({ message: "Security check required", challenge: CHALLENGE_PATH });
          } else {
            this.renderChallenge(req, res, ip, req.originalUrl || "/");
          }
          return;
        }
      }

      next();
    } catch (error) {
      console.error("DDoS protection error:", error);
      next();
    }
  };

  cleanup(): void {
    const now = Date.now();
    for (const map of [this.l3Counts, this.l7Counts, this.newConnections]) {
      for (const [key, value] of map) if (now > value.resetTime) map.delete(key);
    }
    for (const [id, challenge] of this.challenges) if (now > challenge.expires) this.challenges.delete(id);
    for (const [ip, info] of this.blockedIPs) if (now > info.until) this.blockedIPs.delete(ip);
  }

  getStats() {
    return {
      blockedIPs: Array.from(this.blockedIPs.entries()).map(([ip, info]) => ({ ip, reason: info.reason, until: new Date(info.until).toISOString() })),
      activeConnections: Array.from(this.openSockets.values()).reduce((sum, set) => sum + set.size, 0),
      trackedIPs: this.l7Counts.size + this.l3Counts.size,
    };
  }

  unblock(ip: string): boolean {
    return this.blockedIPs.delete(ip);
  }
}

export const ddosProtection = new DdosProtection();

setInterval(() => ddosProtection.cleanup(), 60 * 1000).unref();
