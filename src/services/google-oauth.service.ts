import type { Logger } from 'pino';

import { AppError, ValidationAppError } from '../lib/errors';
import { createGoogleOAuthClient, GOOGLE_OAUTH_USER_SCOPES } from '../lib/google-auth';
import { GoogleOAuthTokenRepository } from '../repositories/google-oauth-token.repository';
import type { AppEnv } from '../types';

type OAuthClientLike = {
  generateAuthUrl(options: {
    access_type: 'offline';
    include_granted_scopes: boolean;
    prompt: 'consent';
    scope: string[];
  }): string;
  getToken(code: string): Promise<{
    tokens: {
      refresh_token?: string | null;
    };
  }>;
};

type OAuthClientFactory = (env: AppEnv) => OAuthClientLike;

export class GoogleOAuthService {
  public constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
    private readonly tokenRepository: GoogleOAuthTokenRepository,
    private readonly oauthClientFactory: OAuthClientFactory = createGoogleOAuthClient,
  ) {}

  public async ensureConnectedIfRequired(): Promise<void> {
    await this.tokenRepository.ensureReady();

    if (this.env.GOOGLE_AUTH_MODE !== 'oauth_user') {
      return;
    }

    if (!(await this.tokenRepository.hasConnection())) {
      this.logger.error({
        event: 'google_oauth_not_connected',
        auth_mode: this.env.GOOGLE_AUTH_MODE,
        calendar_id: this.env.GOOGLE_CALENDAR_ID,
      });

      throw new AppError({
        message: 'Google OAuth user is not connected yet. Visit /auth/google/start first.',
        statusCode: 503,
        errorType: 'google_oauth_not_connected',
      });
    }
  }

  public getAuthorizationUrl(): string {
    this.ensureOAuthModeEnabled();

    const oauthClient = this.oauthClientFactory(this.env);
    const authorizationUrl = oauthClient.generateAuthUrl({
      access_type: 'offline',
      include_granted_scopes: true,
      prompt: 'consent',
      scope: GOOGLE_OAUTH_USER_SCOPES,
    });

    this.logger.info({
      event: 'google_oauth_start',
      auth_mode: this.env.GOOGLE_AUTH_MODE,
      redirect_uri: this.env.GOOGLE_OAUTH_REDIRECT_URI,
      calendar_id: this.env.GOOGLE_CALENDAR_ID,
    });

    return authorizationUrl;
  }

  public async handleCallback(code: string): Promise<{
    connected: true;
    auth_mode: 'oauth_user';
    calendar_id: string;
  }> {
    this.ensureOAuthModeEnabled();

    if (!code.trim()) {
      throw new ValidationAppError('Missing code query parameter for Google OAuth callback');
    }

    const oauthClient = this.oauthClientFactory(this.env);

    try {
      const { tokens } = await oauthClient.getToken(code);
      const refreshToken = tokens.refresh_token ?? await this.tokenRepository.getRefreshToken();

      if (!refreshToken) {
        throw new AppError({
          message: 'Google OAuth callback did not return a refresh token. Retry /auth/google/start with prompt=consent.',
          statusCode: 502,
          errorType: 'google_oauth_missing_refresh_token',
        });
      }

      if (tokens.refresh_token) {
        await this.tokenRepository.saveRefreshToken(tokens.refresh_token);
      }

      this.logger.info({
        event: 'google_oauth_callback_success',
        auth_mode: this.env.GOOGLE_AUTH_MODE,
        calendar_id: this.env.GOOGLE_CALENDAR_ID,
        stored_new_refresh_token: Boolean(tokens.refresh_token),
      });

      return {
        connected: true,
        auth_mode: 'oauth_user',
        calendar_id: this.env.GOOGLE_CALENDAR_ID,
      };
    } catch (error) {
      const rawError = error as {
        response?: {
          status?: unknown;
          data?: unknown;
        };
        message?: string;
      };

      this.logger.error({
        event: 'google_oauth_callback_failed',
        auth_mode: this.env.GOOGLE_AUTH_MODE,
        calendar_id: this.env.GOOGLE_CALENDAR_ID,
        status: rawError?.response?.status,
        data: rawError?.response?.data,
        message: rawError?.message,
      });

      if (error instanceof AppError || error instanceof ValidationAppError) {
        throw error;
      }

      throw new AppError({
        message: 'Google OAuth callback failed',
        statusCode: 502,
        errorType: 'google_oauth_callback_failed',
      });
    }
  }

  private ensureOAuthModeEnabled(): void {
    if (this.env.GOOGLE_AUTH_MODE !== 'oauth_user') {
      throw new AppError({
        message: 'Google OAuth routes are disabled unless GOOGLE_AUTH_MODE=oauth_user.',
        statusCode: 400,
        errorType: 'google_oauth_mode_disabled',
      });
    }
  }
}
