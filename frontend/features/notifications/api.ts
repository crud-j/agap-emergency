import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type NotificationStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RETRYING' | 'CANCELLED';
export type NotificationChannel = 'IN_APP' | 'PUSH' | 'SMS' | 'EMAIL';

export interface AppNotification {
  id: string;
  incident_id: string | null;
  channel: NotificationChannel;
  event_type: string;
  title: string | null;
  body: string;
  status: NotificationStatus;
  data_payload: Record<string, unknown> | null;
  created_at: string;
  delivered_at: string | null;
}

export interface NotificationsPage {
  data: AppNotification[];
  meta: { total: number; page: number; perPage: number };
}

// ─── API ───────────────────────────────────────────────────────────────────────

export function fetchNotifications(page = 1, perPage = 30): Promise<NotificationsPage> {
  return api.get(`/notifications?page=${page}&perPage=${perPage}`, getToken());
}

export function fetchUnreadCount(): Promise<{ unread: number }> {
  return api.get('/notifications/unread-count', getToken());
}

export function markNotificationRead(id: string): Promise<AppNotification> {
  return api.patch(`/notifications/${id}/read`, {}, getToken());
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return api.patch('/notifications/read-all', {}, getToken());
}
