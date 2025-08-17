import { Router } from 'express';
<<<<<<< HEAD
import { prisma } from '../db';
import { authRequired, requireRoles } from '../auth/middleware';
import { z } from 'zod';
import { HttpError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
=======
import { prisma } from '../db.js';
import { authRequired, requireRoles } from '../auth/middleware.js';
import { z } from 'zod';
import { HttpError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e

const router = Router();

router.get('/me', authRequired, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { roles: true } });
  res.json({ id: user!.id, email: user!.email, username: user!.username, roles: user!.roles.map(r => r.name), isEmailVerified: user!.isEmailVerified, twoFaEnabled: user!.twoFaEnabled });
}));

router.get('/', authRequired, requireRoles('ADMIN'), asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({ include: { roles: true } });
  res.json(users.map(u => ({ id: u.id, email: u.email, username: u.username, roles: u.roles.map(r => r.name), isEmailVerified: u.isEmailVerified })));
}));

const roleSchema = z.object({ roles: z.array(z.enum(['ADMIN', 'MODERATOR', 'USER'])) });

router.put('/:id/roles', authRequired, requireRoles('ADMIN'), asyncHandler(async (req, res) => {
  const data = roleSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new HttpError(404, 'Пользователь не найден');
  const roles = await prisma.role.findMany({ where: { name: { in: data.roles } } });
  await prisma.user.update({ where: { id: user.id }, data: { roles: { set: [], connect: roles.map(r => ({ id: r.id })) } } });
  res.json({ ok: true });
}));

export default router; 