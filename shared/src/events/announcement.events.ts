export const ANNOUNCEMENT_EVENTS = {
  PUBLISHED: 'announcement.published',
} as const;

export type AnnouncementEventName =
  (typeof ANNOUNCEMENT_EVENTS)[keyof typeof ANNOUNCEMENT_EVENTS];

export interface AnnouncementPublishedPayload {
  announcementId: string;
  publicReference?: string;
  title: string;
  category: string;
  severity: string;
  scope: string;
  publishedAt: string;
}
