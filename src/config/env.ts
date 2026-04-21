import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

import type { AppEnv } from '../types';

dotenv.config();

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'y', 'si', 'sí', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_VERSION: z.string().trim().min(1).default('1.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().trim().default('*'),
  AGENT_API_KEY: z.string().trim().min(16, 'AGENT_API_KEY debe tener al menos 16 caracteres.'),
  BUSINESS_TIMEZONE: z.string().trim().min(1).default('America/Lima'),
  BUSINESS_HOURS_START: z.string().trim().regex(/^\d{2}:\d{2}$/).default('09:00'),
  BUSINESS_HOURS_END: z.string().trim().regex(/^\d{2}:\d{2}$/).default('18:00'),
  DEFAULT_MEETING_DURATION_MINUTES: z.coerce.number().int().positive().default(30),
  GOOGLE_AUTH_MODE: z.enum(['service_account', 'oauth_user']).default('service_account'),
  GOOGLE_PROJECT_ID: z.string().trim().default(''),
  GOOGLE_CLIENT_EMAIL: z.string().trim().default(''),
  GOOGLE_PRIVATE_KEY: z.string().trim().default(''),
  GOOGLE_OAUTH_CLIENT_ID: z.string().trim().default(''),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().trim().default(''),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().trim().default('http://localhost:3000/auth/google/callback'),
  GOOGLE_CALENDAR_ID: z.string().trim().default(''),
  HANDOFF_PHONE: z.string().trim().default(''),
  BOOKING_REFERENCE: z.string().trim().default(''),
  DATA_DIR: z.string().trim().default('./data'),
  ENABLE_METRICS: booleanFromEnv.default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
}).superRefine((env, ctx) => {
  if (env.GOOGLE_AUTH_MODE === 'service_account') {
    if (!env.GOOGLE_PROJECT_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_PROJECT_ID'],
        message: 'GOOGLE_PROJECT_ID es obligatorio cuando GOOGLE_AUTH_MODE=service_account.',
      });
    }

    if (!env.GOOGLE_CLIENT_EMAIL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLIENT_EMAIL'],
        message: 'GOOGLE_CLIENT_EMAIL es obligatorio cuando GOOGLE_AUTH_MODE=service_account.',
      });
    } else if (!z.string().email().safeParse(env.GOOGLE_CLIENT_EMAIL).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CLIENT_EMAIL'],
        message: 'GOOGLE_CLIENT_EMAIL debe ser un email válido.',
      });
    }

    if (!env.GOOGLE_PRIVATE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_PRIVATE_KEY'],
        message: 'GOOGLE_PRIVATE_KEY es obligatorio cuando GOOGLE_AUTH_MODE=service_account.',
      });
    }

    if (!env.GOOGLE_CALENDAR_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_CALENDAR_ID'],
        message: 'GOOGLE_CALENDAR_ID es obligatorio cuando GOOGLE_AUTH_MODE=service_account.',
      });
    }
  }

  if (env.GOOGLE_AUTH_MODE === 'oauth_user') {
    if (!env.GOOGLE_OAUTH_CLIENT_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_OAUTH_CLIENT_ID'],
        message: 'GOOGLE_OAUTH_CLIENT_ID es obligatorio cuando GOOGLE_AUTH_MODE=oauth_user.',
      });
    }

    if (!env.GOOGLE_OAUTH_CLIENT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_OAUTH_CLIENT_SECRET'],
        message: 'GOOGLE_OAUTH_CLIENT_SECRET es obligatorio cuando GOOGLE_AUTH_MODE=oauth_user.',
      });
    }

    if (!env.GOOGLE_OAUTH_REDIRECT_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GOOGLE_OAUTH_REDIRECT_URI'],
        message: 'GOOGLE_OAUTH_REDIRECT_URI es obligatorio cuando GOOGLE_AUTH_MODE=oauth_user.',
      });
    }
  }
});

let cachedEnv: AppEnv | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Configuración de entorno inválida: ${issues}`);
  }

  return {
    ...parsed.data,
    GOOGLE_CALENDAR_ID: parsed.data.GOOGLE_CALENDAR_ID || (parsed.data.GOOGLE_AUTH_MODE === 'oauth_user' ? 'primary' : ''),
    DATA_DIR: path.resolve(parsed.data.DATA_DIR),
  };
}

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }

  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
