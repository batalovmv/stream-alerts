import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export const addChatSchema = z.object({
  provider: z.enum(['telegram', 'max']),
  chatId: z.string().min(1).max(100).regex(/^-?\d+$|^@[\w]+$/, 'chatId must be a numeric ID or @username'),
});

export const updateChatSchema = z.object({
  enabled: z.boolean().optional(),
  deleteAfterEnd: z.boolean().optional(),
  customTemplate: z.string().max(2000).nullable().optional(),
});

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
