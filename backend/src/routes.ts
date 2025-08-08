import { Router } from 'express';
import authRoutes, { twoFaProtectedRoutes } from './auth/auth.controller.js';
import usersRoutes from './users/users.controller.js';
import serversRoutes from './servers/servers.controller.js';
import filesRoutes from './servers/files.controller.js';
import { authRequired } from './auth/middleware.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true }));
router.use('/auth', authRoutes);
router.use('/auth', authRequired, twoFaProtectedRoutes());
router.use('/users', usersRoutes);
router.use('/servers', serversRoutes);
router.use('/servers/:id/files', filesRoutes);

export default router;
