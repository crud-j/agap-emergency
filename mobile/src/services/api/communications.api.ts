import { authedFetch } from './authed-fetch';
import { readJson } from './http';

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

// authedFetch refreshes an expired access token, so an open chat keeps working
// past the 15-minute token lifetime.
export async function getIncidentMessages(incidentId: string): Promise<IncidentMessage[]> {
  return readJson(await authedFetch(`${API_BASE}/v1/communications/${incidentId}`));
}

export async function sendIncidentMessage(incidentId: string, messageText: string): Promise<IncidentMessage> {
  return readJson(
    await authedFetch(`${API_BASE}/v1/communications/${incidentId}`, {
      method: 'POST',
      body: JSON.stringify({ messageText }),
    }),
  );
}
