import { NextFunction, Request, Response } from 'express';
<<<<<<< HEAD
import { logger } from './logger';
=======
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function assert(condition: any, status: number, message: string) {
  if (!condition) throw new HttpError(status, message);
}

<<<<<<< HEAD
export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, 'Не найдено'));
}

export function errorMiddleware(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    if (err.status >= 500) {
      logger.error({ err }, 'HttpError %d: %s', err.status, err.message);
    } else {
      logger.warn({ err }, 'HttpError %d: %s', err.status, err.message);
    }
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({ error: 'Internal Server Error' });
}
=======
export function errorMiddleware(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal Server Error' });
} 
>>>>>>> ec0bee2093debd91b8e478d60a23a89dd16b809e
