/**
 * CSRF защита для защиты от межсайтовых запросов
 */
import { randomBytes } from "crypto";

// Хранилище CSRF токенов (в production лучше использовать Redis)
const csrfTokens = new Map<string, { token: string; expires: number }>();

// Очистка истекших токенов каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of csrfTokens.entries()) {
    if (now > value.expires) {
      csrfTokens.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Генерировать CSRF токен для сессии
 */
export function generateCSRFToken(sessionId: string): string {
  const token = randomBytes(32).toString("hex");
  // Токен действителен 24 часа
  csrfTokens.set(sessionId, {
    token,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
  return token;
}

/**
 * Проверить CSRF токен
 */
export function verifyCSRFToken(sessionId: string, token: string): boolean {
  const stored = csrfTokens.get(sessionId);
  if (!stored) {
    return false;
  }

  if (Date.now() > stored.expires) {
    csrfTokens.delete(sessionId);
    return false;
  }

  return stored.token === token;
}

/**
 * Удалить CSRF токен (при logout)
 */
export function removeCSRFToken(sessionId: string): void {
  csrfTokens.delete(sessionId);
}

/**
 * Обновить срок действия токена
 */
export function refreshCSRFToken(sessionId: string): void {
  const stored = csrfTokens.get(sessionId);
  if (stored) {
    stored.expires = Date.now() + 24 * 60 * 60 * 1000;
  }
}

