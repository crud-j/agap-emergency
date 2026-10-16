import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Responder {
  id: string;
  full_name: string;
  phone_number: string | null;
  status: string | null;
  availability_status: string;
  availability_changed_at: string | null;
  organization: { id: string; name: string } | null;
}

export interface ResponderListParams {
  page?: number;
  perPage?: number;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchResponders(params?: ResponderListParams): Promise<Responder[]> {
  const qs = new URLSearchParams();
  if (params?.page)    qs.set('page', String(params.page));
  if (params?.perPage) qs.set('perPage', String(params.perPage));
  return api.get(`/responders?${qs}`, getToken());
}

export function fetchResponder(id: string): Promise<Responder> {
  return api.get(`/responders/${id}`, getToken());
}

export function updateResponderStatus(id: string, status: string): Promise<Responder> {
  return api.patch(`/responders/${id}/status`, { status }, getToken());
}
