import pino from 'pino';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level,
  transport: isProd ? undefined : {
    target: 'pino-pretty',
    options: { translateTime: true, singleLine: true }
  },
  base: undefined
});
