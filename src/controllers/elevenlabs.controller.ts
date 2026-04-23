import type { Request, Response } from 'express';

import { AppMetrics } from '../config/metrics';
import { AvailabilityService } from '../services/availability.service';
import { CalendarService } from '../services/calendar.service';
import { HandoffService } from '../services/handoff.service';
import { LeadService } from '../services/lead.service';

export class ElevenLabsController {
  public constructor(
    private readonly metrics: AppMetrics,
    private readonly availabilityService: AvailabilityService,
    private readonly calendarService: CalendarService,
    private readonly leadService: LeadService,
    private readonly handoffService: HandoffService,
  ) {}

  public async checkAvailability(req: Request, res: Response): Promise<void> {
    const payload = req.validatedBody as {
      lead_id?: string;
      conversation_id?: string;
      external_conversation_id?: string;
      preferred_date: string;
      preferred_time_range?: string;
      timezone?: string;
    };

    const result = await this.availabilityService.checkAvailability(payload);
    this.metrics.elevenlabsToolSuccessTotal.inc({ tool: 'check_availability' });

    req.logger.info({
      event: 'availability_checked',
      tool_name: 'check_availability',
      lead_id: payload.lead_id ?? null,
      conversation_id: payload.conversation_id ?? null,
      external_conversation_id: payload.external_conversation_id ?? null,
      preferred_date: result.preferred_date,
      preferred_time_range: result.preferred_time_range,
      available: result.availability.available,
      suggested_slots: result.availability.suggested_slots.length,
    });

    res.status(200).json({
      ok: true,
      tool: 'check_availability',
      request_id: req.requestId,
      availability: result.availability,
      state: {
        requested_meeting: result.requested_meeting,
        preferred_date: result.preferred_date,
        preferred_time_range: result.preferred_time_range,
        lead_status: result.lead_status,
        lead_id: payload.lead_id ?? null,
        conversation_id: payload.conversation_id ?? null,
        external_conversation_id: payload.external_conversation_id ?? null,
      },
    });
  }

  public async createMeeting(req: Request, res: Response): Promise<void> {
    const payload = req.validatedBody as {
      lead_id?: string;
      conversation_id?: string;
      external_conversation_id?: string;
      idempotency_key?: string;
      lead_name?: string;
      lead_phone?: string;
      lead_email?: string;
      meeting_datetime_iso: string;
      specific_service?: string;
      conversation_summary?: string;
      timezone?: string;
    };

    const booking = await this.calendarService.bookMeeting(payload, req.logger);
    this.metrics.elevenlabsToolSuccessTotal.inc({ tool: 'create_meeting' });

    res.status(200).json({
      ok: true,
      tool: 'create_meeting',
      request_id: req.requestId,
      booking: {
        meeting_booked: booking.meeting_booked,
        calendar_event_id: booking.calendar_event_id,
        calendar_event_link: booking.calendar_event_link,
        meeting_datetime_iso: booking.meeting_datetime_iso,
        timezone: booking.timezone,
      },
      idempotency: booking.idempotency,
      state: {
        lead_status: booking.lead_status,
        preferred_date: booking.preferred_date,
        preferred_time_range: booking.preferred_time_range,
        requested_meeting: booking.requested_meeting,
        lead_id: booking.lead_id,
        conversation_id: booking.conversation_id,
        external_conversation_id: booking.external_conversation_id,
      },
    });
  }

  public async saveLeadNote(req: Request, res: Response): Promise<void> {
    const payload = req.validatedBody as Parameters<LeadService['saveLeadNote']>[0];
    const result = await this.leadService.saveLeadNote(payload, req.logger);
    this.metrics.elevenlabsToolSuccessTotal.inc({ tool: 'save_lead_note' });

    res.status(200).json({
      ok: true,
      tool: 'save_lead_note',
      request_id: req.requestId,
      lead: result.lead,
      state: result.state,
    });
  }

  public async handoffToHuman(req: Request, res: Response): Promise<void> {
    const payload = req.validatedBody as Parameters<HandoffService['createHandoff']>[0];
    const result = await this.handoffService.createHandoff(payload, req.logger);
    this.metrics.elevenlabsToolSuccessTotal.inc({ tool: 'handoff_to_human' });

    res.status(200).json({
      ok: true,
      tool: 'handoff_to_human',
      request_id: req.requestId,
      handoff: {
        success: true,
        id: result.handoff.id,
        lead_id: result.handoff.lead_id,
        conversation_id: result.handoff.conversation_id,
        external_conversation_id: result.handoff.external_conversation_id,
        created_at: result.handoff.created_at,
        lead_name: result.handoff.lead_name,
        lead_phone: result.handoff.lead_phone,
        lead_email: result.handoff.lead_email,
        escalation_reason: result.handoff.escalation_reason,
        handoff_phone: result.handoff.handoff_phone,
      },
      state: result.state,
    });
  }
}
