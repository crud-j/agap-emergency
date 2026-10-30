import type {
  IncidentEventName, IncidentCreatedPayload, IncidentStatusChangedPayload, IncidentLocationUpdatedPayload, IncidentAssignedPayload,
  IncidentMessagePayload, IncidentTransportingPayload, IncidentFacilityArrivalPayload, IncidentTransportUpdatedPayload,
} from './incident.events';
import type {
  ResponderEventName, ResponderLocationUpdatedPayload, ResponderStatusChangedPayload, ResponderEtaUpdatedPayload,
  ResponderRouteUpdatedPayload,
} from './responder.events';
import type { DispatchEventName, DispatchCreatedPayload, DispatchCancelledPayload, DispatchUpdatedPayload } from './dispatch.events';
import type { EscalationEventName, EscalationPayload } from './escalation.events';
import type { AnnouncementEventName, AnnouncementPublishedPayload } from './announcement.events';
import type { BarangayEventName, BarangayNoticeUpdatedPayload } from './barangay.events';
import type { NotificationEventName, NotificationCreatedPayload } from './notification.events';
import type { ResourceEventName, ResourceStatusChangedPayload } from './resource.events';
import type { SurgeEventName, SurgeRecommendedPayload, SurgeTriageTagUpdatedPayload } from './surge.events';
import type { AiEventName, AiSuggestionCreatedPayload } from './ai.events';

export type AgapEventName =
  | IncidentEventName
  | ResponderEventName
  | DispatchEventName
  | EscalationEventName
  | AnnouncementEventName
  | NotificationEventName
  | BarangayEventName
  | ResourceEventName
  | SurgeEventName
  | AiEventName;

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
  'incident.transporting': IncidentTransportingPayload;
  'incident.facility_arrival': IncidentFacilityArrivalPayload;
  'incident.transport_updated': IncidentTransportUpdatedPayload;
  'responder.location_updated': ResponderLocationUpdatedPayload;
  'responder.status_changed': ResponderStatusChangedPayload;
  'responder.eta_updated': ResponderEtaUpdatedPayload;
  'responder.route_updated': ResponderRouteUpdatedPayload;
  'dispatch.created': DispatchCreatedPayload;
  'dispatch.updated': DispatchUpdatedPayload;
  'dispatch.cancelled': DispatchCancelledPayload;
  'escalation.created': EscalationPayload;
  'escalation.updated': EscalationPayload;
  'announcement.published': AnnouncementPublishedPayload;
  'notification.created': NotificationCreatedPayload;
  'message.created': IncidentMessagePayload;
  'barangay.notice_updated': BarangayNoticeUpdatedPayload;
  'resource.status_changed': ResourceStatusChangedPayload;
  'surge.recommended': SurgeRecommendedPayload;
  'surge.triage_tag_updated': SurgeTriageTagUpdatedPayload;
  'ai.suggestion_created': AiSuggestionCreatedPayload;
};
