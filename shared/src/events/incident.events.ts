import type { IncidentStatus } from '../enums/incident-status.enum';
import type { IncidentPriority } from '../enums/incident-priority.enum';
import type { IncidentType } from '../enums/incident-type.enum';

export const INCIDENT_EVENTS = {
  CREATED: 'incident.created',
  UPDATED: 'incident.updated',
  STATUS_CHANGED: 'incident.status_changed',
  LOCATION_UPDATED: 'incident.location_updated',
  ASSIGNED: 'incident.assigned',
  DISPATCHED: 'incident.dispatched',
  ACCEPTED: 'incident.accepted',
  EN_ROUTE: 'incident.en_route',
  ARRIVED: 'incident.arrived',
  ASSESSMENT_UPDATED: 'incident.assessment_updated',
  TRANSPORTING: 'incident.transporting',
  FACILITY_ARRIVAL: 'incident.facility_arrival',
  HANDOVER: 'incident.handover',
  RESOLVED: 'incident.resolved',
  CLOSED: 'incident.closed',
  ESCALATED: 'incident.escalated',
  CANCELLED: 'incident.cancelled',
  MESSAGE_CREATED: 'message.created',
} as const;

export type IncidentEventName = (typeof INCIDENT_EVENTS)[keyof typeof INCIDENT_EVENTS];

export interface IncidentCreatedPayload {
  incidentId: string;
  type: IncidentType;
  priority: IncidentPriority;
  status: IncidentStatus;
  location: { lat: number; lng: number } | null;
  reportedAt: string;
}

export interface IncidentStatusChangedPayload {
  incidentId: string;
  previousStatus: IncidentStatus;
  newStatus: IncidentStatus;
  changedAt: string;
  changedBy: string;
  reason?: string;
}

export interface IncidentLocationUpdatedPayload {
  incidentId: string;
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: string;
}

export interface IncidentAssignedPayload {
  incidentId: string;
  assignmentId: string;
  responderId: string;
  responseUnitId: string;
  assignedAt: string;
}

/** MOD-40 — responder begins transporting patient(s) to a facility. */
export interface IncidentTransportingPayload {
  incidentId: string;
  transportId: string;
  dispatchId: string;
  destinationId: string | null;
  destinationName: string | null;
  patientId: string | null;
  transportStartedAt: string;
}

/** MOD-40 — ambulance/unit arrives at the receiving facility. */
export interface IncidentFacilityArrivalPayload {
  incidentId: string;
  transportId: string;
  destinationId: string | null;
  arrivedAt: string;
}

/**
 * Incident-scoped chat message (MOD-33). Carries only a role-based sender label —
 * never a reporter's/bystander's personal identity (CLAUDE.md rule 15).
 */
export interface IncidentMessagePayload {
  id: string;
  incidentId: string;
  senderId: string;
  senderRole: string;
  senderLabel: string;
  messageText: string;
  attachmentId: string | null;
  sentAt: string;
}
