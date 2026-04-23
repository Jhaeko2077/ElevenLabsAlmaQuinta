import type { LeadStatus } from '../types';

const LEAD_STATUS_RANK: Record<LeadStatus, number> = {
  nuevo: 0,
  calificando: 1,
  cotizacion_solicitada: 2,
  reunion_en_proceso: 3,
  reunion_agendada: 4,
  escalado: 5,
  cerrado: 6,
};

export function compareLeadStatus(current: LeadStatus, next: LeadStatus): number {
  return LEAD_STATUS_RANK[current] - LEAD_STATUS_RANK[next];
}

export function canTransitionLeadStatus(
  current: LeadStatus | null | undefined,
  next: LeadStatus | null | undefined,
): boolean {
  if (!current || !next) {
    return true;
  }

  return compareLeadStatus(current, next) <= 0;
}

export function getMostAdvancedLeadStatus(
  current: LeadStatus | null | undefined,
  incoming: LeadStatus | null | undefined,
  fallback: LeadStatus = 'calificando',
): LeadStatus {
  if (!current && !incoming) {
    return fallback;
  }

  if (!current) {
    return incoming ?? fallback;
  }

  if (!incoming) {
    return current;
  }

  return canTransitionLeadStatus(current, incoming) ? incoming : current;
}
