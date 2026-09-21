import type { CreateIncidentInput } from '@agap/shared';

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

export async function getIncidentStatus(id: string, token?: string) {
  const res = await fetch(`${API_BASE}/v1/incidents/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
