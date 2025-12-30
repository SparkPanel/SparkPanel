import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { logSecurityEvent } from "./security-logger";
import type { DdosSettings } from "@shared/schema";

/**
 * Класс для управления защитой от DDoS атак
 */
export class DdosProtection {
  // L7: Rate limiting по IP для запросов
  private l7RequestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  
  // L4: Отслеживание активных соединений по IP
  private l4Connections: Map<string, Set<string>> = new Map(); // IP -> Set of connection IDs
  
  // L3: Отслеживание пакетов (упрощенная версия через запросы)
  private l3PacketCounts: Map<string, { count: number; resetTime: number }> = new Map();
  
  // Заблокированные IP адреса
  private blockedIPs: Map<string, { until: number; reason: string }> = new Map();
  
  // Подозрительные User-Agent паттерны
  private readonly suspiciousUserAgents = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http/i,
    /^$/i, // Пустой User-Agent
  ];

  /**
   * Получить IP адрес клиента
   */
  private getClientIP(req: Request): string {
    return (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (req.headers["x-real-ip"] as string) ||
      req.ip ||
      req.socket.remoteAddress ||
      "unknown"
    );
  }

  /**
   * Проверить, заблокирован ли IP
   */
  private isIPBlocked(ip: string): boolean {
    const blockInfo = this.blockedIPs.get(ip);
    if (!blockInfo) return false;
    
    if (Date.now() > blockInfo.until) {
      this.blockedIPs.delete(ip);
      return false;
    }
    
    return true;
  }

  /**
   * Заблокировать IP адрес
   */
  private blockIP(ip: string, durationSeconds: number, reason: string): void {
    this.blockedIPs.set(ip, {
      until: Date.now() + durationSeconds * 1000,
      reason,
    });
  }

  /**
   * Проверить L7 защиту (HTTP/HTTPS запросы)
   */
  private async checkL7Protection(req: Request, settings: DdosSettings): Promise<{ allowed: boolean; reason?: string }> {
    if (!settings.l7Enabled) {
      return { allowed: true };
    }

    const ip = this.getClientIP(req);
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 минута

    // Проверка User-Agent блокировки
    if (settings.l7UserAgentBlocking) {
      const userAgent = req.headers["user-agent"] || "";
      const isSuspicious = this.suspiciousUserAgents.some(pattern => pattern.test(userAgent));
      
      if (isSuspicious && !userAgent.includes("Mozilla") && !userAgent.includes("Chrome") && !userAgent.includes("Firefox") && !userAgent.includes("Safari") && !userAgent.includes("Edge")) {
        await logSecurityEvent({
          type: "unauthorized_access",
          ip,
          userId: undefined,
          details: `Blocked suspicious User-Agent: ${userAgent.substring(0, 100)}`,
          timestamp: new Date(),
        });
        return { allowed: false, reason: "Suspicious User-Agent blocked" };
      }
    }

    // Rate limiting по запросам в минуту
    if (settings.l7MaxRequestsPerMinute) {
      const key = `l7:${ip}`;
      const record = this.l7RequestCounts.get(key);

      if (!record || now > record.resetTime) {
        this.l7RequestCounts.set(key, {
          count: 1,
          resetTime: now + windowMs,
        });
      } else {
        record.count++;
        
        if (record.count > settings.l7MaxRequestsPerMinute) {
          // Блокируем IP
          const blockDuration = settings.l3BlockDuration || 3600;
          this.blockIP(ip, blockDuration, `L7 rate limit exceeded: ${record.count} requests/min`);
          
          await logSecurityEvent({
            type: "unauthorized_access",
            ip,
            userId: undefined,
            details: `DDoS L7 attack detected: ${record.count} requests/min from IP ${ip}`,
            timestamp: new Date(),
          });
          
          return { allowed: false, reason: "Rate limit exceeded" };
        }
      }
    }

    // JavaScript Challenge (упрощенная версия - проверка наличия специального заголовка)
    if (settings.l7ChallengeMode) {
      const challengeToken = req.headers["x-challenge-token"];
      
      // Если нет токена, проверяем User-Agent (браузеры обычно имеют нормальный User-Agent)
      if (!challengeToken) {
        const userAgent = req.headers["user-agent"] || "";
        // Если User-Agent подозрительный или пустой, блокируем
        if (!userAgent || userAgent.length < 10 || this.suspiciousUserAgents.some(pattern => pattern.test(userAgent))) {
          // В реальной реализации здесь должен быть JavaScript challenge
          // Пока просто логируем и разрешаем (можно добавить реальный challenge позже)
          // return { allowed: false, reason: "JavaScript challenge required" };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Проверить L4 защиту (TCP/UDP соединения)
   */
  private async checkL4Protection(req: Request, settings: DdosSettings): Promise<{ allowed: boolean; reason?: string }> {
    if (!settings.l4Enabled) {
      return { allowed: true };
    }

    const ip = this.getClientIP(req);
    const connectionId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;

    // Отслеживание активных соединений
    if (settings.l4MaxConnectionsPerIp) {
      if (!this.l4Connections.has(ip)) {
        this.l4Connections.set(ip, new Set());
      }
      
      const connections = this.l4Connections.get(ip)!;
      
      // Добавляем текущее соединение
      connections.add(connectionId);
      
      // Удаляем соединение при закрытии
      req.socket.on("close", () => {
        connections.delete(connectionId);
        if (connections.size === 0) {
          this.l4Connections.delete(ip);
        }
      });
      
      // Проверяем лимит
      if (connections.size > settings.l4MaxConnectionsPerIp) {
        const blockDuration = settings.l3BlockDuration || 3600;
        this.blockIP(ip, blockDuration, `L4 connection limit exceeded: ${connections.size} connections`);
        
        await logSecurityEvent({
          type: "unauthorized_access",
          ip,
          userId: undefined,
          details: `DDoS L4 attack detected: ${connections.size} connections from IP ${ip}`,
          timestamp: new Date(),
        });
        
        return { allowed: false, reason: "Connection limit exceeded" };
      }
    }

    // SYN Flood защита (упрощенная версия - проверка скорости новых соединений)
    if (settings.l4SynFloodProtection) {
      // В реальной реализации нужен более сложный механизм
      // Пока используем упрощенную проверку через L7 rate limiting
    }

    return { allowed: true };
  }

  /**
   * Проверить L3 защиту (сетевой уровень)
   */
  private async checkL3Protection(req: Request, settings: DdosSettings): Promise<{ allowed: boolean; reason?: string }> {
    if (!settings.l3Enabled) {
      return { allowed: true };
    }

    const ip = this.getClientIP(req);
    const now = Date.now();
    const windowMs = 1000; // 1 секунда

    // Упрощенная версия L3 защиты через подсчет запросов в секунду
    if (settings.l3MaxPacketsPerSecond) {
      const key = `l3:${ip}`;
      const record = this.l3PacketCounts.get(key);

      if (!record || now > record.resetTime) {
        this.l3PacketCounts.set(key, {
          count: 1,
          resetTime: now + windowMs,
        });
      } else {
        record.count++;
        
        if (record.count > settings.l3MaxPacketsPerSecond) {
          const blockDuration = settings.l3BlockDuration || 3600;
          this.blockIP(ip, blockDuration, `L3 packet limit exceeded: ${record.count} packets/sec`);
          
          await logSecurityEvent({
            type: "unauthorized_access",
            ip,
            userId: undefined,
            details: `DDoS L3 attack detected: ${record.count} packets/sec from IP ${ip}`,
            timestamp: new Date(),
          });
          
          return { allowed: false, reason: "Packet rate limit exceeded" };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Middleware для применения DDoS защиты
   */
  async applyProtection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ip = this.getClientIP(req);
      
      // Проверяем, не заблокирован ли IP
      if (this.isIPBlocked(ip)) {
        const blockInfo = this.blockedIPs.get(ip);
        res.status(403).json({
          message: "IP address is blocked",
          reason: blockInfo?.reason || "DDoS protection",
          retryAfter: Math.ceil((blockInfo!.until - Date.now()) / 1000),
        });
        return;
      }

      // Получаем настройки DDoS защиты для панели
      const settings = await storage.getDdosSettingsByTarget("panel", null);
      
      if (!settings) {
        // Если настроек нет, пропускаем запрос
        return next();
      }

      // Применяем защиту по уровням (L3 -> L4 -> L7)
      const l3Check = await this.checkL3Protection(req, settings);
      if (!l3Check.allowed) {
        res.status(429).json({
          message: "Request blocked by DDoS protection",
          reason: l3Check.reason,
        });
        return;
      }

      const l4Check = await this.checkL4Protection(req, settings);
      if (!l4Check.allowed) {
        res.status(429).json({
          message: "Request blocked by DDoS protection",
          reason: l4Check.reason,
        });
        return;
      }

      const l7Check = await this.checkL7Protection(req, settings);
      if (!l7Check.allowed) {
        res.status(429).json({
          message: "Request blocked by DDoS protection",
          reason: l7Check.reason,
        });
        return;
      }

      // Все проверки пройдены
      next();
    } catch (error) {
      // В случае ошибки пропускаем запрос (fail-open)
      console.error("DDoS protection error:", error);
      next();
    }
  }

  /**
   * Очистка старых записей
   */
  cleanup(): void {
    const now = Date.now();
    
    // Очистка L7 счетчиков
    for (const [key, value] of this.l7RequestCounts.entries()) {
      if (now > value.resetTime) {
        this.l7RequestCounts.delete(key);
      }
    }
    
    // Очистка L3 счетчиков
    for (const [key, value] of this.l3PacketCounts.entries()) {
      if (now > value.resetTime) {
        this.l3PacketCounts.delete(key);
      }
    }
    
    // Очистка заблокированных IP
    for (const [ip, blockInfo] of this.blockedIPs.entries()) {
      if (now > blockInfo.until) {
        this.blockedIPs.delete(ip);
      }
    }
  }

  /**
   * Получить статистику защиты
   */
  getStats(): {
    blockedIPs: number;
    activeL4Connections: number;
    l7ActiveIPs: number;
    l3ActiveIPs: number;
  } {
    return {
      blockedIPs: this.blockedIPs.size,
      activeL4Connections: Array.from(this.l4Connections.values()).reduce((sum, set) => sum + set.size, 0),
      l7ActiveIPs: this.l7RequestCounts.size,
      l3ActiveIPs: this.l3PacketCounts.size,
    };
  }
}

// Глобальный экземпляр защиты от DDoS
export const ddosProtection = new DdosProtection();

// Очистка каждые 5 минут
setInterval(() => {
  ddosProtection.cleanup();
}, 5 * 60 * 1000);

