import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function authFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  return apiFetch<T>(`${API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** facilities.location_status: PENDING_REVIEW / REJECTED are never selectable (the API hides them). */
export type FacilityLocationStatus = 'UNVERIFIED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
export type FacilityReceivingStatus = 'OPEN' | 'AT_CAPACITY' | 'CLOSED' | 'EMERGENCY_ONLY' | 'UNKNOWN';
/** FACILITY_DEACTIVATED reaches the crew only over incident.transport_updated (the hospital was deactivated mid-transport). */
export type DestinationWarning = 'FACILITY_AT_CAPACITY' | 'FACILITY_DEACTIVATED';

export interface TransportHospital {
  id: string;
  name: string;
  facility_type: string;
  address: string | null;
  municipality?: string | null;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  location_status: FacilityLocationStatus;
  receiving_status: FacilityReceivingStatus;
}

/** GET /hospitals/nearby: VERIFIED hospitals with a location, nearest first. */
export interface NearbyHospital extends TransportHospital {
  distanceMeters: number;
  distanceKind: 'STRAIGHT_LINE';
}

export interface TransportFacility {
  id: string;
  name: string;
  facility_type?: string;
  address?: string | null;
  municipality?: string | null;
  latitude: number | null;
  longitude: number | null;
  location_status: FacilityLocationStatus;
  receiving_status: FacilityReceivingStatus;
  /** false: deactivated after the transport started. The transport continues (Reliability Rules). */
  is_active?: boolean;
}

export interface TransportRecord {
  id: string;
  incident_id: string;
  dispatch_id: string;
  destination_id: string | null;
  transport_started_at: string | null;
  estimated_arrival_at: string | null;
  arrived_at: string | null;
  facilities: TransportFacility | null;
  /** C17: set when the crew confirmed the registered reporter is the person carried. */
  reporter_patient_confirmed_at?: string | null;
  /** The reporter's own claim (a hint for the crew, never a confirmation). Staff/crew only. */
  reporterClaimsPatient?: boolean;
  /** REPORTER_DESTINATION_SHARING_ENABLED on the server; false hides the switch. Staff/crew only. */
  reporterSharingEnabled?: boolean;
}

/** POST /transport and PATCH /transport/:id also return any destination warnings. */
export type TransportMutationResult = TransportRecord & { warnings?: DestinationWarning[] };

export function listHospitals(token: string): Promise<TransportHospital[]> {
  return authFetch<TransportHospital[]>('/v1/hospitals', token);
}

export function getNearbyHospitals(lat: number, lng: number, token: string): Promise<NearbyHospital[]> {
  return authFetch<NearbyHospital[]>(`/v1/hospitals/nearby?lat=${lat}&lng=${lng}`, token);
}

export function startTransport(
  incidentId: string,
  body: { dispatchId: string; destinationId?: string },
  token: string,
): Promise<TransportMutationResult> {
  return authFetch<TransportMutationResult>(`/v1/incidents/${incidentId}/transport`, token, {
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
  clientRequestId?: string,
): Promise<TransportMutationResult> {
  return authFetch<TransportMutationResult>(`/v1/incidents/${incidentId}/transport/${transportId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ destinationId, ...(clientRequestId && { clientRequestId }) }),
  });
}

/**
 * clientRequestId: the same id on a retry gets the first answer (plan §19).
 * occurredAt: the tap time, sent only when the arrival was saved on the phone first.
 */
export function recordArrival(
  incidentId: string,
  transportId: string,
  token: string,
  opts: { clientRequestId?: string; occurredAt?: string } = {},
): Promise<TransportRecord> {
  return authFetch<TransportRecord>(`/v1/incidents/${incidentId}/transport/${transportId}/arrive`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      ...(opts.clientRequestId && { clientRequestId: opts.clientRequestId }),
      ...(opts.occurredAt && { occurredAt: opts.occurredAt }),
    }),
  });
}

/** C17: the crew confirms (or withdraws) that the registered reporter is the person carried. */
export function confirmReporterPatient(
  incidentId: string,
  transportId: string,
  confirmed: boolean,
  token: string,
): Promise<TransportRecord> {
  return authFetch<TransportRecord>(`/v1/incidents/${incidentId}/transport/${transportId}/reporter-patient`, token, {
    method: 'PATCH',
    body: JSON.stringify({ confirmed }),
  });
}

export function listTransports(incidentId: string, token: string): Promise<TransportRecord[]> {
  return authFetch<TransportRecord[]>(`/v1/incidents/${incidentId}/transport`, token);
}
