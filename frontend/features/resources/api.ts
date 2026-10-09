import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Response types ───────────────────────────────────────────────────────────

export interface Resource {
  id: string;
  name: string;
  call_sign: string | null;
  resource_type: string;
  status: string;
  base_barangay: string | null;
  base_lat: number | null;
  base_lng: number | null;
  organization_id: string;
  organization?: { id: string; name: string; short_name?: string | null };
  capabilities?: string[];
}

export interface FleetItem extends Resource {
  current_lat: number | null;
  current_lng: number | null;
  last_location_at: string | null;
  assigned_incident_id: string | null;
}

// ─── Request bodies ───────────────────────────────────────────────────────────

export interface ResourceListParams {
  status?: string;
  resource_type?: string;
  organization_id?: string;
  page?: number;
  perPage?: number;
}

export interface CreateResourceBody {
  organizationId: string;
  name: string;
  callSign?: string;
  resourceType: string;
  vehicleId?: string;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchResources(params?: ResourceListParams): Promise<PaginatedResult<Resource>> {
  const qs = new URLSearchParams();
  if (params?.status)          qs.set('status', params.status);
  if (params?.resource_type)   qs.set('type', params.resource_type);
  if (params?.organization_id) qs.set('orgId', params.organization_id);
  if (params?.page)            qs.set('page', String(params.page));
  if (params?.perPage)         qs.set('perPage', String(params.perPage));
  return api.get(`/resources?${qs}`, getToken());
}

export function fetchResource(id: string): Promise<Resource> {
  return api.get(`/resources/${id}`, getToken());
}

export function fetchAvailableResources(): Promise<Resource[]> {
  return api.get('/resources/available', getToken());
}

export function createResource(body: CreateResourceBody): Promise<Resource> {
  return api.post('/resources', body, getToken());
}

export function updateResource(id: string, body: Partial<CreateResourceBody>): Promise<Resource> {
  return api.patch(`/resources/${id}`, body, getToken());
}

export function updateResourceStatus(id: string, status: string): Promise<Resource> {
  return api.patch(`/resources/${id}/status`, { status }, getToken());
}

export function fetchFleet(params?: ResourceListParams): Promise<PaginatedResult<FleetItem>> {
  const qs = new URLSearchParams();
  if (params?.status)          qs.set('status', params.status);
  if (params?.organization_id) qs.set('organization_id', params.organization_id);
  if (params?.page)            qs.set('page', String(params.page));
  if (params?.perPage)         qs.set('perPage', String(params.perPage));
  return api.get(`/fleet?${qs}`, getToken());
}

export function fetchFleetUnit(id: string): Promise<FleetItem> {
  return api.get(`/fleet/${id}`, getToken());
}
