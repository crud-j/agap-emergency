import { IncidentStatus } from '../enums/incident-status.enum';

/**
 * A guest (no account) following their own report (MOD-42, Rule 14). The app sends the
 * token it got back from POST /v1/incidents in this header, never in a URL (URLs land
 * in proxy and server logs).
 */
export const GUEST_REPORT_TOKEN_HEADER = 'x-guest-report-token';

/** `data.type` of a guest report status push. It carries no internal incident id. */
export const GUEST_REPORT_PUSH_TYPE = 'GUEST_REPORT_STATUS';

/** What GET /v1/guest-reports/status returns. Status words only, never who else reported. */
export interface GuestReportStatus {
  /** The guest's own report reference. */
  publicReference: string;
  category: string;
  /** The guest's own report's status (DUPLICATE once it was merged). */
  status: string;
  submittedAt: string;
  /** When the status shown below last changed. */
  updatedAt: string;
  /** The report was merged into another report of the same emergency. */
  merged: boolean;
  /**
   * After a merge: where that emergency stands now. Status only; the other report's
   * reference and reporter are never sent.
   */
  current: { status: string; updatedAt: string } | null;
  /** The status the guest should see: `current.status` after a merge, else `status`. */
  effectiveStatus: string;
  /** Nothing more will happen (closed, cancelled, false alert...). */
  finished: boolean;
  /** This phone gets push notifications for the report. */
  pushEnabled: boolean;
  /** After this, the token stops working and the device token is deleted. */
  followUntil: string;
  /**
   * This phone can't send another guest report yet: `open` while MDRRMO is handling
   * this one, `wait` for a while after it was marked a false alert. Null: it can.
   * The server enforces the same rule on POST /v1/incidents (see guestNewReportGate).
   */
  newReportBlock: GuestNewReportBlock | null;
}

/** Why a guest phone can't send a new report yet, as GET /v1/guest-reports/status sends it. */
export type GuestNewReportBlock =
  | { reason: 'open' }
  /** `until` is an ISO time: a new report is accepted from then on. */
  | { reason: 'wait'; until: string };

/**
 * Statuses after which a guest's report no longer blocks a new one from the same phone:
 * the response is over, or the report was refused. DUPLICATE is not one: the report it
 * was merged into is checked instead. UNABLE_TO_RESPOND and REFERRED are included so a
 * guest is never stuck while the Operations Center re-dispatches or hands off.
 */
export const GUEST_REPORT_ENDED_STATUSES: ReadonlySet<string> = new Set<string>([
  IncidentStatus.RESOLVED,
  IncidentStatus.CLOSED,
  IncidentStatus.CANCELLED,
  IncidentStatus.FALSE_ALERT,
  IncidentStatus.UNABLE_TO_RESPOND,
  IncidentStatus.REFERRED,
]);

/**
 * After MDRRMO marks a guest's report a false alert, that phone waits this long before
 * it can send another guest report. Only after a false alert: a real report that was
 * resolved or closed frees the phone at once, since a second real emergency can follow
 * (Rule 14). Hotlines and sign-in stay available during the wait.
 */
export const GUEST_FALSE_ALERT_WAIT_SECONDS = 10 * 60;

/**
 * Whether a guest phone may send a new report, given where its last report stands.
 * `effectiveStatus` follows merges (the report it was merged into); `changedAt` is when
 * that status was reached. One rule for the server's refusal and the app's status screen.
 */
export function guestNewReportGate(
  effectiveStatus: string,
  changedAt: Date,
  now: Date = new Date(),
): { reason: 'open' } | { reason: 'wait'; until: Date } | null {
  if (!GUEST_REPORT_ENDED_STATUSES.has(effectiveStatus)) return { reason: 'open' };
  if (effectiveStatus !== IncidentStatus.FALSE_ALERT) return null;
  const until = new Date(changedAt.getTime() + GUEST_FALSE_ALERT_WAIT_SECONDS * 1000);
  return until.getTime() > now.getTime() ? { reason: 'wait', until } : null;
}
