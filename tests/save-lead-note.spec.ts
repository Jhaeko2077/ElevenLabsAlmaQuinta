import { readFile } from 'node:fs/promises';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { CalendarService } from '../src/services/calendar.service';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

function createMockCalendarService(): CalendarService {
  return {
    checkReady: async () => undefined,
    queryFreeBusy: async () => [],
    createMeeting: async () => ({ calendar_event_id: 'evt', calendar_event_link: null }),
    bookMeeting: async () => {
      throw new Error('not used');
    },
  } as unknown as CalendarService;
}

describe('POST /api/elevenlabs/save-lead-note', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    await cleanupTempDataDir(dataDir);
  });

  it('persists the normalized lead payload and returns generated identifiers', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({
      env,
      calendarService: createMockCalendarService(),
    });

    const response = await request(app)
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        conversation_id: 'conv-001',
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
    expect(response.body.state.lead_id).toBeTruthy();
    expect(response.body.state.conversation_id).toBe('conv-001');

    const stored = JSON.parse(await readFile(`${dataDir}/leads.json`, 'utf-8')) as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0].lead_name).toBe('Carlos Torres');
    expect(stored[0].requested_quote).toBe(true);
    expect(stored[0].conversation_id).toBe('conv-001');
  });

  it('keeps lead_status monotonic and only promotes to more advanced states', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({
      env,
      calendarService: createMockCalendarService(),
    });

    const initialResponse = await request(app)
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_phone: '+51 999 111 222',
        lead_name: 'Paola Diaz',
      });

    const promotedResponse = await request(app)
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_phone: '+51 999 111 222',
        lead_status: 'reunion_en_proceso',
      });

    const regressiveResponse = await request(app)
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_phone: '+51 999 111 222',
        lead_status: 'calificando',
      });

    const advancedResponse = await request(app)
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_phone: '+51 999 111 222',
        lead_status: 'reunion_agendada',
      });

    const regressiveAfterBookingResponse = await request(app)
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_phone: '+51 999 111 222',
        lead_status: 'calificando',
      });

    expect(initialResponse.body.state.lead_status).toBe('calificando');
    expect(promotedResponse.body.state.lead_status).toBe('reunion_en_proceso');
    expect(regressiveResponse.body.state.lead_status).toBe('reunion_en_proceso');
    expect(advancedResponse.body.state.lead_status).toBe('reunion_agendada');
    expect(regressiveAfterBookingResponse.body.state.lead_status).toBe('reunion_agendada');
    expect(promotedResponse.body.state.lead_id).toBe(initialResponse.body.state.lead_id);
    expect(regressiveAfterBookingResponse.body.state.lead_id).toBe(initialResponse.body.state.lead_id);
  });
});
