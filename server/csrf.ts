import { randomBytes } from "crypto";

const csrfTokens = new Map<string, { token: string; expires: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of csrfTokens.entries()) {
    if (now > value.expires) {
      csrfTokens.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function generateCSRFToken(sessionId: string): string {
  const token = randomBytes(32).toString("hex");
  csrfTokens.set(sessionId, {
    token,
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
  return token;
}

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

export function removeCSRFToken(sessionId: string): void {
  csrfTokens.delete(sessionId);
}

export function refreshCSRFToken(sessionId: string): void {
  const stored = csrfTokens.get(sessionId);
  if (stored) {
    stored.expires = Date.now() + 24 * 60 * 60 * 1000;
  }
}

