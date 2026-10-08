import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Responder {
  id: string;
  user_id: string;
  full_name: string;
  phone_number: string | null;
  status: string | null;
  resource_id: string | null;
  organization_id: string;
  resource?: { id: string; name: string; call_sign: string | null };
}

export interface ResponderListParams {
  status?: string;
  organization_id?: string;
  page?: number;
  perPage?: number;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchResponders(params?: ResponderListParams): Promise<PaginatedResult<Responder>> {
  const qs = new URLSearchParams();
  if (params?.status)          qs.set('status', params.status);
  if (params?.organization_id) qs.set('organization_id', params.organization_id);
  if (params?.page)            qs.set('page', String(params.page));
  if (params?.perPage)         qs.set('perPage', String(params.perPage));
  return api.get(`/responders?${qs}`, getToken());
}

export function fetchResponder(id: string): Promise<Responder> {
  return api.get(`/responders/${id}`, getToken());
}

export function updateResponderStatus(id: string, status: string): Promise<Responder> {
  return api.patch(`/responders/${id}/status`, { status }, getToken());
}
