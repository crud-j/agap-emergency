import type { GuestReportStatus } from '@agap/shared';
import { ApiError } from '../api/http';
import type { SavedGuestReport } from './saved-guest-report';

/**
 * Before a guest starts a new report: `go` to the report flow, or `follow` the report
 * this phone already sent (still open, or a short wait after a false alert).
 */
export type GuestReportGate = { kind: 'go' } | { kind: 'follow'; publicReference: string };

/** Never hold up a report longer than this to check the earlier one (Rule 14). */
export const GUEST_GATE_TIMEOUT_MS = 3_000;

export interface GuestReportGateDeps {
  load: () => Promise<SavedGuestReport | null>;
  fetchStatus: (token: string) => Promise<GuestReportStatus>;
  clear: () => Promise<void>;
  now?: () => Date;
  timeoutMs?: number;
}

/**
 * Whether this phone may start a guest report now. Any doubt (no saved report, no
 * connection, slow server, an older server without `newReportBlock`) means `go`: the
 * server still enforces the rule, and an outage must never stop someone reporting.
 */
export async function guestReportGate(deps: GuestReportGateDeps): Promise<GuestReportGate> {
  const saved = await deps.load().catch(() => null);
  if (!saved) return { kind: 'go' };

  let status: GuestReportStatus;
  try {
    status = await withTimeout(deps.fetchStatus(saved.token), deps.timeoutMs ?? GUEST_GATE_TIMEOUT_MS);
  } catch (err) {
    // The link expired or the report is gone: nothing left to follow.
    if (err instanceof ApiError && (err.status === 401 || err.status === 404)) await deps.clear().catch(() => undefined);
    return { kind: 'go' };
  }

  const block = status.newReportBlock;
  if (!block) return { kind: 'go' };
  if (block.reason === 'wait' && Date.parse(block.until) <= (deps.now?.() ?? new Date()).getTime()) return { kind: 'go' };
  return { kind: 'follow', publicReference: status.publicReference };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Guest report check timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
