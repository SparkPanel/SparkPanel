import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface JwtPayload {
  sub: string;
  roles: string[];
  typ: 'access' | 'refresh';
}

export function signAccessToken(userId: string, roles: string[]) {
  const payload: JwtPayload = { sub: userId, roles, typ: 'access' };
  return jwt.sign(payload, config.jwtAccessSecret, { expiresIn: config.jwtAccessTtl });
}

export function signRefreshToken(userId: string, roles: string[]) {
  const payload: JwtPayload = { sub: userId, roles, typ: 'refresh' };
  return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshTtl });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtAccessSecret) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as JwtPayload;
} 