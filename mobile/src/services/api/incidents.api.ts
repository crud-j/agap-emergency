import type { CreateIncidentInput } from '@agap/shared';
import { authedFetch } from './authed-fetch';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function submitIncident(
  payload: CreateIncidentInput,
  token?: string,
): Promise<{ id: string; ticketNumber: string }> {
  const res = await fetch(`${API_BASE}/v1/incidents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Upload a captured photo as an incident attachment (MOD-10).
 * Best-effort by design — the caller must never let a failure here cancel or
 * block the incident itself. Requires an authenticated citizen (JWT).
 */
export async function uploadIncidentPhoto(
  incidentId: string,
  uri: string,
  token: string,
): Promise<void> {
  const name = uri.split('/').pop() || `incident-${Date.now()}.jpg`;
  const form = new FormData();
  // React Native FormData file shape.
  form.append('file', { uri, name, type: 'image/jpeg' } as unknown as Blob);

  const res = await fetch(`${API_BASE}/v1/incidents/${incidentId}/attachments`, {
    method: 'POST',
    // NOTE: do not set Content-Type — fetch adds the multipart boundary.
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
}

export async function getIncidentStatus(id: string, token?: string) {
  const res = await fetch(`${API_BASE}/v1/incidents/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Incidents reported by the authenticated citizen (MOD-42). Hits the
 * ownership-scoped /mine endpoint — the generic list route is ops-only.
 */
export async function listMyIncidents(): Promise<IncidentSummary[]> {
  const res = await authedFetch(`${API_BASE}/v1/incidents/mine`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? body : (body.data ?? []);
}

/**
 * Full citizen-facing detail for one of the user's own incidents. The backend
 * enforces ownership and omits sensitive recipient data.
 */
export async function getIncidentHistoryDetail(
  id: string,
  token: string,
): Promise<IncidentHistoryDetail> {
  const res = await fetch(`${API_BASE}/v1/incidents/${id}/detail`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Cancel an incident (MOD-08). Reporter can cancel their own pre-dispatch
 * incident; dispatchers can cancel at any cancellable status.
 *
 * Never throws silently — callers must catch and surface errors so the UI
 * never appears to have cancelled when the request actually failed.
 */
export async function cancelIncident(
  incidentId: string,
  reason: CancellationReason,
  token: string,
  notes?: string,
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${API_BASE}/v1/false-alerts/${incidentId}/cancel`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason, notes }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export enum CancellationReason {
  ACCIDENTAL_TRIGGER = 'ACCIDENTAL_TRIGGER',
  SITUATION_RESOLVED = 'SITUATION_RESOLVED',
  DUPLICATE_REPORT   = 'DUPLICATE_REPORT',
  WRONG_APP          = 'WRONG_APP',
  TEST               = 'TEST',
  OTHER              = 'OTHER',
}

export interface IncidentSummary {
  id: string;
  reference: string;
  type: string;
  priority: string;
  status: string;
  address: string | null;
  description: string | null;
  reportedAt: string;
  updatedAt: string;
}

export interface IncidentTimelineEntry {
  status: string;
  at: string;
  notes: string | null;
}

export interface IncidentNotificationEntry {
  title: string;
  channel: string;
  status: string;
  sentAt: string | null;
}

export interface IncidentHistoryDetail {
  id: string;
  reference: string;
  type: string;
  priority: string;
  status: string;
  description: string | null;
  numberOfPatients: number | null;
  reportedAt: string;
  updatedAt: string;
  reporter: { name: string | null; isGuest: boolean };
  location: {
    address: string | null;
    street: string | null;
    barangay: string | null;
    municipality: string | null;
    province: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  timeline: IncidentTimelineEntry[];
  notifications: IncidentNotificationEntry[];
  resolution: {
    outcome: string;
    disposition: string | null;
    notes: string | null;
    followUpRequired: boolean;
    closedAt: string;
  } | null;
}
