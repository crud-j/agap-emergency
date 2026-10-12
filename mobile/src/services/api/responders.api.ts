import type { ResponderAvailability } from '@agap/shared';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function authFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  // Some endpoints (accept/status) may return empty bodies.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface AssignmentIncidentLocation {
  latitude: string | number | null;
  longitude: string | number | null;
  formatted_address: string | null;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
}

export interface AssignmentIncident {
  id: string;
  public_reference: string;
  category: string;
  status: string;
  priority: string;
  description: string | null;
  number_of_patients: number | null;
  incident_locations: AssignmentIncidentLocation | null;
}

export interface AssignmentResource {
  id: string;
  name: string;
  call_sign: string | null;
  resource_type: string;
}

/** A dispatch the authenticated responder is crewed on (MOD-32). */
export interface Assignment {
  id: string;
  incident_id: string;
  status: string;
  dispatch_notes: string | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  incidents: AssignmentIncident | null;
  resources: AssignmentResource | null;
}

export function getMyAssignments(token: string): Promise<Assignment[]> {
  return authFetch<Assignment[]>('/v1/responders/me/assignments', token);
}

export function getAssignment(id: string, token: string): Promise<Assignment> {
  return authFetch<Assignment>(`/v1/responders/assignments/${id}`, token);
}

export function acceptAssignment(id: string, token: string): Promise<void> {
  return authFetch<void>(`/v1/responders/assignments/${id}/accept`, token, { method: 'POST' });
}

export function updateAssignmentStatus(
  id: string,
  status: string,
  token: string,
  notes?: string,
): Promise<void> {
  return authFetch<void>(`/v1/responders/assignments/${id}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...(notes ? { notes } : {}) }),
  });
}

// ─── Incident Command System (MOD-36) — read-only for responders ───────────────

export interface IcsAssignmentView {
  id: string;
  position: string;
  assigned_at: string;
  relieved_at: string | null;
  users: { id: string; full_name: string | null; role: string } | null;
}

export interface IcsStructureView {
  id: string;
  incident_id: string;
  activated_at: string;
  deactivated_at: string | null;
  objectives: string[];
  situation_notes: string | null;
  ics_assignments: IcsAssignmentView[];
}

/**
 * Fetch the ICS structure for an incident. The backend returns 404 when ICS has
 * not been activated — callers should treat a thrown error as "no ICS yet" and
 * render nothing rather than an error state.
 */
export function getIncidentIcs(incidentId: string, token: string): Promise<IcsStructureView> {
  return authFetch<IcsStructureView>(`/v1/incidents/${incidentId}/ics`, token);
}

// ─── Incident Handover (MOD-44) — responder views + acknowledges ──────────────

export interface HandoverUserView {
  id: string;
  full_name: string | null;
  role: string;
}

export interface HandoverView {
  id: string;
  incident_id: string;
  from_user_id: string;
  to_user_id: string;
  situation_summary: string;
  pending_actions: string[];
  handed_over_at: string;
  acknowledged_at: string | null;
  users_incident_handovers_from_user_idTousers?: HandoverUserView | null;
  users_incident_handovers_to_user_idTousers?: HandoverUserView | null;
}

export function getHandovers(incidentId: string, token: string): Promise<HandoverView[]> {
  return authFetch<HandoverView[]>(`/v1/incidents/${incidentId}/handover`, token);
}

/** Acknowledge the current user's pending handover for this incident. */
export function acknowledgeHandover(incidentId: string, token: string): Promise<HandoverView> {
  return authFetch<HandoverView>(`/v1/incidents/${incidentId}/handover/acknowledge`, token, {
    method: 'PATCH',
  });
}

// ─── Responder summary and personal duty availability (MOD-05 / Phase 2) ──────

export interface ResponderOrg {
  id: string;
  name: string;
  position: string | null;
}

export interface ResponderAvailabilitySummary {
  status: string;
  changedAt: string;
  source: string;
}

export interface ResponderSummary {
  user: {
    id: string;
    full_name: string | null;
    role: string;
    organizations: ResponderOrg[];
  };
  availability: ResponderAvailabilitySummary;
  activeAssignmentCount: number;
}

export interface UpdateAvailabilityResponse {
  status: string;
  changedAt: string;
  source: string;
}

export function getMySummary(token: string): Promise<ResponderSummary> {
  return authFetch<ResponderSummary>('/v1/responders/me', token);
}

export function updateMyAvailability(
  status: ResponderAvailability,
  token: string,
): Promise<UpdateAvailabilityResponse> {
  return authFetch<UpdateAvailabilityResponse>('/v1/responders/me/availability', token, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function declineAssignment(id: string, token: string): Promise<void> {
  return authFetch<void>(`/v1/responders/assignments/${id}/decline`, token, { method: 'POST' });
}
