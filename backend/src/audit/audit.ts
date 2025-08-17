<<<<<<< HEAD
import { prisma } from '../db';
=======
import { prisma } from '../db.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
import { Request } from 'express';

export async function audit(req: Request, action: string, entity?: string, entityId?: string, metadata?: any) {
  const userId = req.user?.id;
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined;
  await prisma.auditLog.create({ data: { userId, action, entity, entityId, metadata, ipAddress } });
} 