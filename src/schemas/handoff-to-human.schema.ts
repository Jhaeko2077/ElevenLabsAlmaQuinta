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

export const handoffToHumanSchema = z.object({
  lead_name: optionalText,
  lead_phone: optionalText,
  lead_email: optionalText,
  escalation_reason: optionalText,
  conversation_summary: optionalText,
  lead_status: optionalText,
  handoff_phone: optionalText,
}).passthrough();
