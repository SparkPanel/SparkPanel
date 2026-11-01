/**
 * Проверка команды для консоли игрового сервера. Команда передаётся в stdin процесса
 * (не в оболочку), поэтому опасны только управляющие символы и переводы строк,
 * позволяющие внедрить несколько команд за раз.
 */
export function sanitizeCommand(command: unknown): string {
  if (typeof command !== "string" || !command.trim()) {
    throw new Error("Command must be a non-empty string");
  }
  if (command.length > 1000) {
    throw new Error("Command is too long (max 1000 characters)");
  }
  if (/[\x00-\x08\x0A-\x1F\x7F]/.test(command)) {
    throw new Error("Command contains control characters");
  }
  return command.trim();
}

export function isValidUUID(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeUsername(username: unknown): string {
  if (typeof username !== "string") {
    throw new Error("Username must be a non-empty string");
  }
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 50) {
    throw new Error("Username must be between 3 and 50 characters");
  }
  if (!/^[a-zA-Z0-9._@\-]+$/.test(trimmed)) {
    throw new Error("Username may contain only latin letters, digits and . _ @ -");
  }
  return trimmed;
}

const RESERVED_SYSTEM_USERS = new Set(["root", "sshd", "daemon", "bin", "sys", "nobody", "adm", "operator", "mail", "ftp"]);

/** Имя SFTP-пользователя должно быть допустимым именем Linux-пользователя. */
export function sanitizeSftpUsername(username: unknown): string {
  if (typeof username !== "string") throw new Error("Username is required");
  const trimmed = username.trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_-]{2,31}$/.test(trimmed)) {
    throw new Error("SFTP username must be 3-32 chars: lowercase latin letters, digits, _ or -, starting with a letter");
  }
  if (RESERVED_SYSTEM_USERS.has(trimmed)) throw new Error("This username is reserved");
  return trimmed;
}

export class RateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(
    private maxAttempts = 5,
    private windowMs = 15 * 60 * 1000,
  ) {}

  checkLimit(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);
    if (!record || now > record.resetTime) {
      this.attempts.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return true;
    }
    if (record.count >= this.maxAttempts) return false;
    record.count++;
    return true;
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.attempts.entries()) {
      if (now > value.resetTime) this.attempts.delete(key);
    }
  }
}

export const loginRateLimiter = new RateLimiter(5, 15 * 60 * 1000);
export const twoFactorRateLimiter = new RateLimiter(10, 15 * 60 * 1000);
export const commandRateLimiter = new RateLimiter(60, 60 * 1000);

setInterval(() => {
  loginRateLimiter.cleanup();
  twoFactorRateLimiter.cleanup();
  commandRateLimiter.cleanup();
}, 5 * 60 * 1000).unref();
