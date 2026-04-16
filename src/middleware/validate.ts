import type { RequestHandler } from 'express';
import type { AnyZodObject, ZodSchema } from 'zod';

import { ValidationAppError } from '../lib/errors';

function toSchema(schema: ZodSchema | AnyZodObject): ZodSchema {
  return schema;
}

export function validate(schema: ZodSchema | AnyZodObject, toolName: string): RequestHandler {
  const targetSchema = toSchema(schema);

  return (req, _res, next) => {
    const result = targetSchema.safeParse(req.body);

    if (!result.success) {
      next(new ValidationAppError(`Invalid payload for ${toolName}`, result.error.flatten()));
      return;
    }

    req.validatedBody = result.data;
    next();
  };
}
