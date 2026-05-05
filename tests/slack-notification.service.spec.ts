import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '../src/config/logger';
import { SlackNotificationService } from '../src/services/slack-notification.service';
import type { AppEnv, WebsiteLeadTemperature, WebsiteNextStep } from '../src/types';
import { createTestEnv } from './test-utils';

function createEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    ...createTestEnv('C:/tmp/slack-test'),
    ...overrides,
  };
}

function createInput(overrides: {
  lead_temperature?: WebsiteLeadTemperature;
  next_step?: WebsiteNextStep;
} = {}) {
  const qualification = {
    project_type: 'landing_page' as const,
    business_goal: 'captar clientes interesados en servicios dentales',
    recommended_service: 'landing_page' as const,
    lead_temperature: overrides.lead_temperature ?? 'warm' as const,
    urgency_level: 'medium' as const,
    project_summary: 'Cliente necesita una landing page para captar leads de una clinica dental.',
    next_step: overrides.next_step ?? 'schedule_meeting' as const,
  };

  return {
    lead: {
      id: 'lead-123',
      created_at: '2026-04-28T00:00:00.000Z',
      updated_at: '2026-04-28T00:00:00.000Z',
      conversation_id: 'conv-123',
      external_conversation_id: 'wa-123',
      channel_name: 'whatsapp',
      lead_name: 'Carlos Ramos',
      lead_phone: '+51999888777',
      lead_email: 'carlos@example.com',
      lead_language: 'es',
      lead_interest_category: 'web_project',
      specific_service: 'landing_page',
      requested_quote: true,
      requested_meeting: qualification.next_step === 'schedule_meeting',
      preferred_date: null,
      preferred_time_range: null,
      conversation_summary: qualification.project_summary,
      lead_status: 'cotizacion_solicitada' as const,
    },
    qualification,
    company_name: 'Clinica Sonrisa',
    phone: '+51999888777',
    email: 'carlos@example.com',
    current_website: 'no tiene web',
    required_features: 'formulario de contacto, boton de WhatsApp',
    domain_hosting_status: 'no tiene dominio ni hosting',
    available_materials: 'tiene logo, no tiene textos',
    desired_timeline: 'en 30 dias',
    approximate_budget: 'no proporcionado',
  };
}

describe('SlackNotificationService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips when Slack notifications are disabled', async () => {
    const env = createEnv({ ENABLE_SLACK_NOTIFICATIONS: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const service = new SlackNotificationService(env);

    const result = await service.notifyWebsiteProjectLead(createInput(), createLogger(env));

    expect(result).toEqual({
      status: 'skipped',
      reason: 'slack_notifications_disabled',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips when Slack webhook URL is missing', async () => {
    const env = createEnv({ ENABLE_SLACK_NOTIFICATIONS: true, SLACK_WEBHOOK_URL: '' });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const service = new SlackNotificationService(env);

    const result = await service.notifyWebsiteProjectLead(createInput(), createLogger(env));

    expect(result).toEqual({
      status: 'skipped',
      reason: 'missing_webhook_url',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends Slack for warm leads and includes the commercial brief payload', async () => {
    const env = createEnv({
      ENABLE_SLACK_NOTIFICATIONS: true,
      SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/test',
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const service = new SlackNotificationService(env);

    const result = await service.notifyWebsiteProjectLead(createInput({ lead_temperature: 'warm' }), createLogger(env));

    expect(result).toEqual({ status: 'sent' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string) as { text: string };
    expect(body.text).toContain('Carlos Ramos');
    expect(body.text).toContain('Clinica Sonrisa');
    expect(body.text).toContain('+51999888777');
    expect(body.text).toContain('carlos@example.com');
    expect(body.text).toContain('landing_page');
    expect(body.text).toContain('medium');
    expect(body.text).toContain('schedule_meeting');
    expect(body.text).toContain('captar clientes interesados');
    expect(body.text).toContain('Cliente necesita una landing page');
    expect(body.text).toContain('lead-123');
    expect(body.text).toContain('conv-123');
  });

  it('sends Slack for hot leads', async () => {
    const env = createEnv({
      ENABLE_SLACK_NOTIFICATIONS: true,
      SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/test',
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const service = new SlackNotificationService(env);

    const result = await service.notifyWebsiteProjectLead(createInput({ lead_temperature: 'hot' }), createLogger(env));

    expect(result.status).toBe('sent');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('sends Slack for schedule_meeting when schedule notifications are enabled', async () => {
    const env = createEnv({
      ENABLE_SLACK_NOTIFICATIONS: true,
      SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/test',
      SLACK_NOTIFY_ON_SCHEDULE_MEETING: true,
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const service = new SlackNotificationService(env);

    const result = await service.notifyWebsiteProjectLead(
      createInput({ lead_temperature: 'cold', next_step: 'schedule_meeting' }),
      createLogger(env),
    );

    expect(result.status).toBe('sent');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('skips cold leads that do not schedule a meeting', async () => {
    const env = createEnv({
      ENABLE_SLACK_NOTIFICATIONS: true,
      SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/test',
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);
    const service = new SlackNotificationService(env);

    const result = await service.notifyWebsiteProjectLead(
      createInput({ lead_temperature: 'cold', next_step: 'send_information' }),
      createLogger(env),
    );

    expect(result).toEqual({
      status: 'skipped',
      reason: 'lead_below_notification_threshold',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns failed when Slack responds with an error', async () => {
    const env = createEnv({
      ENABLE_SLACK_NOTIFICATIONS: true,
      SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/test',
    });
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchSpy);
    const service = new SlackNotificationService(env);

    const result = await service.notifyWebsiteProjectLead(createInput(), createLogger(env));

    expect(result).toEqual({
      status: 'failed',
      reason: 'slack_http_500',
    });
  });
});
