import type { Logger } from 'pino';

export const LEAD_STATUSES = [
  'nuevo',
  'calificando',
  'cotizacion_solicitada',
  'reunion_en_proceso',
  'reunion_agendada',
  'escalado',
  'cerrado',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type GoogleAuthMode = 'service_account' | 'oauth_user';

export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  APP_VERSION: string;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  CORS_ORIGIN: string;
  AGENT_API_KEY: string;
  BUSINESS_TIMEZONE: string;
  BUSINESS_HOURS_START: string;
  BUSINESS_HOURS_END: string;
  DEFAULT_MEETING_DURATION_MINUTES: number;
  GOOGLE_AUTH_MODE: GoogleAuthMode;
  GOOGLE_PROJECT_ID: string;
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GOOGLE_OAUTH_REDIRECT_URI: string;
  GOOGLE_CALENDAR_ID: string;
  HANDOFF_PHONE: string;
  BOOKING_REFERENCE: string;
  DATA_DIR: string;
  ENABLE_METRICS: boolean;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
}

export interface BusyWindow {
  start: string;
  end: string;
}

export interface SuggestedSlot {
  start_iso: string;
  end_iso: string;
  label: string;
  local_date: string;
  local_time: string;
  timezone: string;
}

export interface QueryWindow {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  normalizedDate: string;
  normalizedTimeRange: string;
  timezone: string;
}

export interface ParsedTimeRange {
  startTime: string;
  endTime: string;
  normalizedLabel: string;
  usedDefaultWindow: boolean;
}

export interface StoredLead {
  id: string;
  created_at: string;
  updated_at: string;
  channel_name: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  lead_language: string;
  lead_interest_category: string | null;
  specific_service: string | null;
  requested_quote: boolean;
  requested_meeting: boolean;
  preferred_date: string | null;
  preferred_time_range: string | null;
  conversation_summary: string | null;
  lead_status: LeadStatus;
}

export interface StoredHandoff {
  id: string;
  created_at: string;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  escalation_reason: string;
  conversation_summary: string | null;
  lead_status: LeadStatus;
  handoff_phone: string | null;
}

export interface IdempotencyRecord {
  key: string;
  created_at: string;
  response: {
    calendar_event_id: string;
    calendar_event_link: string | null;
    meeting_datetime_iso: string;
    timezone: string;
  };
}

export interface GoogleOAuthTokenRecord {
  refresh_token: string;
  updated_at: string;
}

export interface CreateMeetingResult {
  meeting_booked: boolean;
  calendar_event_id: string;
  calendar_event_link: string | null;
  meeting_datetime_iso: string;
  timezone: string;
  preferred_date: string;
  preferred_time_range: string;
  requested_meeting: true;
  lead_status: 'reunion_agendada';
}

export interface AvailabilityResult {
  requested_meeting: true;
  preferred_date: string;
  preferred_time_range: string;
  lead_status: 'reunion_en_proceso';
  availability: {
    available: boolean;
    suggested_slots: SuggestedSlot[];
    checked_window: {
      start_iso: string;
      end_iso: string;
      timezone: string;
      used_fallback_window: boolean;
    };
    calendar_id: string;
    message: string;
  };
}

export interface LeadSaveResult {
  lead: StoredLead;
  state: {
    lead_status: LeadStatus;
  };
}

export interface HandoffResult {
  handoff: StoredHandoff;
  state: {
    lead_status: 'escalado';
  };
}

export interface CalendarServiceLike {
  checkReady(): Promise<void>;
  queryFreeBusy(window: {
    calendarId: string;
    timeMin: string;
    timeMax: string;
  }): Promise<BusyWindow[]>;
  createMeeting(input: {
    calendarId: string;
    eventId: string;
    summary: string;
    description: string;
    timezone: string;
    startIso: string;
    endIso: string;
    attendees: Array<{ email: string }>;
  }): Promise<{
    calendar_event_id: string;
    calendar_event_link: string | null;
  }>;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      logger: Logger;
      validatedBody?: unknown;
      routeLabel?: string;
      toolName?: string;
      authResult?: 'success' | 'failure' | 'not_applicable';
    }
  }
}

export {};
