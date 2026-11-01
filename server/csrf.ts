import { randomBytes, timingSafeEqual } from "crypto";
import type { Session, SessionData } from "express-session";

type CsrfSession = Session & Partial<SessionData>;

/** CSRF-токен хранится в самой сессии, поэтому переживает перезапуск панели вместе с сессией. */
export function generateCSRFToken(session: CsrfSession): string {
  const token = randomBytes(32).toString("hex");
  session.csrfToken = token;
  return token;
}

export function getOrCreateCSRFToken(session: CsrfSession): string {
  return session.csrfToken || generateCSRFToken(session);
}

export function verifyCSRFToken(session: CsrfSession | undefined, token: unknown): boolean {
  const stored = session?.csrfToken;
  if (!stored || typeof token !== "string") return false;
  const a = Buffer.from(stored);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
