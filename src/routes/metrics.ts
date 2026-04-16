import { Router } from 'express';

import { AppMetrics } from '../config/metrics';

export function createMetricsRouter(metrics: AppMetrics, enabled: boolean): Router {
  const router = Router();

  router.get('/metrics', async (req, res) => {
    req.routeLabel = '/metrics';

    if (!enabled) {
      res.type('text/plain').send('# metrics disabled\n');
      return;
    }

    res.setHeader('Content-Type', metrics.register.contentType);
    res.send(await metrics.register.metrics());
  });

  return router;
}
