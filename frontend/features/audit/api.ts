import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

/** One `audit_logs` row as GET /audit returns it (Prisma AuditLog + actor name). */
export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  actor_role: string | null;
  module_id: string | null;
  incident_id: string | null;
  ip_address: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  occurred_at: string;
  users?: { full_name: string } | null;
}

export interface AuditLogParams {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  page?: number;
  perPage?: number;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchAuditLog(params?: AuditLogParams): Promise<PaginatedResult<AuditLogEntry>> {
  const qs = new URLSearchParams();
  if (params?.action)     qs.set('action', params.action);
  if (params?.entityType) qs.set('entityType', params.entityType);
  if (params?.entityId)   qs.set('entityId', params.entityId);
  if (params?.actorId)    qs.set('actorId', params.actorId);
  if (params?.from)       qs.set('from', params.from);
  if (params?.to)         qs.set('to', params.to);
  if (params?.page)       qs.set('page', String(params.page));
  if (params?.perPage)    qs.set('perPage', String(params.perPage));
  return api.get(`/audit?${qs}`, getToken());
}

/** Command log: every audit entry for one incident, newest first. */
export function fetchIncidentAudit(incidentId: string): Promise<AuditLogEntry[]> {
  return api.get(`/audit/incidents/${incidentId}`, getToken());
}

export function fetchAuditEntry(id: string): Promise<AuditLogEntry> {
  return api.get(`/audit/${id}`, getToken());
}
