const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Incident-scoped chat message (MOD-33). The backend returns a role-based
 * `sender_label` only — never a reporter's/bystander's personal identity.
 */
export interface IncidentMessage {
  id: string;
  incident_id: string;
  sender_id: string;
  message_text: string;
  attachment_id: string | null;
  sent_at: string;
  sender_role: string;
  sender_label: string;
}

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
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function getIncidentMessages(incidentId: string, token: string): Promise<IncidentMessage[]> {
  return authFetch<IncidentMessage[]>(`/v1/communications/${incidentId}`, token);
}

export function sendIncidentMessage(
  incidentId: string,
  messageText: string,
  token: string,
): Promise<IncidentMessage> {
  return authFetch<IncidentMessage>(`/v1/communications/${incidentId}`, token, {
    method: 'POST',
    body: JSON.stringify({ messageText }),
  });
}
