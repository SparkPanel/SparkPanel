export function sanitizeCommand(command: string): string {
  if (!command || typeof command !== "string") {
    throw new Error("Command must be a non-empty string");
  }

  
  if (command.length > 1000) {
    throw new Error("Command is too long (max 1000 characters)");
  }

  
  const dangerousPatterns = [
    /[;&|`$(){}[\]]/, // Опасные символы shell (включает ;, &, |, `, $, (, ), {, }, [, ])
    /\${/,            // Переменные окружения в shell (${VAR})
    />/,              // Перенаправление вывода
    /</,              // Перенаправление ввода
    /&&/,             // Логические операторы (AND)
    /\|\|/,           // Логические операторы (OR)
    /\\n/,            // Переносы строк
    /\\r/,            // Возврат каретки
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      throw new Error("Command contains dangerous characters");
    }
  }

  
  return command.trim();
}


export function sanitizePath(path: string): string {
  if (!path || typeof path !== "string") {
    throw new Error("Path must be a non-empty string");
  }

  
  if (path.length > 500) {
    throw new Error("Path is too long (max 500 characters)");
  }

  
  let normalizedPath = path.replace(/\/+/g, "/");

  
  if (normalizedPath.startsWith("/")) {
    normalizedPath = "/" + normalizedPath.slice(1).replace(/\/+$/, "");
  } else {
    normalizedPath = normalizedPath.replace(/\/+$/, "");
  }

  
  if (normalizedPath.includes("..") || normalizedPath.includes("./") || normalizedPath.includes("../")) {
    throw new Error("Path traversal detected");
  }

  
  if (!/^[\/a-zA-Z0-9._\-\s]+$/.test(normalizedPath)) {
    throw new Error("Path contains invalid characters");
  }

  return normalizedPath;
}


export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}


export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


export function sanitizeUsername(username: string): string {
  if (!username || typeof username !== "string") {
    throw new Error("Username must be a non-empty string");
  }

  
  if (username.length < 3 || username.length > 50) {
    throw new Error("Username must be between 3 and 50 characters");
  }

  
  if (!/^[a-zA-Z0-9\s._@\-]+$/.test(username)) {
    throw new Error("Username contains invalid characters");
  }

  return username.trim();
}


export class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  
  checkLimit(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now > record.resetTime) {
      
      this.attempts.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true;
    }

    if (record.count >= this.maxAttempts) {
      return false; 
    }

    record.count++;
    return true;
  }

  
  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.attempts.entries()) {
      if (now > value.resetTime) {
        this.attempts.delete(key);
      }
    }
  }
}


export const loginRateLimiter = new RateLimiter(5, 15 * 60 * 1000); 
export const commandRateLimiter = new RateLimiter(30, 60 * 1000); 


setInterval(() => {
  loginRateLimiter.cleanup();
  commandRateLimiter.cleanup();
}, 5 * 60 * 1000);

