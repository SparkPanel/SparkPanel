import { Router } from 'express';
<<<<<<< HEAD
import { authRequired } from '../auth/middleware';
import { HttpError } from '../utils/errors';
=======
import { authRequired } from '../auth/middleware.js';
import { HttpError } from '../utils/errors.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import multer from 'multer';
import os from 'os';
<<<<<<< HEAD
import { prisma } from '../db';
import { serverDataPath } from './docker';
import { asyncHandler } from '../utils/asyncHandler';
import { getDirectorySizeBytes } from './quota';
import { config } from '../config';

const tmpUploadDir = path.join(os.tmpdir(), 'sparkpanel_uploads');
try { fssync.mkdirSync(tmpUploadDir, { recursive: true }); } catch {}
const upload = multer({ dest: tmpUploadDir, limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES) || 50 * 1024 * 1024 } });
=======
import { prisma } from '../db.js';
import { serverDataPath } from './docker.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getDirectorySizeBytes } from './quota.js';
import { config } from '../config.js';

const tmpUploadDir = path.join(os.tmpdir(), 'sparkpanel_uploads');
try { fssync.mkdirSync(tmpUploadDir, { recursive: true }); } catch {}
const upload = multer({ dest: tmpUploadDir });
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e

const router = Router({ mergeParams: true });

function resolveSafe(base: string, p: string) {
  const full = path.resolve(base, p);
<<<<<<< HEAD
  const normalizedBase = path.resolve(base) + path.sep;
  if (full !== path.resolve(base) && !full.startsWith(normalizedBase)) throw new HttpError(400, 'Неверный путь');
=======
  if (!full.startsWith(base)) throw new HttpError(400, 'Неверный путь');
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
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

  // quota check
  if (config.diskQuota.enforce) {
    const currentSize = await getDirectorySizeBytes(base);
    const incoming = req.file ? fssync.statSync(req.file.path).size : 0;
    const limitBytes = (server.diskLimitMb ?? config.diskQuota.defaultMb) * 1024 * 1024;
    if (currentSize + incoming > limitBytes) {
      // cleanup temp
      try { if (req.file) fssync.unlinkSync(req.file.path); } catch {}
      throw new HttpError(400, 'Превышен диск лимит сервера');
    }
  }

<<<<<<< HEAD
  const toPath = resolveSafe(base, String(req.query.path || path.basename(req.file?.originalname ?? 'upload.bin')));
=======
  const toPath = resolveSafe(base, String(req.query.path || (req.file?.originalname ?? 'upload.bin')));
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
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