import { Router } from 'express';
import { prisma } from '../db.js';
import { authRequired } from '../auth/middleware.js';
import { HttpError, assert } from '../utils/errors.js';
import { z } from 'zod';
import { audit } from '../audit/audit.js';
import { createOrStartContainer, getStats, removeContainer, stopContainer } from './docker.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

const createServerSchema = z.object({
  name: z.string().min(3),
  port: z.number().int().min(1024).max(65535),
  cpuLimit: z.number().optional(),
  memoryLimitMb: z.number().optional(),
  image: z.string().default('itzg/minecraft-server'),
  version: z.string().default('1.20.6'),
  type: z.string().default('VANILLA'),
  rconEnabled: z.boolean().optional().default(false),
  rconPort: z.number().int().min(1024).max(65535).optional(),
  rconPassword: z.string().min(4).max(64).optional(),
}).refine(v => !v.rconEnabled || (v.rconPort && v.rconPassword), {
  message: 'Для RCON укажите rconPort и rconPassword',
  path: ['rconPort']
});

router.get('/', authRequired, asyncHandler(async (req, res) => {
  const servers = await prisma.server.findMany({ where: { ownerId: req.user!.id } });
  res.json(servers);
}));

router.post('/', authRequired, asyncHandler(async (req, res) => {
  const data = createServerSchema.parse(req.body);
  const existingPort = await prisma.server.findFirst({ where: { port: data.port } });
  assert(!existingPort, 400, 'Порт уже занят другим сервером');
  if (data.rconEnabled && data.rconPort) {
    const existingRcon = await prisma.server.findFirst({ where: { rconPort: data.rconPort } });
    assert(!existingRcon, 400, 'RCON порт уже занят другим сервером');
  }
  const server = await prisma.server.create({ data: { name: data.name, ownerId: req.user!.id, port: data.port, cpuLimit: data.cpuLimit, memoryLimitMb: data.memoryLimitMb, image: data.image, version: data.version, type: data.type, rconEnabled: data.rconEnabled, rconPort: data.rconPort, rconPassword: data.rconPassword } });
  await audit(req, 'SERVER_CREATE', 'Server', server.id, { name: server.name });
  res.status(201).json(server);
}));

router.get('/:id', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  res.json(server);
}));

router.put('/:id', authRequired, asyncHandler(async (req, res) => {
  const schema = z.object({ diskLimitMb: z.number().int().min(512).max(1024 * 1024).optional(), name: z.string().min(3).optional() });
  const data = schema.parse(req.body);
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const updated = await prisma.server.update({ where: { id: server.id }, data });
  res.json(updated);
}));

router.put('/:id/rcon', authRequired, asyncHandler(async (req, res) => {
  const schema = z.object({ rconEnabled: z.boolean(), rconPort: z.number().int().min(1024).max(65535).optional(), rconPassword: z.string().min(4).max(64).optional() });
  const data = schema.parse(req.body);
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  if (data.rconEnabled && data.rconPort) {
    const existingRcon = await prisma.server.findFirst({ where: { rconPort: data.rconPort, NOT: { id: server.id } } });
    assert(!existingRcon, 400, 'RCON порт уже занят другим сервером');
  }
  const updated = await prisma.server.update({ where: { id: server.id }, data: { rconEnabled: data.rconEnabled, rconPort: data.rconPort, rconPassword: data.rconPassword } });
  res.json(updated);
}));

router.delete('/:id', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  await removeContainer(server.id).catch(() => {});
  await prisma.server.delete({ where: { id: server.id } });
  await audit(req, 'SERVER_DELETE', 'Server', server.id);
  res.json({ ok: true });
}));

router.post('/:id/start', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  await prisma.server.update({ where: { id: server.id }, data: { status: 'STARTING' } });
  const container = await createOrStartContainer({ id: server.id, name: server.name, image: server.image, version: server.version, type: server.type, cpuLimit: server.cpuLimit ?? undefined, memoryLimitMb: server.memoryLimitMb ?? undefined, port: server.port, rconEnabled: server.rconEnabled, rconPort: server.rconPort ?? undefined, rconPassword: server.rconPassword ?? undefined });
  await prisma.server.update({ where: { id: server.id }, data: { status: 'RUNNING', dockerId: container.id } });
  await audit(req, 'SERVER_START', 'Server', server.id);
  res.json({ ok: true });
}));

router.post('/:id/stop', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  await prisma.server.update({ where: { id: server.id }, data: { status: 'STOPPING' } });
  await stopContainer(server.id);
  await prisma.server.update({ where: { id: server.id }, data: { status: 'STOPPED' } });
  await audit(req, 'SERVER_STOP', 'Server', server.id);
  res.json({ ok: true });
}));

router.get('/:id/stats', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const stats = await getStats(server.id);
  res.json(stats ?? { cpuPercent: 0, memoryUsage: 0, memoryLimit: 0, netIO: { rx_bytes: 0, tx_bytes: 0 } });
}));

export default router; 