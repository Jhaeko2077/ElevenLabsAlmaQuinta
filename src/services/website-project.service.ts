import {
  normalizeBoolean,
  normalizeEmail,
  normalizeIdentifier,
  normalizeNullableString,
  normalizePhone,
  sanitizeSummary,
} from '../lib/normalize';
import { LeadService } from './lead.service';
import { SlackNotificationService } from './slack-notification.service';
import type {
  SlackNotificationResult,
  WebsiteLeadTemperature,
  WebsiteNextStep,
  WebsiteProjectQualification,
  WebsiteProjectQualificationResult,
  WebsiteProjectType,
  WebsiteRecommendedService,
  WebsiteUrgencyLevel,
} from '../types';

type QualifyWebsiteProjectInput = {
  lead_id?: string;
  conversation_id?: string;
  external_conversation_id?: string;
  channel_name?: string;
  lead_name?: string;
  company_name?: string;
  email?: string;
  phone?: string;
  lead_email?: string;
  lead_phone?: string;
  project_type: WebsiteProjectType;
  business_goal: string;
  inquiry_reason?: string;
  current_website?: string;
  required_features?: string;
  domain_hosting_status?: string;
  available_materials?: string;
  desired_timeline?: string;
  timeline?: string;
  approximate_budget?: string;
  requested_quote?: unknown;
  requested_meeting?: unknown;
  conversation_summary?: string;
  urgency_level?: WebsiteUrgencyLevel;
  lead_temperature?: WebsiteLeadTemperature;
  recommended_service?: WebsiteRecommendedService;
  project_summary?: string;
  next_step?: WebsiteNextStep;
  timezone?: string;
};

const RECOMMENDED_SERVICE_BY_PROJECT_TYPE: Record<WebsiteProjectType, WebsiteRecommendedService> = {
  landing_page: 'landing_page',
  corporate_website: 'corporate_website',
  ecommerce: 'ecommerce_development',
  website_redesign: 'website_redesign',
  web_maintenance: 'website_maintenance',
  booking_website: 'booking_website',
  web_app: 'custom_web_development',
  not_sure: 'consultation_needed',
  other: 'consultation_needed',
};

export class WebsiteProjectService {
  public constructor(
    private readonly leadService: LeadService,
    private readonly slackNotificationService: SlackNotificationService,
  ) {}

  public async qualifyWebsiteProject(
    input: QualifyWebsiteProjectInput,
    logger: Express.Request['logger'],
  ): Promise<WebsiteProjectQualificationResult> {
    const businessGoal = sanitizeSummary(input.business_goal) ?? input.business_goal;
    const desiredTimeline = normalizeNullableString(input.desired_timeline) ?? normalizeNullableString(input.timeline);
    const projectSummary = this.resolveProjectSummary(input, businessGoal, desiredTimeline);
    const recommendedService = input.recommended_service ?? this.inferRecommendedService(input.project_type);
    const nextStep = input.next_step ?? this.inferNextStep(input);
    const urgencyLevel = input.urgency_level ?? this.inferUrgencyLevel(input, desiredTimeline);
    const leadTemperature = input.lead_temperature ?? this.inferLeadTemperature(input, nextStep);

    const qualification: WebsiteProjectQualification = {
      project_type: input.project_type,
      business_goal: businessGoal,
      recommended_service: recommendedService,
      lead_temperature: leadTemperature,
      urgency_level: urgencyLevel,
      project_summary: projectSummary,
      next_step: nextStep,
    };
    const requestedMeeting = nextStep === 'schedule_meeting';
    const leadPhone = normalizePhone(input.phone) ?? normalizePhone(input.lead_phone);
    const leadEmail = normalizeEmail(input.email) ?? normalizeEmail(input.lead_email);
    const companyName = normalizeNullableString(input.company_name);
    const currentWebsite = normalizeNullableString(input.current_website);
    const requiredFeatures = sanitizeSummary(input.required_features);
    const domainHostingStatus = normalizeNullableString(input.domain_hosting_status);
    const availableMaterials = sanitizeSummary(input.available_materials);
    const approximateBudget = normalizeNullableString(input.approximate_budget);

    let lead = await this.leadService.upsertLeadContext({
      lead_id: normalizeIdentifier(input.lead_id) ?? undefined,
      conversation_id: normalizeIdentifier(input.conversation_id) ?? undefined,
      external_conversation_id: normalizeIdentifier(input.external_conversation_id) ?? undefined,
      channel_name: input.channel_name,
      lead_name: input.lead_name,
      lead_phone: leadPhone ?? undefined,
      lead_email: leadEmail ?? undefined,
      lead_interest_category: 'web_project',
      specific_service: recommendedService,
      requested_quote: true,
      requested_meeting: requestedMeeting,
      conversation_summary: projectSummary,
      lead_status: 'cotizacion_solicitada',
      company_name: companyName ?? undefined,
      project_type: input.project_type,
      business_goal: businessGoal,
      current_website: currentWebsite ?? undefined,
      required_features: requiredFeatures ?? undefined,
      domain_hosting_status: domainHostingStatus ?? undefined,
      available_materials: availableMaterials ?? undefined,
      desired_timeline: desiredTimeline ?? undefined,
      approximate_budget: approximateBudget ?? undefined,
      urgency_level: urgencyLevel,
      lead_temperature: leadTemperature,
      recommended_service: recommendedService,
      project_summary: projectSummary,
      next_step: nextStep,
    }, {
      defaultLeadStatus: 'cotizacion_solicitada',
    });

    const slackResult = await this.slackNotificationService.notifyWebsiteProjectLead({
      lead,
      qualification,
      company_name: companyName,
      phone: leadPhone,
      email: leadEmail,
      current_website: currentWebsite,
      required_features: requiredFeatures,
      domain_hosting_status: domainHostingStatus,
      available_materials: availableMaterials,
      desired_timeline: desiredTimeline,
      approximate_budget: approximateBudget,
    }, logger);

    lead = await this.persistSlackStatus(lead.id, slackResult);

    return {
      lead,
      qualification,
      state: {
        ...qualification,
        lead_status: lead.lead_status,
        requested_quote: true,
        requested_meeting: requestedMeeting,
        lead_id: lead.id,
        conversation_id: lead.conversation_id,
        external_conversation_id: lead.external_conversation_id,
      },
      notifications: {
        slack: slackResult,
      },
    };
  }

  private inferRecommendedService(projectType: WebsiteProjectType): WebsiteRecommendedService {
    return RECOMMENDED_SERVICE_BY_PROJECT_TYPE[projectType];
  }

  private inferNextStep(input: QualifyWebsiteProjectInput): WebsiteNextStep {
    const text = this.buildSearchText(input);

    if (normalizeBoolean(input.requested_meeting, false) || this.containsAny(text, ['reun', 'agenda', 'cita', 'meeting', 'llamada'])) {
      return 'schedule_meeting';
    }

    if (this.containsAny(text, ['humano', 'asesor', 'ejecutivo', 'consultor'])) {
      return 'human_follow_up';
    }

    if (normalizeBoolean(input.requested_quote, false) || this.containsAny(text, ['cotiz', 'presupuesto', 'precio', 'propuesta'])) {
      return 'save_lead';
    }

    return 'continue_qualification';
  }

  private inferUrgencyLevel(
    input: QualifyWebsiteProjectInput,
    desiredTimeline: string | null,
  ): WebsiteUrgencyLevel {
    const text = this.buildSearchText(input, desiredTimeline ?? undefined);

    if (this.containsAny(text, ['urgente', 'hoy', 'manana', 'esta semana', 'asap', 'cuanto antes', 'inmediato'])) {
      return 'high';
    }

    if (this.containsAny(text, ['30 dias', 'este mes', 'proximo mes', 'pronto', '2 semanas', 'dos semanas'])) {
      return 'medium';
    }

    return 'medium';
  }

  private inferLeadTemperature(
    input: QualifyWebsiteProjectInput,
    nextStep: WebsiteNextStep,
  ): WebsiteLeadTemperature {
    if (nextStep === 'schedule_meeting') {
      return 'hot';
    }

    if (
      normalizeBoolean(input.requested_quote, false)
      || normalizeNullableString(input.approximate_budget)
      || normalizeNullableString(input.desired_timeline)
      || normalizeNullableString(input.timeline)
      || sanitizeSummary(input.required_features)
    ) {
      return 'warm';
    }

    return 'cold';
  }

  private resolveProjectSummary(
    input: QualifyWebsiteProjectInput,
    businessGoal: string,
    desiredTimeline: string | null,
  ): string {
    const explicitSummary = sanitizeSummary(input.project_summary) ?? sanitizeSummary(input.conversation_summary);

    if (explicitSummary) {
      return explicitSummary;
    }

    const parts = [
      `Objetivo: ${businessGoal}`,
      normalizeNullableString(input.inquiry_reason) ? `Motivo: ${normalizeNullableString(input.inquiry_reason)}` : null,
      sanitizeSummary(input.required_features) ? `Funciones: ${sanitizeSummary(input.required_features)}` : null,
      desiredTimeline ? `Plazo: ${desiredTimeline}` : null,
    ].filter(Boolean);

    return sanitizeSummary(parts.join(' | ')) ?? businessGoal;
  }

  private buildSearchText(input: QualifyWebsiteProjectInput, extra?: string): string {
    return [
      input.business_goal,
      input.inquiry_reason,
      input.conversation_summary,
      input.project_summary,
      input.required_features,
      input.desired_timeline,
      input.timeline,
      input.approximate_budget,
      extra,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private containsAny(text: string, terms: string[]): boolean {
    return terms.some((term) => text.includes(term));
  }

  private async persistSlackStatus(leadId: string, slackResult: SlackNotificationResult) {
    return this.leadService.upsertLeadContext({
      lead_id: leadId,
      slack_notification_status: slackResult.status,
      slack_notified_at: slackResult.status === 'sent' ? new Date().toISOString() : null,
    }, {
      defaultLeadStatus: 'cotizacion_solicitada',
    });
  }
}

