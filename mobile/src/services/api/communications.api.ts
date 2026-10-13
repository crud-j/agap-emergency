import { apiFetch } from './http';

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

export function getIncidentMessages(incidentId: string, token: string): Promise<IncidentMessage[]> {
  return apiFetch(`${API_BASE}/v1/communications/${incidentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function sendIncidentMessage(
  incidentId: string,
  messageText: string,
  token: string,
): Promise<IncidentMessage> {
  return apiFetch(`${API_BASE}/v1/communications/${incidentId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messageText }),
  });
}
