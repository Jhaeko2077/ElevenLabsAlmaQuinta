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

export const WEBSITE_PROJECT_TYPES = [
  'landing_page',
  'corporate_website',
  'ecommerce',
  'website_redesign',
  'web_maintenance',
  'booking_website',
  'web_app',
  'not_sure',
  'other',
] as const;

export const WEBSITE_RECOMMENDED_SERVICES = [
  'landing_page',
  'corporate_website',
  'ecommerce_development',
  'website_redesign',
  'website_maintenance',
  'booking_website',
  'custom_web_development',
  'consultation_needed',
] as const;

export const WEBSITE_URGENCY_LEVELS = ['low', 'medium', 'high'] as const;
export const WEBSITE_LEAD_TEMPERATURES = ['cold', 'warm', 'hot'] as const;
export const WEBSITE_NEXT_STEPS = [
  'schedule_meeting',
  'save_lead',
  'human_follow_up',
  'send_information',
  'continue_qualification',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type GoogleAuthMode = 'service_account' | 'oauth_user';
export type IdempotencyStatus = 'in_progress' | 'succeeded' | 'failed_retryable' | 'failed_final';
export type WebsiteProjectType = (typeof WEBSITE_PROJECT_TYPES)[number];
export type WebsiteRecommendedService = (typeof WEBSITE_RECOMMENDED_SERVICES)[number];
export type WebsiteUrgencyLevel = (typeof WEBSITE_URGENCY_LEVELS)[number];
export type WebsiteLeadTemperature = (typeof WEBSITE_LEAD_TEMPERATURES)[number];
export type WebsiteNextStep = (typeof WEBSITE_NEXT_STEPS)[number];
export type SlackNotificationStatus = 'sent' | 'skipped' | 'failed';

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
  ENABLE_SLACK_NOTIFICATIONS: boolean;
  SLACK_WEBHOOK_URL: string;
  SLACK_CHANNEL: string;
  SLACK_NOTIFY_MIN_TEMPERATURE: WebsiteLeadTemperature;
  SLACK_NOTIFY_ON_SCHEDULE_MEETING: boolean;
  SLACK_APP_NAME: string;
  SLACK_NOTIFICATIONS_TIMEOUT_MS: number;
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

export interface LeadCorrelationFields {
  lead_id: string | null;
  conversation_id: string | null;
  external_conversation_id: string | null;
}

export interface LeadLookupInput extends Partial<LeadCorrelationFields> {
  lead_phone?: string | null;
  lead_email?: string | null;
}

export interface StoredLead {
  id: string;
  created_at: string;
  updated_at: string;
  conversation_id: string | null;
  external_conversation_id: string | null;
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
  company_name?: string | null;
  project_type?: WebsiteProjectType | null;
  business_goal?: string | null;
  current_website?: string | null;
  required_features?: string | null;
  domain_hosting_status?: string | null;
  available_materials?: string | null;
  desired_timeline?: string | null;
  approximate_budget?: string | null;
  urgency_level?: WebsiteUrgencyLevel | null;
  lead_temperature?: WebsiteLeadTemperature | null;
  recommended_service?: WebsiteRecommendedService | null;
  project_summary?: string | null;
  next_step?: WebsiteNextStep | null;
  slack_notified_at?: string | null;
  slack_notification_status?: SlackNotificationStatus | null;
}

export interface StoredHandoff {
  id: string;
  created_at: string;
  lead_id: string | null;
  conversation_id: string | null;
  external_conversation_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  escalation_reason: string;
  conversation_summary: string | null;
  lead_status: LeadStatus;
  handoff_phone: string | null;
}

export interface CreateMeetingResult extends LeadCorrelationFields {
  meeting_booked: boolean;
  calendar_event_id: string;
  calendar_event_link: string | null;
  meeting_datetime_iso: string;
  timezone: string;
  preferred_date: string;
  preferred_time_range: string;
  requested_meeting: true;
  lead_status: LeadStatus;
  idempotency: {
    reused: boolean;
    key: string;
  };
}

export interface IdempotencyRecord {
  key: string;
  tool: 'create_meeting';
  status: IdempotencyStatus;
  fingerprint: string | null;
  created_at: string;
  updated_at: string;
  started_at: string;
  finished_at: string | null;
  lock_expires_at: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  external_conversation_id: string | null;
  calendar_event_id: string | null;
  response: CreateMeetingResult | null;
  error: {
    message: string;
    status_code: number | null;
  } | null;
}

export interface GoogleOAuthTokenRecord {
  refresh_token: string;
  updated_at: string;
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
  state: LeadCorrelationFields & {
    lead_status: LeadStatus;
  };
}

export interface HandoffResult {
  handoff: StoredHandoff;
  state: LeadCorrelationFields & {
    lead_status: LeadStatus;
  };
}

export interface WebsiteProjectQualification {
  project_type: WebsiteProjectType;
  business_goal: string;
  recommended_service: WebsiteRecommendedService;
  lead_temperature: WebsiteLeadTemperature;
  urgency_level: WebsiteUrgencyLevel;
  project_summary: string;
  next_step: WebsiteNextStep;
}

export interface SlackNotificationResult {
  status: SlackNotificationStatus;
  reason?: string;
}

export interface WebsiteProjectQualificationResult {
  lead: StoredLead;
  qualification: WebsiteProjectQualification;
  state: LeadCorrelationFields & WebsiteProjectQualification & {
    lead_status: LeadStatus;
    requested_quote: true;
    requested_meeting: boolean;
  };
  notifications: {
    slack: SlackNotificationResult;
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
