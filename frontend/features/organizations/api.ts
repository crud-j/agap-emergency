import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  org_type: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UpdateOrganizationBody {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive?: boolean;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchOrganizations(params?: {
  orgType?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResult<Organization>> {
  const qs = new URLSearchParams();
  if (params?.orgType)  qs.set('orgType', params.orgType);
  if (params?.page)     qs.set('page', String(params.page));
  if (params?.perPage)  qs.set('perPage', String(params.perPage));
  return api.get(`/organizations?${qs}`, getToken());
}

export function fetchOrganization(id: string): Promise<Organization> {
  return api.get(`/organizations/${id}`, getToken());
}

export function updateOrganization(id: string, body: UpdateOrganizationBody): Promise<Organization> {
  return api.patch(`/organizations/${id}`, body, getToken());
}
