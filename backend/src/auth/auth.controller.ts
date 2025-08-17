<<<<<<< HEAD
import { asyncHandler } from '../utils/asyncHandler';
import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config';
import { HttpError, assert } from '../utils/errors';
import { emailSchema, passwordSchema, usernameSchema } from '../utils/validators';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt';
import { sendEmail, resetEmailTemplate, verificationEmailTemplate } from './email';
import { generateTwoFaSecret, generateQrDataUrl, verifyTwoFaToken } from './twofa';
=======
import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config.js';
import { HttpError, assert } from '../utils/errors.js';
import { emailSchema, passwordSchema, usernameSchema } from '../utils/validators.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from './jwt.js';
import { sendEmail, resetEmailTemplate, verificationEmailTemplate } from './email.js';
import { generateTwoFaSecret, generateQrDataUrl, verifyTwoFaToken } from './twofa.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e

const router = Router();

const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
});

<<<<<<< HEAD
\1asyncHandler(async (\2) => {
=======
router.post('/register', async (req: Request, res: Response) => {
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
  const data = registerSchema.parse(req.body);
  const exists = await prisma.user.findFirst({ where: { OR: [{ email: data.email }, { username: data.username }] } });
  assert(!exists, 400, 'Пользователь с таким email или именем уже существует');
  const hash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({ data: { email: data.email, username: data.username, passwordHash: hash } });
  const userRole = await prisma.role.upsert({ where: { name: 'USER' }, update: {}, create: { name: 'USER' } });
  await prisma.user.update({ where: { id: user.id }, data: { roles: { connect: { id: userRole.id } } } });
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
  await prisma.emailVerificationToken.create({ data: { userId: user.id, token, expiresAt } });
  const link = `${config.apiBaseUrl}/api/auth/verify-email?token=${token}`;
  await sendEmail(user.email, 'Подтверждение email', verificationEmailTemplate(link));
  res.status(201).json({ ok: true });
});

<<<<<<< HEAD
\1asyncHandler(async (\2) => {
=======
router.get('/verify-email', async (req: Request, res: Response) => {
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
  const token = String(req.query.token || '');
  assert(token, 400, 'Токен обязателен');
  const record = await prisma.emailVerificationToken.findUnique({ where: { token } });
  assert(record && record.expiresAt > new Date(), 400, 'Неверный или просроченный токен');
  await prisma.user.update({ where: { id: record.userId }, data: { isEmailVerified: true } });
  await prisma.emailVerificationToken.delete({ where: { id: record.id } });
  res.json({ ok: true });
});

const loginSchema = z.object({
  login: z.string(),
  password: passwordSchema,
  twoFactorToken: z.string().optional(),
});

function setRefreshCookie(res: Response, token: string) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: '/api/auth',
<<<<<<< HEAD
  
    path: '/api/auth',
  });
}

\1asyncHandler(async (\2) => {
=======
  });
}

router.post('/login', async (req: Request, res: Response) => {
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
  const data = loginSchema.parse(req.body);
  const user = await prisma.user.findFirst({ where: { OR: [{ email: data.login }, { username: data.login }] }, include: { roles: true } });
  assert(user, 401, 'Неверные учетные данные');
  assert(user!.isEmailVerified, 401, 'Подтвердите email перед входом');
  const valid = await bcrypt.compare(data.password, user!.passwordHash);
  assert(valid, 401, 'Неверные учетные данные');
  if (user!.twoFaEnabled) {
    assert(data.twoFactorToken, 401, 'Требуется код 2FA');
    assert(verifyTwoFaToken(user!.twoFaSecret!, data.twoFactorToken!), 401, 'Неверный код 2FA');
  }
  const roles = user!.roles.map(r => r.name);
  const access = signAccessToken(user!.id, roles);
  const refresh = signRefreshToken(user!.id, roles);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await prisma.session.create({ data: { userId: user!.id, refreshToken: refresh, expiresAt, userAgent: req.headers['user-agent'] ?? undefined, ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined } });
  setRefreshCookie(res, refresh);
  res.json({ accessToken: access, user: { id: user!.id, email: user!.email, username: user!.username, roles } });
});

<<<<<<< HEAD
\1asyncHandler(async (\2) => {
=======
router.post('/refresh', async (req: Request, res: Response) => {
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
  const token = (req as any).cookies?.refresh_token || (req.body as any)?.refreshToken;
  assert(token, 401, 'Нет refresh токена');
  const payload = verifyRefreshToken(token);
  const session = await prisma.session.findUnique({ where: { refreshToken: token } });
  assert(session && session.expiresAt > new Date(), 401, 'Сессия недействительна');
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { roles: true } });
  assert(user, 401, 'Пользователь не найден');
  const roles = user!.roles.map(r => r.name);
  const newAccess = signAccessToken(user!.id, roles);
  const newRefresh = signRefreshToken(user!.id, roles);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await prisma.session.update({ where: { id: session!.id }, data: { refreshToken: newRefresh, expiresAt } });
  setRefreshCookie(res, newRefresh);
  res.json({ accessToken: newAccess });
});

<<<<<<< HEAD
\1asyncHandler(async (\2) => {
=======
router.post('/logout', async (req: Request, res: Response) => {
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
  const token = (req as any).cookies?.refresh_token || (req.body as any)?.refreshToken;
  if (token) {
    await prisma.session.deleteMany({ where: { refreshToken: token } });
    res.clearCookie('refresh_token', { path: '/api/auth' });
  }
  res.json({ ok: true });
});

export function twoFaProtectedRoutes() {
  const r = Router();
  r.post('/2fa/setup', async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    const secret = generateTwoFaSecret(user!.username);
    await prisma.user.update({ where: { id: user!.id }, data: { twoFaSecret: secret.base32 } });
    const qr = await generateQrDataUrl(secret.otpauth_url!);
    res.json({ otpauthUrl: secret.otpauth_url, qrDataUrl: qr, base32: secret.base32 });
  });
  r.post('/2fa/enable', async (req: Request, res: Response) => {
    const schema = z.object({ token: z.string() });
    const data = schema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    assert(user?.twoFaSecret, 400, 'Секрет 2FA не сгенерирован');
    assert(verifyTwoFaToken(user!.twoFaSecret!, data.token), 400, 'Неверный код');
    await prisma.user.update({ where: { id: user!.id }, data: { twoFaEnabled: true } });
    res.json({ ok: true });
  });
  r.post('/2fa/disable', async (req: Request, res: Response) => {
    const schema = z.object({ token: z.string() });
    const data = schema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    assert(user?.twoFaSecret, 400, '2FA ещё не включена');
    assert(verifyTwoFaToken(user!.twoFaSecret!, data.token), 400, 'Неверный код');
    await prisma.user.update({ where: { id: user!.id }, data: { twoFaEnabled: false, twoFaSecret: null } });
    res.json({ ok: true });
  });
  return r;
}

<<<<<<< HEAD
\1asyncHandler(async (\2) => {
=======
router.post('/request-password-reset', async (req, res) => {
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
  const schema = z.object({ login: z.string() });
  const { login } = schema.parse(req.body);
  const user = await prisma.user.findFirst({ where: { OR: [{ email: login }, { username: login }] } });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await prisma.passwordResetToken.create({ data: { userId: user.id, token, expiresAt } });
    const link = `${config.baseUrl}/reset-password?token=${token}`;
    await sendEmail(user.email, 'Сброс пароля', resetEmailTemplate(link));
  }
  res.json({ ok: true });
});

<<<<<<< HEAD
\1asyncHandler(async (\2) => {
=======
router.post('/reset-password', async (req, res) => {
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
  const schema = z.object({ token: z.string(), password: passwordSchema });
  const { token, password } = schema.parse(req.body);
  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  assert(record && record.expiresAt > new Date(), 400, 'Неверный или просроченный токен');
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hash } });
  await prisma.passwordResetToken.delete({ where: { id: record.id } });
  // revoke sessions
  await prisma.session.deleteMany({ where: { userId: record.userId } });
  res.json({ ok: true });
});

export default router;
