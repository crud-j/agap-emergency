export const BARANGAY_EVENTS = {
  NOTICE_UPDATED: 'barangay.notice_updated',
} as const;

export type BarangayEventName = (typeof BARANGAY_EVENTS)[keyof typeof BARANGAY_EVENTS];

/** Ops-only: never sent to the citizen's incident room. */
export interface BarangayNoticeUpdatedPayload {
  incidentId: string;
  barangayId: string;
  barangayName: string;
  isApproximate: boolean;
  smsStatus: string;
  lastReport: string | null;
  lastReportAt: string | null;
  followupDue: boolean;
}
