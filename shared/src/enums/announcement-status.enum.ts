/**
 * Municipal announcements are a one-way broadcast system.
 * They are completely separate from emergency incident records.
 */
export enum AnnouncementStatus {
  DRAFT = 'DRAFT',
  REVIEW = 'REVIEW',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  EXPIRED = 'EXPIRED',
  ARCHIVED = 'ARCHIVED',
}
