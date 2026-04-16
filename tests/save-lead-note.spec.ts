import { readFile } from 'node:fs/promises';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { CalendarService } from '../src/services/calendar.service';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

describe('POST /api/elevenlabs/save-lead-note', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    await cleanupTempDataDir(dataDir);
  });

  it('persists the normalized lead payload', async () => {
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
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_name: 'Carlos Torres',
        lead_phone: '+51 987 654 321',
        lead_email: 'CARLOS@EXAMPLE.COM',
        requested_quote: 'si',
        requested_meeting: 'no',
        conversation_summary: 'Interesado en cotizacion para servicio premium.',
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.lead.lead_email).toBe('carlos@example.com');
    expect(response.body.lead.requested_quote).toBe(true);
    expect(response.body.lead.requested_meeting).toBe(false);
    expect(response.body.state.lead_status).toBe('calificando');

    const stored = JSON.parse(await readFile(`${dataDir}/leads.json`, 'utf-8')) as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0].lead_name).toBe('Carlos Torres');
    expect(stored[0].requested_quote).toBe(true);
  });
});
