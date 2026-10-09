import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  category: string;
  severity: string;
  scope: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED' | 'SUPERSEDED';
  scheduled_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  publish_now: boolean;
  target_barangays: string[];
  sms_sent_count: number | null;
  publisher_id: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnouncementListParams {
  status?: string;
  category?: string;
  page?: number;
  perPage?: number;
}

export interface CreateAnnouncementBody {
  title: string;
  body: string;
  category: string;
  severity: string;
  scope: string;
  targetBarangays?: string[];
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

/** Publisher view — returns all statuses (drafts, scheduled, published, archived). */
export function fetchAnnouncementsForPublisher(
  params?: AnnouncementListParams,
): Promise<PaginatedResult<Announcement>> {
  const qs = new URLSearchParams();
  if (params?.status)   qs.set('status', params.status);
  if (params?.category) qs.set('category', params.category);
  if (params?.page)     qs.set('page', String(params.page));
  if (params?.perPage)  qs.set('perPage', String(params.perPage));
  return api.get(`/announcements/publisher/all?${qs}`, getToken());
}

/** Public feed — published only (used by mobile / citizen feed). */
export function fetchPublishedAnnouncements(params?: {
  category?: string;
  barangay?: string;
}): Promise<Announcement[]> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.barangay) qs.set('barangay', params.barangay);
  return api.get(`/announcements?${qs}`, getToken());
}

export function fetchAnnouncement(id: string): Promise<Announcement> {
  return api.get(`/announcements/${id}`, getToken());
}

export function createAnnouncement(body: CreateAnnouncementBody): Promise<Announcement> {
  return api.post('/announcements', body, getToken());
}

export function publishAnnouncement(id: string): Promise<Announcement> {
  return api.post(`/announcements/${id}/publish`, {}, getToken());
}

export function scheduleAnnouncement(id: string, scheduledAt: string): Promise<Announcement> {
  return api.post(`/announcements/${id}/schedule`, { scheduledAt }, getToken());
}

export function archiveAnnouncement(id: string): Promise<Announcement> {
  return api.post(`/announcements/${id}/archive`, {}, getToken());
}

export function updateAnnouncement(
  id: string,
  body: Partial<CreateAnnouncementBody>,
): Promise<Announcement> {
  return api.patch(`/announcements/${id}`, body, getToken());
}
