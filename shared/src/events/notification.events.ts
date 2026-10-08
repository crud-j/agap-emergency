export const NOTIFICATION_EVENTS = {
  CREATED: 'notification.created',
} as const;

export type NotificationEventName =
  (typeof NOTIFICATION_EVENTS)[keyof typeof NOTIFICATION_EVENTS];

export interface NotificationCreatedPayload {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  incidentId?: string;
  createdAt: string;
}
