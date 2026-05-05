import { readFile } from 'node:fs/promises';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import type { CalendarService } from '../src/services/calendar.service';
import { cleanupTempDataDir, createTempDataDir, createTestEnv } from './test-utils';

const validPayload = {
  lead_name: 'Carlos Ramos',
  company_name: 'Clinica Sonrisa',
  email: 'carlos@example.com',
  phone: '+51999888777',
  project_type: 'landing_page',
  business_goal: 'captar clientes interesados en servicios dentales',
  current_website: 'no tiene web',
  required_features: 'formulario de contacto, boton de WhatsApp',
  domain_hosting_status: 'no tiene dominio ni hosting',
  available_materials: 'tiene logo, no tiene textos',
  desired_timeline: 'en 30 dias',
  approximate_budget: 'no proporcionado',
  urgency_level: 'medium',
  lead_temperature: 'warm',
  recommended_service: 'landing_page',
  project_summary: 'Cliente necesita una landing page para captar leads de una clinica dental.',
  next_step: 'schedule_meeting',
  timezone: 'America/Lima',
  conversation_id: 'conv_test_001',
  external_conversation_id: 'wa_test_001',
};

const minimalCalculatedPayload = {
  lead_name: 'Carlos Ramos',
  lead_phone: '+51999888777',
  lead_email: 'carlos@example.com',
  channel_name: 'whatsapp',
  project_type: 'ecommerce',
  business_goal: 'vender productos online',
  inquiry_reason: 'quiere cotizar y reunirse esta semana',
  requested_quote: true,
  requested_meeting: true,
  timeline: 'esta semana',
  conversation_summary: 'Cliente quiere una tienda online para vender productos y desea reunirse esta semana.',
  conversation_id: 'conv_test_hot_001',
  external_conversation_id: 'wa_test_hot_001',
  urgency_level: 'muy alta',
  lead_temperature: 'hirviendo',
  recommended_service: 'tienda_online',
  project_summary: '',
  next_step: 'agendar_ya',
};

function createMockCalendarService(): CalendarService {
  return {
    checkReady: async () => undefined,
    queryFreeBusy: async () => [],
    createMeeting: async () => ({ calendar_event_id: 'evt', calendar_event_link: null }),
    bookMeeting: async () => ({
      meeting_booked: true,
      calendar_event_id: 'evt',
      calendar_event_link: null,
      meeting_datetime_iso: '2026-05-15T10:00:00-05:00',
      timezone: 'America/Lima',
      preferred_date: '2026-05-15',
      preferred_time_range: '10:00-10:30',
      requested_meeting: true,
      lead_status: 'reunion_agendada',
      lead_id: 'lead-compat',
      conversation_id: null,
      external_conversation_id: null,
      idempotency: {
        reused: false,
        key: 'test-key',
      },
    }),
  } as unknown as CalendarService;
}

describe('POST /api/elevenlabs/qualify-website-project', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createTempDataDir();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await cleanupTempDataDir(dataDir);
  });

  it('returns 401 when the API key is missing', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({ env, calendarService: createMockCalendarService() });

    const response = await request(app)
      .post('/api/elevenlabs/qualify-website-project')
      .set('Content-Type', 'application/json')
      .send(validPayload);

    expect(response.status).toBe(401);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.type).toBe('auth_error');
  });

  it('returns a content type error when JSON content type is missing', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({ env, calendarService: createMockCalendarService() });

    const response = await request(app)
      .post('/api/elevenlabs/qualify-website-project')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(JSON.stringify(validPayload));

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.type).toBe('content_type_error');
  });

  it('returns 400 when a required field is missing', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({ env, calendarService: createMockCalendarService() });
    const { project_type: _projectType, ...payload } = validPayload;

    const response = await request(app)
      .post('/api/elevenlabs/qualify-website-project')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
    expect(response.body.error.type).toBe('validation_error');
  });

  it('qualifies and persists a valid website project lead', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({ env, calendarService: createMockCalendarService() });

    const response = await request(app)
      .post('/api/elevenlabs/qualify-website-project')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(validPayload);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.tool).toBe('qualify_website_project');
    expect(response.body.state.project_type).toBe('landing_page');
    expect(response.body.state.recommended_service).toBe('landing_page');
    expect(response.body.state.lead_temperature).toBe('warm');
    expect(response.body.state.urgency_level).toBe('medium');
    expect(response.body.state.next_step).toBe('schedule_meeting');
    expect(response.body.state.requested_quote).toBe(true);
    expect(response.body.state.requested_meeting).toBe(true);
    expect(response.body.state.lead_id).toBeTruthy();
    expect(response.body.state.conversation_id).toBe('conv_test_001');
    expect(response.body.notifications.slack.status).toBe('skipped');

    const stored = JSON.parse(await readFile(`${dataDir}/leads.json`, 'utf-8')) as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0].lead_interest_category).toBe('web_project');
    expect(stored[0].specific_service).toBe('landing_page');
    expect(stored[0].company_name).toBe('Clinica Sonrisa');
    expect(stored[0].project_type).toBe('landing_page');
    expect(stored[0].requested_quote).toBe(true);
    expect(stored[0].requested_meeting).toBe(true);
  });

  it('calculates qualification fields from a minimal ElevenLabs payload', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({ env, calendarService: createMockCalendarService() });

    const response = await request(app)
      .post('/api/elevenlabs/qualify-website-project')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(minimalCalculatedPayload);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.tool).toBe('qualify_website_project');
    expect(response.body.state.project_type).toBe('ecommerce');
    expect(response.body.state.recommended_service).toBe('ecommerce_development');
    expect(response.body.state.project_summary).toContain('tienda online');
    expect(response.body.state.lead_temperature).toBe('hot');
    expect(response.body.state.urgency_level).toBe('high');
    expect(response.body.state.next_step).toBe('schedule_meeting');
    expect(response.body.state.lead_status).toBe('cotizacion_solicitada');
    expect(response.body.state.requested_quote).toBe(true);
    expect(response.body.state.requested_meeting).toBe(true);
    expect(response.body.state.conversation_id).toBe('conv_test_hot_001');
    expect(response.body.state.external_conversation_id).toBe('wa_test_hot_001');
    expect(response.body.lead.lead_phone).toBe('+51999888777');
    expect(response.body.lead.lead_email).toBe('carlos@example.com');
    expect(response.body.lead.channel_name).toBe('whatsapp');
  });
  it('sets requested_meeting false when next_step does not schedule a meeting', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({ env, calendarService: createMockCalendarService() });

    const response = await request(app)
      .post('/api/elevenlabs/qualify-website-project')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        ...validPayload,
        next_step: 'send_information',
        lead_temperature: 'cold',
      });

    expect(response.status).toBe(200);
    expect(response.body.state.requested_quote).toBe(true);
    expect(response.body.state.requested_meeting).toBe(false);
  });

  it('reuses lead identity by conversation_id and external_conversation_id', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({ env, calendarService: createMockCalendarService() });

    const firstResponse = await request(app)
      .post('/api/elevenlabs/qualify-website-project')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(validPayload);

    const secondResponse = await request(app)
      .post('/api/elevenlabs/qualify-website-project')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({
        ...validPayload,
        lead_name: undefined,
        email: undefined,
        phone: undefined,
        conversation_id: 'conv_test_001',
        external_conversation_id: 'wa_test_001',
        project_summary: 'Actualizacion del brief web.',
      });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.state.lead_id).toBe(firstResponse.body.state.lead_id);
    expect(secondResponse.body.lead.lead_email).toBe('carlos@example.com');

    const stored = JSON.parse(await readFile(`${dataDir}/leads.json`, 'utf-8')) as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
  });

  it('returns ok true when Slack fails for an otherwise valid qualification', async () => {
    const env = {
      ...createTestEnv(dataDir),
      ENABLE_SLACK_NOTIFICATIONS: true,
      SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/test',
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchSpy);
    const app = createApp({ env, calendarService: createMockCalendarService() });

    const response = await request(app)
      .post('/api/elevenlabs/qualify-website-project')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send(validPayload);

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.notifications.slack.status).toBe('failed');
    expect(response.body.notifications.slack.reason).toBe('slack_http_500');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps existing tools available after adding the new route', async () => {
    const env = createTestEnv(dataDir);
    const app = createApp({ env, calendarService: createMockCalendarService() });

    const saveLeadResponse = await request(app)
      .post('/api/elevenlabs/save-lead-note')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({ lead_name: 'Ana', lead_phone: '+51999111222' });

    const availabilityResponse = await request(app)
      .post('/api/elevenlabs/check-availability')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({ preferred_date: '2026-05-10', preferred_time_range: 'manana' });

    const meetingResponse = await request(app)
      .post('/api/elevenlabs/create-meeting')
      .set('Content-Type', 'application/json')
      .set('X-Agent-API-Key', env.AGENT_API_KEY)
      .send({ meeting_datetime_iso: '2026-05-15T10:00:00-05:00' });

    expect(saveLeadResponse.status).toBe(200);
    expect(availabilityResponse.status).toBe(200);
    expect(meetingResponse.status).toBe(200);
  });
});

