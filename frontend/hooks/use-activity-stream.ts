
'use client';

import { useEffect, useState } from 'react';
import { onIncidentEvent } from '@/lib/websocket';
import type {
  IncidentCreatedPayload,
  IncidentStatusChangedPayload,
  IncidentLocationUpdatedPayload,
  IncidentAssignedPayload,
  DispatchCreatedPayload,
  DispatchCancelledPayload,
  EscalationPayload,
  AnnouncementPublishedPayload,
  NotificationCreatedPayload,
  IncidentMessagePayload,
} from '@agap/shared';

export type ActivityItem = {
  id: string;
  event: string;
  message: string;
  timestamp: string;
  incidentId?: string;
};

const MAX_ITEMS = 8;

export function useActivityStream() {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    let counter = 0;

    const add = (
      event: string,
      message: string,
      timestamp: string,
      incidentId?: string,
    ) => {
      counter += 1;

      setItems((current) =>
        [
          {
            id: `${event}-${timestamp}-${counter}`,
            event,
            message,
            timestamp,
            ...(incidentId ? { incidentId } : {}),
          },
          ...current,
        ].slice(0, MAX_ITEMS),
      );
    };

    const offCreated = onIncidentEvent<IncidentCreatedPayload>(
      'incident.created',
      (payload) => {
        console.log(
          '[AGAP ActivityStream] incident.created received:',
          payload,
        );

        add(
          'incident.created',
          `New ${payload.type} incident reported (${payload.priority}).`,
          payload.reportedAt,
          payload.incidentId,
        );
      },
    );

    const offStatus = onIncidentEvent<IncidentStatusChangedPayload>(
      'incident.status_changed',
      (payload) =>
        add(
          'incident.status_changed',
          `Incident status changed from ${payload.previousStatus} to ${payload.newStatus}.`,
          payload.changedAt,
          payload.incidentId,
        ),
    );

    const offLocation = onIncidentEvent<IncidentLocationUpdatedPayload>(
      'incident.location_updated',
      (payload) =>
        add(
          'incident.location_updated',
          'Incident location updated.',
          payload.updatedAt,
          payload.incidentId,
        ),
    );

    const offAssigned = onIncidentEvent<IncidentAssignedPayload>(
      'incident.assigned',
      (payload) =>
        add(
          'incident.assigned',
          `Responder assigned to incident (unit ${payload.responseUnitId}).`,
          payload.assignedAt,
          payload.incidentId,
        ),
    );

    const offDispatchCreated = onIncidentEvent<DispatchCreatedPayload>(
      'dispatch.created',
      (payload) =>
        add(
          'dispatch.created',
          'A dispatch was created.',
          new Date().toISOString(),
          payload.incidentId,
        ),
    );

    const offDispatchCancelled = onIncidentEvent<DispatchCancelledPayload>(
      'dispatch.cancelled',
      (payload) =>
        add(
          'dispatch.cancelled',
          'A dispatch was cancelled.',
          new Date().toISOString(),
          payload.incidentId,
        ),
    );

    const offEscalationCreated = onIncidentEvent<EscalationPayload>(
      'escalation.created',
      () =>
        add(
          'escalation.created',
          'An incident escalation was created.',
          new Date().toISOString(),
        ),
    );

    const offEscalationUpdated = onIncidentEvent<EscalationPayload>(
      'escalation.updated',
      () =>
        add(
          'escalation.updated',
          'An incident escalation was updated.',
          new Date().toISOString(),
        ),
    );

    const offAnnouncement = onIncidentEvent<AnnouncementPublishedPayload>(
      'announcement.published',
      () =>
        add(
          'announcement.published',
          'An operations announcement was published.',
          new Date().toISOString(),
        ),
    );

    const offNotification = onIncidentEvent<NotificationCreatedPayload>(
      'notification.created',
      () =>
        add(
          'notification.created',
          'A notification was created.',
          new Date().toISOString(),
        ),
    );

    const offMessage = onIncidentEvent<IncidentMessagePayload>(
      'message.created',
      (payload) =>
        add(
          'message.created',
          'A new incident message was received.',
          payload.sentAt,
          payload.incidentId,
        ),
    );

    return () => {
      offCreated();
      offStatus();
      offLocation();
      offAssigned();
      offDispatchCreated();
      offDispatchCancelled();
      offEscalationCreated();
      offEscalationUpdated();
      offAnnouncement();
      offNotification();
      offMessage();
    };
  }, []);

  return items;
}
