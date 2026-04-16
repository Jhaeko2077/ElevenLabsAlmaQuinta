import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';

import { createLogger } from './config/logger';
import { AppMetrics, createMetrics } from './config/metrics';
import { getEnv } from './config/env';
import { ElevenLabsController } from './controllers/elevenlabs.controller';
import { RateLimitAppError } from './lib/errors';
import { createAgentAuthMiddleware } from './middleware/auth';
import { createErrorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { createRequestIdMiddleware } from './middleware/request-id';
import { HandoffRepository } from './repositories/handoff.repository';
import { IdempotencyRepository } from './repositories/idempotency.repository';
import { LeadRepository } from './repositories/lead.repository';
import { createElevenLabsRouter } from './routes/elevenlabs';
import { createHealthRouter } from './routes/health';
import { createMetricsRouter } from './routes/metrics';
import { AvailabilityService } from './services/availability.service';
import { CalendarService } from './services/calendar.service';
import { HandoffService } from './services/handoff.service';
import { LeadService } from './services/lead.service';
import type { AppEnv } from './types';

export interface AppDependencies {
  env: AppEnv;
  logger: Logger;
  metrics: AppMetrics;
  leadRepository: LeadRepository;
  handoffRepository: HandoffRepository;
  idempotencyRepository: IdempotencyRepository;
  calendarService: CalendarService;
  availabilityService: AvailabilityService;
  leadService: LeadService;
  handoffService: HandoffService;
  controller: ElevenLabsController;
}

function parseCorsOrigins(corsOrigin: string): string[] | '*' {
  if (corsOrigin.trim() === '*') {
    return '*';
  }

  return corsOrigin
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createCorsMiddleware(env: AppEnv): RequestHandler {
  const allowedOrigins = parseCorsOrigins(env.CORS_ORIGIN);

  return cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins === '*' || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
  });
}

function createRateLimitMiddleware(env: AppEnv): RequestHandler {
  const store = new Map<string, { count: number; resetAt: number }>();

  return (req, _res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const current = store.get(ip);

    if (!current || current.resetAt <= now) {
      store.set(ip, {
        count: 1,
        resetAt: now + env.RATE_LIMIT_WINDOW_MS,
      });
      next();
      return;
    }

    if (current.count >= env.RATE_LIMIT_MAX_REQUESTS) {
      next(new RateLimitAppError());
      return;
    }

    current.count += 1;
    store.set(ip, current);
    next();
  };
}

function createRequestLifecycleMiddleware(metrics: AppMetrics): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();

    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route = req.routeLabel ?? req.originalUrl.split('?')[0] ?? 'unknown';

      metrics.recordHttpRequest({
        method: req.method,
        route,
        statusCode: res.statusCode,
        durationMs,
      });

      req.logger.info({
        request_id: req.requestId,
        route,
        method: req.method,
        tool_name: req.toolName,
        duration_ms: Number(durationMs.toFixed(2)),
        status_code: res.statusCode,
        auth_result: req.authResult ?? 'not_applicable',
        error_type: res.locals.errorType,
      });
    });

    next();
  };
}

export function createAppDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  const env = overrides.env ?? getEnv();
  const logger = overrides.logger ?? createLogger(env);
  const metrics = overrides.metrics ?? createMetrics(env);
  const leadRepository = overrides.leadRepository ?? new LeadRepository(env.DATA_DIR);
  const handoffRepository = overrides.handoffRepository ?? new HandoffRepository(env.DATA_DIR);
  const idempotencyRepository = overrides.idempotencyRepository ?? new IdempotencyRepository(env.DATA_DIR);
  const calendarService = overrides.calendarService ?? new CalendarService(
    env,
    metrics,
    logger,
    idempotencyRepository,
  );
  const availabilityService = overrides.availabilityService ?? new AvailabilityService(
    env,
    metrics,
    calendarService,
  );
  const leadService = overrides.leadService ?? new LeadService(leadRepository, metrics);
  const handoffService = overrides.handoffService ?? new HandoffService(handoffRepository, metrics, env);
  const controller = overrides.controller ?? new ElevenLabsController(
    metrics,
    availabilityService,
    calendarService,
    leadService,
    handoffService,
  );

  return {
    env,
    logger,
    metrics,
    leadRepository,
    handoffRepository,
    idempotencyRepository,
    calendarService,
    availabilityService,
    leadService,
    handoffService,
    controller,
  };
}

export function createApp(overrides: Partial<AppDependencies> = {}): Express {
  const dependencies = createAppDependencies(overrides);
  const authMiddleware = createAgentAuthMiddleware(dependencies.env, dependencies.metrics);
  const app = express();

  app.disable('x-powered-by');
  app.use(createRequestIdMiddleware(dependencies.logger));
  app.use(createRequestLifecycleMiddleware(dependencies.metrics));
  app.use(helmet());
  app.use(createCorsMiddleware(dependencies.env));
  app.use(createRateLimitMiddleware(dependencies.env));
  app.use(express.json({
    limit: '100kb',
    type: ['application/json', 'application/*+json'],
  }));

  app.use(createHealthRouter({
    env: dependencies.env,
    calendarService: dependencies.calendarService,
    leadRepository: dependencies.leadRepository,
    handoffRepository: dependencies.handoffRepository,
    idempotencyRepository: dependencies.idempotencyRepository,
  }));
  app.use(createMetricsRouter(dependencies.metrics, dependencies.env.ENABLE_METRICS));
  app.use(createElevenLabsRouter({
    authMiddleware,
    controller: dependencies.controller,
    metrics: dependencies.metrics,
  }));

  app.use(notFoundHandler);
  app.use(createErrorHandler(dependencies.metrics, dependencies.env.NODE_ENV));

  return app;
}
