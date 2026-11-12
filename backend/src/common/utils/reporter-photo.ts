import { ACTIVE_INCIDENT_STATUSES } from '@agap/shared';

/**
 * `consent_records.consent_type` for "show my profile photo to responders" (MOD-01 / MOD-48).
 * Separate from the photo itself: the selfie was taken as a profile picture, and showing it
 * to the incident's staff and crew is a different purpose, so it needs its own opt-in.
 */
export const RESPONDER_PHOTO_CONSENT_TYPE = 'PROFILE_PHOTO_RESPONDERS';

/** Prisma filter for the reporter's active responder-photo consent. */
export const ACTIVE_RESPONDER_PHOTO_CONSENT = {
  where: { consent_type: RESPONDER_PHOTO_CONSENT_TYPE, status: 'GRANTED' as const },
  select: { id: true },
  take: 1,
};

/** Include fragment that loads only what {@link reporterPhotoAvailable} needs: no name, no photo location. */
export const REPORTER_PHOTO_INCLUDE = {
  select: {
    is_guest: true,
    users: {
      select: {
        profile_photo_updated_at: true,
        consent_records: ACTIVE_RESPONDER_PHOTO_CONSENT,
      },
    },
  },
} as const;

export interface ReporterPhotoSource {
  is_guest?: boolean | null;
  users?: {
    profile_photo_updated_at?: Date | null;
    consent_records?: ReadonlyArray<unknown> | null;
  } | null;
}

/** The photo may be shown only while the incident still needs a response. */
export function isReporterPhotoWindowOpen(status: string | null | undefined): boolean {
  return !!status && (ACTIVE_INCIDENT_STATUSES as readonly string[]).includes(status);
}

/**
 * True when the incident's staff and assigned crew may see the reporter's profile photo:
 * a registered reporter (never a guest) who has a photo, has consented, and the incident
 * is still active. The REPORTER's photo, never the patient's (rule 2).
 */
export function reporterPhotoAvailable(
  reporter: ReporterPhotoSource | null | undefined,
  incidentStatus: string | null | undefined,
): boolean {
  if (!reporter || reporter.is_guest || !isReporterPhotoWindowOpen(incidentStatus)) return false;
  const user = reporter.users;
  return !!user?.profile_photo_updated_at && (user.consent_records?.length ?? 0) > 0;
}
