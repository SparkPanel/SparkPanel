import { Router } from 'express';
import authRoutes, { twoFaProtectedRoutes } from './auth/auth.controller';
import usersRoutes from './users/users.controller';
import serversRoutes from './servers/servers.controller';
import filesRoutes from './servers/files.controller';
import backupsRoutes from './servers/backups.controller';
import tasksRoutes from './servers/tasks.controller';
import { authRequired } from './auth/middleware';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true }));
router.use('/auth', authRoutes);
router.use('/auth', authRequired, twoFaProtectedRoutes());
router.use('/users', usersRoutes);
router.use('/servers', serversRoutes);
router.use('/servers/:id/files', filesRoutes);
router.use('/servers/:id/backups', backupsRoutes);
router.use('/servers/:id/tasks', tasksRoutes);

export default router;
