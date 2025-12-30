import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { logSecurityEvent } from "./security-logger";
import type { DdosSettings } from "@shared/schema";
import { createHash } from "crypto";

/**
 * Класс для управления защитой от DDoS атак
 */
export class DdosProtection {
  // L7: Rate limiting по IP для запросов
  private l7RequestCounts: Map<string, { count: number; resetTime: number }> = new Map();
  
  // L4: Отслеживание активных соединений по IP
  private l4Connections: Map<string, Set<string>> = new Map(); // IP -> Set of connection IDs
  
  // L4: Отслеживание новых соединений для SYN Flood защиты
  private l4NewConnections: Map<string, { count: number; resetTime: number }> = new Map(); // IP -> счетчик новых соединений
  
  // L3: Отслеживание пакетов (через подсчет запросов в секунду)
  private l3PacketCounts: Map<string, { count: number; resetTime: number }> = new Map();
  
  // Заблокированные IP адреса
  private blockedIPs: Map<string, { until: number; reason: string }> = new Map();
  
  // JavaScript Challenge: токены для проверки
  private challengeTokens: Map<string, { token: string; expires: number; solved: boolean }> = new Map(); // IP -> challenge data
  
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
   * Генерировать JavaScript Challenge
   */
  private generateChallenge(ip: string): { html: string; token: string } {
    // Генерируем случайное число для challenge
    const num1 = Math.floor(Math.random() * 100) + 1;
    const num2 = Math.floor(Math.random() * 100) + 1;
    const answer = num1 + num2;
    
    // Создаем токен на основе IP, ответа и времени
    const tokenData = `${ip}:${answer}:${Date.now()}`;
    const token = createHash("sha256").update(tokenData).digest("hex").substring(0, 32);
    
    // Сохраняем challenge
    this.challengeTokens.set(ip, {
      token,
      expires: Date.now() + 5 * 60 * 1000, // 5 минут
      solved: false,
    });
    
    // Генерируем HTML с JavaScript challenge
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Security Check</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .challenge-box {
      background: white;
      padding: 40px;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
    }
    h1 { color: #333; margin-bottom: 20px; }
    .math-problem {
      font-size: 24px;
      margin: 20px 0;
      color: #667eea;
    }
    input {
      padding: 10px;
      font-size: 18px;
      border: 2px solid #ddd;
      border-radius: 5px;
      width: 100px;
      text-align: center;
      margin: 10px;
    }
    button {
      padding: 12px 30px;
      font-size: 16px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      margin-top: 10px;
    }
    button:hover { background: #5568d3; }
    .error { color: red; margin-top: 10px; display: none; }
  </style>
</head>
<body>
  <div class="challenge-box">
    <h1>🔒 Security Check</h1>
    <p>Please solve this simple math problem to continue:</p>
    <div class="math-problem">${num1} + ${num2} = ?</div>
    <input type="number" id="answer" placeholder="Answer" autofocus>
    <br>
    <button onclick="verifyChallenge()">Verify</button>
    <div class="error" id="error">Incorrect answer. Please try again.</div>
  </div>
  <script>
    const correctAnswer = ${answer};
    const token = "${token}";
    
    function verifyChallenge() {
      const userAnswer = parseInt(document.getElementById("answer").value);
      const errorDiv = document.getElementById("error");
      
      if (userAnswer === correctAnswer) {
        // Правильный ответ - отправляем токен и перезагружаем страницу
        const xhr = new XMLHttpRequest();
        xhr.open("GET", window.location.href);
        xhr.setRequestHeader("X-Challenge-Token", token);
        xhr.onload = function() {
          if (xhr.status === 200) {
            // Сохраняем токен в sessionStorage для последующих запросов
            sessionStorage.setItem("challenge-token", token);
            // Перезагружаем страницу
            window.location.reload();
          }
        };
        xhr.send();
      } else {
        errorDiv.style.display = "block";
        document.getElementById("answer").value = "";
        document.getElementById("answer").focus();
      }
    }
    
    // Автоматическая отправка при нажатии Enter
    document.getElementById("answer").addEventListener("keypress", function(e) {
      if (e.key === "Enter") {
        verifyChallenge();
      }
    });
    
    // Проверяем, есть ли сохраненный токен
    const savedToken = sessionStorage.getItem("challenge-token");
    if (savedToken) {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", window.location.href);
      xhr.setRequestHeader("X-Challenge-Token", savedToken);
      xhr.onload = function() {
        if (xhr.status === 200) {
          // Токен валиден, перенаправляем на оригинальный URL
          window.location.href = window.location.pathname;
        }
      };
      xhr.send();
    }
  </script>
</body>
</html>`;
    
    return { html, token };
  }

  /**
   * Проверить и пометить challenge как решенный
   */
  private markChallengeSolved(ip: string, token: string): boolean {
    const challengeData = this.challengeTokens.get(ip);
    if (challengeData && challengeData.token === token) {
      challengeData.solved = true;
      return true;
    }
    return false;
  }

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
  private async checkL7Protection(req: Request, settings: DdosSettings): Promise<{ allowed: boolean; reason?: string; challengeHtml?: string }> {
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

    // JavaScript Challenge - реальная реализация
    if (settings.l7ChallengeMode) {
      const challengeToken = req.headers["x-challenge-token"] as string;
      const challengeIP = ip;
      const now = Date.now();
      
      // Проверяем, есть ли активный challenge для этого IP
      const challengeData = this.challengeTokens.get(challengeIP);
      
      if (!challengeToken) {
        // Если нет токена, проверяем, нужен ли challenge
        const userAgent = req.headers["user-agent"] || "";
        const needsChallenge = !userAgent || 
                               userAgent.length < 10 || 
                               this.suspiciousUserAgents.some(pattern => pattern.test(userAgent)) ||
                               !challengeData ||
                               (challengeData && !challengeData.solved && now > challengeData.expires);
        
        if (needsChallenge) {
          // Генерируем новый challenge
          const challenge = this.generateChallenge(challengeIP);
          
          // Отправляем HTML страницу с JavaScript challenge
          return {
            allowed: false,
            reason: "JavaScript challenge required",
            challengeHtml: challenge.html,
          };
        }
        
        // Если challenge был решен, но токен не передан, разрешаем (может быть первый запрос после решения)
        if (challengeData && challengeData.solved) {
          return { allowed: true };
        }
      } else {
        // Проверяем токен
        if (challengeData && challengeData.token === challengeToken && challengeData.solved) {
          // Токен валиден, разрешаем запрос
          return { allowed: true };
        } else {
          // Неверный токен, требуем новый challenge
          this.challengeTokens.delete(challengeIP);
          const challenge = this.generateChallenge(challengeIP);
          return {
            allowed: false,
            reason: "Invalid challenge token",
            challengeHtml: challenge.html,
          };
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

    // SYN Flood защита - отслеживание скорости новых соединений
    if (settings.l4SynFloodProtection) {
      const now = Date.now();
      const windowMs = 1000; // 1 секунда
      const maxNewConnectionsPerSecond = 10; // Максимум 10 новых соединений в секунду
      
      const key = `l4-syn:${ip}`;
      const record = this.l4NewConnections.get(key);
      
      if (!record || now > record.resetTime) {
        // Новое окно времени
        this.l4NewConnections.set(key, {
          count: 1,
          resetTime: now + windowMs,
        });
      } else {
        record.count++;
        
        // Проверяем лимит новых соединений
        if (record.count > maxNewConnectionsPerSecond) {
          const blockDuration = settings.l3BlockDuration || 3600;
          this.blockIP(ip, blockDuration, `L4 SYN Flood detected: ${record.count} new connections/sec`);
          
          await logSecurityEvent({
            type: "unauthorized_access",
            ip,
            userId: undefined,
            details: `DDoS L4 SYN Flood attack detected: ${record.count} new connections/sec from IP ${ip}`,
            timestamp: new Date(),
          });
          
          return { allowed: false, reason: "SYN Flood protection: too many new connections" };
        }
      }
      
      // Отслеживаем новое соединение (уже добавлено выше в l4Connections)
      // Это соединение считается "новым" для SYN Flood защиты
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
        // Если это JavaScript Challenge, отправляем HTML страницу
        if ((l7Check as any).challengeHtml) {
          res.status(200).send((l7Check as any).challengeHtml);
          return;
        }
        
        // Проверяем, решен ли challenge
        const challengeToken = req.headers["x-challenge-token"] as string;
        if (challengeToken && l7Check.reason === "JavaScript challenge required") {
          const ip = this.getClientIP(req);
          if (this.markChallengeSolved(ip, challengeToken)) {
            // Challenge решен, разрешаем запрос
            return next();
          }
        }
        
        res.status(429).json({
          message: "Request blocked by DDoS protection",
          reason: l7Check.reason,
        });
        return;
      }
      
      // Если challenge был решен, помечаем его
      const challengeToken = req.headers["x-challenge-token"] as string;
      if (challengeToken) {
        const ip = this.getClientIP(req);
        this.markChallengeSolved(ip, challengeToken);
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
    
    // Очистка L4 счетчиков новых соединений
    for (const [key, value] of this.l4NewConnections.entries()) {
      if (now > value.resetTime) {
        this.l4NewConnections.delete(key);
      }
    }
    
    // Очистка истекших challenge токенов
    for (const [ip, challengeData] of this.challengeTokens.entries()) {
      if (now > challengeData.expires) {
        this.challengeTokens.delete(ip);
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

