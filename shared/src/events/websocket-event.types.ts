import type { IncidentEventName, IncidentCreatedPayload, IncidentStatusChangedPayload, IncidentLocationUpdatedPayload, IncidentAssignedPayload, IncidentMessagePayload } from './incident.events';
import type { ResponderEventName, ResponderLocationUpdatedPayload, ResponderStatusChangedPayload } from './responder.events';
import type { DispatchEventName, DispatchCreatedPayload, DispatchCancelledPayload } from './dispatch.events';
import type { EscalationEventName, EscalationPayload } from './escalation.events';
import type { AnnouncementEventName, AnnouncementPublishedPayload } from './announcement.events';
import type { NotificationEventName, NotificationCreatedPayload } from './notification.events';

export type AgapEventName =
  | IncidentEventName
  | ResponderEventName
  | DispatchEventName
  | EscalationEventName
  | AnnouncementEventName
  | NotificationEventName;

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
  'dispatch.created': DispatchCreatedPayload;
  'dispatch.updated': Record<string, unknown>;
  'dispatch.cancelled': DispatchCancelledPayload;
  'escalation.created': EscalationPayload;
  'escalation.updated': EscalationPayload;
  'announcement.published': AnnouncementPublishedPayload;
  'notification.created': NotificationCreatedPayload;
  'message.created': IncidentMessagePayload;
};
