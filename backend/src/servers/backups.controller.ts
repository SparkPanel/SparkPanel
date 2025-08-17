import { Router } from 'express';
<<<<<<< HEAD
import { authRequired } from '../auth/middleware';
import { prisma } from '../db';
import { HttpError } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
=======
import { authRequired } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { HttpError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
import path from 'path';
import fs from 'fs/promises';
import fssync from 'fs';
import tar from 'tar';
<<<<<<< HEAD
import { serverDataPath } from './docker';
import { config } from '../config';
=======
import { serverDataPath } from './docker.js';
import { config } from '../config.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const router = Router({ mergeParams: true });

const s3 = config.s3.enabled ? new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint || undefined,
  forcePathStyle: config.s3.pathStyle,
  credentials: config.s3.accessKeyId ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey } : undefined,
}) : null;

function backupsDir(serverId: string) {
  return path.join(serverDataPath(serverId), '..', `${serverId}_backups`);
}

router.get('/', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const list = await prisma.backup.findMany({ where: { serverId: server.id }, orderBy: { createdAt: 'desc' } });
  res.json(list);
}));

router.post('/', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const dir = serverDataPath(server.id);
  const tmpFile = path.join('/tmp', `${server.id}-${Date.now()}.tar.gz`);
  await tar.c({ gzip: true, file: tmpFile, cwd: dir }, ['.']);
  const size = fssync.statSync(tmpFile).size;

  if (config.s3.enabled && s3 && config.s3.bucket) {
    const key = `${server.id}/${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(4).toString('hex')}.tar.gz`;
    const body = fssync.createReadStream(tmpFile);
    await s3.send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: body, ServerSideEncryption: config.s3.sse || undefined }));
    await fs.unlink(tmpFile).catch(()=>{});
    const rec = await prisma.backup.create({ data: { serverId: server.id, storage: 'S3', s3Bucket: config.s3.bucket, s3Key: key, sizeBytes: size } });
    res.status(201).json(rec);
  } else {
    const bdir = backupsDir(server.id);
    await fs.mkdir(bdir, { recursive: true });
    const file = path.join(bdir, `${new Date().toISOString().replace(/[:.]/g,'-')}.tar.gz`);
    await fs.rename(tmpFile, file);
    const rec = await prisma.backup.create({ data: { serverId: server.id, storage: 'LOCAL', path: file, sizeBytes: size } });
    res.status(201).json(rec);
  }
}));

router.post('/:backupId/restore', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const backup = await prisma.backup.findFirst({ where: { id: req.params.backupId, serverId: server.id } });
  if (!backup) throw new HttpError(404, 'Бэкап не найден');
  const dir = serverDataPath(server.id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  if (backup.storage === 'S3') {
    if (!s3) throw new HttpError(500, 'S3 не настроен');
    const tmp = path.join('/tmp', `${server.id}-restore-${Date.now()}.tar.gz`);
    const resp = await s3.send(new GetObjectCommand({ Bucket: backup.s3Bucket!, Key: backup.s3Key! }));
    const stream = resp.Body as any as NodeJS.ReadableStream;
    await fs.writeFile(tmp, Buffer.from(await streamToBuffer(stream)));
    await tar.x({ file: tmp, cwd: dir });
    await fs.unlink(tmp).catch(()=>{});
  } else {
    await tar.x({ file: backup.path!, cwd: dir });
  }
  res.json({ ok: true });
}));

router.delete('/:backupId', authRequired, asyncHandler(async (req, res) => {
  const server = await prisma.server.findFirst({ where: { id: req.params.id, ownerId: req.user!.id } });
  if (!server) throw new HttpError(404, 'Сервер не найден');
  const backup = await prisma.backup.findFirst({ where: { id: req.params.backupId, serverId: server.id } });
  if (!backup) throw new HttpError(404, 'Бэкап не найден');
  if (backup.storage === 'S3') {
    if (!s3) throw new HttpError(500, 'S3 не настроен');
    await s3.send(new DeleteObjectCommand({ Bucket: backup.s3Bucket!, Key: backup.s3Key! }));
  } else {
    try { await fs.unlink(backup.path!); } catch {}
  }
  await prisma.backup.delete({ where: { id: backup.id } });
  res.json({ ok: true });
}));

async function streamToBuffer(stream: NodeJS.ReadableStream) {
  const chunks: any[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default router;
