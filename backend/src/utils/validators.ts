import { z } from 'zod';

export const emailSchema = z.string().email();
export const usernameSchema = z.string().min(3).max(32).regex(/^[a-zA-Z0-9_\-]+$/);
export const passwordSchema = z.string().min(8).max(128);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().optional(),
}); 