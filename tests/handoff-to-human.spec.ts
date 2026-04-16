import { readFile } from 'node:fs/promises';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import type { CalendarService } from '../src/services/calendar.service';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

describe('POST /api/elevenlabs/handoff-to-human', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    await cleanupTempDataDir(dataDir);
  });

  it('persists the handoff and falls back to HANDOFF_PHONE from env', async () => {
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
      .post('/api/elevenlabs/handoff-to-human')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_name: 'Ana Ruiz',
        lead_phone: '+51 955 444 333',
        conversation_summary: 'Pidio hablar con una persona del equipo.',
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.handoff.success).toBe(true);
    expect(response.body.handoff.escalation_reason).toBe('solicitud_explicita_del_usuario');
    expect(response.body.handoff.handoff_phone).toBe(env.HANDOFF_PHONE);
    expect(response.body.state.lead_status).toBe('escalado');

    const stored = JSON.parse(await readFile(`${dataDir}/handoffs.json`, 'utf-8')) as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0].handoff_phone).toBe(env.HANDOFF_PHONE);
  });
});
