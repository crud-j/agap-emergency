import type { RescueAccess, RescueTakenTo, WaterLevel } from '@agap/shared';
import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** One rescue trip (MOD-32/52, plan Phase 4). Every field optional; counts, never names. */
export interface RescueTripBody {
  rescuedCount?: number;
  families?: number;
  children?: number;
  elderly?: number;
  pwd?: number;
  pregnant?: number;
  stillWaiting?: number;
  waterLevel?: WaterLevel;
  access?: RescueAccess;
  takenTo?: RescueTakenTo;
  takenToFacilityId?: string;
  takenToOther?: string;
  notes?: string;
  /** Fixed at the tap and kept through offline retries: a resend returns the first trip. */
  clientRequestId?: string;
}

/** A stored trip, newest first in the summary's `trips`. */
export interface RescueTrip {
  id: string;
  incident_id: string;
  dispatch_id: string | null;
  rescued_count: number | null;
  families: number | null;
  children: number | null;
  elderly: number | null;
  pwd: number | null;
  pregnant: number | null;
  still_waiting: number | null;
  water_level: WaterLevel | null;
  access: RescueAccess | null;
  taken_to: RescueTakenTo | null;
  taken_to_facility_id: string | null;
  reported_at: string;
  facilities?: { id: string; name: string } | null;
}

/** GET /incidents/:id/rescue-summary: running totals (computed on the server) and the trips. */
export interface RescueSummary {
  tripCount: number;
  rescued: number;
  families: number;
  children: number;
  elderly: number;
  pwd: number;
  pregnant: number;
  stillWaiting: number | null;
  stillWaitingAt: string | null;
  lastTripAt: string | null;
  trips: RescueTrip[];
}

export interface EvacuationCenter {
  id: string;
  name: string;
  barangay: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
}

export function submitRescueTrip(incidentId: string, body: RescueTripBody, token: string): Promise<RescueTrip> {
  return apiFetch<RescueTrip>(`${API_BASE}/v1/incidents/${incidentId}/rescue-trip`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export function getRescueSummary(incidentId: string, token: string): Promise<RescueSummary> {
  return apiFetch<RescueSummary>(`${API_BASE}/v1/incidents/${incidentId}/rescue-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Active evacuation centers (the trip's "taken to" picker). */
export function getEvacuationCenters(token: string): Promise<EvacuationCenter[]> {
  return apiFetch<EvacuationCenter[]>(`${API_BASE}/v1/facilities/evacuation-centers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
