/// <reference types="jest" />

import type { GuestReportStatus } from '@agap/shared';
import { ApiError, NetworkError } from '../../api/http';
import { guestReportGate, type GuestReportGateDeps } from '../guest-report-gate';
import { formatCountdown, secondsUntil } from '../../../components/guest-report/guest-status-text';

const NOW = new Date('2026-11-26T12:00:00Z');
const SAVED = { token: 't'.repeat(43), publicReference: 'INC-2026-000500', savedAt: NOW.toISOString() };

function status(newReportBlock: GuestReportStatus['newReportBlock'] | undefined): GuestReportStatus {
  return {
    publicReference: 'INC-2026-000500',
    category: 'FIRE',
    status: 'RECEIVED',
    submittedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    merged: false,
    current: null,
    effectiveStatus: 'RECEIVED',
    finished: false,
    pushEnabled: false,
    followUntil: NOW.toISOString(),
    newReportBlock: newReportBlock as GuestReportStatus['newReportBlock'],
  };
}

function deps(over: Partial<GuestReportGateDeps> = {}): GuestReportGateDeps & { clear: jest.Mock } {
  return {
    load: async () => SAVED,
    fetchStatus: async () => status(null),
    clear: jest.fn(async () => undefined),
    now: () => NOW,
    timeoutMs: 50,
    ...over,
  } as GuestReportGateDeps & { clear: jest.Mock };
}

describe('guest report gate (before a guest starts a new report)', () => {
  it('no report followed on this phone → straight to the form', async () => {
    await expect(guestReportGate(deps({ load: async () => null }))).resolves.toEqual({ kind: 'go' });
  });

  it('the earlier report is still open → open that report instead', async () => {
    const d = deps({ fetchStatus: async () => status({ reason: 'open' }) });
    await expect(guestReportGate(d)).resolves.toEqual({ kind: 'follow', publicReference: 'INC-2026-000500' });
  });

  it('a false alert a few minutes ago → open that report (it shows the countdown)', async () => {
    const d = deps({ fetchStatus: async () => status({ reason: 'wait', until: '2026-11-26T12:07:00Z' }) });
    await expect(guestReportGate(d)).resolves.toMatchObject({ kind: 'follow' });
  });

  it('the wait is already over → straight to the form', async () => {
    const d = deps({ fetchStatus: async () => status({ reason: 'wait', until: '2026-11-26T11:59:59Z' }) });
    await expect(guestReportGate(d)).resolves.toEqual({ kind: 'go' });
  });

  it('closed or resolved (no block) → straight to the form', async () => {
    await expect(guestReportGate(deps())).resolves.toEqual({ kind: 'go' });
  });

  it('an older server that does not say → straight to the form', async () => {
    await expect(guestReportGate(deps({ fetchStatus: async () => status(undefined) }))).resolves.toEqual({ kind: 'go' });
  });

  it('no connection, or a slow server → straight to the form (an outage never blocks a report)', async () => {
    await expect(
      guestReportGate(deps({ fetchStatus: async () => { throw new NetworkError(); } })),
    ).resolves.toEqual({ kind: 'go' });
    await expect(
      guestReportGate(deps({ fetchStatus: () => new Promise<GuestReportStatus>(() => undefined) })),
    ).resolves.toEqual({ kind: 'go' });
  });

  it('an expired link → forgets it and goes to the form', async () => {
    const d = deps({ fetchStatus: async () => { throw new ApiError('gone', 401); } });
    await expect(guestReportGate(d)).resolves.toEqual({ kind: 'go' });
    expect(d.clear).toHaveBeenCalled();
  });
});

describe('countdown text', () => {
  it('counts whole seconds down to 0', () => {
    expect(secondsUntil('2026-11-26T12:07:00Z', NOW.getTime())).toBe(420);
    expect(secondsUntil('2026-11-26T11:00:00Z', NOW.getTime())).toBe(0);
    expect(secondsUntil('not a date', NOW.getTime())).toBe(0);
  });

  it('reads m:ss', () => {
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(305)).toBe('5:05');
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});
