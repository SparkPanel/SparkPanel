import { Router } from 'express';
import { authRequired } from '../auth/middleware.js';
import { HttpError } from '../utils/errors.js';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import multer from 'multer';
import os from 'os';
import { prisma } from '../db.js';
import { serverDataPath } from './docker.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const tmpUploadDir = path.join(os.tmpdir(), 'sparkpanel_uploads');
try { fssync.mkdirSync(tmpUploadDir, { recursive: true }); } catch {}
const upload = multer({ dest: tmpUploadDir });

const router = Router({ mergeParams: true });

function resolveSafe(base: string, p: string) {
  const full = path.resolve(base, p);
  if (!full.startsWith(base)) throw new HttpError(400, 'Неверный путь');
  return full;
}

router.get('/', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const base = serverDataPath(server.id);
  const dir = resolveSafe(base, String(req.query.path || '.'));
  const entries = await fs.readdir(dir, { withFileTypes: true });
  res.json(entries.map(e => ({ name: e.name, isDir: e.isDirectory() })));
}));

router.get('/download', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const base = serverDataPath(server.id);
  const file = resolveSafe(base, String(req.query.path || ''));
  if (!fssync.existsSync(file) || fssync.statSync(file).isDirectory()) throw new HttpError(404, 'Файл не найден');
  res.download(file);
}));

router.post('/upload', authRequired, upload.single('file'), asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const base = serverDataPath(server.id);
  const toPath = resolveSafe(base, String(req.query.path || (req.file?.originalname ?? 'upload.bin')));
  await fs.mkdir(path.dirname(toPath), { recursive: true });
  await fs.rename(req.file!.path, toPath);
  res.json({ ok: true });
}));

router.delete('/', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const base = serverDataPath(server.id);
  const target = resolveSafe(base, String(req.query.path || ''));
  await fs.rm(target, { recursive: true, force: true });
  res.json({ ok: true });
}));

export default router; 