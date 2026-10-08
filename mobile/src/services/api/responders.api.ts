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
