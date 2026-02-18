import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/** UUID v4 format regex for route params */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const addChatSchema = z.object({
  provider: z.enum(['telegram', 'max']),
  chatId: z.string().min(1).max(100).regex(/^-?\d+$|^@[\w]+$/, 'chatId must be a numeric ID or @username'),
});

export const updateChatSchema = z.object({
  enabled: z.boolean().optional(),
  deleteAfterEnd: z.boolean().optional(),
  customTemplate: z.string().max(2000).nullable().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);

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

/** Validate that req.params.id is a valid UUID */
export function validateIdParam(req: Request, res: Response, next: NextFunction): void {
  const id = String(req.params.id);
  if (!UUID_REGEX.test(id)) {
    res.status(400).json({ error: 'Invalid ID format' });
    return;
  }
  next();
}
