import pino, { type Logger } from 'pino';

import type { AppEnv } from '../types';

export function createLogger(env: AppEnv): Logger {
  return pino({
    name: 'alma-quinta-elevenlabs-backend',
    level: env.LOG_LEVEL,
    base: {
      service: 'alma-quinta-elevenlabs-backend',
      version: env.APP_VERSION,
      environment: env.NODE_ENV,
    },
    redact: {
      paths: [
        'headers.x-agent-api-key',
        'req.headers.x-agent-api-key',
        'agent_api_key',
        'google_private_key',
        'private_key',
      ],
      censor: '[REDACTED]',
    },
  });
}
