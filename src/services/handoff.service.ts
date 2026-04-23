import { AppMetrics } from '../config/metrics';
import { normalizeEmail, normalizeIdentifier, normalizeNullableString, normalizePhone, sanitizeSummary } from '../lib/normalize';
import { maskEmail, maskPhone, shortenText } from '../lib/redaction';
import { HandoffRepository } from '../repositories/handoff.repository';
import { LeadService } from './lead.service';
import type { AppEnv, HandoffResult } from '../types';

export class HandoffService {
  public constructor(
    private readonly repository: HandoffRepository,
    private readonly metrics: AppMetrics,
    private readonly env: AppEnv,
    private readonly leadService: LeadService,
  ) {}

  public async createHandoff(input: {
    lead_id?: string;
    conversation_id?: string;
    external_conversation_id?: string;
    lead_name?: string;
    lead_phone?: string;
    lead_email?: string;
    escalation_reason?: string;
    conversation_summary?: string;
    lead_status?: string;
    handoff_phone?: string;
  }, logger: Express.Request['logger']): Promise<HandoffResult> {
    const lookup = {
      lead_id: normalizeIdentifier(input.lead_id),
      conversation_id: normalizeIdentifier(input.conversation_id),
      external_conversation_id: normalizeIdentifier(input.external_conversation_id),
      lead_phone: normalizePhone(input.lead_phone),
      lead_email: normalizeEmail(input.lead_email),
    };
    const existingLead = await this.leadService.findLead(lookup);
    const explicitLeadEmail = normalizeEmail(input.lead_email);
    const resolvedLeadEmail = explicitLeadEmail ?? existingLead?.lead_email ?? null;

    if (!explicitLeadEmail && existingLead?.lead_email) {
      logger.info({
        event: 'handoff_lead_enriched',
        lead_id: existingLead.id,
        conversation_id: existingLead.conversation_id,
        lead_phone: maskPhone(existingLead.lead_phone),
        lead_email: maskEmail(existingLead.lead_email),
      });
    }

    if (!explicitLeadEmail && !existingLead?.lead_email) {
      logger.info({
        event: 'handoff_lead_enrichment_unresolved',
        lead_id: lookup.lead_id,
        conversation_id: lookup.conversation_id,
        external_conversation_id: lookup.external_conversation_id,
        lead_phone: maskPhone(lookup.lead_phone),
      });
    }

    const lead = await this.leadService.upsertLeadContext({
      lead_id: lookup.lead_id ?? existingLead?.id ?? undefined,
      conversation_id: lookup.conversation_id ?? existingLead?.conversation_id ?? undefined,
      external_conversation_id: lookup.external_conversation_id ?? existingLead?.external_conversation_id ?? undefined,
      lead_name: input.lead_name,
      lead_phone: lookup.lead_phone ?? existingLead?.lead_phone ?? undefined,
      lead_email: resolvedLeadEmail ?? undefined,
      conversation_summary: input.conversation_summary,
      lead_status: 'escalado',
    }, {
      defaultLeadStatus: 'escalado',
    });

    const handoff = await this.repository.create({
      lead_id: lead.id,
      conversation_id: lead.conversation_id,
      external_conversation_id: lead.external_conversation_id,
      lead_name: normalizeNullableString(input.lead_name) ?? lead.lead_name,
      lead_phone: normalizePhone(input.lead_phone) ?? lead.lead_phone,
      lead_email: resolvedLeadEmail,
      escalation_reason: normalizeNullableString(input.escalation_reason) ?? 'solicitud_explicita_del_usuario',
      conversation_summary: sanitizeSummary(input.conversation_summary) ?? lead.conversation_summary,
      lead_status: 'escalado',
      handoff_phone: normalizePhone(input.handoff_phone) ?? normalizePhone(this.env.HANDOFF_PHONE),
    });

    this.metrics.handoffsCreatedTotal.inc();

    logger.info({
      event: 'handoff_created',
      handoff_id: handoff.id,
      lead_id: handoff.lead_id,
      conversation_id: handoff.conversation_id,
      external_conversation_id: handoff.external_conversation_id,
      lead_name: handoff.lead_name,
      lead_phone: maskPhone(handoff.lead_phone),
      lead_email: maskEmail(handoff.lead_email),
      escalation_reason: handoff.escalation_reason,
      conversation_summary: shortenText(handoff.conversation_summary),
    });

    return {
      handoff,
      state: {
        lead_status: lead.lead_status,
        lead_id: lead.id,
        conversation_id: lead.conversation_id,
        external_conversation_id: lead.external_conversation_id,
      },
    };
  }
}
