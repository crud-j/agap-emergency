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
