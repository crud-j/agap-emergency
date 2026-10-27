import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function authFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  return apiFetch<T>(`${API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface TransportHospital {
  id: string;
  name: string;
  facility_type: string;
  address: string | null;
  is_active: boolean;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export interface TransportRecord {
  id: string;
  incident_id: string;
  dispatch_id: string;
  destination_id: string | null;
  transport_started_at: string | null;
  estimated_arrival_at: string | null;
  arrived_at: string | null;
  facilities: { id: string; name: string } | null;
}

export function listHospitals(token: string): Promise<TransportHospital[]> {
  return authFetch<TransportHospital[]>('/v1/hospitals', token);
}

export function startTransport(
  incidentId: string,
  body: { dispatchId: string; destinationId?: string },
  token: string,
): Promise<TransportRecord> {
  return authFetch<TransportRecord>(`/v1/incidents/${incidentId}/transport`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Set or change the destination of an open transport (crew members, before arrival). */
export function updateTransportDestination(
  incidentId: string,
  transportId: string,
  destinationId: string,
  token: string,
): Promise<TransportRecord> {
  return authFetch<TransportRecord>(`/v1/incidents/${incidentId}/transport/${transportId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ destinationId }),
  });
}

export function recordArrival(
  incidentId: string,
  transportId: string,
  token: string,
): Promise<TransportRecord> {
  return authFetch<TransportRecord>(`/v1/incidents/${incidentId}/transport/${transportId}/arrive`, token, {
    method: 'PATCH',
    body: JSON.stringify({}),
  });
}

export function listTransports(incidentId: string, token: string): Promise<TransportRecord[]> {
  return authFetch<TransportRecord[]>(`/v1/incidents/${incidentId}/transport`, token);
}
