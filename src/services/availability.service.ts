import { AppMetrics } from '../config/metrics';
import { ValidationAppError } from '../lib/errors';
import {
  buildQueryWindow,
  buildSlots,
  filterBusySlots,
  formatSuggestedSlots,
  getBusinessHoursRange,
  parseDateInput,
  parseTimeRangeInput,
} from '../lib/time';
import { normalizeTimezone } from '../lib/normalize';
import type { AppEnv, AvailabilityResult, BusyWindow, CalendarServiceLike, QueryWindow, SuggestedSlot } from '../types';

export class AvailabilityService {
  public constructor(
    private readonly env: AppEnv,
    private readonly metrics: AppMetrics,
    private readonly calendarService: CalendarServiceLike,
  ) {}

  public async checkAvailability(input: {
    preferred_date: string;
    preferred_time_range?: string;
    timezone?: string;
  }): Promise<AvailabilityResult> {
    const timezone = normalizeTimezone(input.timezone, this.env.BUSINESS_TIMEZONE);
    const normalizedDate = parseDateInput(input.preferred_date, timezone);

    if (!normalizedDate) {
      throw new ValidationAppError('preferred_date is required and must be interpretable', {
        preferred_date: input.preferred_date,
      });
    }

    const parsedRange = parseTimeRangeInput(
      input.preferred_time_range,
      this.env.BUSINESS_HOURS_START,
      this.env.BUSINESS_HOURS_END,
    );

    let queryWindow = buildQueryWindow(normalizedDate, parsedRange, timezone);
    let busyWindows = await this.calendarService.queryFreeBusy({
      calendarId: this.env.GOOGLE_CALENDAR_ID,
      timeMin: queryWindow.startIso,
      timeMax: queryWindow.endIso,
    });
    let availableSlots = this.resolveAvailableSlots(queryWindow, busyWindows, timezone);
    let usedFallbackWindow = false;

    if (availableSlots.length === 0 && !parsedRange.usedDefaultWindow) {
      const fallbackWindow = getBusinessHoursRange(
        normalizedDate,
        this.env.BUSINESS_HOURS_START,
        this.env.BUSINESS_HOURS_END,
        timezone,
      );

      busyWindows = await this.calendarService.queryFreeBusy({
        calendarId: this.env.GOOGLE_CALENDAR_ID,
        timeMin: fallbackWindow.startIso,
        timeMax: fallbackWindow.endIso,
      });

      availableSlots = this.resolveAvailableSlots(fallbackWindow, busyWindows, timezone);
      queryWindow = fallbackWindow;
      usedFallbackWindow = true;
    }

    const suggestedSlots = formatSuggestedSlots(availableSlots, 5);
    const available = suggestedSlots.length > 0;

    return {
      requested_meeting: true,
      preferred_date: normalizedDate,
      preferred_time_range: queryWindow.normalizedTimeRange,
      lead_status: 'reunion_en_proceso',
      availability: {
        available,
        suggested_slots: suggestedSlots,
        checked_window: {
          start_iso: queryWindow.startIso,
          end_iso: queryWindow.endIso,
          timezone,
          used_fallback_window: usedFallbackWindow,
        },
        calendar_id: this.env.GOOGLE_CALENDAR_ID,
        message: available
          ? `Se encontraron ${suggestedSlots.length} horarios disponibles.`
          : 'No se encontraron horarios disponibles en la ventana consultada.',
      },
    };
  }

  private resolveAvailableSlots(
    queryWindow: QueryWindow,
    busyWindows: BusyWindow[],
    timezone: string,
  ): SuggestedSlot[] {
    const candidateSlots = buildSlots(
      queryWindow,
      this.env.DEFAULT_MEETING_DURATION_MINUTES,
      timezone,
    );

    this.metrics.googleCalendarFreebusyConflictsTotal.inc(busyWindows.length);
    return filterBusySlots(candidateSlots, busyWindows);
  }
}
