import type { CreateIncidentInput } from '@agap/shared';
import type { PhotoCaptureMeta } from '@/src/types/incident-capture';
import { authedFetch } from './authed-fetch';
import { apiFetch, defaultHeaders, multipartHeaders, ApiError } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function submitIncident(
  payload: CreateIncidentInput,
  token?: string,
): Promise<{ id: string; ticketNumber: string }> {
  return apiFetch(`${API_BASE}/v1/incidents`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify(payload),
  });
}

/**
 * Upload a captured photo as an incident attachment (MOD-10).
 * Best-effort by design — a failure here must never cancel or block the incident.
 *
 * `meta` carries trusted capture provenance (Tier 1 photo validation) as extra
 * multipart fields the backend reads during triage (MOD-25) to score authenticity.
 * The fields are advisory — the backend must ignore them gracefully if absent.
 */
export async function uploadIncidentPhoto(
  incidentId: string,
  uri: string,
  token: string,
  meta?: PhotoCaptureMeta,
): Promise<void> {
  const name = uri.split('/').pop() || `incident-${Date.now()}.jpg`;
  const ext  = name.split('.').pop()?.toLowerCase() ?? '';
  const MIME: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp', mp4: 'video/mp4',
  };
  const type = MIME[ext] ?? 'image/jpeg';
  const form = new FormData();
  // React Native FormData file shape.
  form.append('file', { uri, name, type } as unknown as Blob);

  // Trusted capture provenance — stamped on-device at the shutter, not from EXIF.
  if (meta) {
    form.append('capturedAt', String(meta.capturedAt));
    form.append('captureSource', meta.source);
    if (meta.lat != null)      form.append('captureLat', String(meta.lat));
    if (meta.lng != null)      form.append('captureLng', String(meta.lng));
    if (meta.accuracy != null) form.append('captureAccuracy', String(meta.accuracy));
  }

  const res = await authedFetch(`${API_BASE}/v1/incidents/${incidentId}/attachments`, {
    method: 'POST',
    // Content-Type intentionally omitted — runtime sets multipart boundary.
    headers: multipartHeaders(token),
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError((err as any).message ?? `HTTP ${res.status}`, res.status);
  }
}

/**
 * Upload a recorded video clip as an incident attachment (MOD-10).
 * Best-effort — failure must never cancel or modify the incident.
 */
export async function uploadIncidentVideo(
  incidentId: string,
  uri: string,
  token: string,
): Promise<void> {
  return uploadIncidentPhoto(incidentId, uri, token);
}

export async function getIncidentStatus(id: string, token?: string) {
  return apiFetch(`${API_BASE}/v1/incidents/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

/**
 * Incidents reported by the authenticated citizen (MOD-42). Hits the
 * ownership-scoped /mine endpoint — the generic list route is ops-only.
 */
export async function listMyIncidents(): Promise<IncidentSummary[]> {
  const res = await authedFetch(`${API_BASE}/v1/incidents/mine`);
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  const body = await res.json();
  return Array.isArray(body) ? body : (body.data ?? []);
}

/**
 * Full citizen-facing detail for one of the user's own incidents (MOD-42).
 * Uses authedFetch so a stale access token is refreshed automatically rather
 * than hard-failing with 401.
 */
export async function getIncidentHistoryDetail(
  id: string,
  token: string,
): Promise<IncidentHistoryDetail> {
  const res = await authedFetch(`${API_BASE}/v1/incidents/${id}/detail`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  return res.json();
}

/**
 * Cancel an incident (MOD-08). Never throws silently — callers must catch and
 * surface errors so the UI never appears to have cancelled when it hasn't.
 */
export async function cancelIncident(
  incidentId: string,
  reason: CancellationReason,
  token: string,
  notes?: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`${API_BASE}/v1/false-alerts/${incidentId}/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason, notes }),
  });
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
