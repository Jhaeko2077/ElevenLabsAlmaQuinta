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
  GOOGLE_PROJECT_ID: z.string().trim().min(1),
  GOOGLE_CLIENT_EMAIL: z.string().trim().email(),
  GOOGLE_PRIVATE_KEY: z.string().trim().min(1),
  GOOGLE_CALENDAR_ID: z.string().trim().min(1),
  HANDOFF_PHONE: z.string().trim().default(''),
  BOOKING_REFERENCE: z.string().trim().default(''),
  DATA_DIR: z.string().trim().default('./data'),
  ENABLE_METRICS: booleanFromEnv.default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
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
