/**
 * Municipal announcements are a one-way broadcast system.
 * They are completely separate from emergency incident records.
 *
 * Matches `announcement_status` in backend/prisma/schema.prisma.
 */
export enum AnnouncementStatus {
  DRAFT = 'DRAFT',
  /** CRITICAL advisory waiting for an MDRRMO Supervisor (ANNOUNCEMENT_APPROVAL_REQUIRED). */
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
  SUPERSEDED = 'SUPERSEDED',
  CANCELLED = 'CANCELLED',
}
