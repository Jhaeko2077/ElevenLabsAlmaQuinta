import { LEAD_STATUSES, type LeadStatus } from '../types';

function toTrimmedString(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes', 'y', 'si', 'sí', 'on'].includes(normalized)) {
      return true;
    }

    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

export function normalizePhone(value: unknown): string | null {
  const phone = toTrimmedString(value);

  if (!phone) {
    return null;
  }

  const normalized = phone.replace(/[^\d+]/g, '');
  return normalized.length >= 6 ? normalized : null;
}

export function normalizeEmail(value: unknown): string | null {
  const email = toTrimmedString(value)?.toLowerCase() ?? null;

  if (!email) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeLanguage(value: unknown, fallback = 'es'): string {
  const language = toTrimmedString(value)?.toLowerCase() ?? fallback;

  if (['es', 'en', 'pt'].includes(language)) {
    return language;
  }

  if (['spanish', 'español', 'espanol'].includes(language)) {
    return 'es';
  }

  if (['english', 'inglés', 'ingles'].includes(language)) {
    return 'en';
  }

  if (['portuguese', 'português', 'portugues'].includes(language)) {
    return 'pt';
  }

  return fallback;
}

export function normalizeLeadStatus(value: unknown, fallback: LeadStatus = 'calificando'): LeadStatus {
  const status = toTrimmedString(value)?.toLowerCase() ?? fallback;
  const directMatch = LEAD_STATUSES.find((item) => item === status);

  if (directMatch) {
    return directMatch;
  }

  const mappedStatus: Record<string, LeadStatus> = {
    nuevo_lead: 'nuevo',
    meeting: 'reunion_en_proceso',
    meeting_in_progress: 'reunion_en_proceso',
    agendada: 'reunion_agendada',
    scheduled: 'reunion_agendada',
    quoted: 'cotizacion_solicitada',
    quote_requested: 'cotizacion_solicitada',
    escalated: 'escalado',
    closed: 'cerrado',
  };

  return mappedStatus[status] ?? fallback;
}

export function normalizeTimezone(value: unknown, fallback = 'America/Lima'): string {
  const timezone = toTrimmedString(value) ?? fallback;

  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return fallback;
  }
}

export function sanitizeSummary(value: unknown): string | null {
  const text = toTrimmedString(value);

  if (!text) {
    return null;
  }

  return text
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .slice(0, 2000)
    .trim();
}

export function normalizeNullableString(value: unknown): string | null {
  return toTrimmedString(value);
}
