import type { IncidentEventName, IncidentCreatedPayload, IncidentStatusChangedPayload, IncidentLocationUpdatedPayload, IncidentAssignedPayload } from './incident.events';
import type { ResponderEventName, ResponderLocationUpdatedPayload, ResponderStatusChangedPayload } from './responder.events';

export type AgapEventName = IncidentEventName | ResponderEventName;

export interface AgapWebSocketEvent<T = unknown> {
  event: AgapEventName;
  data: T;
  timestamp: string;
}

export type AgapWebSocketPayloadMap = {
  'incident.created': IncidentCreatedPayload;
  'incident.status_changed': IncidentStatusChangedPayload;
  'incident.location_updated': IncidentLocationUpdatedPayload;
  'incident.assigned': IncidentAssignedPayload;
  'responder.location_updated': ResponderLocationUpdatedPayload;
  'responder.status_changed': ResponderStatusChangedPayload;
  'responder.eta_updated': Record<string, unknown>;
};
