import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types (match the `escalations` Prisma model) ──────────────────────────────

export interface EscalationIncident {
  id: string;
  public_reference: string;
  category: string;
  priority: string;
  status: string;
}

export interface Escalation {
  id: string;
  incident_id: string;
  sla_policy_id: string | null;
  escalation_level: string;
  /** ACTIVE | ACKNOWLEDGED | RESOLVED | CANCELLED */
  status: string;
  triggered_reason: string;
  sla_breach_at: string;
  notified_user_id: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  incidents?: EscalationIncident | null;
}

export interface EscalationListParams {
  status?: string;
  incidentId?: string;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────
// GET /escalations returns a plain array (no pagination).

export function fetchEscalations(params?: EscalationListParams): Promise<Escalation[]> {
  const qs = new URLSearchParams();
  if (params?.status)     qs.set('status', params.status);
  if (params?.incidentId) qs.set('incidentId', params.incidentId);
  const q = qs.toString();
  return api.get(`/escalations${q ? `?${q}` : ''}`, getToken());
}

export function fetchEscalation(id: string): Promise<Escalation> {
  return api.get(`/escalations/${id}`, getToken());
}

// Backend uses POST for both state transitions.
export function acknowledgeEscalation(id: string): Promise<Escalation> {
  return api.post(`/escalations/${id}/acknowledge`, {}, getToken());
}

export function resolveEscalation(id: string): Promise<Escalation> {
  return api.post(`/escalations/${id}/resolve`, {}, getToken());
}
