import { computeSla, formatCountdown, type SlaInput } from '@/lib/sla';

// Fixed clock so deadlines are deterministic.
const SUBMITTED = '2026-10-08T10:00:00.000Z';
const submittedMs = new Date(SUBMITTED).getTime();

function base(overrides: Partial<SlaInput> = {}): SlaInput {
  return { priority: 'HIGH', status: 'SUBMITTED', submitted_at: SUBMITTED, ...overrides };
}

describe('computeSla (MOD-41)', () => {
  it('tracks the Acknowledge milestone first for a fresh incident', () => {
    // HIGH ack threshold = 120s; 30s elapsed → 90s remaining.
    const s = computeSla(base(), submittedMs + 30_000);
    expect(s.label).toBe('Acknowledge');
    expect(s.remainingSecs).toBe(90);
    expect(s.breached).toBe(false);
    expect(s.met).toBe(false);
  });

  it('advances to Dispatch once acknowledged', () => {
    const s = computeSla(base({ status: 'ACKNOWLEDGED' }), submittedMs + 30_000);
    expect(s.label).toBe('Dispatch'); // HIGH dispatch threshold = 300s
    expect(s.remainingSecs).toBe(270);
  });

  it('flags a breach when the deadline has passed', () => {
    // 200s elapsed vs 120s ack deadline → breached.
    const s = computeSla(base(), submittedMs + 200_000);
    expect(s.breached).toBe(true);
    expect(s.remainingSecs).toBeLessThan(0);
  });

  it('warns within the final 60s before a deadline', () => {
    // 90s elapsed vs 120s ack deadline → 30s remaining → warn.
    const s = computeSla(base(), submittedMs + 90_000);
    expect(s.warn).toBe(true);
    expect(s.breached).toBe(false);
  });

  it('reports SLA met once on scene', () => {
    const s = computeSla(base({ status: 'ON_SCENE' }), submittedMs + 10_000);
    expect(s.met).toBe(true);
    expect(s.label).toBe('SLA met');
  });

  it('falls back to MEDIUM thresholds for an unknown priority', () => {
    // MEDIUM ack = 300s; 0s elapsed → 300s remaining.
    const s = computeSla(base({ priority: 'NOPE' }), submittedMs);
    expect(s.remainingSecs).toBe(300);
  });
});

describe('formatCountdown', () => {
  it('formats remaining time as m:ss', () => {
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(5)).toBe('0:05');
  });

  it('marks breached time as over', () => {
    expect(formatCountdown(-75)).toBe('+1:15 over');
  });
});
