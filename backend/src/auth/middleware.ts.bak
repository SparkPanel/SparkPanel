import { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from './jwt.js';
import { HttpError } from '../utils/errors.js';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; roles: string[] };
    }
  }
}

export function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw new HttpError(401, 'Требуется аутентификация');
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, roles: payload.roles };
    next();
  } catch {
    throw new HttpError(401, 'Недействительный токен');
  }
}

export function requireRoles(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const roles = req.user?.roles || [];
    const ok = roles.some(r => allowed.includes(r));
    if (!ok) throw new HttpError(403, 'Недостаточно прав');
    next();
  };
} 