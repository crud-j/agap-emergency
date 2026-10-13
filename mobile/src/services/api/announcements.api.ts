import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  severity: 'INFORMATIONAL' | 'ADVISORY' | 'WARNING' | 'CRITICAL';
  scope: string;
  target_barangays: string[];
  status: string;
  published_at: string | null;
  image_url: string | null;
  created_at: string;
}

export interface AnnouncementParams {
  limit?: number;
  severity?: string;
  barangay?: string;
  category?: string;
}

export function getAnnouncements(params: AnnouncementParams = {}): Promise<Announcement[]> {
  const query = new URLSearchParams();
  if (params.limit)    query.set('limit',    String(params.limit));
  if (params.severity) query.set('severity', params.severity);
  if (params.barangay) query.set('barangay', params.barangay);
  if (params.category) query.set('category', params.category);
  const qs = query.toString();
  return apiFetch(`${API_BASE}/v1/announcements${qs ? `?${qs}` : ''}`);
}

export function getAnnouncementById(id: string): Promise<Announcement> {
  return apiFetch(`${API_BASE}/v1/announcements/${id}`);
}

export async function subscribeToSms(phoneNumber: string, barangayPreference?: string): Promise<void> {
  await apiFetch(`${API_BASE}/v1/announcements/subscribe`, {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, barangayPreference }),
  });
}
