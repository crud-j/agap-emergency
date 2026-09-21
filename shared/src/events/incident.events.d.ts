import type { IncidentStatus } from '../enums/incident-status.enum';
import type { IncidentPriority } from '../enums/incident-priority.enum';
import type { IncidentType } from '../enums/incident-type.enum';
export declare const INCIDENT_EVENTS: {
    readonly CREATED: "incident.created";
    readonly UPDATED: "incident.updated";
    readonly STATUS_CHANGED: "incident.status_changed";
    readonly LOCATION_UPDATED: "incident.location_updated";
    readonly ASSIGNED: "incident.assigned";
    readonly DISPATCHED: "incident.dispatched";
    readonly ACCEPTED: "incident.accepted";
    readonly EN_ROUTE: "incident.en_route";
    readonly ARRIVED: "incident.arrived";
    readonly ASSESSMENT_UPDATED: "incident.assessment_updated";
    readonly TRANSPORTING: "incident.transporting";
    readonly FACILITY_ARRIVAL: "incident.facility_arrival";
    readonly HANDOVER: "incident.handover";
    readonly RESOLVED: "incident.resolved";
    readonly CLOSED: "incident.closed";
    readonly ESCALATED: "incident.escalated";
    readonly CANCELLED: "incident.cancelled";
};
export type IncidentEventName = (typeof INCIDENT_EVENTS)[keyof typeof INCIDENT_EVENTS];
export interface IncidentCreatedPayload {
    incidentId: string;
    type: IncidentType;
    priority: IncidentPriority;
    status: IncidentStatus;
    location: {
        lat: number;
        lng: number;
    } | null;
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
//# sourceMappingURL=incident.events.d.ts.map