import { createHash, randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { calendar_v3 } from 'googleapis';

import { AppMetrics } from '../config/metrics';
import { UpstreamAppError, ValidationAppError } from '../lib/errors';
import {
  normalizeEmail,
  normalizeIdentifier,
  normalizeNullableString,
  normalizePhone,
  normalizeTimezone,
  sanitizeSummary,
} from '../lib/normalize';
import { maskEmail, maskPhone } from '../lib/redaction';
import { addMinutes, formatIsoInTimeZone, parseMeetingDateTimeInput } from '../lib/time';
import { IdempotencyRepository } from '../repositories/idempotency.repository';
import { LeadService } from './lead.service';
import type { AppEnv, BusyWindow, CreateMeetingResult } from '../types';

type CalendarClientFactory = (env: AppEnv) => Promise<calendar_v3.Calendar>;

const IDEMPOTENCY_LOCK_TTL_MS = 2 * 60 * 1000;

function extractErrorStatus(error: unknown): number {
  const maybeError = error as {
    code?: number;
    status?: number;
    statusCode?: number;
    response?: { status?: number };
  };

  return maybeError.code ?? maybeError.statusCode ?? maybeError.status ?? maybeError.response?.status ?? 502;
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
  private readonly inFlightMeetings = new Map<string, Promise<CreateMeetingResult>>();

  public constructor(
    private readonly env: AppEnv,
    private readonly metrics: AppMetrics,
    private readonly logger: Logger,
    private readonly idempotencyRepository: IdempotencyRepository,
    private readonly clientFactory: CalendarClientFactory,
    private readonly leadService: LeadService,
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
    lead_id?: string;
    conversation_id?: string;
    external_conversation_id?: string;
    idempotency_key?: string;
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

    const requestedLeadPhone = normalizePhone(input.lead_phone);
    const requestedLeadEmail = normalizeEmail(input.lead_email);
    const existingLead = await this.leadService.findLead({
      lead_id: normalizeIdentifier(input.lead_id),
      conversation_id: normalizeIdentifier(input.conversation_id),
      external_conversation_id: normalizeIdentifier(input.external_conversation_id),
      lead_phone: requestedLeadPhone,
      lead_email: requestedLeadEmail,
    });

    const leadId = normalizeIdentifier(input.lead_id) ?? existingLead?.id ?? randomUUID();
    const conversationId = normalizeIdentifier(input.conversation_id) ?? existingLead?.conversation_id ?? null;
    const externalConversationId = normalizeIdentifier(input.external_conversation_id)
      ?? existingLead?.external_conversation_id
      ?? null;
    const leadName = normalizeNullableString(input.lead_name) ?? existingLead?.lead_name ?? 'Cliente';
    const leadPhone = requestedLeadPhone ?? existingLead?.lead_phone ?? null;
    const persistedLeadEmail = requestedLeadEmail ?? existingLead?.lead_email ?? null;
    const specificService = normalizeNullableString(input.specific_service) ?? existingLead?.specific_service ?? null;
    const conversationSummary = sanitizeSummary(input.conversation_summary) ?? existingLead?.conversation_summary ?? null;
    const idempotencyFingerprint = this.buildIdempotencyFingerprint({
      leadId,
      leadName,
      leadPhone,
      leadEmail: persistedLeadEmail,
      meetingDateTimeIso: parsedMeeting.normalizedIso,
      specificService,
      timezone,
    });
    const explicitIdempotencyKey = normalizeIdentifier(input.idempotency_key);
    const idempotencyKey = explicitIdempotencyKey
      ? `create_meeting:${explicitIdempotencyKey}`
      : `create_meeting:fingerprint:${idempotencyFingerprint}`;
    const existingPromise = this.inFlightMeetings.get(idempotencyKey);

    if (existingPromise) {
      this.metrics.idempotencyHitsTotal.inc();
      requestLogger.info({
        event: 'meeting_created',
        source: 'in_flight',
        idempotency_key: idempotencyKey,
        lead_id: leadId,
        conversation_id: conversationId,
      });
      return this.withReusedIdempotency(await existingPromise, idempotencyKey);
    }

    const reservation = await this.idempotencyRepository.beginExecution({
      key: idempotencyKey,
      fingerprint: idempotencyFingerprint,
      lead_id: leadId,
      conversation_id: conversationId,
      external_conversation_id: externalConversationId,
      lockTtlMs: IDEMPOTENCY_LOCK_TTL_MS,
    });

    const currentPromise = this.inFlightMeetings.get(idempotencyKey);

    if (!reservation.acquired && currentPromise) {
      this.metrics.idempotencyHitsTotal.inc();
      return this.withReusedIdempotency(await currentPromise, idempotencyKey);
    }

    if (!reservation.acquired) {
      this.metrics.idempotencyHitsTotal.inc();

      if (reservation.record.status === 'succeeded' && reservation.record.response) {
        requestLogger.info({
          event: 'meeting_created',
          source: 'idempotency_store',
          idempotency_key: idempotencyKey,
          lead_id: reservation.record.response.lead_id,
          conversation_id: reservation.record.response.conversation_id,
          calendar_event_id: reservation.record.response.calendar_event_id,
        });
        return this.withReusedIdempotency(reservation.record.response, idempotencyKey);
      }

      throw new UpstreamAppError(
        'Meeting creation already in progress for this idempotency key',
        { idempotency_key: idempotencyKey },
        503,
      );
    }

    const bookingPromise = this.executeMeetingBooking({
      idempotencyKey,
      leadId,
      conversationId,
      externalConversationId,
      leadName,
      leadPhone,
      requestedLeadEmail,
      persistedLeadEmail,
      specificService,
      conversationSummary,
      timezone,
      parsedMeeting,
      requestLogger,
    });

    this.inFlightMeetings.set(idempotencyKey, bookingPromise);

    try {
      return await bookingPromise;
    } finally {
      this.inFlightMeetings.delete(idempotencyKey);
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
    extendedPrivateProperties?: Record<string, string>;
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
          extendedProperties: input.extendedPrivateProperties
            ? {
              private: input.extendedPrivateProperties,
            }
            : undefined,
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

  private async executeMeetingBooking(input: {
    idempotencyKey: string;
    leadId: string;
    conversationId: string | null;
    externalConversationId: string | null;
    leadName: string;
    leadPhone: string | null;
    requestedLeadEmail: string | null;
    persistedLeadEmail: string | null;
    specificService: string | null;
    conversationSummary: string | null;
    timezone: string;
    parsedMeeting: NonNullable<ReturnType<typeof parseMeetingDateTimeInput>>;
    requestLogger: Express.Request['logger'];
  }): Promise<CreateMeetingResult> {
    const startIso = input.parsedMeeting.normalizedIso;
    const endIso = formatIsoInTimeZone(
      addMinutes(input.parsedMeeting.start, this.env.DEFAULT_MEETING_DURATION_MINUTES),
      input.timezone,
    );
    const eventId = this.buildDeterministicEventId(input.idempotencyKey);

    try {
      const created = await this.createMeeting({
        calendarId: this.env.GOOGLE_CALENDAR_ID,
        eventId,
        summary: `Reunion Alma Quinta - ${input.leadName}`,
        description: this.buildDescription({
          leadName: input.leadName,
          leadPhone: input.leadPhone,
          leadEmail: input.persistedLeadEmail,
          specificService: input.specificService,
          conversationSummary: input.conversationSummary,
        }),
        timezone: input.timezone,
        startIso,
        endIso,
        attendees: input.requestedLeadEmail ? [{ email: input.requestedLeadEmail }] : [],
        extendedPrivateProperties: this.buildExtendedPrivateProperties({
          idempotencyKey: input.idempotencyKey,
          leadId: input.leadId,
          conversationId: input.conversationId,
          externalConversationId: input.externalConversationId,
        }),
      });

      const lead = await this.leadService.upsertLeadContext({
        lead_id: input.leadId,
        conversation_id: input.conversationId ?? undefined,
        external_conversation_id: input.externalConversationId ?? undefined,
        lead_name: input.leadName,
        lead_phone: input.leadPhone ?? undefined,
        lead_email: input.persistedLeadEmail ?? undefined,
        specific_service: input.specificService ?? undefined,
        conversation_summary: input.conversationSummary ?? undefined,
        requested_meeting: true,
        preferred_date: input.parsedMeeting.preferredDate,
        preferred_time_range: input.parsedMeeting.preferredTimeRange,
        lead_status: 'reunion_agendada',
      }, {
        defaultLeadStatus: 'reunion_agendada',
      });

      const result: CreateMeetingResult = {
        meeting_booked: true,
        calendar_event_id: created.calendar_event_id,
        calendar_event_link: created.calendar_event_link,
        meeting_datetime_iso: startIso,
        timezone: input.timezone,
        preferred_date: input.parsedMeeting.preferredDate,
        preferred_time_range: input.parsedMeeting.preferredTimeRange,
        requested_meeting: true,
        lead_status: lead.lead_status,
        lead_id: lead.id,
        conversation_id: lead.conversation_id,
        external_conversation_id: lead.external_conversation_id,
        idempotency: {
          reused: false,
          key: input.idempotencyKey,
        },
      };

      await this.idempotencyRepository.completeSuccess({
        key: input.idempotencyKey,
        response: result,
      });

      this.metrics.meetingsCreatedTotal.inc();

      input.requestLogger.info({
        event: 'meeting_created',
        idempotency_key: input.idempotencyKey,
        calendar_event_id: created.calendar_event_id,
        lead_id: lead.id,
        conversation_id: lead.conversation_id,
        external_conversation_id: lead.external_conversation_id,
        lead_name: input.leadName,
        lead_phone: maskPhone(input.leadPhone),
        lead_email: maskEmail(input.persistedLeadEmail),
        meeting_datetime_iso: startIso,
      });

      return result;
    } catch (error) {
      this.metrics.meetingsCreateFailuresTotal.inc();
      await this.markIdempotencyFailure(input.idempotencyKey, error);
      throw error;
    }
  }

  private async markIdempotencyFailure(idempotencyKey: string, error: unknown): Promise<void> {
    try {
      const statusCode = extractErrorStatus(error);
      await this.idempotencyRepository.completeFailure({
        key: idempotencyKey,
        message: extractErrorMessage(error, 'Meeting creation failed'),
        statusCode,
        retryable: statusCode >= 500 || statusCode === 429,
      });
    } catch (repositoryError) {
      this.logger.error({
        event: 'idempotency_failure_persist_error',
        idempotency_key: idempotencyKey,
        error_message: extractErrorMessage(repositoryError, 'Failed to persist idempotency failure state'),
      });
    }
  }

  private withReusedIdempotency(result: CreateMeetingResult, idempotencyKey: string): CreateMeetingResult {
    return {
      ...result,
      idempotency: {
        reused: true,
        key: idempotencyKey,
      },
    };
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
      `Telefono: ${input.leadPhone ?? 'No disponible'}`,
      `Email: ${input.leadEmail ?? 'No disponible'}`,
      `Servicio: ${input.specificService ?? 'No especificado'}`,
      `Resumen: ${input.conversationSummary ?? 'Sin resumen conversacional'}`,
    ];

    if (this.env.BOOKING_REFERENCE) {
      sections.push(`Referencia: ${this.env.BOOKING_REFERENCE}`);
    }

    return sections.join('\n');
  }

  private buildIdempotencyFingerprint(input: {
    leadId: string | null;
    leadName: string;
    leadPhone: string | null;
    leadEmail: string | null;
    meetingDateTimeIso: string;
    specificService: string | null;
    timezone: string;
  }): string {
    const seed = JSON.stringify({
      tool_name: 'create_meeting',
      lead_id: input.leadId,
      lead_phone: input.leadPhone,
      lead_email: input.leadEmail,
      lead_name: input.leadId ? null : input.leadName.toLowerCase(),
      meeting_datetime_iso: input.meetingDateTimeIso,
      specific_service: input.specificService?.toLowerCase() ?? null,
      timezone: input.timezone,
    });

    return createHash('sha256').update(seed).digest('hex');
  }

  private buildDeterministicEventId(idempotencyKey: string): string {
    const hash = createHash('sha256').update(idempotencyKey).digest('hex');
    return `aq${hash.slice(0, 30)}`;
  }

  private buildExtendedPrivateProperties(input: {
    idempotencyKey: string;
    leadId: string | null;
    conversationId: string | null;
    externalConversationId: string | null;
  }): Record<string, string> {
    const properties: Record<string, string> = {
      idempotency_key: input.idempotencyKey.slice(0, 500),
    };

    if (input.leadId) {
      properties.lead_id = input.leadId.slice(0, 200);
    }

    if (input.conversationId) {
      properties.conversation_id = input.conversationId.slice(0, 200);
    }

    if (input.externalConversationId) {
      properties.external_conversation_id = input.externalConversationId.slice(0, 200);
    }

    return properties;
  }
}
