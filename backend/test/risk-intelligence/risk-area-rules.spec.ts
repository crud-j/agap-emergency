import {
  levelFromCount,
  nextNightlyRun,
  reviewHint,
  suggestAreaName,
} from '../../src/risk-intelligence/risk-area-rules';

/** MOD-51 risk-area rules (2026-11-15): AGAP suggests, the Supervisor decides. */

const NOW = new Date('2026-11-15T04:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const area = (over: Partial<{ risk_level: string; is_active: boolean; created_at: Date }> = {}) => ({
  risk_level: 'LOW',
  is_active: true,
  created_at: daysAgo(30),
  ...over,
});
const stats = (n90: number, lastDaysAgo: number | null = n90 ? 2 : null) => ({
  incidents_90d: n90,
  incidents_prev_90d: 0,
  last_incident_at: lastDaysAgo === null ? null : daysAgo(lastDaysAgo),
});

describe('levelFromCount', () => {
  it.each([
    [0, 'LOW'],
    [2, 'LOW'],
    [3, 'MODERATE'],
    [5, 'MODERATE'],
    [6, 'HIGH'],
    [9, 'HIGH'],
    [10, 'CRITICAL'],
    [40, 'CRITICAL'],
  ])('%i incidents in 90 days → %s', (n, level) => {
    expect(levelFromCount(n)).toBe(level);
  });
});

describe('reviewHint', () => {
  it('suggests raising the level when incidents call for more', () => {
    expect(reviewHint(area({ risk_level: 'MODERATE' }), stats(7), NOW)).toEqual({
      kind: 'RAISE',
      suggestedLevel: 'HIGH',
      incidents: 7,
      windowDays: 90,
    });
  });

  it('never suggests lowering a level', () => {
    expect(reviewHint(area({ risk_level: 'CRITICAL' }), stats(1), NOW)).toBeNull();
  });

  it('suggests deactivating an area older than a year with no incident for a year', () => {
    expect(reviewHint(area({ created_at: daysAgo(500) }), stats(0, 400), NOW)).toEqual({ kind: 'QUIET', quietDays: 400 });
    // Never had an incident: quiet since it was created.
    expect(reviewHint(area({ created_at: daysAgo(400) }), stats(0, null), NOW)).toEqual({ kind: 'QUIET', quietDays: 400 });
  });

  it('leaves a new area, a recently active one and an inactive one alone', () => {
    expect(reviewHint(area({ created_at: daysAgo(100) }), stats(0, null), NOW)).toBeNull();
    expect(reviewHint(area({ created_at: daysAgo(500) }), stats(0, 200), NOW)).toBeNull();
    expect(reviewHint(area({ is_active: false, risk_level: 'LOW' }), stats(12), NOW)).toBeNull();
  });
});

describe('suggestAreaName', () => {
  it('names the area by barangay and type, in plain words', () => {
    expect(suggestAreaName('Lolomboy', 'FLOOD')).toBe('Lolomboy flood area');
    expect(suggestAreaName('Bunlo', 'ROAD_ACCIDENT')).toBe('Bunlo road accident area');
    expect(suggestAreaName(null, 'FIRE')).toBe('Bocaue fire area');
  });
});

describe('nextNightlyRun (02:30 Asia/Manila)', () => {
  it('is later the same Manila night when it is before 02:30 there', () => {
    // 01:00 Manila on 16 Nov = 17:00 UTC on 15 Nov.
    expect(nextNightlyRun(new Date('2026-11-15T17:00:00.000Z')).toISOString()).toBe('2026-11-15T18:30:00.000Z');
  });

  it('is the next night once 02:30 has passed, whatever the server zone', () => {
    // 12:00 Manila on 15 Nov.
    expect(nextNightlyRun(NOW).toISOString()).toBe('2026-11-15T18:30:00.000Z');
    // Exactly 02:30 Manila: the next one is tomorrow.
    expect(nextNightlyRun(new Date('2026-11-15T18:30:00.000Z')).toISOString()).toBe('2026-11-16T18:30:00.000Z');
  });
});
