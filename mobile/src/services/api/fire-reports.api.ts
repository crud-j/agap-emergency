import type { FireAlarmLevel, FireHazard, FireOccupancyType, FireStatus } from '@agap/shared';
import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** A fire crew's size-up report (MOD-32/36, plan Phase 3). Every field optional; counts, never names. */
export interface FireReportBody {
  alarmLevel?: FireAlarmLevel;
  fireStatus?: FireStatus;
  structuresInvolved?: number;
  occupancyType?: FireOccupancyType;
  hazards?: FireHazard[];
  spreading?: boolean;
  evacuationNeeded?: boolean;
  casualtiesSeen?: number;
  trappedPersons?: number;
  notes?: string;
  /** Fixed at the tap and kept through offline retries: a resend returns the first report. */
  clientRequestId?: string;
}

/** A stored report, newest first from GET /incidents/:id/fire-reports. */
export interface FireReport {
  id: string;
  incident_id: string;
  dispatch_id: string | null;
  alarm_level: FireAlarmLevel | null;
  fire_status: FireStatus | null;
  structures_involved: number | null;
  occupancy_type: FireOccupancyType | null;
  hazards: FireHazard[];
  spreading: boolean | null;
  evacuation_needed: boolean | null;
  casualties_seen: number | null;
  trapped_persons: number | null;
  notes: string | null;
  reported_at: string;
}

export function submitFireReport(incidentId: string, body: FireReportBody, token: string): Promise<FireReport> {
  return apiFetch<FireReport>(`${API_BASE}/v1/incidents/${incidentId}/fire-report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

/** Newest first: the first one is the current picture. */
export function getFireReports(incidentId: string, token: string): Promise<FireReport[]> {
  return apiFetch<FireReport[]>(`${API_BASE}/v1/incidents/${incidentId}/fire-reports`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
