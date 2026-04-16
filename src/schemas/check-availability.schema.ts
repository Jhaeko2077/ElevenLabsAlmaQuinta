import { z } from 'zod';

const requiredText = z.preprocess((value) => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return value;
}, z.string().min(1));

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

export const checkAvailabilitySchema = z.object({
  lead_name: optionalText,
  preferred_date: requiredText,
  preferred_time_range: optionalText,
  specific_service: optionalText,
  conversation_summary: optionalText,
  timezone: optionalText,
}).passthrough();
