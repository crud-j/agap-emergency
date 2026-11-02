import { api, asPaginated } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Response types (snake_case — Prisma serialization) ─────────────────────

export interface Organization {
  id: string;
  name: string;
  short_name: string | null;
  organization_type: string;
  barangay: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

// ─── Request bodies (camelCase — matches NestJS DTO) ─────────────────────────

export interface CreateOrgBody {
  name: string;
  shortName?: string;
  organizationType: string;
  barangay?: string;
  contactNumber?: string;
  email?: string;
  address?: string;
}

export type UpdateOrgBody = Partial<CreateOrgBody> & { isActive?: boolean };

// ─── Fetchers ────────────────────────────────────────────────────────────────

/**
 * GET /organizations returns a plain array of active organizations
 * (organizations.service.ts findAll); wrap it so callers keep the PaginatedResult shape.
 */
export async function fetchOrganizations(params?: {
  orgType?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedResult<Organization>> {
  const qs = new URLSearchParams();
  // The backend ignores orgType, page and perPage today; no caller relies on them.
  if (params?.orgType)  qs.set('orgType', params.orgType);
  if (params?.page)     qs.set('page', String(params.page));
  if (params?.perPage)  qs.set('perPage', String(params.perPage));
  const body = await api.get<Organization[] | PaginatedResult<Organization>>(`/organizations?${qs}`, getToken());
  return asPaginated(body);
}

export function fetchOrganization(id: string): Promise<Organization> {
  return api.get(`/organizations/${id}`, getToken());
}

export function createOrganization(body: CreateOrgBody): Promise<Organization> {
  return api.post('/organizations', body, getToken());
}

export function updateOrganization(id: string, body: UpdateOrgBody): Promise<Organization> {
  return api.patch(`/organizations/${id}`, body, getToken());
}
