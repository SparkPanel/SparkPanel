import { Router } from 'express';
<<<<<<< HEAD
import authRoutes, { twoFaProtectedRoutes } from './auth/auth.controller';
import usersRoutes from './users/users.controller';
import serversRoutes from './servers/servers.controller';
import filesRoutes from './servers/files.controller';
import backupsRoutes from './servers/backups.controller';
import tasksRoutes from './servers/tasks.controller';
import { authRequired } from './auth/middleware';
=======
import authRoutes, { twoFaProtectedRoutes } from './auth/auth.controller.js';
import usersRoutes from './users/users.controller.js';
import serversRoutes from './servers/servers.controller.js';
import filesRoutes from './servers/files.controller.js';
import backupsRoutes from './servers/backups.controller.js';
import tasksRoutes from './servers/tasks.controller.js';
import { authRequired } from './auth/middleware.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e

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
