import { Router } from 'express';

import { asyncHandler } from '../lib/errors';
import { GoogleOAuthService } from '../services/google-oauth.service';

export function createAuthRouter(dependencies: {
  googleOAuthService: GoogleOAuthService;
}): Router {
  const router = Router();

  router.get('/auth/google/start', (req, res) => {
    req.routeLabel = '/auth/google/start';
    const authorizationUrl = dependencies.googleOAuthService.getAuthorizationUrl();
    res.redirect(302, authorizationUrl);
  });

  router.get('/auth/google/callback', asyncHandler(async (req, res) => {
    req.routeLabel = '/auth/google/callback';
    const code = typeof req.query.code === 'string' ? req.query.code : '';

    await dependencies.googleOAuthService.handleCallback(code);

    res.status(200).send('Google Calendar connected successfully');
  }));

  return router;
}
