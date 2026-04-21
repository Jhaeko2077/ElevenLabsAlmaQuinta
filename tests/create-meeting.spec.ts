import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { createLogger } from '../src/config/logger';
import { createMetrics } from '../src/config/metrics';
import { IdempotencyRepository } from '../src/repositories/idempotency.repository';
import { CalendarService } from '../src/services/calendar.service';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

describe('POST /api/elevenlabs/create-meeting', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    await cleanupTempDataDir(dataDir);
  });

  it('creates a meeting with mocked Google Calendar responses', async () => {
    const env = createTestEnv(dataDir);
    const logger = createLogger(env);
    const metrics = createMetrics(env);
    const idempotencyRepository = new IdempotencyRepository(env.DATA_DIR);
    const insertSpy = vi.fn().mockResolvedValue({
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
        get: vi.fn(),
      },
    };
    const calendarService = new CalendarService(
      env,
      metrics,
      logger,
      idempotencyRepository,
      async () => mockClient as never,
    );

    const app = createApp({
      env,
      logger,
      metrics,
      idempotencyRepository,
      calendarService,
    });

    const response = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
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
    expect(insertSpy).toHaveBeenCalledTimes(1);

    const firstCall = insertSpy.mock.calls[0][0];
    expect(firstCall.calendarId).toBe(env.GOOGLE_CALENDAR_ID);
    expect(firstCall.sendUpdates).toBe('all');
    expect(firstCall.requestBody.summary).toContain('Alma Quinta');
    expect(firstCall.requestBody.attendees).toEqual([{ email: 'lucia@example.com' }]);
  });
});
