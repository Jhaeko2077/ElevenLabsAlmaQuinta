import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export function createRequestIdMiddleware(logger: Logger): RequestHandler {
  return (req, _res, next) => {
    const requestId = req.header('x-request-id')?.trim() || randomUUID();

    req.requestId = requestId;
    req.authResult = 'not_applicable';
    req.logger = logger.child({
      request_id: requestId,
    });

    next();
  };
}
