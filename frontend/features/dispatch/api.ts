import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';
import type { IncidentListItem } from '../incidents/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DispatchItem {
  id: string;
  incident_id: string;
  resource_id: string;
  status: string;
  dispatch_notes: string | null;
  dispatched_at: string;
  arrived_at: string | null;
  cancelled_at: string | null;
  resource?: ResourceSummary;
}

export interface ResourceSummary {
  id: string;
  name: string;
  call_sign: string | null;
  resource_type: string;
  status: string;
  base_barangay: string | null;
  organization_id: string;
}

/**
 * Ranked unit recommendation (MOD-29/30). Mirrors the backend
 * ResourceMatchingService response — a ranked array, assistive only.
 */
export interface ResourceRecommendation {
  rank: number;
  resourceId: string;
  resourceName: string;
  callSign: string | null;
  resourceType: string;
  organizationId: string;
  score: number;
  distanceMeters: number | null;
  requiredCapabilities: string[];
  matchedCapabilities: string[];
  rationale: string;
}

export interface PriorityRecommendation {
  incidentId: string;
  currentPriority: string;
  recommendedPriority: string;
  note: string;
}

export interface CreateDispatchBody {
  incidentId: string;
  resourceId: string;
  initialCrewIds?: string[];
  dispatchNotes?: string;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchDispatches(incidentId?: string): Promise<PaginatedResult<DispatchItem>> {
  const qs = incidentId ? `?incidentId=${incidentId}` : '';
  return api.get(`/dispatch${qs}`, getToken());
}

export function fetchDispatch(id: string): Promise<DispatchItem> {
  return api.get(`/dispatch/${id}`, getToken());
}

export function createDispatch(body: CreateDispatchBody): Promise<DispatchItem> {
  return api.post('/dispatch', body, getToken());
}

export function fetchDispatchRecommendations(incidentId: string): Promise<ResourceRecommendation[]> {
  return api.get(`/dispatch/recommendations?incidentId=${incidentId}`, getToken());
}

/** MOD-24 — assistive priority recommendation (dispatcher confirms the final priority). */
export function fetchPriorityRecommendation(incidentId: string): Promise<PriorityRecommendation> {
  return api.get(`/dispatch/priority/${incidentId}`, getToken());
}

export function fetchAvailableUnits(): Promise<ResourceSummary[]> {
  return api.get('/resources/available', getToken());
}

export function fetchDispatchIncidents(perPage = 100): Promise<{ data: IncidentListItem[] }> {
  return api.get(`/incidents?perPage=${perPage}`, getToken());
}
