import { z } from 'zod';

const optionalText = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return undefined;
}, z.string().min(1).optional());

const optionalBooleanish = z.union([z.boolean(), z.string(), z.number()]).optional();

export const saveLeadNoteSchema = z.object({
  lead_name: optionalText,
  lead_phone: optionalText,
  lead_email: optionalText,
  lead_language: optionalText,
  lead_interest_category: optionalText,
  specific_service: optionalText,
  requested_quote: optionalBooleanish,
  requested_meeting: optionalBooleanish,
  preferred_date: optionalText,
  preferred_time_range: optionalText,
  conversation_summary: optionalText,
  lead_status: optionalText,
  channel_name: optionalText,
}).passthrough();
