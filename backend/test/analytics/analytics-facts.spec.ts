import {
  buildFacts,
  factsToPromptText,
  manilaDayLabel,
  previousRange,
  type PeriodTotals,
  type TargetStat,
} from '../../src/analytics/narrative/analytics-facts';

/** MOD-50 AI summary: the facts and changes code computes before the AI sees anything. */

const FROM = new Date('2026-10-15T16:00:00.000Z'); // 16 Oct 2026, 00:00 Manila
const TO = new Date('2026-11-14T16:00:00.000Z'); // 15 Nov 2026, 00:00 Manila
const target = (over: Partial<TargetStat> = {}): TargetStat => ({ met: 20, counted: 20, overdue: 0, pct: 100, ...over });
const interval = (avgSec: number | null, n = 20) => ({ avgSec, n });

function totals(over: Partial<PeriodTotals> = {}): PeriodTotals {
  return {
    range: { from: FROM, to: TO },
    incidents: 20,
    byCategory: [{ category: 'MEDICAL', count: 20 }],
    byPriority: [
      { priority: 'CRITICAL', count: 2 },
      { priority: 'HIGH', count: 18 },
      { priority: 'MEDIUM', count: 0 },
      { priority: 'LOW', count: 0 },
    ],
    byBarangay: [{ barangay: 'Wakas', count: 20 }],
    targets: { acknowledge: target(), dispatch: target(), onScene: target() },
    intervals: { acknowledge: interval(60), dispatch: interval(300), arrival: interval(600) },
    falseAlerts: { count: 1, ratePct: 5 },
    ...over,
  };
}

const previous = (over: Partial<PeriodTotals> = {}) => totals({ range: previousRange({ from: FROM, to: TO }), ...over });

describe('period helpers', () => {
  it('labels days in Manila and finds the previous period of the same length', () => {
    expect(manilaDayLabel(FROM)).toBe('16 Oct 2026');
    expect(previousRange({ from: FROM, to: TO })).toEqual({
      from: new Date('2026-09-15T16:00:00.000Z'),
      to: FROM,
    });
  });

  it('labels the period by its last day, not the exclusive end', () => {
    const facts = buildFacts(totals(), previous());
    expect(facts.period).toMatchObject({ days: 30, label: '16 Oct 2026 to 14 Nov 2026' });
  });
});

describe('findChanges (through buildFacts)', () => {
  it('always states the total against the previous period', () => {
    expect(buildFacts(totals({ incidents: 42 }), previous({ incidents: 31 })).changes[0]).toBe(
      'Incidents reported: 42, up from 31 in the previous period.',
    );
    expect(buildFacts(totals(), previous()).changes[0]).toBe('Incidents reported: 20, the same as the previous period.');
  });

  it('flags a category that rose by 3 or more and by half or more, on a base of 5', () => {
    const facts = buildFacts(
      totals({ byCategory: [{ category: 'FLOOD', count: 11 }, { category: 'FIRE', count: 6 }, { category: 'MEDICAL', count: 4 }] }),
      previous({ byCategory: [{ category: 'FLOOD', count: 4 }, { category: 'FIRE', count: 5 }, { category: 'MEDICAL', count: 0 }] }),
    );
    expect(facts.changes).toContain('Category Flood: 11 incidents, up from 4.');
    // +1 only; and 4 is below the base of 5.
    expect(facts.changes.join('\n')).not.toMatch(/Fire|Medical/);
  });

  it('flags a drop the same way, and a rise from zero', () => {
    const facts = buildFacts(
      totals({ byBarangay: [{ barangay: 'Lolomboy', count: 2 }, { barangay: 'Bunlo', count: 6 }, { barangay: 'Unassigned', count: 9 }] }),
      previous({ byBarangay: [{ barangay: 'Lolomboy', count: 9 }, { barangay: 'Unassigned', count: 0 }] }),
    );
    expect(facts.changes).toContain('Barangay Lolomboy: 2 incidents, down from 9.');
    expect(facts.changes).toContain('Barangay Bunlo: 6 incidents, up from 0.');
    expect(facts.changes.join('\n')).not.toContain('Unassigned');
  });

  it('flags a response target below 90%, a fall of 10 points, and incidents still waiting', () => {
    const facts = buildFacts(
      totals({
        targets: {
          acknowledge: target({ met: 17, counted: 20, pct: 85 }),
          dispatch: target({ met: 18, counted: 20, pct: 90, overdue: 3 }),
          onScene: target({ met: 19, counted: 20, pct: 95 }),
        },
      }),
      previous({ targets: { acknowledge: target(), dispatch: target(), onScene: target({ pct: 100 }) } }),
    );
    expect(facts.changes).toContain('Response target "Acknowledged": 85% met (17 of 20), down from 100%.');
    expect(facts.changes).toContain('Response target "Dispatched": 90% met (18 of 20), down from 100%.');
    expect(facts.changes).toContain('Response target "Dispatched": 3 incidents still waiting past the target.');
    expect(facts.changes.join('\n')).not.toContain('First unit on scene');
  });

  it('never compares a target on fewer than 5 incidents', () => {
    const facts = buildFacts(
      totals({ targets: { acknowledge: target({ met: 2, counted: 4, pct: 50 }), dispatch: target(), onScene: target() } }),
      previous(),
    );
    expect(facts.changes.join('\n')).not.toContain('Acknowledged');
  });

  it('flags an average that moved by 20% and at least 1 minute, on 5 or more each side', () => {
    const facts = buildFacts(
      totals({ intervals: { acknowledge: interval(90), dispatch: interval(390), arrival: interval(900, 4) } }),
      previous({ intervals: { acknowledge: interval(60), dispatch: interval(300), arrival: interval(600) } }),
    );
    // 1.5 vs 1 min: +50% but only 0.5 min. 6.5 vs 5: +1.5 min, +30%. Arrival: only 4 samples.
    expect(facts.changes).toEqual(expect.arrayContaining(['Average time "Report to dispatched": 6.5 minutes, slower than 5 minutes.']));
    expect(facts.changes.join('\n')).not.toMatch(/Report to acknowledged|first unit on scene/);
  });

  it('flags a false alert rate that moved by 5 points', () => {
    const facts = buildFacts(totals({ falseAlerts: { count: 3, ratePct: 15 } }), previous({ falseAlerts: { count: 1, ratePct: 5 } }));
    expect(facts.changes).toContain('False alert rate: 15% (3 of 20), up from 5%.');
  });
});

describe('factsToPromptText', () => {
  it('is the same text for the same facts, and carries no identifying field', () => {
    const facts = buildFacts(totals(), previous());
    const text = factsToPromptText(facts);
    expect(factsToPromptText(buildFacts(totals(), previous()))).toBe(text);
    expect(text).toContain('INCIDENTS REPORTED: 20 (previous period: 20).');
    expect(text).toContain('- Wakas: 20 / 20');
    expect(text).toContain('- Report to dispatched: 5 / 5');
    expect(text).not.toMatch(/INC-|\+63|@|latitude|longitude/i);
  });

  it('writes "no data" for a missing figure', () => {
    const facts = buildFacts(
      totals({ targets: { acknowledge: target({ pct: null, counted: 0, met: 0 }), dispatch: target(), onScene: target() } }),
      previous(),
    );
    expect(factsToPromptText(facts)).toContain('- Acknowledged: no data (0 of 0;');
  });
});
