import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  summary: string | null;
  action_required: string | null;
  category: string;
  severity: 'INFORMATIONAL' | 'ADVISORY' | 'WARNING' | 'CRITICAL';
  scope: string;
  language: 'FIL' | 'EN' | 'FIL_EN';
  target_barangays: string[];
  status: 'PUBLISHED' | 'CANCELLED' | 'ARCHIVED' | 'SUPERSEDED';
  effective_start_at: string | null;
  effective_end_at: string | null;
  issuing_office: string | null;
  source_reference: string | null;
  contact_info: string | null;
  published_at: string | null;
  cancelled_at: string | null;
  correction_note: string | null;
  has_image: boolean;
  image_alt_text: string | null;
  updated_at: string;
  created_at: string;
}

export interface AnnouncementParams {
  limit?: number;
  severity?: string;
  barangay?: string;
  category?: string;
}

/**
 * Announcement images are streamed by the backend, so the phone loads them
 * from the same API host it already reaches (LAN IP / ngrok) — never from the
 * internal storage host. `updated_at` busts the image cache on change.
 */
export function announcementImageUrl(a: Pick<Announcement, 'id' | 'has_image' | 'updated_at'>): string | null {
  if (!a.has_image) return null;
  return `${API_BASE}/v1/announcements/${a.id}/image?v=${encodeURIComponent(a.updated_at)}`;
}

/**
 * `<Image source>` for an announcement. Carries the ngrok bypass header —
 * without it a tunnelled dev backend answers with an HTML warning page and the
 * image silently fails to render.
 */
export function announcementImageSource(
  a: Pick<Announcement, 'id' | 'has_image' | 'updated_at'>,
): { uri: string; headers: Record<string, string> } | null {
  const uri = announcementImageUrl(a);
  return uri ? { uri, headers: { 'ngrok-skip-browser-warning': '1' } } : null;
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
