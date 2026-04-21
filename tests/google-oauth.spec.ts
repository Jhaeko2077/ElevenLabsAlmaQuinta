import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

describe('Google OAuth routes', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    await cleanupTempDataDir(dataDir);
  });

  it('redirects from /auth/google/start to the Google consent URL', async () => {
    const env = {
      ...createTestEnv(dataDir),
      GOOGLE_AUTH_MODE: 'oauth_user' as const,
      GOOGLE_CALENDAR_ID: 'primary',
    };
    const googleOAuthService = {
      getAuthorizationUrl: vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mock=1'),
      handleCallback: vi.fn(),
    } as never;
    const app = createApp({
      env,
      googleOAuthService,
    });

    const response = await request(app).get('/auth/google/start');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');
    expect((googleOAuthService as { getAuthorizationUrl: ReturnType<typeof vi.fn> }).getAuthorizationUrl).toHaveBeenCalledTimes(1);
  });

  it('handles /auth/google/callback successfully', async () => {
    const env = {
      ...createTestEnv(dataDir),
      GOOGLE_AUTH_MODE: 'oauth_user' as const,
      GOOGLE_CALENDAR_ID: 'primary',
    };
    const googleOAuthService = {
      getAuthorizationUrl: vi.fn(),
      handleCallback: vi.fn().mockResolvedValue({
        connected: true,
        auth_mode: 'oauth_user',
        calendar_id: 'primary',
      }),
    } as never;
    const app = createApp({
      env,
      googleOAuthService,
    });

    const response = await request(app).get('/auth/google/callback?code=test-code');

    expect(response.status).toBe(200);
    expect(response.text).toBe('Google Calendar connected successfully');
    expect((googleOAuthService as { handleCallback: ReturnType<typeof vi.fn> }).handleCallback).toHaveBeenCalledWith('test-code');
  });

  it('returns a clear readiness error when oauth_user has no refresh token yet', async () => {
    const env = {
      ...createTestEnv(dataDir),
      GOOGLE_AUTH_MODE: 'oauth_user' as const,
      GOOGLE_CALENDAR_ID: 'primary',
    };
    const app = createApp({ env });

    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body.error.type).toBe('readiness_error');
    expect(response.body.error.details.message).toContain('/auth/google/start');
  });
});
