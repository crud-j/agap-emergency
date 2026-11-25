import { IncidentStatus } from '@agap/shared';

/** A guest follows their report for at most this long. */
export const GUEST_FOLLOW_TTL_MS = 7 * 24 * 60 * 60_000;
/** Once the report has ended, the link (and the device token) lives this much longer. */
export const GUEST_FOLLOW_AFTER_END_MS = 24 * 60 * 60_000;
/** Resends of the same report each get a token; this caps them. */
export const MAX_GUEST_FOLLOWERS_PER_INCIDENT = 5;

/**
 * Statuses after which nothing more happens for the guest. DUPLICATE is not one: the
 * guest keeps following the report theirs was merged into. UNABLE_TO_RESPOND and
 * REFERRED still close later.
 */
export const GUEST_FINISHED_STATUSES: ReadonlySet<string> = new Set([
  IncidentStatus.CLOSED,
  IncidentStatus.CANCELLED,
  IncidentStatus.FALSE_ALERT,
]);
