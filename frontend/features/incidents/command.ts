import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── ICS Types (MOD-36) ──────────────────────────────────────────────────────

export interface IcsAssignment {
  id: string;
  position: string;
  assigned_at: string;
  relieved_at: string | null;
  users: { id: string; full_name: string | null; role: string } | null;
  organization_id: string | null;
}

export interface IcsStructure {
  id: string;
  incident_id: string;
  activated_at: string;
  deactivated_at: string | null;
  objectives: string[];
  situation_notes: string | null;
  ics_assignments: IcsAssignment[];
}

// ─── Agency Types (MOD-34) ───────────────────────────────────────────────────

export interface AgencyParticipant {
  id: string;
  incident_id: string;
  organization_id: string;
  joined_at: string;
  left_at: string | null;
  role_in_incident: string | null;
  organizations: {
    id: string;
    name: string;
    short_name: string | null;
    organization_type: string;
  } | null;
}

export interface AvailableOrg {
  id: string;
  name: string;
  short_name: string | null;
  organization_type: string;
  contact_number: string | null;
}

// ─── Handover Types (MOD-44) ─────────────────────────────────────────────────

export interface HandoverUser {
  id: string;
  full_name: string | null;
  role: string;
}

export interface HandoverRecord {
  id: string;
  incident_id: string;
  from_user_id: string;
  to_user_id: string;
  situation_summary: string;
  pending_actions: string[];
  resources_in_field: Record<string, unknown> | null;
  handed_over_at: string;
  acknowledged_at: string | null;
  // Relations included by HandoverService.list()
  users_incident_handovers_from_user_idTousers?: HandoverUser | null;
  users_incident_handovers_to_user_idTousers?: HandoverUser | null;
}

// ─── Mutual Aid Types (MOD-35) ───────────────────────────────────────────────

export interface MutualAidRequest {
  id: string;
  incident_id: string;
  requesting_org_id: string;
  providing_org_id: string | null;
  resource_type: string;
  quantity: number;
  capability_needed: string[];
  priority: string;
  status: string;
  request_notes: string | null;
  response_notes: string | null;
  requested_at: string;
  fulfilled_at: string | null;
  requesting_org?: { id: string; name: string; short_name: string | null };
  providing_org?: { id: string; name: string; short_name: string | null } | null;
}

export interface MutualAidListParams {
  incidentId?: string;
  orgId?: string;
  status?: string;
  page?: number;
  perPage?: number;
}

export interface CreateMutualAidBody {
  incidentId: string;
  resourceType: string;
  quantity?: number;
  capabilityNeeded?: string[];
  priority?: string;
  requestNotes?: string;
}

// ─── ICS fetchers ─────────────────────────────────────────────────────────────

export function fetchIcs(incidentId: string): Promise<IcsStructure> {
  return api.get(`/incidents/${incidentId}/ics`, getToken());
}

export function activateIcs(
  incidentId: string,
  objectives: string[],
): Promise<IcsStructure> {
  return api.post(`/incidents/${incidentId}/ics/activate`, { objectives }, getToken());
}

export function updateIcs(
  incidentId: string,
  data: { objectives?: string[]; situationNotes?: string },
): Promise<IcsStructure> {
  return api.patch(`/incidents/${incidentId}/ics`, data, getToken());
}

export function deactivateIcs(incidentId: string): Promise<IcsStructure> {
  return api.post(`/incidents/${incidentId}/ics/deactivate`, {}, getToken());
}

export function addIcsPosition(
  incidentId: string,
  data: { userId: string; position: string; organizationId?: string },
): Promise<IcsAssignment> {
  return api.post(`/incidents/${incidentId}/ics/positions`, data, getToken());
}

export function removeIcsPosition(
  incidentId: string,
  posId: string,
): Promise<void> {
  return api.delete(`/incidents/${incidentId}/ics/positions/${posId}`, getToken());
}

// ─── Agency fetchers ──────────────────────────────────────────────────────────

export function fetchAgencies(incidentId: string): Promise<AgencyParticipant[]> {
  return api.get(`/incidents/${incidentId}/agencies`, getToken());
}

export function fetchAvailableAgencies(
  incidentId: string,
  orgType?: string,
): Promise<AvailableOrg[]> {
  const qs = orgType ? `?orgType=${encodeURIComponent(orgType)}` : '';
  return api.get(`/incidents/${incidentId}/agencies/available${qs}`, getToken());
}

export function addAgency(
  incidentId: string,
  organizationId: string,
  roleInIncident?: string,
): Promise<AgencyParticipant> {
  return api.post(`/incidents/${incidentId}/agencies`, { organizationId, roleInIncident }, getToken());
}

// ─── Handover fetchers ────────────────────────────────────────────────────────

export function fetchHandovers(incidentId: string): Promise<HandoverRecord[]> {
  return api.get(`/incidents/${incidentId}/handover`, getToken());
}

export function createHandover(
  incidentId: string,
  data: { toUserId: string; situationSummary: string; pendingActions?: string[] },
): Promise<HandoverRecord> {
  return api.post(`/incidents/${incidentId}/handover`, data, getToken());
}

export function acknowledgeHandover(incidentId: string): Promise<HandoverRecord> {
  return api.patch(`/incidents/${incidentId}/handover/acknowledge`, {}, getToken());
}

// ─── Mutual aid fetchers ──────────────────────────────────────────────────────

export function fetchMutualAidRequests(
  params?: MutualAidListParams,
): Promise<{ data: MutualAidRequest[]; meta: { total: number } }> {
  const qs = new URLSearchParams();
  if (params?.incidentId) qs.set('incidentId', params.incidentId);
  if (params?.orgId)      qs.set('orgId', params.orgId);
  if (params?.status)     qs.set('status', params.status);
  if (params?.page)       qs.set('page', String(params.page));
  if (params?.perPage)    qs.set('perPage', String(params.perPage));
  return api.get(`/resources/requests?${qs}`, getToken());
}

export function createMutualAidRequest(body: CreateMutualAidBody): Promise<MutualAidRequest> {
  return api.post('/resources/requests', body, getToken());
}

export function approveMutualAid(
  requestId: string,
  notes?: string,
): Promise<MutualAidRequest> {
  return api.patch(`/resources/requests/${requestId}/approve`, { notes }, getToken());
}

export function denyMutualAid(
  requestId: string,
  notes?: string,
): Promise<MutualAidRequest> {
  return api.patch(`/resources/requests/${requestId}/deny`, { notes }, getToken());
}
