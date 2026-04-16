import { AppMetrics } from '../config/metrics';
import { normalizeBoolean, normalizeEmail, normalizeLanguage, normalizeLeadStatus, normalizeNullableString, normalizePhone, sanitizeSummary } from '../lib/normalize';
import { maskEmail, maskPhone, shortenText } from '../lib/redaction';
import { LeadRepository } from '../repositories/lead.repository';
import type { LeadSaveResult } from '../types';

export class LeadService {
  public constructor(
    private readonly repository: LeadRepository,
    private readonly metrics: AppMetrics,
  ) {}

  public async saveLeadNote(input: {
    lead_name?: string;
    lead_phone?: string;
    lead_email?: string;
    lead_language?: string;
    lead_interest_category?: string;
    specific_service?: string;
    requested_quote?: unknown;
    requested_meeting?: unknown;
    preferred_date?: string;
    preferred_time_range?: string;
    conversation_summary?: string;
    lead_status?: string;
    channel_name?: string;
  }, logger: Express.Request['logger']): Promise<LeadSaveResult> {
    const lead = await this.repository.upsert({
      channel_name: normalizeNullableString(input.channel_name),
      lead_name: normalizeNullableString(input.lead_name),
      lead_phone: normalizePhone(input.lead_phone),
      lead_email: normalizeEmail(input.lead_email),
      lead_language: normalizeLanguage(input.lead_language, 'es'),
      lead_interest_category: normalizeNullableString(input.lead_interest_category),
      specific_service: normalizeNullableString(input.specific_service),
      requested_quote: normalizeBoolean(input.requested_quote, false),
      requested_meeting: normalizeBoolean(input.requested_meeting, false),
      preferred_date: normalizeNullableString(input.preferred_date),
      preferred_time_range: normalizeNullableString(input.preferred_time_range),
      conversation_summary: sanitizeSummary(input.conversation_summary),
      lead_status: normalizeLeadStatus(input.lead_status, 'calificando'),
    });

    this.metrics.leadNotesSavedTotal.inc();

    logger.info({
      event: 'lead_note_saved',
      lead_id: lead.id,
      lead_name: lead.lead_name,
      lead_phone: maskPhone(lead.lead_phone),
      lead_email: maskEmail(lead.lead_email),
      lead_status: lead.lead_status,
      conversation_summary: shortenText(lead.conversation_summary),
    });

    return {
      lead,
      state: {
        lead_status: lead.lead_status,
      },
    };
  }
}
