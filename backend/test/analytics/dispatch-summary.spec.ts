import { UserRole } from '@agap/shared';
import { AnalyticsController } from '../../src/analytics/analytics.controller';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

// ─── Minimal mocks ────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-22T04:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const count = (n: number) => ({ _count: { _all: n } });

function makeMocks(byStatus: Record<string, unknown>[] = []) {
  const prisma = {
    incident: {
      groupBy: jest.fn().mockResolvedValue(byStatus),
      count: jest.fn().mockResolvedValue(0),
    },
    resources: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  return { service: new AnalyticsService(prisma as any), prisma };
}

describe('GET /analytics/dispatch-summary access', () => {
  it('allows exactly the Dispatcher and Supervisor', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.dispatchSummary);
    expect([...roles].sort()).toEqual([UserRole.DISPATCHER, UserRole.SUPERVISOR].sort());
  });
});

describe('AnalyticsService.getDispatchSummary()', () => {
  it('splits active incidents the way the queue does', async () => {
    const { service, prisma } = makeMocks([
      { status: 'SUBMITTED', ...count(2) },
      { status: 'RECEIVED', ...count(1) },
      { status: 'ASSESSED', ...count(3) },
      { status: 'DISPATCH_PENDING', ...count(1) },
      { status: 'EN_ROUTE', ...count(2) },
      { status: 'ON_SCENE', ...count(4) },
    ]);
    const summary = await service.getDispatchSummary(NOW);

    // The groupBy is restricted to the shared active list (same as ACTIVE_STATUSES in the queue).
    expect(prisma.incident.groupBy.mock.calls[0][0].where.status.in).toEqual([
      'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING',
      'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING',
    ]);
    expect(summary).toMatchObject({
      active: 13, unreviewed: 3, awaitingDispatch: 4, enRoute: 2, onScene: 4,
    });
  });

  it('compares the last 24 hours with the 24 hours before, by submission and resolution time', async () => {
    const { service, prisma } = makeMocks();
    await service.getDispatchSummary(NOW);

    const wheres = prisma.incident.count.mock.calls.map((c) => c[0].where);
    expect(wheres).toContainEqual({
      submitted_at: { gte: hoursAgo(24), lt: NOW },
      status: { notIn: ['DRAFT', 'DUPLICATE'] },
    });
    expect(wheres).toContainEqual({
      submitted_at: { gte: hoursAgo(48), lt: hoursAgo(24) },
      status: { notIn: ['DRAFT', 'DUPLICATE'] },
      priority: 'CRITICAL',
    });
    expect(wheres).toContainEqual({ resolved_at: { gte: hoursAgo(24), lt: NOW } });
  });

  it('returns counts only', async () => {
    const { service } = makeMocks();
    const summary = await service.getDispatchSummary(NOW);
    expect(Object.keys(summary).sort()).toEqual([
      'active', 'awaitingDispatch', 'critical', 'enRoute', 'generatedAt', 'last24h',
      'onScene', 'previous24h', 'units', 'unreviewed',
    ]);
    expect(Object.keys(summary.last24h).sort()).toEqual(['critical', 'reported', 'resolved']);
  });
});
