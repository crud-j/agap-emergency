import { authedFetch } from './authed-fetch';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/** Consent type required before any medical profile can be created/read (MOD-48). */
export const MEDICAL_CONSENT_TYPE = 'MEDICAL_PROFILE';

export interface ConsentStatus {
  consentType: string;
  granted: boolean;
  record: {
    id: string;
    consent_type: string;
    status: string;
    granted_at: string;
    withdrawn_at: string | null;
  } | null;
}

export interface AccessLogEntry {
  id: string;
  data_type: string;
  purpose: string | null;
  accessed_at: string;
  incident_id: string | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ─── Consent (MOD-48) ──────────────────────────────────────────────────────────

export async function checkConsent(type: string): Promise<ConsentStatus> {
  return json(await authedFetch(`${API_BASE}/v1/consent/${type}`));
}

export async function grantConsent(type: string): Promise<unknown> {
  return json(
    await authedFetch(`${API_BASE}/v1/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentType: type }),
    }),
  );
}

export async function revokeConsent(type: string): Promise<void> {
  const res = await authedFetch(`${API_BASE}/v1/consent/${type}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
}

// ─── Privacy (MOD-48) ──────────────────────────────────────────────────────────

/** My sensitive-data access log — who viewed my data and when. */
export async function getAccessLog(): Promise<AccessLogEntry[]> {
  return json(await authedFetch(`${API_BASE}/v1/privacy/access-log`));
}

/** Full export of my personal data (returned as a JSON object). */
export async function exportMyData(): Promise<{ exportedAt: string; data: unknown }> {
  return json(await authedFetch(`${API_BASE}/v1/privacy/export`));
}
