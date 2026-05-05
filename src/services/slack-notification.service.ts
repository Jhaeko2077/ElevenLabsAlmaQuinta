import type { Logger } from 'pino';

import { maskEmail, maskPhone } from '../lib/redaction';
import type {
  AppEnv,
  SlackNotificationResult,
  StoredLead,
  WebsiteLeadTemperature,
  WebsiteNextStep,
  WebsiteProjectQualification,
} from '../types';

const TEMPERATURE_RANK: Record<WebsiteLeadTemperature, number> = {
  cold: 0,
  warm: 1,
  hot: 2,
};

export interface WebsiteProjectSlackInput {
  lead: StoredLead;
  qualification: WebsiteProjectQualification;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  current_website: string | null;
  required_features: string | null;
  domain_hosting_status: string | null;
  available_materials: string | null;
  desired_timeline: string | null;
  approximate_budget: string | null;
}

export class SlackNotificationService {
  public constructor(private readonly env: AppEnv) {}

  public async notifyWebsiteProjectLead(
    input: WebsiteProjectSlackInput,
    logger: Logger,
  ): Promise<SlackNotificationResult> {
    if (!this.env.ENABLE_SLACK_NOTIFICATIONS) {
      return {
        status: 'skipped',
        reason: 'slack_notifications_disabled',
      };
    }

    if (!this.env.SLACK_WEBHOOK_URL) {
      logger.warn({
        event: 'slack_notification_skipped',
        reason: 'missing_webhook_url',
        lead_id: input.lead.id,
        conversation_id: input.lead.conversation_id,
      });

      return {
        status: 'skipped',
        reason: 'missing_webhook_url',
      };
    }

    if (!this.shouldNotify(input.qualification.lead_temperature, input.qualification.next_step)) {
      return {
        status: 'skipped',
        reason: 'lead_below_notification_threshold',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.env.SLACK_NOTIFICATIONS_TIMEOUT_MS);

    try {
      const response = await fetch(this.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.buildPayload(input)),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn({
          event: 'slack_notification_failed',
          status_code: response.status,
          lead_id: input.lead.id,
          conversation_id: input.lead.conversation_id,
        });

        return {
          status: 'failed',
          reason: `slack_http_${response.status}`,
        };
      }

      logger.info({
        event: 'slack_notification_sent',
        lead_id: input.lead.id,
        conversation_id: input.lead.conversation_id,
        lead_phone: maskPhone(input.phone),
        lead_email: maskEmail(input.email),
      });

      return {
        status: 'sent',
      };
    } catch (error) {
      const reason = error instanceof Error && error.name === 'AbortError'
        ? 'slack_timeout'
        : 'slack_request_failed';

      logger.warn({
        event: 'slack_notification_failed',
        reason,
        lead_id: input.lead.id,
        conversation_id: input.lead.conversation_id,
        error_message: error instanceof Error ? error.message : 'Unknown Slack error',
      });

      return {
        status: 'failed',
        reason,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private shouldNotify(temperature: WebsiteLeadTemperature, nextStep: WebsiteNextStep): boolean {
    if (
      this.env.SLACK_NOTIFY_ON_SCHEDULE_MEETING
      && nextStep === 'schedule_meeting'
    ) {
      return true;
    }

    const minimumTemperature = this.env.SLACK_NOTIFY_MIN_TEMPERATURE === 'hot' ? 'hot' : 'warm';
    return temperature !== 'cold' && TEMPERATURE_RANK[temperature] >= TEMPERATURE_RANK[minimumTemperature];
  }

  private buildPayload(input: WebsiteProjectSlackInput): { username: string; text: string } {
    return {
      username: this.env.SLACK_APP_NAME,
      text: this.buildText(input),
    };
  }

  private buildText(input: WebsiteProjectSlackInput): string {
    const leadName = input.lead.lead_name ?? 'No proporcionado';
    const companyName = input.company_name ?? 'No proporcionado';
    const phone = input.phone ?? input.lead.lead_phone ?? 'No proporcionado';
    const email = input.email ?? input.lead.lead_email ?? 'No proporcionado';

    return [
      '*Nuevo lead web calificado desde ElevenLabs*',
      '',
      `*Nombre:* ${leadName}`,
      `*Empresa:* ${companyName}`,
      `*Telefono:* ${phone}`,
      `*Email:* ${email}`,
      '',
      `*Proyecto:* ${input.qualification.project_type}`,
      `*Servicio recomendado:* ${input.qualification.recommended_service}`,
      `*Temperatura:* ${input.qualification.lead_temperature}`,
      `*Urgencia:* ${input.qualification.urgency_level}`,
      `*Siguiente paso:* ${input.qualification.next_step}`,
      '',
      '*Objetivo:*',
      input.qualification.business_goal,
      '',
      '*Funciones:*',
      input.required_features ?? 'No proporcionado',
      '',
      '*Web actual:*',
      input.current_website ?? 'No proporcionado',
      '',
      '*Dominio / hosting:*',
      input.domain_hosting_status ?? 'No proporcionado',
      '',
      '*Materiales disponibles:*',
      input.available_materials ?? 'No proporcionado',
      '',
      '*Plazo:*',
      input.desired_timeline ?? 'No proporcionado',
      '',
      '*Presupuesto:*',
      input.approximate_budget ?? 'No proporcionado',
      '',
      '*Resumen:*',
      input.qualification.project_summary,
      '',
      '*Trazabilidad:*',
      `Lead ID: ${input.lead.id}`,
      `Conversation ID: ${input.lead.conversation_id ?? 'No proporcionado'}`,
      `External Conversation ID: ${input.lead.external_conversation_id ?? 'No proporcionado'}`,
      `Canal Slack configurado: ${this.env.SLACK_CHANNEL}`,
    ].join('\n');
  }
}

