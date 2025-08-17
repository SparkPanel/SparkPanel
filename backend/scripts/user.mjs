#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function help() {
  console.log(`Usage:
  node scripts/user.mjs create --email <email> --username <name> --password <pass>
  node scripts/user.mjs admin --login <email|username>
  node scripts/user.mjs reset-password --login <email|username> --password <newPass>
`);
}

function arg(key) {
  const i = process.argv.indexOf(key);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const cmd = process.argv[2];

(async () => {
  try {
    if (!cmd) { help(); process.exit(1); }

    if (cmd === 'create') {
      const email = arg('--email');
      const username = arg('--username');
      const password = arg('--password');
      if (!email || !username || !password) { help(); process.exit(1); }
      const hash = await bcrypt.hash(password, 10);
      let user = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
      if (!user) {
        user = await prisma.user.create({ data: { email, username, passwordHash: hash, isEmailVerified: true } });
      }
      const role = await prisma.role.upsert({ where: { name: 'USER' }, update: {}, create: { name: 'USER' } });
      await prisma.user.update({ where: { id: user.id }, data: { roles: { connect: { id: role.id } } } });
      console.log('Created/updated user id:', user.id);
      process.exit(0);
    }

    if (cmd === 'admin') {
      const login = arg('--login');
      if (!login) { help(); process.exit(1); }
      const user = await prisma.user.findFirst({ where: { OR: [{ email: login }, { username: login }] } });
      if (!user) throw new Error('User not found');
      const role = await prisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN' } });
      await prisma.user.update({ where: { id: user.id }, data: { roles: { connect: { id: role.id } } } });
      console.log('Granted ADMIN to:', user.id);
      process.exit(0);
    }

    if (cmd === 'reset-password') {
      const login = arg('--login');
      const newPassword = arg('--password');
      if (!login || !newPassword) { help(); process.exit(1); }
      const user = await prisma.user.findFirst({ where: { OR: [{ email: login }, { username: login }] } });
      if (!user) throw new Error('User not found');
      const hash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
      await prisma.session.deleteMany({ where: { userId: user.id } });
      console.log('Password reset for:', user.id);
      process.exit(0);
    }

    help();
    process.exit(1);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
