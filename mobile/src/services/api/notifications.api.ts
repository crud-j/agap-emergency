import { authedFetch } from './authed-fetch';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface AppNotification {
  id: string;
  incident_id: string | null;
  channel: string;
  event_type: string;
  title: string | null;
  body: string;
  status: string;
  created_at: string;
}

export interface PaginatedNotifications {
  data: AppNotification[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function getNotifications(
  token: string,
  page = 1,
): Promise<PaginatedNotifications> {
  const res = await fetch(`${API_BASE}/v1/notifications?page=${page}`, {
    headers: authHeader(token),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getUnreadCount(): Promise<number> {
  const res = await authedFetch(`${API_BASE}/v1/notifications/unread-count`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.unread ?? 0;
}

export async function markAllRead(token: string): Promise<void> {
  await fetch(`${API_BASE}/v1/notifications/read-all`, {
    method: 'PATCH',
    headers: authHeader(token),
  });
}

export async function markRead(id: string, token: string): Promise<void> {
  await fetch(`${API_BASE}/v1/notifications/${id}/read`, {
    method: 'PATCH',
    headers: authHeader(token),
  });
}

export async function registerFcmToken(
  accessToken: string,
  fcmToken: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/notifications/register-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(accessToken) },
    body: JSON.stringify({ fcmToken }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
