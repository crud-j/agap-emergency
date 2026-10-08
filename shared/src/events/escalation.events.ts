export const ESCALATION_EVENTS = {
  CREATED: 'escalation.created',
  UPDATED: 'escalation.updated',
} as const;

export type EscalationEventName =
  (typeof ESCALATION_EVENTS)[keyof typeof ESCALATION_EVENTS];

export interface EscalationPayload {
  escalationId: string;
  incidentId: string;
  escalationType: string;
  status: string;
  createdAt: string;
}
