import type { IncidentStatus } from '../enums/incident-status.enum';
import type { IncidentPriority } from '../enums/incident-priority.enum';
import type { IncidentType } from '../enums/incident-type.enum';
import type { TransportDestinationView } from '../maps/map.types';

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
  TRANSPORT_UPDATED: 'incident.transport_updated',
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

/**
 * MOD-40 — responder begins transporting patient(s) to a facility.
 * The fields marked "ops copy only" go to `ops:all`; the incident-room copy is
 * status-only (Correction C18): incidentId, transportId, dispatchId, transportStartedAt.
 */
export interface IncidentTransportingPayload {
  incidentId: string;
  transportId: string;
  dispatchId: string;
  /** Ops copy only. */
  destinationId?: string | null;
  /** Ops copy and a crew-confirmed reporter-patient's copy (C17) only. Name, numeric coordinates and verified flag. */
  destination?: TransportDestinationView | null;
  /** Ops copy only. Never reaches an incident room or the reporter (§0 rule 5). */
  patientId?: string | null;
  transportStartedAt: string;
}

/** MOD-40 — ambulance/unit arrives at the receiving facility. The incident-room copy has no destinationId (C18). */
export interface IncidentFacilityArrivalPayload {
  incidentId: string;
  transportId: string;
  dispatchId?: string;
  /** Ops copy only. */
  destinationId?: string | null;
  /** Ops copy and a crew-confirmed reporter-patient's copy (C17) only. */
  destination?: TransportDestinationView | null;
  arrivedAt: string;
}

/**
 * MOD-40 — a transport's destination changed (or the hospital was deactivated or
 * filled up). Never sent to the incident room: a destination only exists on the
 * hospital leg (C18). Ops gets the full payload; per-user copies have no `destination.id`.
 */
export interface IncidentTransportUpdatedPayload {
  incidentId: string;
  dispatchId: string;
  transportId: string;
  destination: (TransportDestinationView & { id?: string }) | null;
  destinationWarning?: 'FACILITY_DEACTIVATED' | 'FACILITY_AT_CAPACITY';
  changedAt: string;
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
