import { UserRole } from '@agap/shared';
import { AnalyticsController } from '../../src/analytics/analytics.controller';
import {
  AnalyticsService,
  manilaDateKey,
  manilaMidnight,
} from '../../src/analytics/analytics.service';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

// ─── Minimal mocks ────────────────────────────────────────────────────────────

type Rows = Record<string, unknown>[];

function makeMocks(opts: {
  byCategory?: Rows;
  byPriority?: Rows;
  byBarangay?: Rows;
  resolvedToday?: number;
  units?: Rows;
  trend?: Rows;
  performance?: Rows;
} = {}) {
  const rawCalls: { sql: string; values: unknown[] }[] = [];

  const prisma = {
    incident: {
      groupBy: jest.fn(async (args: { by: string[] }) =>
        args.by[0] === 'category' ? (opts.byCategory ?? []) : (opts.byPriority ?? []),
      ),
      count: jest.fn().mockResolvedValue(opts.resolvedToday ?? 0),
    },
    incident_locations: { groupBy: jest.fn().mockResolvedValue(opts.byBarangay ?? []) },
    resources: { groupBy: jest.fn().mockResolvedValue(opts.units ?? []) },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      rawCalls.push({ sql, values });
      return sql.includes('to_char') ? (opts.trend ?? []) : (opts.performance ?? []);
    }),
  };

  const service = new AnalyticsService(prisma as any);
  return { service, prisma, rawCalls };
}

const count = (n: number) => ({ _count: { _all: n } });

/** 2026-10-23 00:30 in Manila, but still 2026-10-22 in UTC. */
const JUST_AFTER_MANILA_MIDNIGHT = new Date('2026-10-22T16:30:00.000Z');

// ─── Access ───────────────────────────────────────────────────────────────────

describe('GET /analytics/municipal-overview access', () => {
  it('allows exactly the LGU account, Dispatcher and Supervisor', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.municipalOverview);
    expect([...roles].sort()).toEqual(
      [UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.DISPATCHER, UserRole.SUPERVISOR].sort(),
    );
  });
});

// ─── Shape (count-only guard) ─────────────────────────────────────────────────

describe('AnalyticsService.getMunicipalOverview() shape', () => {
  it('returns only the documented keys, all counts', async () => {
    const { service } = makeMocks({
      byCategory: [{ category: 'FIRE', ...count(2) }],
      byPriority: [{ priority: 'CRITICAL', ...count(2) }],
      byBarangay: [{ barangay: 'Bunlo', ...count(2) }],
      units: [{ status: 'AVAILABLE', ...count(3) }],
    });
    const overview = await service.getMunicipalOverview(JUST_AFTER_MANILA_MIDNIGHT);

    expect(Object.keys(overview).sort()).toEqual([
      'active', 'activeByBarangay', 'activeByCategory', 'activeByPriority', 'generatedAt',
      'performance7d', 'today', 'trend7d', 'units', 'yesterday',
    ]);
    expect(Object.keys(overview.today).sort()).toEqual(['critical', 'resolved', 'total']);
    expect(Object.keys(overview.yesterday).sort()).toEqual(['critical', 'total']);
    expect(Object.keys(overview.units).sort()).toEqual(['available', 'deployed', 'unavailable']);
    expect(Object.keys(overview.performance7d).sort()).toEqual(
      ['acknowledgeSec', 'arrivalSec', 'dispatchSec', 'resolvedShare'],
    );
    for (const row of overview.activeByBarangay) expect(Object.keys(row).sort()).toEqual(['barangay', 'count']);
    for (const row of overview.activeByCategory) expect(Object.keys(row).sort()).toEqual(['category', 'count']);
    for (const row of overview.trend7d) expect(Object.keys(row).sort()).toEqual(['critical', 'date', 'total']);
  });

  it('never reads incident rows: aggregates only', async () => {
    const { service, prisma } = makeMocks();
    await service.getMunicipalOverview(JUST_AFTER_MANILA_MIDNIGHT);
    expect((prisma.incident as Record<string, unknown>).findMany).toBeUndefined();
    for (const call of prisma.incident.groupBy.mock.calls) expect(call[0]).not.toHaveProperty('select');
    expect(prisma.incident_locations.groupBy.mock.calls[0][0]).not.toHaveProperty('select');
  });
});

// ─── Counts ───────────────────────────────────────────────────────────────────

describe('AnalyticsService.getMunicipalOverview() counts', () => {
  it('counts active incidents with no tagged barangay as Unassigned', async () => {
    const { service } = makeMocks({
      byCategory: [{ category: 'MEDICAL', ...count(4) }, { category: 'FLOOD', ...count(3) }],
      // 7 active, 4 tagged: 3 have a null barangay or no location row.
      byBarangay: [{ barangay: 'Lolomboy', ...count(1) }, { barangay: 'Bunlo', ...count(3) }],
    });
    const overview = await service.getMunicipalOverview(JUST_AFTER_MANILA_MIDNIGHT);

    expect(overview.active).toBe(7);
    expect(overview.activeByBarangay).toEqual([
      { barangay: 'Bunlo', count: 3 },
      { barangay: 'Lolomboy', count: 1 },
      { barangay: 'Unassigned', count: 3 },
    ]);
  });

  it('omits Unassigned when every active incident has a barangay', async () => {
    const { service } = makeMocks({
      byCategory: [{ category: 'FIRE', ...count(1) }],
      byBarangay: [{ barangay: 'Bundukan', ...count(1) }],
    });
    const overview = await service.getMunicipalOverview(JUST_AFTER_MANILA_MIDNIGHT);
    expect(overview.activeByBarangay).toEqual([{ barangay: 'Bundukan', count: 1 }]);
  });

  it('zero-fills all four priorities in severity order', async () => {
    const { service } = makeMocks({ byPriority: [{ priority: 'HIGH', ...count(2) }] });
    const overview = await service.getMunicipalOverview(JUST_AFTER_MANILA_MIDNIGHT);
    expect(overview.activeByPriority).toEqual([
      { priority: 'CRITICAL', count: 0 },
      { priority: 'HIGH', count: 2 },
      { priority: 'MEDIUM', count: 0 },
      { priority: 'LOW', count: 0 },
    ]);
  });

  it('buckets unit statuses into available, deployed and unavailable', async () => {
    const { service } = makeMocks({
      units: [
        { status: 'AVAILABLE', ...count(4) },
        { status: 'EN_ROUTE', ...count(1) },
        { status: 'RETURNING', ...count(1) },
        { status: 'RESERVED', ...count(1) },
        { status: 'OFFLINE', ...count(2) },
      ],
    });
    const overview = await service.getMunicipalOverview(JUST_AFTER_MANILA_MIDNIGHT);
    expect(overview.units).toEqual({ available: 4, deployed: 3, unavailable: 2 });
  });
});

// ─── Trend and day boundaries ─────────────────────────────────────────────────

describe('AnalyticsService.getMunicipalOverview() trend', () => {
  it('has exactly 7 Manila days, oldest first, zero-filled', async () => {
    const { service } = makeMocks({
      trend: [
        { day: '2026-10-23', total: 2, critical: 1 },
        { day: '2026-10-20', total: 5, critical: 0 },
      ],
    });
    const overview = await service.getMunicipalOverview(JUST_AFTER_MANILA_MIDNIGHT);

    expect(overview.trend7d).toEqual([
      { date: '2026-10-17', total: 0, critical: 0 },
      { date: '2026-10-18', total: 0, critical: 0 },
      { date: '2026-10-19', total: 0, critical: 0 },
      { date: '2026-10-20', total: 5, critical: 0 },
      { date: '2026-10-21', total: 0, critical: 0 },
      { date: '2026-10-22', total: 0, critical: 0 },
      { date: '2026-10-23', total: 2, critical: 1 },
    ]);
    expect(overview.today).toMatchObject({ total: 2, critical: 1 });
    expect(overview.yesterday).toEqual({ total: 0, critical: 0 });
  });

  it('starts "today" at Manila midnight, not UTC midnight', async () => {
    const { service, prisma, rawCalls } = makeMocks();
    await service.getMunicipalOverview(JUST_AFTER_MANILA_MIDNIGHT);

    // Resolved today counts from 2026-10-23 00:00 Manila = 2026-10-22 16:00 UTC.
    expect(prisma.incident.count.mock.calls[0][0]).toEqual({
      where: { resolved_at: { gte: new Date('2026-10-22T16:00:00.000Z') } },
    });
    // The trend window opens six Manila days earlier.
    const trend = rawCalls.find((c) => c.sql.includes('to_char'))!;
    expect(trend.values[0]).toEqual(new Date('2026-10-16T16:00:00.000Z'));
  });

  it('manilaMidnight and manilaDateKey ignore the server time zone', () => {
    expect(manilaMidnight(new Date('2026-10-22T15:59:59.999Z')).toISOString()).toBe('2026-10-21T16:00:00.000Z');
    expect(manilaMidnight(new Date('2026-10-22T16:00:00.000Z')).toISOString()).toBe('2026-10-22T16:00:00.000Z');
    expect(manilaDateKey(new Date('2026-10-22T15:59:59.999Z'))).toBe('2026-10-22');
    expect(manilaDateKey(new Date('2026-10-22T16:00:00.000Z'))).toBe('2026-10-23');
  });
});

// ─── Performance ──────────────────────────────────────────────────────────────

describe('AnalyticsService.getPerformanceFromIncidents()', () => {
  it('returns null (never 0) when there are no incidents', async () => {
    const { service } = makeMocks({
      performance: [{ ack: null, dispatch: null, arrival: null, total: 0, resolved: 0 }],
    });
    await expect(service.getPerformanceFromIncidents(new Date())).resolves.toEqual({
      acknowledgeSec: null,
      dispatchSec: null,
      arrivalSec: null,
      resolvedShare: null,
    });
  });

  it('rounds averages to whole seconds and reports the resolved share', async () => {
    const { service } = makeMocks({
      // Postgres AVG over numeric comes back as a Decimal-like string.
      performance: [{ ack: '95.4', dispatch: '310.6', arrival: null, total: 4, resolved: 3 }],
    });
    await expect(service.getPerformanceFromIncidents(new Date())).resolves.toEqual({
      acknowledgeSec: 95,
      dispatchSec: 311,
      arrivalSec: null,
      resolvedShare: 0.75,
    });
  });
});
