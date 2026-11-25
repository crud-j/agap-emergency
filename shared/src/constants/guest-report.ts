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
}
