import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { createLogger } from '../src/config/logger';
import { createMetrics } from '../src/config/metrics';
import { IdempotencyRepository } from '../src/repositories/idempotency.repository';
import { LeadRepository } from '../src/repositories/lead.repository';
import { CalendarService } from '../src/services/calendar.service';
import { LeadService } from '../src/services/lead.service';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

class FailOnceIdempotencyRepository extends IdempotencyRepository {
  private shouldFail = true;

  public override async completeSuccess(input: Parameters<IdempotencyRepository['completeSuccess']>[0]) {
    if (this.shouldFail) {
      this.shouldFail = false;
      throw new Error('forced idempotency write failure');
    }

    return super.completeSuccess(input);
  }
}

function createCalendarHarness(dataDir: string, options: {
  idempotencyRepository?: IdempotencyRepository;
  insertSpy?: ReturnType<typeof vi.fn>;
  getSpy?: ReturnType<typeof vi.fn>;
} = {}) {
  const env = createTestEnv(dataDir);
  const logger = createLogger(env);
  const metrics = createMetrics(env);
  const leadRepository = new LeadRepository(env.DATA_DIR);
  const leadService = new LeadService(leadRepository, metrics);
  const idempotencyRepository = options.idempotencyRepository ?? new IdempotencyRepository(env.DATA_DIR);
  const insertSpy = options.insertSpy ?? vi.fn().mockResolvedValue({
    data: {
      id: 'google-event-123',
      htmlLink: 'https://calendar.google.com/event?eid=123',
    },
  });
  const getSpy = options.getSpy ?? vi.fn().mockResolvedValue({
    data: {
      id: 'google-event-123',
      htmlLink: 'https://calendar.google.com/event?eid=123',
    },
  });
  const mockClient = {
    freebusy: {
      query: vi.fn(),
    },
    events: {
      insert: insertSpy,
      get: getSpy,
    },
  };
  const calendarService = new CalendarService(
    env,
    metrics,
    logger,
    idempotencyRepository,
    async () => mockClient as never,
    leadService,
  );
  const app = createApp({
    env,
    logger,
    metrics,
    leadRepository,
    leadService,
    idempotencyRepository,
    calendarService,
  });

  return {
    app,
    env,
    insertSpy,
    getSpy,
  };
}

describe('POST /api/elevenlabs/create-meeting', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    await cleanupTempDataDir(dataDir);
  });

  it('creates a meeting with mocked Google Calendar responses and persists lead identity', async () => {
    const { app, env, insertSpy } = createCalendarHarness(dataDir);

    const response = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        conversation_id: 'conv-001',
        lead_name: 'Lucia Gomez',
        lead_phone: '+51 999 888 777',
        lead_email: 'lucia@example.com',
        meeting_datetime_iso: '2026-05-15T10:00:00-05:00',
        specific_service: 'Membresia Alma Quinta',
        conversation_summary: 'Quiere agendar una reunion de presentacion.',
        timezone: 'America/Lima',
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.booking.meeting_booked).toBe(true);
    expect(response.body.booking.calendar_event_id).toBe('google-event-123');
    expect(response.body.state.lead_status).toBe('reunion_agendada');
    expect(response.body.state.lead_id).toBeTruthy();
    expect(response.body.state.conversation_id).toBe('conv-001');
    expect(response.body.idempotency.reused).toBe(false);
    expect(insertSpy).toHaveBeenCalledTimes(1);

    const firstCall = insertSpy.mock.calls[0][0];
    expect(firstCall.calendarId).toBe(env.GOOGLE_CALENDAR_ID);
    expect(firstCall.sendUpdates).toBe('all');
    expect(firstCall.requestBody.summary).toContain('Alma Quinta');
    expect(firstCall.requestBody.attendees).toEqual([{ email: 'lucia@example.com' }]);
    expect(firstCall.requestBody.extendedProperties.private.idempotency_key).toContain('create_meeting:');
    expect(firstCall.requestBody.extendedProperties.private.lead_id).toBe(response.body.state.lead_id);
  });

  it('reuses the same successful response when idempotency_key repeats', async () => {
    const { app, env, insertSpy } = createCalendarHarness(dataDir);
    const payload = {
      idempotency_key: 'retry-123',
      lead_name: 'Lucia Gomez',
      lead_phone: '+51 999 888 777',
      lead_email: 'lucia@example.com',
      meeting_datetime_iso: '2026-05-15T10:00:00-05:00',
      specific_service: 'Membresia Alma Quinta',
      timezone: 'America/Lima',
    };

    const firstResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(payload);

    const secondResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(payload);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.booking.calendar_event_id).toBe(firstResponse.body.booking.calendar_event_id);
    expect(secondResponse.body.idempotency).toEqual({
      reused: true,
      key: 'create_meeting:retry-123',
    });
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to a deterministic fingerprint when idempotency_key is missing', async () => {
    const { app, env, insertSpy } = createCalendarHarness(dataDir);
    const payload = {
      lead_name: 'Lucia Gomez',
      lead_phone: '+51 999 888 777',
      lead_email: 'lucia@example.com',
      meeting_datetime_iso: '2026-05-15T10:00:00-05:00',
      specific_service: 'Membresia Alma Quinta',
      timezone: 'America/Lima',
    };

    const firstResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(payload);

    const secondResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(payload);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.idempotency.reused).toBe(true);
    expect(secondResponse.body.idempotency.key).toContain('create_meeting:fingerprint:');
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });

  it('creates a distinct meeting when meeting_datetime_iso changes', async () => {
    const insertSpy = vi.fn()
      .mockResolvedValueOnce({
        data: {
          id: 'google-event-123',
          htmlLink: 'https://calendar.google.com/event?eid=123',
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: 'google-event-456',
          htmlLink: 'https://calendar.google.com/event?eid=456',
        },
      });
    const { app, env } = createCalendarHarness(dataDir, { insertSpy });

    const firstResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_name: 'Lucia Gomez',
        lead_phone: '+51 999 888 777',
        meeting_datetime_iso: '2026-05-15T10:00:00-05:00',
        timezone: 'America/Lima',
      });

    const secondResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_name: 'Lucia Gomez',
        lead_phone: '+51 999 888 777',
        meeting_datetime_iso: '2026-05-15T11:00:00-05:00',
        timezone: 'America/Lima',
      });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstResponse.body.booking.calendar_event_id).toBe('google-event-123');
    expect(secondResponse.body.booking.calendar_event_id).toBe('google-event-456');
    expect(insertSpy).toHaveBeenCalledTimes(2);
  });

  it('does not create a duplicate event after an intermediate persistence failure and retry', async () => {
    const env = createTestEnv(dataDir);
    const logger = createLogger(env);
    const metrics = createMetrics(env);
    const leadRepository = new LeadRepository(env.DATA_DIR);
    const leadService = new LeadService(leadRepository, metrics);
    const idempotencyRepository = new FailOnceIdempotencyRepository(env.DATA_DIR);
    const insertSpy = vi.fn()
      .mockResolvedValueOnce({
        data: {
          id: 'google-event-123',
          htmlLink: 'https://calendar.google.com/event?eid=123',
        },
      })
      .mockRejectedValueOnce({
        response: {
          status: 409,
        },
        message: 'duplicate event id',
      });
    const getSpy = vi.fn().mockResolvedValue({
      data: {
        id: 'google-event-123',
        htmlLink: 'https://calendar.google.com/event?eid=123',
      },
    });
    const mockClient = {
      freebusy: {
        query: vi.fn(),
      },
      events: {
        insert: insertSpy,
        get: getSpy,
      },
    };
    const calendarService = new CalendarService(
      env,
      metrics,
      logger,
      idempotencyRepository,
      async () => mockClient as never,
      leadService,
    );
    const app = createApp({
      env,
      logger,
      metrics,
      leadRepository,
      leadService,
      idempotencyRepository,
      calendarService,
    });
    const payload = {
      idempotency_key: 'recover-1',
      lead_name: 'Lucia Gomez',
      lead_phone: '+51 999 888 777',
      meeting_datetime_iso: '2026-05-15T10:00:00-05:00',
      timezone: 'America/Lima',
    };

    const firstResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(payload);

    const secondResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(payload);

    expect(firstResponse.status).toBe(500);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.booking.calendar_event_id).toBe('google-event-123');
    expect(insertSpy).toHaveBeenCalledTimes(2);
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate inserts for concurrent create_meeting requests with the same key', async () => {
    const insertSpy = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return {
        data: {
          id: 'google-event-123',
          htmlLink: 'https://calendar.google.com/event?eid=123',
        },
      };
    });
    const { app, env } = createCalendarHarness(dataDir, { insertSpy });
    const payload = {
      idempotency_key: 'concurrent-1',
      lead_name: 'Lucia Gomez',
      lead_phone: '+51 999 888 777',
      meeting_datetime_iso: '2026-05-15T10:00:00-05:00',
      timezone: 'America/Lima',
    };

    const [firstResponse, secondResponse] = await Promise.all([
      request(app)
        .post('/api/elevenlabs/create-meeting')
        .set('Content-Type', 'application/json')
        .set('X-Agent-API-Key', env.AGENT_API_KEY)
        .send(payload),
      request(app)
        .post('/api/elevenlabs/create-meeting')
        .set('Content-Type', 'application/json')
        .set('X-Agent-API-Key', env.AGENT_API_KEY)
        .send(payload),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect([firstResponse.body.idempotency.reused, secondResponse.body.idempotency.reused]).toContain(true);
  });
});
