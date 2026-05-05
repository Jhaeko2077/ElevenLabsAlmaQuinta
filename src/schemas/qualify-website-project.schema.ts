import { z } from 'zod';

import {
  WEBSITE_LEAD_TEMPERATURES,
  WEBSITE_NEXT_STEPS,
  WEBSITE_PROJECT_TYPES,
  WEBSITE_RECOMMENDED_SERVICES,
  WEBSITE_URGENCY_LEVELS,
} from '../types';

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

function requiredEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((value) => {
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }

    if (typeof value === 'number') {
      return String(value);
    }

    return value;
  }, z.enum(values));
}

function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess((value) => {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized.length > 0 ? normalized : undefined;
    }

    if (typeof value === 'number') {
      return String(value);
    }

    return undefined;
  }, z.enum(values).optional().catch(undefined));
}

const optionalBooleanish = z.union([z.boolean(), z.string(), z.number()]).optional();

export const qualifyWebsiteProjectSchema = z.object({
  lead_id: optionalText,
  conversation_id: optionalText,
  external_conversation_id: optionalText,
  lead_name: optionalText,
  company_name: optionalText,
  email: optionalText,
  phone: optionalText,
  lead_email: optionalText,
  lead_phone: optionalText,
  channel_name: optionalText,
  project_type: optionalEnum(WEBSITE_PROJECT_TYPES),
  business_goal: optionalText,
  inquiry_reason: optionalText,
  current_website: optionalText,
  required_features: optionalText,
  domain_hosting_status: optionalText,
  available_materials: optionalText,
  desired_timeline: optionalText,
  timeline: optionalText,
  approximate_budget: optionalText,
  requested_quote: optionalBooleanish,
  requested_meeting: optionalBooleanish,
  conversation_summary: optionalText,
  urgency_level: optionalEnum(WEBSITE_URGENCY_LEVELS),
  lead_temperature: optionalEnum(WEBSITE_LEAD_TEMPERATURES),
  recommended_service: optionalEnum(WEBSITE_RECOMMENDED_SERVICES),
  project_summary: optionalText,
  next_step: optionalEnum(WEBSITE_NEXT_STEPS),
  timezone: optionalText,
}).passthrough();
