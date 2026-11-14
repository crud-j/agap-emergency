import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from '../../src/analytics/analytics.service';

/** GET /analytics/daily and the nightly job: one Asia/Manila day, reported incidents only. */
describe('AnalyticsService.getDailySummary()', () => {
  function build() {
    const prisma = {
      incident: { count: jest.fn().mockReturnValue('count'), groupBy: jest.fn().mockReturnValue('group') },
      $transaction: jest.fn().mockResolvedValue([4, [], []]),
    };
    return { service: new AnalyticsService(prisma as any), prisma };
  }

  it('counts the Manila calendar day, not the server day', async () => {
    const { service, prisma } = build();
    const summary = await service.getDailySummary('2026-11-14');

    const where = prisma.incident.count.mock.calls[0][0].where;
    // 2026-11-14 00:00 in Manila is 2026-11-13 16:00 UTC.
    expect(where.submitted_at.gte.toISOString()).toBe('2026-11-13T16:00:00.000Z');
    expect(where.submitted_at.lt.toISOString()).toBe('2026-11-14T16:00:00.000Z');
    expect(summary).toMatchObject({ date: '2026-11-14', total: 4 });
  });

  it('skips DRAFT and DUPLICATE like every other analytics count', async () => {
    const { service, prisma } = build();
    await service.getDailySummary('2026-11-14');

    expect(prisma.incident.count.mock.calls[0][0].where.status).toEqual({ notIn: ['DRAFT', 'DUPLICATE'] });
    expect(prisma.incident.groupBy.mock.calls[0][0].where.status).toEqual({ notIn: ['DRAFT', 'DUPLICATE'] });
  });

  it('defaults to today in Manila (just after midnight there, still the day before in UTC)', async () => {
    const { service } = build();
    const summary = await service.getDailySummary(undefined, new Date('2026-11-14T16:30:00.000Z'));
    expect(summary.date).toBe('2026-11-15');
  });

  it.each(['14-11-2026', '2026-02-30', 'yesterday'])('refuses %p with 400', async (bad) => {
    const { service } = build();
    await expect(service.getDailySummary(bad)).rejects.toBeInstanceOf(BadRequestException);
  });
});
