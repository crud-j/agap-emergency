/**
 * What a guest reporter reads about their report (MOD-42). Plain words, no names, no
 * ETA promises (Rule 13), and the hotlines wherever AGAP is not sending help (Rule 9).
 */
export type GuestStatusTone = 'progress' | 'done' | 'warn';

export interface GuestStatusText {
  title: string;
  body: string;
  tone: GuestStatusTone;
}

const TEXT: Record<string, GuestStatusText> = {
  SUBMITTED: {
    title: 'Waiting for a dispatcher',
    body: 'Your report reached the MDRRMO Operations Center. A dispatcher will review it shortly.',
    tone: 'progress',
  },
  RECEIVED: {
    title: 'Waiting for a dispatcher',
    body: 'Your report reached the MDRRMO Operations Center. A dispatcher will review it shortly.',
    tone: 'progress',
  },
  ACKNOWLEDGED: {
    title: 'Report accepted',
    body: 'A dispatcher has your report and is reviewing it.',
    tone: 'progress',
  },
  ASSESSED: {
    title: 'Arranging a response',
    body: 'MDRRMO is choosing the right team for this emergency.',
    tone: 'progress',
  },
  DISPATCH_PENDING: {
    title: 'Arranging a response',
    body: 'MDRRMO is choosing the right team for this emergency.',
    tone: 'progress',
  },
  DISPATCHED: {
    title: 'Help is on the way',
    body: 'Responders have been sent.',
    tone: 'progress',
  },
  EN_ROUTE: {
    title: 'Responders on the way',
    body: 'Responders are travelling to the scene. Keep your phone nearby.',
    tone: 'progress',
  },
  ON_SCENE: {
    title: 'Responders have arrived',
    body: 'Responders are now at the scene.',
    tone: 'progress',
  },
  TRANSPORTING: {
    title: 'Patient being transported',
    body: 'Responders are taking the patient to a receiving facility.',
    tone: 'progress',
  },
  ASSISTING: {
    title: 'Responders assisting',
    body: 'Responders are assisting at the scene.',
    tone: 'progress',
  },
  RESOLVED: {
    title: 'Responders have finished',
    body: 'Responders have finished at the scene. MDRRMO will close the report.',
    tone: 'done',
  },
  CLOSED: {
    title: 'Report closed',
    body: 'This report is closed. Thank you for reporting through AGAP.',
    tone: 'done',
  },
  CANCELLED: {
    title: 'Report cancelled',
    body: 'This report was cancelled. If you still need help, call 911 or the MDRRMO hotline.',
    tone: 'warn',
  },
  FALSE_ALERT: {
    title: 'Closed as a false alert',
    body: 'MDRRMO reviewed this report and closed it. If you still need help, call 911 or report again.',
    tone: 'warn',
  },
  UNABLE_TO_RESPOND: {
    title: 'MDRRMO could not send responders',
    body: 'If you still need help, call 911 or the MDRRMO hotline now.',
    tone: 'warn',
  },
  REFERRED: {
    title: 'Referred to a partner agency',
    body: 'Your report was passed to a partner agency, which will follow up.',
    tone: 'progress',
  },
};

export function guestStatusText(status: string): GuestStatusText {
  return TEXT[status] ?? { title: 'Report sent', body: 'MDRRMO has your report.', tone: 'progress' };
}

export const GUEST_MERGED_NOTE =
  'Your report was merged with another report of the same emergency. You will keep seeing its progress here.';

/** Whole seconds from now until an ISO time; 0 once it has passed (or if unreadable). */
export function secondsUntil(iso: string, now: number = Date.now()): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - now) / 1000)) : 0;
}

/** A countdown as m:ss, e.g. 9:05. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
