import type { CreateIncidentInput } from '@agap/shared';
import type { PhotoCaptureMeta } from '@/src/types/incident-capture';
import { File, UploadTask, UploadType } from 'expo-file-system';
import { authedFetch } from './authed-fetch';
import { apiFetch, ApiError } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function submitIncident(
  payload: CreateIncidentInput,
  token?: string,
): Promise<{ id: string; public_reference: string; priority?: string }> {
  return apiFetch<{ id: string; public_reference: string; priority?: string }>(`${API_BASE}/v1/incidents`, {
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
    png: 'image/png', webp: 'image/webp',
    mp4: 'video/mp4',
    // expo-camera's recordAsync() writes a QuickTime container on iOS (Android writes mp4).
    mov: 'video/quicktime', qt: 'video/quicktime',
  };
  // Fall back to a generic binary type rather than image/jpeg when the extension
  // is unrecognized — mislabeling a video as a photo sends it through the wrong
  // size-limit tier on the backend and gets it silently rejected.
  const type = MIME[ext] ?? 'application/octet-stream';

  const parameters: Record<string, string> = {};
  // Trusted capture provenance — stamped on-device at the shutter, not from EXIF.
  if (meta) {
    parameters.capturedAt = String(meta.capturedAt);
    if (meta.source != null)   parameters.captureSource = meta.source;
    if (meta.lat != null)      parameters.captureLat = String(meta.lat);
    if (meta.lng != null)      parameters.captureLng = String(meta.lng);
    if (meta.accuracy != null) parameters.captureAccuracy = String(meta.accuracy);
  }

  // Uses expo-file-system's native UploadTask rather than fetch()+FormData:
  // React Native's own FormData file-part shape ({ uri, name, type }) is rejected
  // by this RN version's New Architecture networking module with "Unsupported
  // FormDataPart implementation" — every photo/video upload failed with a generic
  // NetworkError before it ever left the device. The native multipart upload
  // sidesteps RN's fetch/FormData bridge entirely.
  const task = new UploadTask(
    new File(uri),
    `${API_BASE}/v1/incidents/${incidentId}/attachments`,
    {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: type,
      parameters,
      headers: {
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': '1',
      },
    },
  );

  const result = await task.uploadAsync();
  if (result.status < 200 || result.status >= 300) {
    const body = (() => { try { return JSON.parse(result.body); } catch { return {}; } })();
    throw new ApiError((body as any).message ?? `HTTP ${result.status}`, result.status, body);
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
  meta?: PhotoCaptureMeta,
): Promise<void> {
  return uploadIncidentPhoto(incidentId, uri, token, meta);
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
/** Verified Reporter standing: a report counts once its incident is CLOSED. */
export interface ReporterStanding {
  verifiedReports: number;
  falseAlerts: number;
  isVerifiedReporter: boolean;
}

export async function getMyStanding(): Promise<ReporterStanding> {
  const res = await authedFetch(`${API_BASE}/v1/incidents/mine/standing`);
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  return res.json();
}

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
