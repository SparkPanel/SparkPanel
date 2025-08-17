import cron from 'node-cron';
<<<<<<< HEAD
import { prisma } from './db';
import { serverDataPath, createOrStartContainer, stopContainer } from './servers/docker';
=======
import { prisma } from './db.js';
import { serverDataPath, createOrStartContainer, stopContainer } from './servers/docker.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
import tar from 'tar';
import path from 'path';
import fs from 'fs/promises';
import fssync from 'fs';
<<<<<<< HEAD
import { config } from './config';
=======
import { config } from './config.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = config.s3.enabled ? new S3Client({
  region: config.s3.region,
  endpoint: config.s3.endpoint || undefined,
  forcePathStyle: config.s3.pathStyle,
  credentials: config.s3.accessKeyId ? { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey } : undefined,
}) : null;

async function runBackup(serverId: string) {
  const dir = serverDataPath(serverId);
  const bdir = path.join(dir, '..', `${serverId}_backups`);
  await fs.mkdir(bdir, { recursive: true });
  const file = path.join(bdir, `${new Date().toISOString().replace(/[:.]/g,'-')}.tar.gz`);
  await tar.c({ gzip: true, file, cwd: dir }, ['.']);
  const size = fssync.statSync(file).size;
  await prisma.backup.create({ data: { serverId, storage: 'LOCAL', path: file, sizeBytes: size } });
}

async function runRestart(serverId: string) {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) return;
  await stopContainer(serverId);
  await createOrStartContainer({ id: server.id, name: server.name, image: server.image, version: server.version, type: server.type, cpuLimit: server.cpuLimit ?? undefined, memoryLimitMb: server.memoryLimitMb ?? undefined, port: server.port, rconEnabled: server.rconEnabled, rconPort: server.rconPort ?? undefined, rconPassword: server.rconPassword ?? undefined });
}

async function enforceBackupRetention() {
  const maxDays = config.backupRetention.days;
  const maxCount = config.backupRetention.maxCountPerServer;
  const servers = await prisma.server.findMany({ select: { id: true } });
  const now = Date.now();
  for (const s of servers) {
    const backups = await prisma.backup.findMany({ where: { serverId: s.id }, orderBy: { createdAt: 'desc' } });
    const toDelete: typeof backups = [];
    // по сроку
    for (const b of backups) {
      if (now - new Date(b.createdAt).getTime() > maxDays * 24 * 60 * 60 * 1000) toDelete.push(b);
    }
    // по количеству (оставить первые maxCount)
    if (backups.length - toDelete.length > maxCount) {
      const extras = backups.slice(maxCount).filter(b => !toDelete.find(x => x.id === b.id));
      toDelete.push(...extras);
    }
    for (const b of toDelete) {
      try {
        if (b.storage === 'S3') {
          if (s3 && b.s3Bucket && b.s3Key) await s3.send(new DeleteObjectCommand({ Bucket: b.s3Bucket, Key: b.s3Key }));
        } else if (b.path) {
          try { await fs.unlink(b.path); } catch {}
        }
        await prisma.backup.delete({ where: { id: b.id } });
      } catch (e) {
        console.error('Retention delete failed', b.id, e);
      }
    }
  }
}

export function startScheduler() {
  // индивидуальные задачи
  (async () => {
    const tasks = await prisma.task.findMany({ where: { enabled: true } });
    for (const t of tasks) {
      try {
        if (!cron.validate(t.cron)) continue;
        cron.schedule(t.cron, async () => {
          if (t.type === 'BACKUP') await runBackup(t.serverId);
          if (t.type === 'RESTART') await runRestart(t.serverId);
          await prisma.task.update({ where: { id: t.id }, data: { lastRunAt: new Date() } });
        });
      } catch (e) {
        console.error('Failed to schedule task', t.id, e);
      }
    }
  })();

  // ретеншн — ежедневная очистка
  cron.schedule('0 4 * * *', async () => {
    try { await enforceBackupRetention(); } catch (e) { console.error('Retention error', e); }
  });
}
