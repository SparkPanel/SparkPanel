import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

type Part = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema<any>, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = (schema as any).parse((req as any)[part]);
      (req as any)[part] = data;
      next();
    } catch (e: any) {
      if (e?.issues) {
        return next({ status: 400, message: 'Неверные данные', details: e.issues });
      }
      next(e);
    }
  };
}
