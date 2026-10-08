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
  created_at: string;
}

export interface AnnouncementParams {
  limit?: number;
  severity?: string;
  barangay?: string;
  category?: string;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getAnnouncements(params: AnnouncementParams = {}): Promise<Announcement[]> {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', String(params.limit));
  if (params.severity) query.set('severity', params.severity);
  if (params.barangay) query.set('barangay', params.barangay);
  if (params.category) query.set('category', params.category);
  const qs = query.toString();
  return apiFetch(`/v1/announcements${qs ? `?${qs}` : ''}`);
}

export async function getAnnouncementById(id: string): Promise<Announcement> {
  return apiFetch(`/v1/announcements/${id}`);
}

export async function subscribeToSms(
  phoneNumber: string,
  barangayPreference?: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/announcements/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber, barangayPreference }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
}
