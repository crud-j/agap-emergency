import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Escalation {
  id: string;
  incident_id: string;
  escalation_type: string;
  status: string;
  reason: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_by: string | null;
  incident?: {
    id: string;
    public_reference: string;
    category: string;
    priority: string;
  };
}

export interface EscalationListParams {
  status?: string;
  incidentId?: string;
  page?: number;
  perPage?: number;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchEscalations(params?: EscalationListParams): Promise<PaginatedResult<Escalation>> {
  const qs = new URLSearchParams();
  if (params?.status)     qs.set('status', params.status);
  if (params?.incidentId) qs.set('incidentId', params.incidentId);
  if (params?.page)       qs.set('page', String(params.page));
  if (params?.perPage)    qs.set('perPage', String(params.perPage));
  return api.get(`/escalations?${qs}`, getToken());
}

export function fetchEscalation(id: string): Promise<Escalation> {
  return api.get(`/escalations/${id}`, getToken());
}

export function acknowledgeEscalation(id: string): Promise<Escalation> {
  return api.patch(`/escalations/${id}/acknowledge`, {}, getToken());
}

export function resolveEscalation(id: string, resolution?: string): Promise<Escalation> {
  return api.patch(`/escalations/${id}/resolve`, { resolution }, getToken());
}
