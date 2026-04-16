import { AppMetrics } from '../config/metrics';
import { normalizeEmail, normalizeLeadStatus, normalizeNullableString, normalizePhone, sanitizeSummary } from '../lib/normalize';
import { maskEmail, maskPhone, shortenText } from '../lib/redaction';
import { HandoffRepository } from '../repositories/handoff.repository';
import type { AppEnv, HandoffResult } from '../types';

export class HandoffService {
  public constructor(
    private readonly repository: HandoffRepository,
    private readonly metrics: AppMetrics,
    private readonly env: AppEnv,
  ) {}

  public async createHandoff(input: {
    lead_name?: string;
    lead_phone?: string;
    lead_email?: string;
    escalation_reason?: string;
    conversation_summary?: string;
    lead_status?: string;
    handoff_phone?: string;
  }, logger: Express.Request['logger']): Promise<HandoffResult> {
    const handoff = await this.repository.create({
      lead_name: normalizeNullableString(input.lead_name),
      lead_phone: normalizePhone(input.lead_phone),
      lead_email: normalizeEmail(input.lead_email),
      escalation_reason: normalizeNullableString(input.escalation_reason) ?? 'solicitud_explicita_del_usuario',
      conversation_summary: sanitizeSummary(input.conversation_summary),
      lead_status: normalizeLeadStatus(input.lead_status, 'escalado') === 'escalado' ? 'escalado' : 'escalado',
      handoff_phone: normalizePhone(input.handoff_phone) ?? normalizePhone(this.env.HANDOFF_PHONE),
    });

    this.metrics.handoffsCreatedTotal.inc();

    logger.info({
      event: 'handoff_created',
      handoff_id: handoff.id,
      lead_name: handoff.lead_name,
      lead_phone: maskPhone(handoff.lead_phone),
      lead_email: maskEmail(handoff.lead_email),
      escalation_reason: handoff.escalation_reason,
      conversation_summary: shortenText(handoff.conversation_summary),
    });

    return {
      handoff,
      state: {
        lead_status: 'escalado',
      },
    };
  }
}
