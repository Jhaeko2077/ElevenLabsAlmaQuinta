import type { BusyWindow, ParsedTimeRange, QueryWindow, SuggestedSlot } from '../types';

const MORNING_WORDS = new Set(['mañana', 'manana', 'morning', 'am']);
const AFTERNOON_WORDS = new Set(['tarde', 'afternoon', 'pm']);

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function getTimeParts(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

function timeToMinutes(value: string): number {
  const parts = getTimeParts(value);

  if (!parts) {
    throw new Error(`Hora inválida: ${value}`);
  }

  return (parts.hour * 60) + parts.minute;
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getPartsFromDate(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.get('year')),
    month: Number(lookup.get('month')),
    day: Number(lookup.get('day')),
    hour: Number(lookup.get('hour')),
    minute: Number(lookup.get('minute')),
    second: Number(lookup.get('second')),
  };
}

export function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = getPartsFromDate(date, timeZone);
  const utcEquivalent = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return Math.round((utcEquivalent - date.getTime()) / 60000);
}

function offsetToString(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  return `${sign}${pad(hours)}:${pad(minutes)}`;
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = getPartsFromDate(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function formatTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = getPartsFromDate(date, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatIsoInTimeZone(date: Date, timeZone: string): string {
  const parts = getPartsFromDate(date, timeZone);
  const offset = offsetToString(getTimeZoneOffsetMinutes(date, timeZone));

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${offset}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + (minutes * 60_000));
}

export function makeZonedDate(dateString: string, timeString: string, timeZone: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  const time = getTimeParts(timeString);

  if (!year || !month || !day || !time) {
    throw new Error(`Fecha u hora inválida: ${dateString} ${timeString}`);
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, time.hour, time.minute, 0));
  const initialOffset = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  let actualDate = new Date(Date.UTC(year, month - 1, day, time.hour, time.minute, 0) - (initialOffset * 60_000));

  const refinedOffset = getTimeZoneOffsetMinutes(actualDate, timeZone);

  if (refinedOffset !== initialOffset) {
    actualDate = new Date(Date.UTC(year, month - 1, day, time.hour, time.minute, 0) - (refinedOffset * 60_000));
  }

  return actualDate;
}

export function parseDateInput(
  input: string,
  timeZone: string,
  referenceDate = new Date(),
): string | null {
  const normalized = input.trim().toLowerCase();

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (['hoy', 'today'].includes(normalized)) {
    return formatDateInTimeZone(referenceDate, timeZone);
  }

  if (['mañana', 'manana', 'tomorrow'].includes(normalized)) {
    return formatDateInTimeZone(addMinutes(referenceDate, 24 * 60), timeZone);
  }

  const parsed = new Date(input);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatDateInTimeZone(parsed, timeZone);
}

export function parseTimeRangeInput(
  input: string | null | undefined,
  businessStart: string,
  businessEnd: string,
): ParsedTimeRange {
  if (!input || input.trim().length === 0) {
    return {
      startTime: businessStart,
      endTime: businessEnd,
      normalizedLabel: `${businessStart}-${businessEnd}`,
      usedDefaultWindow: true,
    };
  }

  const normalized = input.trim().toLowerCase();

  if (MORNING_WORDS.has(normalized)) {
    return {
      startTime: '09:00',
      endTime: '12:00',
      normalizedLabel: '09:00-12:00',
      usedDefaultWindow: false,
    };
  }

  if (AFTERNOON_WORDS.has(normalized)) {
    return {
      startTime: '14:00',
      endTime: '18:00',
      normalizedLabel: '14:00-18:00',
      usedDefaultWindow: false,
    };
  }

  const rangeMatch = normalized.match(/^(\d{1,2}:\d{2})\s*[-a]\s*(\d{1,2}:\d{2})$/);

  if (rangeMatch) {
    const start = rangeMatch[1].padStart(5, '0');
    const end = rangeMatch[2].padStart(5, '0');

    if (timeToMinutes(start) < timeToMinutes(end)) {
      return {
        startTime: start,
        endTime: end,
        normalizedLabel: `${start}-${end}`,
        usedDefaultWindow: false,
      };
    }
  }

  return {
    startTime: businessStart,
    endTime: businessEnd,
    normalizedLabel: `${businessStart}-${businessEnd}`,
    usedDefaultWindow: true,
  };
}

export function buildQueryWindow(
  normalizedDate: string,
  timeRange: ParsedTimeRange,
  timeZone: string,
): QueryWindow {
  const start = makeZonedDate(normalizedDate, timeRange.startTime, timeZone);
  const end = makeZonedDate(normalizedDate, timeRange.endTime, timeZone);

  return {
    start,
    end,
    startIso: formatIsoInTimeZone(start, timeZone),
    endIso: formatIsoInTimeZone(end, timeZone),
    normalizedDate,
    normalizedTimeRange: timeRange.normalizedLabel,
    timezone: timeZone,
  };
}

export function buildSlots(
  queryWindow: QueryWindow,
  durationMinutes: number,
  timeZone: string,
): SuggestedSlot[] {
  const slots: SuggestedSlot[] = [];
  let current = new Date(queryWindow.start);

  while ((current.getTime() + (durationMinutes * 60_000)) <= queryWindow.end.getTime()) {
    const end = addMinutes(current, durationMinutes);

    slots.push({
      start_iso: formatIsoInTimeZone(current, timeZone),
      end_iso: formatIsoInTimeZone(end, timeZone),
      label: `${formatDateInTimeZone(current, timeZone)} ${formatTimeInTimeZone(current, timeZone)}`,
      local_date: formatDateInTimeZone(current, timeZone),
      local_time: formatTimeInTimeZone(current, timeZone),
      timezone: timeZone,
    });

    current = end;
  }

  return slots;
}

function overlaps(slot: SuggestedSlot, busyWindow: BusyWindow): boolean {
  const slotStart = new Date(slot.start_iso).getTime();
  const slotEnd = new Date(slot.end_iso).getTime();
  const busyStart = new Date(busyWindow.start).getTime();
  const busyEnd = new Date(busyWindow.end).getTime();

  return slotStart < busyEnd && slotEnd > busyStart;
}

export function filterBusySlots(slots: SuggestedSlot[], busyWindows: BusyWindow[]): SuggestedSlot[] {
  return slots.filter((slot) => busyWindows.every((busyWindow) => !overlaps(slot, busyWindow)));
}

export function formatSuggestedSlots(slots: SuggestedSlot[], maxSlots = 5): SuggestedSlot[] {
  return slots.slice(0, maxSlots);
}

export function parseMeetingDateTimeInput(
  input: string,
  timeZone: string,
): {
  start: Date;
  normalizedIso: string;
  preferredDate: string;
  preferredTimeRange: string;
} | null {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const isoWithOffset = /([zZ]|[+-]\d{2}:\d{2})$/;
  let start: Date | null = null;

  if (isoWithOffset.test(trimmed)) {
    const parsed = new Date(trimmed);
    start = Number.isNaN(parsed.getTime()) ? null : parsed;
  } else {
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})(?::\d{2})?$/);

    if (!match) {
      return null;
    }

    start = makeZonedDate(match[1], match[2], timeZone);
  }

  if (!start) {
    return null;
  }

  const preferredDate = formatDateInTimeZone(start, timeZone);
  const localTime = formatTimeInTimeZone(start, timeZone);
  const endTime = formatTimeInTimeZone(addMinutes(start, 30), timeZone);

  return {
    start,
    normalizedIso: formatIsoInTimeZone(start, timeZone),
    preferredDate,
    preferredTimeRange: `${localTime}-${endTime}`,
  };
}

export function getBusinessHoursRange(
  normalizedDate: string,
  businessStart: string,
  businessEnd: string,
  timeZone: string,
): QueryWindow {
  return buildQueryWindow(
    normalizedDate,
    {
      startTime: businessStart,
      endTime: businessEnd,
      normalizedLabel: `${businessStart}-${businessEnd}`,
      usedDefaultWindow: true,
    },
    timeZone,
  );
}
