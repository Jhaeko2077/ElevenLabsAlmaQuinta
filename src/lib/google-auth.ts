import { google, type calendar_v3 } from 'googleapis';

import type { AppEnv } from '../types';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export function normalizeGooglePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n');
}

export function createGoogleCalendarClient(env: AppEnv): calendar_v3.Calendar {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      project_id: env.GOOGLE_PROJECT_ID,
      client_email: env.GOOGLE_CLIENT_EMAIL,
      private_key: normalizeGooglePrivateKey(env.GOOGLE_PRIVATE_KEY),
    },
    scopes: GOOGLE_CALENDAR_SCOPES,
  });

  return google.calendar({
    version: 'v3',
    auth,
  });
}
