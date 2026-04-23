import { readFile } from 'node:fs/promises';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { createLogger } from '../src/config/logger';
import { createMetrics } from '../src/config/metrics';
import { IdempotencyRepository } from '../src/repositories/idempotency.repository';
import { LeadRepository } from '../src/repositories/lead.repository';
import { CalendarService } from '../src/services/calendar.service';
import { LeadService } from '../src/services/lead.service';
import type { CalendarService as CalendarServiceType } from '../src/services/calendar.service';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

function createMockCalendarService(): CalendarServiceType {
  return {
    checkReady: async () => undefined,
    queryFreeBusy: async () => [],
    createMeeting: async () => ({ calendar_event_id: 'evt', calendar_event_link: null }),
    bookMeeting: async () => {
      throw new Error('not used');
    },
  } as unknown as CalendarServiceType;
}

function createCalendarHarness(dataDir: string) {
  const env = createTestEnv(dataDir);
  const logger = createLogger(env);
  const metrics = createMetrics(env);
  const leadRepository = new LeadRepository(env.DATA_DIR);
  const leadService = new LeadService(leadRepository, metrics);
  const idempotencyRepository = new IdempotencyRepository(env.DATA_DIR);
  const insertSpy = vi.fn().mockResolvedValue({
    data: {
      id: 'google-event-123',
      htmlLink: 'https://calendar.google.com/event?eid=123',
    },
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

  return {
    app,
    env,
  };
}

describe('POST /api/elevenlabs/handoff-to-human', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    await cleanupTempDataDir(dataDir);
  });

  it('persists the handoff, keeps explicit lead_email and falls back to HANDOFF_PHONE', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({
      env,
      calendarService: createMockCalendarService(),
    });

    const response = await request(app)
      .post('/api/elevenlabs/handoff-to-human')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_name: 'Ana Ruiz',
        lead_phone: '+51 955 444 333',
        lead_email: 'ana@example.com',
        conversation_summary: 'Pidio hablar con una persona del equipo.',
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.handoff.success).toBe(true);
    expect(response.body.handoff.lead_email).toBe('ana@example.com');
    expect(response.body.handoff.escalation_reason).toBe('solicitud_explicita_del_usuario');
    expect(response.body.handoff.handoff_phone).toBe(env.HANDOFF_PHONE);
    expect(response.body.state.lead_status).toBe('escalado');
    expect(response.body.state.lead_id).toBeTruthy();
  });

  it('hydrates lead_email from a persisted lead and promotes the lead to escalado', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({
      env,
      calendarService: createMockCalendarService(),
    });

    await request(app)
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_phone: '+51 955 444 333',
        lead_email: 'ana@example.com',
        lead_status: 'reunion_agendada',
      });

    const response = await request(app)
      .post('/api/elevenlabs/handoff-to-human')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        lead_phone: '+51 955 444 333',
        conversation_summary: 'Pidio hablar con una persona del equipo.',
      });

    expect(response.status).toBe(200);
    expect(response.body.handoff.lead_email).toBe('ana@example.com');
    expect(response.body.state.lead_status).toBe('escalado');

    const storedLeads = JSON.parse(await readFile(`${dataDir}/leads.json`, 'utf-8')) as Array<Record<string, unknown>>;
    expect(storedLeads[0].lead_status).toBe('escalado');
  });

  it('keeps lead_email null when there is not enough information to enrich the handoff', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({
      env,
      calendarService: createMockCalendarService(),
    });

    const response = await request(app)
      .post('/api/elevenlabs/handoff-to-human')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        conversation_summary: 'Pidio hablar con una persona del equipo.',
      });

    expect(response.status).toBe(200);
    expect(response.body.handoff.lead_email).toBeNull();
    expect(response.body.state.lead_id).toBeTruthy();
  });

  it('reuses the same lead_id across save_lead_note, create_meeting and handoff via conversation_id', async () => {
    const { app, env } = createCalendarHarness(dataDir);

    const leadResponse = await request(app)
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        conversation_id: 'conv-shared-1',
        lead_name: 'Marina Lopez',
        lead_phone: '+51 944 222 111',
        lead_email: 'marina@example.com',
      });

    const meetingResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        conversation_id: 'conv-shared-1',
        idempotency_key: 'flow-shared-1',
        meeting_datetime_iso: '2026-05-15T10:00:00-05:00',
        timezone: 'America/Lima',
      });

    const handoffResponse = await request(app)
      .post('/api/elevenlabs/handoff-to-human')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        conversation_id: 'conv-shared-1',
        conversation_summary: 'Necesita apoyo humano.',
      });

    expect(leadResponse.status).toBe(200);
    expect(meetingResponse.status).toBe(200);
    expect(handoffResponse.status).toBe(200);
    expect(meetingResponse.body.state.lead_id).toBe(leadResponse.body.state.lead_id);
    expect(handoffResponse.body.state.lead_id).toBe(leadResponse.body.state.lead_id);
    expect(handoffResponse.body.handoff.lead_email).toBe('marina@example.com');
    expect(handoffResponse.body.state.conversation_id).toBe('conv-shared-1');
  });
});
