import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createLogger } from '../src/config/logger';
import { createMetrics } from '../src/config/metrics';
import type { AppEnv } from '../src/types';

export async function createTempDataDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'alma-quinta-elevenlabs-'));
}

export async function cleanupTempDataDir(dataDir: string): Promise<void> {
  await rm(dataDir, { recursive: true, force: true });
}

export function createTestEnv(dataDir: string): AppEnv {
  return {
    NODE_ENV: 'test',
    PORT: 3001,
    APP_VERSION: 'test',
    LOG_LEVEL: 'fatal',
    CORS_ORIGIN: '*',
    AGENT_API_KEY: 'test-agent-api-key-1234567890',
    BUSINESS_TIMEZONE: 'America/Lima',
    BUSINESS_HOURS_START: '09:00',
    BUSINESS_HOURS_END: '18:00',
    DEFAULT_MEETING_DURATION_MINUTES: 30,
    GOOGLE_PROJECT_ID: 'test-project',
    GOOGLE_CLIENT_EMAIL: 'calendar-service@test-project.iam.gserviceaccount.com',
    GOOGLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nTEST\\n-----END PRIVATE KEY-----\\n',
    GOOGLE_CALENDAR_ID: 'test-calendar@group.calendar.google.com',
    HANDOFF_PHONE: '+51999888777',
    BOOKING_REFERENCE: 'https://agenda.almaquinta.test',
    DATA_DIR: dataDir,
    ENABLE_METRICS: true,
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
  };
}

export function createTestLoggerAndMetrics(env: AppEnv) {
  return {
    logger: createLogger(env),
    metrics: createMetrics(env),
  };
}
