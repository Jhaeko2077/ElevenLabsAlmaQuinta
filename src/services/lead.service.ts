import { AppMetrics } from '../config/metrics';
import { getMostAdvancedLeadStatus } from '../lib/lead-status';
import {
  normalizeBoolean,
  normalizeEmail,
  normalizeIdentifier,
  normalizeLanguage,
  normalizeLeadStatus,
  normalizeNullableString,
  normalizePhone,
  sanitizeSummary,
} from '../lib/normalize';
import { maskEmail, maskPhone, shortenText } from '../lib/redaction';
import { LeadRepository } from '../repositories/lead.repository';
import type {
  LeadLookupInput,
  LeadSaveResult,
  LeadStatus,
  SlackNotificationStatus,
  StoredLead,
  WebsiteLeadTemperature,
  WebsiteNextStep,
  WebsiteProjectType,
  WebsiteRecommendedService,
  WebsiteUrgencyLevel,
} from '../types';

type LeadContextInput = {
  lead_id?: string;
  conversation_id?: string;
  external_conversation_id?: string;
  channel_name?: string;
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
  company_name?: string;
  project_type?: WebsiteProjectType;
  business_goal?: string;
  current_website?: string;
  required_features?: string;
  domain_hosting_status?: string;
  available_materials?: string;
  desired_timeline?: string;
  approximate_budget?: string;
  urgency_level?: WebsiteUrgencyLevel;
  lead_temperature?: WebsiteLeadTemperature;
  recommended_service?: WebsiteRecommendedService;
  project_summary?: string;
  next_step?: WebsiteNextStep;
  slack_notified_at?: string | null;
  slack_notification_status?: SlackNotificationStatus;
};

function hasOwn(input: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export class LeadService {
  public constructor(
    private readonly repository: LeadRepository,
    private readonly metrics: AppMetrics,
  ) {}

  public async findLead(input: LeadLookupInput): Promise<StoredLead | null> {
    return this.repository.findByIdentifiers({
      lead_id: normalizeIdentifier(input.lead_id),
      conversation_id: normalizeIdentifier(input.conversation_id),
      external_conversation_id: normalizeIdentifier(input.external_conversation_id),
      lead_phone: normalizePhone(input.lead_phone),
      lead_email: normalizeEmail(input.lead_email),
    });
  }

  public async upsertLeadContext(
    input: LeadContextInput,
    options: {
      defaultLeadStatus?: LeadStatus;
    } = {},
  ): Promise<StoredLead> {
    const defaultLeadStatus = options.defaultLeadStatus ?? 'calificando';
    const lookup = {
      lead_id: normalizeIdentifier(input.lead_id),
      conversation_id: normalizeIdentifier(input.conversation_id),
      external_conversation_id: normalizeIdentifier(input.external_conversation_id),
      lead_phone: normalizePhone(input.lead_phone),
      lead_email: normalizeEmail(input.lead_email),
    };
    const existingLead = await this.repository.findByIdentifiers(lookup);
    const incomingLeadStatus = hasOwn(input, 'lead_status')
      ? normalizeLeadStatus(input.lead_status, existingLead?.lead_status ?? defaultLeadStatus)
      : null;
    const finalLeadStatus = getMostAdvancedLeadStatus(
      existingLead?.lead_status,
      incomingLeadStatus,
      defaultLeadStatus,
    );

    return this.repository.upsert({
      lead_id: lookup.lead_id ?? existingLead?.id ?? null,
      conversation_id: lookup.conversation_id ?? existingLead?.conversation_id ?? null,
      external_conversation_id: lookup.external_conversation_id ?? existingLead?.external_conversation_id ?? null,
      channel_name: this.resolveNullableField(input, 'channel_name', existingLead?.channel_name ?? null),
      lead_name: this.resolveNullableField(input, 'lead_name', existingLead?.lead_name ?? null),
      lead_phone: lookup.lead_phone ?? existingLead?.lead_phone ?? null,
      lead_email: lookup.lead_email ?? existingLead?.lead_email ?? null,
      lead_language: hasOwn(input, 'lead_language')
        ? normalizeLanguage(input.lead_language, existingLead?.lead_language ?? 'es')
        : existingLead?.lead_language ?? 'es',
      lead_interest_category: this.resolveNullableField(
        input,
        'lead_interest_category',
        existingLead?.lead_interest_category ?? null,
      ),
      specific_service: this.resolveNullableField(input, 'specific_service', existingLead?.specific_service ?? null),
      requested_quote: hasOwn(input, 'requested_quote')
        ? normalizeBoolean(input.requested_quote, existingLead?.requested_quote ?? false)
        : existingLead?.requested_quote ?? false,
      requested_meeting: hasOwn(input, 'requested_meeting')
        ? normalizeBoolean(input.requested_meeting, existingLead?.requested_meeting ?? false)
        : existingLead?.requested_meeting ?? false,
      preferred_date: this.resolveNullableField(input, 'preferred_date', existingLead?.preferred_date ?? null),
      preferred_time_range: this.resolveNullableField(
        input,
        'preferred_time_range',
        existingLead?.preferred_time_range ?? null,
      ),
      conversation_summary: hasOwn(input, 'conversation_summary')
        ? sanitizeSummary(input.conversation_summary) ?? existingLead?.conversation_summary ?? null
        : existingLead?.conversation_summary ?? null,
      lead_status: finalLeadStatus,
      company_name: this.resolveNullableField(input, 'company_name', existingLead?.company_name ?? null),
      project_type: this.resolveOptionalValue(input, 'project_type', existingLead?.project_type ?? null),
      business_goal: this.resolveNullableField(input, 'business_goal', existingLead?.business_goal ?? null),
      current_website: this.resolveNullableField(input, 'current_website', existingLead?.current_website ?? null),
      required_features: this.resolveNullableField(input, 'required_features', existingLead?.required_features ?? null),
      domain_hosting_status: this.resolveNullableField(
        input,
        'domain_hosting_status',
        existingLead?.domain_hosting_status ?? null,
      ),
      available_materials: this.resolveNullableField(
        input,
        'available_materials',
        existingLead?.available_materials ?? null,
      ),
      desired_timeline: this.resolveNullableField(input, 'desired_timeline', existingLead?.desired_timeline ?? null),
      approximate_budget: this.resolveNullableField(
        input,
        'approximate_budget',
        existingLead?.approximate_budget ?? null,
      ),
      urgency_level: this.resolveOptionalValue(input, 'urgency_level', existingLead?.urgency_level ?? null),
      lead_temperature: this.resolveOptionalValue(input, 'lead_temperature', existingLead?.lead_temperature ?? null),
      recommended_service: this.resolveOptionalValue(
        input,
        'recommended_service',
        existingLead?.recommended_service ?? null,
      ),
      project_summary: hasOwn(input, 'project_summary')
        ? sanitizeSummary(input.project_summary) ?? existingLead?.project_summary ?? null
        : existingLead?.project_summary ?? null,
      next_step: this.resolveOptionalValue(input, 'next_step', existingLead?.next_step ?? null),
      slack_notified_at: this.resolveOptionalValue(
        input,
        'slack_notified_at',
        existingLead?.slack_notified_at ?? null,
      ),
      slack_notification_status: this.resolveOptionalValue(
        input,
        'slack_notification_status',
        existingLead?.slack_notification_status ?? null,
      ),
    });
  }

  public async saveLeadNote(input: LeadContextInput, logger: Express.Request['logger']): Promise<LeadSaveResult> {
    const lead = await this.upsertLeadContext(input, {
      defaultLeadStatus: 'calificando',
    });

    this.metrics.leadNotesSavedTotal.inc();

    logger.info({
      event: 'lead_note_saved',
      lead_id: lead.id,
      conversation_id: lead.conversation_id,
      external_conversation_id: lead.external_conversation_id,
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
        lead_id: lead.id,
        conversation_id: lead.conversation_id,
        external_conversation_id: lead.external_conversation_id,
      },
    };
  }

  private resolveNullableField(
    input: LeadContextInput,
    key: keyof LeadContextInput,
    existingValue: string | null,
  ): string | null {
    if (!hasOwn(input, key)) {
      return existingValue;
    }

    return normalizeNullableString(input[key]) ?? existingValue;
  }

  private resolveOptionalValue<T>(
    input: LeadContextInput,
    key: keyof LeadContextInput,
    existingValue: T | null,
  ): T | null {
    if (!hasOwn(input, key)) {
      return existingValue;
    }

    return (input[key] as T | null | undefined) ?? existingValue;
  }
}
