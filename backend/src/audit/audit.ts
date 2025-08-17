import { prisma } from '../db';
import { Request } from 'express';

export async function audit(req: Request, action: string, entity?: string, entityId?: string, metadata?: any) {
  const userId = req.user?.id;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined;
  await prisma.auditLog.create({ data: { userId, action, entity, entityId, metadata, ipAddress } });
} 