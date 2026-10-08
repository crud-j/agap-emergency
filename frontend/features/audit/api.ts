import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  actor_role: string | null;
  organization_id: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  actor?: { full_name: string | null; email: string | null };
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

export function fetchAuditEntry(id: string): Promise<AuditLogEntry> {
  return api.get(`/audit/${id}`, getToken());
}
