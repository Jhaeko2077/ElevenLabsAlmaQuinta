import { Router } from 'express';

import { AppError } from '../lib/errors';
import type { AppEnv } from '../types';

export function createHealthRouter(dependencies: {
  env: AppEnv;
  calendarService: { checkReady(): Promise<void> };
  leadRepository: { ensureReady(): Promise<void> };
  handoffRepository: { ensureReady(): Promise<void> };
  idempotencyRepository: { ensureReady(): Promise<void> };
}): Router {
  const router = Router();

  router.get('/', (req, res) => {
    req.routeLabel = '/';

    res.json({
      service: 'alma-quinta-elevenlabs-backend',
      version: dependencies.env.APP_VERSION,
      environment: dependencies.env.NODE_ENV,
      uptime: process.uptime(),
    });
  });

  router.get('/health/live', (req, res) => {
    req.routeLabel = '/health/live';

    res.json({
      ok: true,
      status: 'live',
      service: 'alma-quinta-elevenlabs-backend',
    });
  });

  router.get('/health/ready', async (req, res, next) => {
    req.routeLabel = '/health/ready';

    try {
      await Promise.all([
        dependencies.leadRepository.ensureReady(),
        dependencies.handoffRepository.ensureReady(),
        dependencies.idempotencyRepository.ensureReady(),
        dependencies.calendarService.checkReady(),
      ]);

      res.json({
        ok: true,
        status: 'ready',
        checks: {
          config_loaded: true,
          data_directory_accessible: true,
          google_client_initializable: true,
        },
      });
    } catch (error) {
      next(new AppError({
        message: 'Service not ready',
        statusCode: 503,
        errorType: 'readiness_error',
        details: error instanceof Error ? { message: error.message } : undefined,
      }));
    }
  });

  return router;
}
