import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import type { CalendarService } from '../src/services/calendar.service';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

describe('POST /api/elevenlabs/check-availability', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    await cleanupTempDataDir(dataDir);
  });

  it('returns 401 when the API key is invalid', async () => {
    const env = createTestEnv(dataDir);
    const mockCalendarService = {
      checkReady: async () => undefined,
      queryFreeBusy: async () => [],
      createMeeting: async () => ({ calendar_event_id: 'evt', calendar_event_link: null }),
      bookMeeting: async () => {
        throw new Error('not used');
      },
    } as unknown as CalendarService;

    const app = createApp({
      env,
      calendarService: mockCalendarService,
    });

    const response = await request(app)
      .post('/api/elevenlabs/check-availability')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', 'wrong-key')
      .send({
        preferred_date: '2026-05-10',
      });

    expect(response.status).toBe(401);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.type).toBe('auth_error');
  });

  it('returns 400 when preferred_date is missing', async () => {
    const env = createTestEnv(dataDir);
    const mockCalendarService = {
      checkReady: async () => undefined,
      queryFreeBusy: async () => [],
      createMeeting: async () => ({ calendar_event_id: 'evt', calendar_event_link: null }),
      bookMeeting: async () => {
        throw new Error('not used');
      },
    } as unknown as CalendarService;

    const app = createApp({
      env,
      calendarService: mockCalendarService,
    });

    const response = await request(app)
      .post('/api/elevenlabs/check-availability')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        preferred_time_range: 'manana',
      });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.type).toBe('validation_error');
  });

  it('returns suggested slots for a valid preferred_date and echoes shared identifiers', async () => {
    const env = createTestEnv(dataDir);
    const queryFreeBusy = vi.fn().mockResolvedValue([
      {
        start: '2026-05-10T09:00:00-05:00',
        end: '2026-05-10T09:30:00-05:00',
      },
    ]);
    const mockCalendarService = {
      checkReady: async () => undefined,
      queryFreeBusy,
      createMeeting: async () => ({ calendar_event_id: 'evt', calendar_event_link: null }),
      bookMeeting: async () => {
        throw new Error('not used');
      },
    } as unknown as CalendarService;

    const app = createApp({
      env,
      calendarService: mockCalendarService,
    });

    const response = await request(app)
      .post('/api/elevenlabs/check-availability')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_id: 'lead-123',
        conversation_id: 'conv-123',
        lead_name: 'Maria Perez',
        preferred_date: '2026-05-10',
        preferred_time_range: 'manana',
        timezone: 'America/Lima',
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.tool).toBe('check_availability');
    expect(response.body.state.requested_meeting).toBe(true);
    expect(response.body.state.lead_status).toBe('reunion_en_proceso');
    expect(response.body.state.lead_id).toBe('lead-123');
    expect(response.body.state.conversation_id).toBe('conv-123');
    expect(response.body.availability.available).toBe(true);
    expect(response.body.availability.suggested_slots).toHaveLength(5);
    expect(queryFreeBusy).toHaveBeenCalledTimes(1);
  });
});
