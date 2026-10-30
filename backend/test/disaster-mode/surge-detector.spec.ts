import { SurgeDetectorService } from '../../src/disaster-mode/surge-detector.service';
import {
  SURGE_RECOMMENDED,
  surgeRecommendationText,
} from '../../src/disaster-mode/surge-recommendation';

/**
 * AUTOMATION_NEEDS_PLAN Phase 2, C2 (MOD-52): the detector tells every Supervisor when recent
 * incidents trip a rule, at most once an hour per rule, and never activates surge mode.
 */

const NOW = new Date('2026-10-30T06:00:00Z');
const FLOOD_RULE = {
  id: 'rule-flood',
  rule_key: 'FLOOD_CLUSTER',
  window_minutes: 30,
  min_incidents: 5,
  category: 'FLOOD',
  barangays: ['Lolomboy', 'Bunlo', 'Igulot', 'Bambang'],
  is_active: true,
};
const SUPERVISORS = [{ id: 'sup-1', full_name: 'Sup One' }, { id: 'sup-2', full_name: 'Sup Two' }];

function build(opts: {
  activeSurge?: boolean;
  rules?: Array<Record<string, unknown>>;
  count?: number;
  river?: { river_level_m: number; river_level_at: Date } | null;
  recentNotice?: boolean;
} = {}) {
  const prisma: any = {
    surge_incidents: {
      findFirst: jest.fn().mockResolvedValue(opts.activeSurge ? { id: 'surge-1' } : null),
      create: jest.fn(),
      update: jest.fn(),
    },
    surge_rules: { findMany: jest.fn().mockResolvedValue(opts.rules ?? [FLOOD_RULE]) },
    incident: { count: jest.fn().mockResolvedValue(opts.count ?? 0), update: jest.fn() },
    surge_settings: { findUnique: jest.fn().mockResolvedValue(opts.river ?? null) },
    notification: { findFirst: jest.fn().mockResolvedValue(opts.recentNotice ? { id: 'n-old' } : null) },
    user: { findMany: jest.fn().mockResolvedValue(SUPERVISORS) },
  };
  const notifications: any = { create: jest.fn().mockResolvedValue({}) };
  const realtime: any = { surgeRecommended: jest.fn() };
  const service = new SurgeDetectorService(prisma, notifications, realtime);
  return { service, prisma, notifications, realtime };
}

describe('surgeRecommendationText', () => {
  it('names the count, category, barangays and window', () => {
    expect(
      surgeRecommendationText({ ruleKey: 'FLOOD_CLUSTER', count: 5, windowMinutes: 30, category: 'FLOOD', barangays: ['Bunlo', 'Igulot'] }),
    ).toEqual({ title: 'Surge mode recommended', body: '5 FLOOD incidents in Bunlo, Igulot in 30 min. Review surge mode.' });
  });

  it('reads the volume rule (any category, any barangay) and the river level', () => {
    expect(surgeRecommendationText({ ruleKey: 'VOLUME', count: 9, windowMinutes: 30, category: null, barangays: [] }).body)
      .toBe('9 incidents in 30 min. Review surge mode.');
    expect(surgeRecommendationText({ ruleKey: 'RIVER_LEVEL', count: 0, windowMinutes: 0, category: 'FLOOD', barangays: [], riverLevelM: 11.6 }).body)
      .toBe('Bocaue River at 11.60 m (critical 11.50 m). Review surge mode.');
  });
});

describe('SurgeDetectorService.evaluate', () => {
  it('trips at the threshold: one in-app notice per Supervisor and one ops event', async () => {
    const b = build({ count: 5 });
    await expect(b.service.evaluate(NOW)).resolves.toBe(2);

    expect(b.notifications.create).toHaveBeenCalledTimes(2);
    expect(b.notifications.create.mock.calls.map((c: any[]) => c[0].userId).sort()).toEqual(['sup-1', 'sup-2']);
    expect(b.notifications.create).toHaveBeenCalledWith({
      userId: 'sup-1',
      eventType: SURGE_RECOMMENDED,
      title: 'Surge mode recommended',
      body: '5 FLOOD incidents in Lolomboy, Bunlo, Igulot, Bambang in 30 min. Review surge mode.',
      channel: 'IN_APP',
      dataPayload: { ruleKey: 'FLOOD_CLUSTER', count: 5, windowMinutes: 30, category: 'FLOOD', barangays: FLOOD_RULE.barangays },
    });
    expect(b.realtime.surgeRecommended).toHaveBeenCalledTimes(1);
    expect(b.realtime.surgeRecommended).toHaveBeenCalledWith(
      expect.objectContaining({ ruleKey: 'FLOOD_CLUSTER', count: 5, recommendedAt: NOW.toISOString() }),
    );
    // Recipients come from findEscalationRecipients(['SUPERVISOR']): the sign-in rule, not status ACTIVE.
    expect(b.prisma.user.findMany.mock.calls[0][0].where.role).toEqual({ in: ['SUPERVISOR'] });
  });

  it('does not trip one below the threshold', async () => {
    const b = build({ count: 4 });
    await expect(b.service.evaluate(NOW)).resolves.toBe(0);
    expect(b.notifications.create).not.toHaveBeenCalled();
    expect(b.realtime.surgeRecommended).not.toHaveBeenCalled();
  });

  it('counts the rule window, category and barangays, and leaves out drafts, cancelled, false and duplicate alerts', async () => {
    const b = build({ count: 0 });
    await b.service.evaluate(NOW);
    const where = b.prisma.incident.count.mock.calls[0][0].where;
    expect(where.created_at.gte).toEqual(new Date(NOW.getTime() - 30 * 60_000));
    expect(where.status).toEqual({ notIn: ['DRAFT', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE'] });
    expect(where.category).toBe('FLOOD');
    // Geocoded text or the polygon-matched barangay notice.
    expect(where.OR).toEqual([
      { incident_locations: { is: { barangay: { in: FLOOD_RULE.barangays } } } },
      { barangay_notices: { some: { barangay: { name: { in: FLOOD_RULE.barangays } } } } },
    ]);
  });

  it('a rule with no category or barangays counts every incident in the window', async () => {
    const b = build({ rules: [{ ...FLOOD_RULE, rule_key: 'VOLUME', category: null, barangays: [], min_incidents: 8 }], count: 8 });
    await expect(b.service.evaluate(NOW)).resolves.toBe(2);
    const where = b.prisma.incident.count.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('category');
    expect(where).not.toHaveProperty('OR');
  });

  it('dedups: the same rule recommended in the last 60 min sends nothing', async () => {
    const b = build({ count: 7, recentNotice: true });
    await expect(b.service.evaluate(NOW)).resolves.toBe(0);
    expect(b.notifications.create).not.toHaveBeenCalled();
    expect(b.realtime.surgeRecommended).not.toHaveBeenCalled();
    expect(b.prisma.notification.findFirst).toHaveBeenCalledWith({
      where: {
        event_type: SURGE_RECOMMENDED,
        created_at: { gte: new Date(NOW.getTime() - 60 * 60_000) },
        data_payload: { path: ['ruleKey'], equals: 'FLOOD_CLUSTER' },
      },
      select: { id: true },
    });
  });

  it('trips RIVER_LEVEL on a critical reading from the last 6 hours', async () => {
    const b = build({ count: 0, river: { river_level_m: 11.62, river_level_at: new Date(NOW.getTime() - 60 * 60_000) } });
    await expect(b.service.evaluate(NOW)).resolves.toBe(2);
    expect(b.notifications.create.mock.calls[0][0]).toMatchObject({
      body: 'Bocaue River at 11.62 m (critical 11.50 m). Review surge mode.',
      dataPayload: { ruleKey: 'RIVER_LEVEL', riverLevelM: 11.62 },
    });
  });

  it('ignores a river reading below critical or older than 6 hours', async () => {
    const below = build({ river: { river_level_m: 11.49, river_level_at: NOW } });
    await expect(below.service.evaluate(NOW)).resolves.toBe(0);
    const stale = build({ river: { river_level_m: 12, river_level_at: new Date(NOW.getTime() - 7 * 60 * 60_000) } });
    await expect(stale.service.evaluate(NOW)).resolves.toBe(0);
    expect(stale.notifications.create).not.toHaveBeenCalled();
  });

  it('does nothing while a surge is already active', async () => {
    const b = build({ activeSurge: true, count: 50 });
    await expect(b.service.evaluate(NOW)).resolves.toBe(0);
    expect(b.prisma.surge_rules.findMany).not.toHaveBeenCalled();
    expect(b.notifications.create).not.toHaveBeenCalled();
  });

  it('never activates surge mode or writes an incident', async () => {
    const b = build({ count: 99, river: { river_level_m: 13, river_level_at: NOW } });
    await b.service.evaluate(NOW);
    expect(b.prisma.surge_incidents.create).not.toHaveBeenCalled();
    expect(b.prisma.surge_incidents.update).not.toHaveBeenCalled();
    expect(b.prisma.incident.update).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyNames(SurgeDetectorService.prototype)).not.toContain('activate');
  });

  it('a database error never throws out of the cron run', async () => {
    const b = build();
    b.prisma.surge_rules.findMany.mockRejectedValue(new Error('db down'));
    await expect(b.service.evaluate(NOW)).resolves.toBe(0);
  });

  it('one failed notice still reaches the other Supervisors', async () => {
    const b = build({ count: 5 });
    b.notifications.create.mockRejectedValueOnce(new Error('insert failed'));
    await expect(b.service.evaluate(NOW)).resolves.toBe(1);
    expect(b.realtime.surgeRecommended).toHaveBeenCalledTimes(1);
  });

  it('a failure on one rule does not stop the next', async () => {
    const b = build({
      rules: [FLOOD_RULE, { ...FLOOD_RULE, rule_key: 'INDUSTRIAL', category: 'INDUSTRIAL', barangays: ['Bundukan'], min_incidents: 2 }],
      count: 6,
    });
    b.prisma.notification.findFirst.mockRejectedValueOnce(new Error('json filter failed')).mockResolvedValue(null);
    await expect(b.service.evaluate(NOW)).resolves.toBe(2);
    expect(b.realtime.surgeRecommended).toHaveBeenCalledWith(expect.objectContaining({ ruleKey: 'INDUSTRIAL' }));
  });
});
