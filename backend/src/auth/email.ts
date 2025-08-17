import nodemailer from 'nodemailer';
<<<<<<< HEAD
import { config } from '../config';
=======
import { config } from '../config.js';
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

export async function sendEmail(to: string, subject: string, html: string) {
  if (!config.smtp.host) return; // silently ignore if SMTP disabled
  await transporter.sendMail({ from: config.smtp.from, to, subject, html });
}

export function verificationEmailTemplate(link: string) {
  return `<p>Здравствуйте! Подтвердите ваш email для SparkPanel.</p><p><a href="${link}">Подтвердить</a></p>`;
}

export function resetEmailTemplate(link: string) {
  return `<p>Вы запросили восстановление пароля.</p><p><a href="${link}">Сбросить пароль</a></p>`;
} 