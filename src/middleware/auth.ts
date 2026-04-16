import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

import { AppMetrics } from '../config/metrics';
import { AuthAppError, ContentTypeAppError } from '../lib/errors';
import { maskApiKey } from '../lib/redaction';
import type { AppEnv } from '../types';

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createAgentAuthMiddleware(env: AppEnv, metrics: AppMetrics): RequestHandler {
  return (req, _res, next) => {
    const receivedApiKey = req.header('x-agent-api-key')?.trim();

    if (!receivedApiKey || !safeCompare(receivedApiKey, env.AGENT_API_KEY)) {
      req.authResult = 'failure';
      metrics.authFailuresTotal.inc();

      req.logger.warn({
        event: 'auth_failure',
        route: req.routeLabel ?? req.originalUrl,
        method: req.method,
        provided_api_key: maskApiKey(receivedApiKey),
      });

      next(new AuthAppError('Invalid X-Agent-API-Key header'));
      return;
    }

    req.authResult = 'success';
    next();
  };
}

export const requireJsonContentType: RequestHandler = (req, _res, next) => {
  if (req.method === 'POST' && !req.is('application/json')) {
    next(new ContentTypeAppError());
    return;
  }

  next();
};
