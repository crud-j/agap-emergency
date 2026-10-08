import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { PaginatedResult } from '@agap/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  public_reference: string;
  title: string;
  body: string;
  category: string;
  severity: string;
  scope: string;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  author_id: string;
  author?: { full_name: string | null };
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
  scheduledAt?: string;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export function fetchAnnouncements(params?: AnnouncementListParams): Promise<PaginatedResult<Announcement>> {
  const qs = new URLSearchParams();
  if (params?.status)   qs.set('status', params.status);
  if (params?.category) qs.set('category', params.category);
  if (params?.page)     qs.set('page', String(params.page));
  if (params?.perPage)  qs.set('perPage', String(params.perPage));
  return api.get(`/announcements?${qs}`, getToken());
}

export function fetchAnnouncement(id: string): Promise<Announcement> {
  return api.get(`/announcements/${id}`, getToken());
}

export function createAnnouncement(body: CreateAnnouncementBody): Promise<Announcement> {
  return api.post('/announcements', body, getToken());
}

export function publishAnnouncement(id: string): Promise<Announcement> {
  return api.patch(`/announcements/${id}/publish`, {}, getToken());
}

export function archiveAnnouncement(id: string): Promise<Announcement> {
  return api.patch(`/announcements/${id}/archive`, {}, getToken());
}
