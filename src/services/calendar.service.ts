import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import type { calendar_v3 } from 'googleapis';

import { AppMetrics } from '../config/metrics';
import { UpstreamAppError, ValidationAppError } from '../lib/errors';
import { normalizeEmail, normalizeNullableString, normalizePhone, normalizeTimezone, sanitizeSummary } from '../lib/normalize';
import { maskEmail, maskPhone } from '../lib/redaction';
import { addMinutes, formatIsoInTimeZone, parseMeetingDateTimeInput } from '../lib/time';
import { IdempotencyRepository } from '../repositories/idempotency.repository';
import type { AppEnv, BusyWindow, CreateMeetingResult } from '../types';

type CalendarClientFactory = (env: AppEnv) => Promise<calendar_v3.Calendar>;

function extractErrorStatus(error: unknown): number {
  const maybeError = error as {
    code?: number;
    status?: number;
    response?: { status?: number };
  };

  return maybeError.code ?? maybeError.status ?? maybeError.response?.status ?? 502;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export class CalendarService {
  private client: calendar_v3.Calendar | null = null;
  private clientPromise: Promise<calendar_v3.Calendar> | null = null;

  public constructor(
    private readonly env: AppEnv,
    private readonly metrics: AppMetrics,
    private readonly logger: Logger,
    private readonly idempotencyRepository: IdempotencyRepository,
    private readonly clientFactory: CalendarClientFactory,
  ) {}

  public async checkReady(): Promise<void> {
    await this.getClient();
    await this.idempotencyRepository.ensureReady();
  }

  public async queryFreeBusy(window: {
    calendarId: string;
    timeMin: string;
    timeMax: string;
  }): Promise<BusyWindow[]> {
    const operation = 'freebusy_query';
    const startedAt = Date.now();
    const client = await this.getClient();

    try {
      const response = await client.freebusy.query({
        requestBody: {
          timeMin: window.timeMin,
          timeMax: window.timeMax,
          items: [{ id: window.calendarId }],
        },
      });

      this.metrics.recordGoogleApiCall(operation, 'success', Date.now() - startedAt);

      const busy = response.data.calendars?.[window.calendarId]?.busy ?? [];
      return busy
        .filter((item): item is { start: string; end: string } => Boolean(item.start && item.end))
        .map((item) => ({
          start: item.start,
          end: item.end,
        }));
    } catch (error) {
      const statusCode = extractErrorStatus(error);
      this.metrics.recordGoogleApiCall(operation, 'failure', Date.now() - startedAt);

      this.logger.error({
        event: 'google_calendar_error',
        operation,
        status_code: statusCode,
        error_message: extractErrorMessage(error, 'Google Calendar freebusy query failed'),
      });

      throw new UpstreamAppError(
        'Google Calendar freebusy query failed',
        { operation, status_code: statusCode },
        statusCode === 503 ? 503 : 502,
      );
    }
  }

  public async bookMeeting(input: {
    lead_name?: string;
    lead_phone?: string;
    lead_email?: string;
    meeting_datetime_iso: string;
    specific_service?: string;
    conversation_summary?: string;
    timezone?: string;
  }, requestLogger: Express.Request['logger']): Promise<CreateMeetingResult> {
    const timezone = normalizeTimezone(input.timezone, this.env.BUSINESS_TIMEZONE);
    const parsedMeeting = parseMeetingDateTimeInput(input.meeting_datetime_iso, timezone);

    if (!parsedMeeting) {
      throw new ValidationAppError('meeting_datetime_iso is required and must be interpretable', {
        meeting_datetime_iso: input.meeting_datetime_iso,
      });
    }

    const leadName = normalizeNullableString(input.lead_name) ?? 'Cliente';
    const leadPhone = normalizePhone(input.lead_phone);
    const leadEmail = normalizeEmail(input.lead_email);
    const specificService = normalizeNullableString(input.specific_service);
    const conversationSummary = sanitizeSummary(input.conversation_summary);
    const eventId = this.buildDeterministicEventId({
      leadName,
      leadPhone,
      leadEmail,
      meetingDateTimeIso: parsedMeeting.normalizedIso,
    });
    const idempotencyKey = `meeting:${eventId}`;
    const existingRecord = await this.idempotencyRepository.get(idempotencyKey);

    if (existingRecord) {
      this.metrics.idempotencyHitsTotal.inc();

      requestLogger.info({
        event: 'meeting_created',
        source: 'idempotency_store',
        calendar_event_id: existingRecord.response.calendar_event_id,
        lead_name: leadName,
        lead_phone: maskPhone(leadPhone),
        lead_email: maskEmail(leadEmail),
      });

      return {
        meeting_booked: true,
        calendar_event_id: existingRecord.response.calendar_event_id,
        calendar_event_link: existingRecord.response.calendar_event_link,
        meeting_datetime_iso: existingRecord.response.meeting_datetime_iso,
        timezone: existingRecord.response.timezone,
        preferred_date: parsedMeeting.preferredDate,
        preferred_time_range: parsedMeeting.preferredTimeRange,
        requested_meeting: true,
        lead_status: 'reunion_agendada',
      };
    }

    const startIso = parsedMeeting.normalizedIso;
    const endIso = formatIsoInTimeZone(
      addMinutes(parsedMeeting.start, this.env.DEFAULT_MEETING_DURATION_MINUTES),
      timezone,
    );

    try {
      const created = await this.createMeeting({
        calendarId: this.env.GOOGLE_CALENDAR_ID,
        eventId,
        summary: `Reunión Alma Quinta - ${leadName}`,
        description: this.buildDescription({
          leadName,
          leadPhone,
          leadEmail,
          specificService,
          conversationSummary,
        }),
        timezone,
        startIso,
        endIso,
        attendees: leadEmail ? [{ email: leadEmail }] : [],
      });

      await this.idempotencyRepository.set({
        key: idempotencyKey,
        created_at: new Date().toISOString(),
        response: {
          calendar_event_id: created.calendar_event_id,
          calendar_event_link: created.calendar_event_link,
          meeting_datetime_iso: startIso,
          timezone,
        },
      });

      this.metrics.meetingsCreatedTotal.inc();

      requestLogger.info({
        event: 'meeting_created',
        calendar_event_id: created.calendar_event_id,
        lead_name: leadName,
        lead_phone: maskPhone(leadPhone),
        lead_email: maskEmail(leadEmail),
        meeting_datetime_iso: startIso,
      });

      return {
        meeting_booked: true,
        calendar_event_id: created.calendar_event_id,
        calendar_event_link: created.calendar_event_link,
        meeting_datetime_iso: startIso,
        timezone,
        preferred_date: parsedMeeting.preferredDate,
        preferred_time_range: parsedMeeting.preferredTimeRange,
        requested_meeting: true,
        lead_status: 'reunion_agendada',
      };
    } catch (error) {
      this.metrics.meetingsCreateFailuresTotal.inc();
      throw error;
    }
  }

  public async createMeeting(input: {
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
  }> {
    const operation = 'events_insert';
    const startedAt = Date.now();
    const client = await this.getClient();

    try {
      const response = await client.events.insert({
        calendarId: input.calendarId,
        sendUpdates: 'all',
        requestBody: {
          id: input.eventId,
          summary: input.summary,
          description: input.description,
          start: {
            dateTime: input.startIso,
            timeZone: input.timezone,
          },
          end: {
            dateTime: input.endIso,
            timeZone: input.timezone,
          },
          attendees: input.attendees.length > 0 ? input.attendees : undefined,
        },
      });

      this.metrics.recordGoogleApiCall(operation, 'success', Date.now() - startedAt);

      return {
        calendar_event_id: response.data.id ?? input.eventId,
        calendar_event_link: response.data.htmlLink ?? null,
      };
    } catch (error) {
      const rawError = error as {
        response?: {
          status?: unknown;
          data?: unknown;
        };
        message?: string;
        errors?: unknown;
      };
      const statusCode = extractErrorStatus(error);
      this.metrics.recordGoogleApiCall(operation, 'failure', Date.now() - startedAt);

      if (statusCode === 409) {
        return this.getExistingMeeting(input.calendarId, input.eventId);
      }

      this.logger.error(
        {
          status: rawError?.response?.status,
          data: rawError?.response?.data,
          message: rawError?.message,
          errors: rawError?.errors,
        },
        'Google Calendar insert raw error',
      );

      this.logger.error({
        event: 'google_calendar_error',
        operation,
        status_code: statusCode,
        error_message: extractErrorMessage(error, 'Google Calendar events insert failed'),
      });

      throw new UpstreamAppError(
        'Google Calendar events insert failed',
        { operation, status_code: statusCode },
        statusCode === 503 ? 503 : 502,
      );
    }
  }

  private async getExistingMeeting(calendarId: string, eventId: string): Promise<{
    calendar_event_id: string;
    calendar_event_link: string | null;
  }> {
    const operation = 'events_get';
    const startedAt = Date.now();
    const client = await this.getClient();

    try {
      const response = await client.events.get({
        calendarId,
        eventId,
      });

      this.metrics.recordGoogleApiCall(operation, 'success', Date.now() - startedAt);

      return {
        calendar_event_id: response.data.id ?? eventId,
        calendar_event_link: response.data.htmlLink ?? null,
      };
    } catch (error) {
      const statusCode = extractErrorStatus(error);
      this.metrics.recordGoogleApiCall(operation, 'failure', Date.now() - startedAt);

      this.logger.error({
        event: 'google_calendar_error',
        operation,
        status_code: statusCode,
        error_message: extractErrorMessage(error, 'Google Calendar duplicate recovery failed'),
      });

      throw new UpstreamAppError(
        'Google Calendar duplicate recovery failed',
        { operation, status_code: statusCode },
        statusCode === 503 ? 503 : 502,
      );
    }
  }

  private async getClient(): Promise<calendar_v3.Calendar> {
    if (this.client) {
      return this.client;
    }

    if (!this.clientPromise) {
      this.clientPromise = this.clientFactory(this.env)
        .then((client) => {
          this.client = client;
          return client;
        })
        .catch((error) => {
          this.clientPromise = null;
          throw error;
        });
    }

    return this.clientPromise;
  }

  private buildDescription(input: {
    leadName: string;
    leadPhone: string | null;
    leadEmail: string | null;
    specificService: string | null;
    conversationSummary: string | null;
  }): string {
    const sections = [
      `Lead: ${input.leadName}`,
      `Teléfono: ${input.leadPhone ?? 'No disponible'}`,
      `Email: ${input.leadEmail ?? 'No disponible'}`,
      `Servicio: ${input.specificService ?? 'No especificado'}`,
      `Resumen: ${input.conversationSummary ?? 'Sin resumen conversacional'}`,
    ];

    if (this.env.BOOKING_REFERENCE) {
      sections.push(`Referencia: ${this.env.BOOKING_REFERENCE}`);
    }

    return sections.join('\n');
  }

  private buildDeterministicEventId(input: {
    leadName: string;
    leadPhone: string | null;
    leadEmail: string | null;
    meetingDateTimeIso: string;
  }): string {
    const seed = [
      'alma-quinta',
      input.leadName.toLowerCase(),
      input.leadPhone ?? '',
      input.leadEmail ?? '',
      input.meetingDateTimeIso,
    ].join('|');

    const hash = createHash('sha256').update(seed).digest('hex');
    return `aq${hash.slice(0, 30)}`;
  }
}
