import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { CalendarService } from '../src/services/calendar.service';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

describe('health endpoints', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    await cleanupTempDataDir(dataDir);
  });

  it('returns service metadata and readiness checks', async () => {
    const env = createTestEnv(dataDir);
    const mockCalendarService = {
      checkReady: async () => undefined,
      queryFreeBusy: async () => [],
      createMeeting: async () => ({ calendar_event_id: 'evt', calendar_event_link: null }),
      bookMeeting: async () => ({
        meeting_booked: true,
        calendar_event_id: 'evt',
        calendar_event_link: null,
        meeting_datetime_iso: '2026-05-01T10:00:00-05:00',
        timezone: 'America/Lima',
        preferred_date: '2026-05-01',
        preferred_time_range: '10:00-10:30',
        requested_meeting: true as const,
        lead_status: 'reunion_agendada' as const,
      }),
    } as unknown as CalendarService;

    const app = createApp({
      env,
      calendarService: mockCalendarService,
    });

    const rootResponse = await request(app).get('/');
    expect(rootResponse.status).toBe(200);
    expect(rootResponse.body.service).toBe('alma-quinta-elevenlabs-backend');
    expect(rootResponse.body.environment).toBe('test');

    const liveResponse = await request(app).get('/health/live');
    expect(liveResponse.status).toBe(200);
    expect(liveResponse.body.status).toBe('live');

    const readyResponse = await request(app).get('/health/ready');
    expect(readyResponse.status).toBe(200);
    expect(readyResponse.body.ok).toBe(true);
    expect(readyResponse.body.checks.google_client_initializable).toBe(true);
  });
});
