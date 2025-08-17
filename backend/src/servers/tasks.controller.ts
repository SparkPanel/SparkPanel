import { Router } from 'express';
import { authRequired } from '../auth/middleware';
import { prisma } from '../db';
import { HttpError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { z } from 'zod';
import cron from 'node-cron';

const router = Router({ mergeParams: true });

const upsertSchema = z.object({
  type: z.enum(['BACKUP', 'RESTART']),
  cron: z.string().min(1),
  enabled: z.boolean().default(true),
});

function validateCronOrThrow(expr: string) {
  if (!cron.validate(expr)) throw new HttpError(400, 'Неверное выражение CRON');
}

function nextRunPreview(expr: string, count = 3) {
  // node-cron не даёт next‑меток, но мы можем просто вернуть выражение как валидное
  // Для настоящего превью можно подключить croner или cron-parser, но оставим лёгко‑весную проверку
  return Array(count).fill(expr);
}

router.get('/validate', authRequired, asyncHandler(async (req, res) => {
  const expr = String(req.query.cron || '');
  validateCronOrThrow(expr);
  res.json({ valid: true, next: nextRunPreview(expr) });
}));

router.get('/', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const list = await prisma.task.findMany({ where: { serverId: server.id } });
  res.json(list);
}));

router.post('/', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const data = upsertSchema.parse(req.body);
  validateCronOrThrow(data.cron);
  const created = await prisma.task.create({ data: { serverId: server.id, type: data.type, cron: data.cron, enabled: data.enabled } });
  res.status(201).json({ ...created, next: nextRunPreview(data.cron) });
}));

router.put('/:taskId', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const task = await prisma.task.findFirst({ where: { id: req.params.taskId, serverId: server.id } });
  if (!task) throw new HttpError(404, 'Задача не найдена');
  const data = upsertSchema.partial().parse(req.body);
  if (data.cron) validateCronOrThrow(data.cron);
  const updated = await prisma.task.update({ where: { id: task.id }, data });
  res.json({ ...updated, next: data.cron ? nextRunPreview(data.cron) : undefined });
}));

router.delete('/:taskId', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const task = await prisma.task.findFirst({ where: { id: req.params.taskId, serverId: server.id } });
  if (!task) throw new HttpError(404, 'Задача не найдена');
  await prisma.task.delete({ where: { id: task.id } });
  res.json({ ok: true });
}));

export default router;
