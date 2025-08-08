import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import { config, isProd } from './config.js';
import routes from './routes.js';
import { errorMiddleware } from './utils/errors.js';
import { prisma } from './db.js';
import { verifyAccessToken } from './auth/jwt.js';
import { getStats } from './servers/docker.js';

async function seed() {
  for (const name of ['ADMIN', 'MODERATOR', 'USER']) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  // optional bootstrap admin
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const bcrypt = await import('bcryptjs');
    let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) {
      const hash = await bcrypt.default.hash(adminPassword, 10);
      admin = await prisma.user.create({ data: { email: adminEmail, username: 'admin', passwordHash: hash, isEmailVerified: true } });
      const role = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
      await prisma.user.update({ where: { id: admin.id }, data: { roles: { connect: { id: role!.id } } } });
      console.log('Создан админ-пользователь');
    }
  }
}

async function bootstrap() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.baseUrl, credentials: true }));
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  app.use('/api', routes);

  app.use(errorMiddleware);

  const server = http.createServer(app);
  const io = new IOServer(server, { cors: { origin: config.baseUrl, credentials: true } });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token || typeof token !== 'string') return next(new Error('unauthorized'));
      const payload = verifyAccessToken(token);
      (socket as any).user = { id: payload.sub, roles: payload.roles };
      next();
    } catch (e) {
      next(new Error('unauthorized'));
    }
  });

  const intervals = new Map<string, NodeJS.Timer>();

  io.on('connection', (socket) => {
    socket.on('watch_server', async (serverId: string) => {
      // ensure user owns this server
      const server = await prisma.server.findFirst({ where: { id: serverId, ownerId: (socket as any).user.id } });
      if (!server) return;
      const key = `${socket.id}:${serverId}`;
      if (intervals.has(key)) return;
      const timer = setInterval(async () => {
        const stats = await getStats(serverId);
        socket.emit('server_stats', { serverId, stats });
      }, 2000);
      intervals.set(key, timer);
    });

    socket.on('unwatch_server', (serverId: string) => {
      const key = `${socket.id}:${serverId}`;
      const t = intervals.get(key);
      if (t) { clearInterval(t); intervals.delete(key); }
    });

    socket.on('disconnect', () => {
      for (const [key, t] of intervals) {
        if (key.startsWith(socket.id + ':')) { clearInterval(t); intervals.delete(key); }
      }
    });
  });

  await seed();

  server.listen(config.port, () => {
    console.log(`SparkPanel backend запущен на порту ${config.port} (${isProd ? 'prod' : 'dev'})`);
  });
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
