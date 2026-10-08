import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

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

export function fetchMessages(incidentId: string): Promise<IncidentMessage[]> {
  return api.get(`/communications/${incidentId}`, getToken());
}

export function postMessage(incidentId: string, messageText: string): Promise<IncidentMessage> {
  return api.post(`/communications/${incidentId}`, { messageText }, getToken());
}
