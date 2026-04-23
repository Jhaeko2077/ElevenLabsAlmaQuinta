import type { Logger } from 'pino';
import { google, type calendar_v3 } from 'googleapis';

import { AppError } from './errors';
import { GoogleOAuthTokenRepository } from '../repositories/google-oauth-token.repository';
import type { AppEnv } from '../types';

export const GOOGLE_SERVICE_ACCOUNT_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export const GOOGLE_OAUTH_USER_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
];

export function normalizeGooglePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n');
}

export function createServiceAccountGoogleCalendarClient(env: AppEnv): calendar_v3.Calendar {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      project_id: env.GOOGLE_PROJECT_ID,
      client_email: env.GOOGLE_CLIENT_EMAIL,
      private_key: normalizeGooglePrivateKey(env.GOOGLE_PRIVATE_KEY),
    },
    scopes: GOOGLE_SERVICE_ACCOUNT_SCOPES,
  });

  return google.calendar({
    version: 'v3',
    auth,
  });
}

export function createGoogleOAuthClient(env: AppEnv) {
  return new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

export async function createGoogleCalendarClient(params: {
  env: AppEnv;
  tokenRepository: GoogleOAuthTokenRepository;
  logger: Logger;
}): Promise<calendar_v3.Calendar> {
  const { env, tokenRepository, logger } = params;

  if (env.GOOGLE_AUTH_MODE === 'service_account') {
    return createServiceAccountGoogleCalendarClient(env);
  }

  const refreshToken = await tokenRepository.getRefreshToken();

  if (!refreshToken) {
    logger.error({
      event: 'google_oauth_not_connected',
      auth_mode: env.GOOGLE_AUTH_MODE,
      calendar_id: env.GOOGLE_CALENDAR_ID,
    });

    throw new AppError({
      message: 'Google OAuth user is not connected yet. Visit /auth/google/start first.',
      statusCode: 503,
      errorType: 'google_oauth_not_connected',
    });
  }

  const oauthClient = createGoogleOAuthClient(env);
  oauthClient.setCredentials({
    refresh_token: refreshToken,
  });

  return google.calendar({
    version: 'v3',
    auth: oauthClient,
  });
}
