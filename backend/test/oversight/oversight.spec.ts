import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { OversightController } from '../../src/oversight/oversight.controller';
import { OVERSIGHT_CONFIG, OversightService, minutesFrom } from '../../src/oversight/oversight.service';
import { IncidentsService } from '../../src/incidents/incidents.service';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

// ─── Minimal mocks ────────────────────────────────────────────────────────────

const NOW = new Date('2026-10-22T04:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function makeMocks(opts: {
  config?: { config_key: string; config_value: unknown }[];
  waiting?: Record<string, unknown>[];
  rejected?: Record<string, unknown>[];
  stale?: Record<string, unknown>[];
  handovers?: Record<string, unknown>[];
  workloadOpen?: Record<string, unknown>[];
  workloadActions?: Record<string, unknown>[];
  staff?: Record<string, unknown>[];
} = {}) {
  const rawCalls: { sql: string; values: unknown[] }[] = [];
  const prisma = {
    system_configurations: { findMany: jest.fn().mockResolvedValue(opts.config ?? []) },
    incident: {
      findMany: jest.fn().mockResolvedValue(opts.waiting ?? []),
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    dispatches: { findMany: jest.fn().mockResolvedValue(opts.rejected ?? []) },
    incident_handovers: { findMany: jest.fn().mockResolvedValue(opts.handovers ?? []) },
    incidentEvent: {
      groupBy: jest.fn().mockResolvedValue(opts.workloadActions ?? []),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: { findMany: jest.fn().mockResolvedValue(opts.staff ?? []) },
    escalation: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      rawCalls.push({ sql, values });
      return sql.includes('location_history') ? (opts.stale ?? []) : (opts.workloadOpen ?? []);
    }),
  };
  const analytics = {
    getUnitCounts: jest.fn().mockResolvedValue({ available: 0, deployed: 0, unavailable: 0 }),
    getPerformanceFromIncidents: jest.fn().mockResolvedValue({
      acknowledgeSec: null, dispatchSec: null, arrivalSec: null, resolvedShare: null,
    }),
  };
  const service = new OversightService(prisma as any, analytics as any);
  return { service, prisma, analytics, rawCalls };
}

// ─── Access ───────────────────────────────────────────────────────────────────

describe('OversightController access', () => {
  it('is Supervisor only, and no endpoint widens it', () => {
    expect(Reflect.getMetadata(ROLES_KEY, OversightController)).toEqual([UserRole.SUPERVISOR]);
    for (const name of ['summary', 'workload', 'exceptions', 'handovers', 'activity', 'majorIncidents'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, OversightController.prototype[name])).toBeUndefined();
    }
  });
});

// ─── Thresholds ───────────────────────────────────────────────────────────────

describe('oversight thresholds', () => {
  it('reads minutes from system_configurations and defaults to 5', async () => {
    const { service } = makeMocks({
      config: [{ config_key: OVERSIGHT_CONFIG.waitingMinutes, config_value: 10 }],
    });
    await expect(service.getThresholds()).resolves.toEqual({ waitingMinutes: 10, staleLocationMinutes: 5 });
  });

  it('accepts numeric strings and rejects nonsense', () => {
    expect(minutesFrom('7')).toBe(7);
    expect(minutesFrom(0)).toBe(5);
    expect(minutesFrom(9999)).toBe(5);
    expect(minutesFrom(2.5)).toBe(5);
    expect(minutesFrom({ minutes: 3 })).toBe(5);
    expect(minutesFrom(undefined)).toBe(5);
  });
});

// ─── Exceptions ───────────────────────────────────────────────────────────────

describe('OversightService.getExceptions()', () => {
  it('waiting: asks for SUBMITTED/RECEIVED older than the threshold and reports the wait', async () => {
    const { service, prisma } = makeMocks({
      config: [{ config_key: OVERSIGHT_CONFIG.waitingMinutes, config_value: 5 }],
      waiting: [{
        id: 'inc-1', public_reference: 'INC-2026-000101', category: 'MEDICAL', priority: 'HIGH',
        status: 'SUBMITTED', submitted_at: minutesAgo(12),
      }],
    });
    const result = await service.getExceptions(NOW);

    expect(prisma.incident.findMany.mock.calls[0][0].where).toEqual({
      status: { in: ['SUBMITTED', 'RECEIVED'] },
      submitted_at: { lt: minutesAgo(5) },
    });
    expect(result.waiting).toEqual([{
      incidentId: 'inc-1', publicReference: 'INC-2026-000101', category: 'MEDICAL', priority: 'HIGH',
      status: 'SUBMITTED', submittedAt: minutesAgo(12).toISOString(), waitingSec: 720,
    }]);
  });

  it('rejected: only on still-active incidents, uncovered rejections first', async () => {
    const row = (id: string, openDispatches: number) => ({
      id,
      rejected_at: minutesAgo(3),
      rejected_reason: 'Unit low on fuel',
      resources: { call_sign: `UNIT-${id}`, name: 'Ambulance' },
      incidents: {
        id: `inc-${id}`, public_reference: `INC-${id}`,
        dispatches: Array.from({ length: openDispatches }, (_, i) => ({ id: `open-${i}` })),
      },
    });
    const { service, prisma } = makeMocks({ rejected: [row('a', 1), row('b', 0)] });
    const result = await service.getExceptions(NOW);

    const where = prisma.dispatches.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('REJECTED');
    expect(where.incidents.status.in).toEqual(expect.arrayContaining(['SUBMITTED', 'ON_SCENE']));
    expect(where.incidents.status.in).not.toContain('RESOLVED');
    expect(result.rejected.map((r) => [r.unit, r.reassigned])).toEqual([['UNIT-b', false], ['UNIT-a', true]]);
  });

  it('stale location: cutoff comes from the threshold; a crew that never reported shows lastSeenAt null', async () => {
    const { service, rawCalls } = makeMocks({
      config: [{ config_key: OVERSIGHT_CONFIG.staleLocationMinutes, config_value: 8 }],
      stale: [
        { dispatch_id: 'd-1', incident_id: 'inc-1', public_reference: 'INC-1', unit: 'ALPHA-1', last_seen: minutesAgo(20), since: minutesAgo(20) },
        { dispatch_id: 'd-2', incident_id: 'inc-2', public_reference: 'INC-2', unit: 'BRAVO-1', last_seen: null, since: minutesAgo(9) },
      ],
    });
    const result = await service.getExceptions(NOW);

    const stale = rawCalls.find((c) => c.sql.includes('location_history'))!;
    // Crew positions are matched through dispatch_crew (location_history.resource_id is not filled).
    expect(stale.sql).toContain('dispatch_crew');
    expect(stale.values).toContainEqual(minutesAgo(8));
    expect(result.staleLocation).toEqual([
      { dispatchId: 'd-1', incidentId: 'inc-1', publicReference: 'INC-1', unit: 'ALPHA-1', lastSeenAt: minutesAgo(20).toISOString(), silentSec: 1200 },
      { dispatchId: 'd-2', incidentId: 'inc-2', publicReference: 'INC-2', unit: 'BRAVO-1', lastSeenAt: null, silentSec: 540 },
    ]);
  });
});

// ─── Handovers ────────────────────────────────────────────────────────────────

describe('OversightService.getPendingHandovers()', () => {
  it('lists only unacknowledged handovers on incidents that have not ended, person to person', async () => {
    const { service, prisma } = makeMocks({
      handovers: [{
        id: 'h-1',
        handed_over_at: minutesAgo(30),
        pending_actions: ['Call BFP', 'Confirm hospital bed'],
        incidents: { id: 'inc-1', public_reference: 'INC-2026-000101', status: 'ON_SCENE' },
        users_incident_handovers_from_user_idTousers: { id: 'u-1', full_name: 'Night Dispatcher', role: 'DISPATCHER' },
        users_incident_handovers_to_user_idTousers: { id: 'u-2', full_name: 'Day Dispatcher', role: 'DISPATCHER' },
      }],
    });
    const result = await service.getPendingHandovers();

    const where = prisma.incident_handovers.findMany.mock.calls[0][0].where;
    expect(where.acknowledged_at).toBeNull();
    expect(where.incidents.status.notIn).toEqual(['CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE']);
    expect(result).toEqual([{
      id: 'h-1', incidentId: 'inc-1', publicReference: 'INC-2026-000101', incidentStatus: 'ON_SCENE',
      from: { id: 'u-1', name: 'Night Dispatcher', role: 'DISPATCHER' },
      to: { id: 'u-2', name: 'Day Dispatcher', role: 'DISPATCHER' },
      handedOverAt: minutesAgo(30).toISOString(), pendingActionCount: 2,
    }]);
  });
});

// ─── Summary and workload ─────────────────────────────────────────────────────

describe('OversightService.getSummary()', () => {
  it('splits active incidents by status and counts open escalations', async () => {
    const { service, prisma } = makeMocks();
    prisma.incident.groupBy.mockResolvedValue([
      { status: 'SUBMITTED', _count: { _all: 2 } },
      { status: 'RECEIVED', _count: { _all: 1 } },
      { status: 'EN_ROUTE', _count: { _all: 3 } },
      { status: 'ON_SCENE', _count: { _all: 4 } },
    ]);
    prisma.escalation.count.mockResolvedValue(2);
    const summary = await service.getSummary(NOW);

    expect(summary).toMatchObject({ active: 10, unacknowledged: 3, enRoute: 3, onScene: 4, openEscalations: 2 });
    expect(prisma.escalation.count.mock.calls[0][0]).toEqual({ where: { status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } } });
  });
});

describe('OversightService.getWorkload()', () => {
  it('merges open dispatches and last-hour actions per person, busiest first, idle staff included', async () => {
    const { service, prisma } = makeMocks({
      workloadOpen: [{ dispatcher_id: 'u-2', open_dispatches: 3, open_incidents: 2 }],
      workloadActions: [{ triggered_by_id: 'u-1', _count: { _all: 7 } }],
      staff: [
        { id: 'u-1', full_name: 'Ana', role: 'SUPERVISOR' },
        { id: 'u-2', full_name: 'Ben', role: 'DISPATCHER' },
        { id: 'u-3', full_name: 'Cara', role: 'DISPATCHER' },
      ],
    });
    const rows = await service.getWorkload(NOW);

    expect(prisma.incidentEvent.groupBy.mock.calls[0][0].where.occurred_at).toEqual({ gte: minutesAgo(60) });
    expect(rows).toEqual([
      { userId: 'u-2', name: 'Ben', role: 'DISPATCHER', openDispatches: 3, openIncidents: 2, actionsLastHour: 0 },
      { userId: 'u-1', name: 'Ana', role: 'SUPERVISOR', openDispatches: 0, openIncidents: 0, actionsLastHour: 7 },
      { userId: 'u-3', name: 'Cara', role: 'DISPATCHER', openDispatches: 0, openIncidents: 0, actionsLastHour: 0 },
    ]);
  });

  it('lists staff who can sign in (PENDING_VERIFICATION included) plus anyone holding open incidents', async () => {
    const { service, prisma } = makeMocks({
      workloadOpen: [{ dispatcher_id: 'u-susp', open_dispatches: 1, open_incidents: 1 }],
    });
    await service.getWorkload(NOW);

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.role).toEqual({ in: ['DISPATCHER', 'SUPERVISOR'] });
    expect(where.OR).toEqual([
      { status: { notIn: ['SUSPENDED', 'DEACTIVATED'] } },
      { id: { in: ['u-susp'] } },
    ]);
    // A PENDING_VERIFICATION dispatcher passes the status clause; ACTIVE alone is no longer required.
    expect(where.OR[0].status.notIn).not.toContain('PENDING_VERIFICATION');
  });
});

describe('OversightService.getActivity()', () => {
  it('reads incident_events newest first and never selects notes', async () => {
    const { service, prisma } = makeMocks();
    prisma.incidentEvent.findMany.mockResolvedValue([{
      id: 'e-1', from_status: 'ACKNOWLEDGED', to_status: 'DISPATCHED', occurred_at: minutesAgo(2),
      incidents: { id: 'inc-1', public_reference: 'INC-2026-000101' },
      users: { id: 'u-2', full_name: 'Ben', role: 'DISPATCHER' },
    }]);
    const feed = await service.getActivity();

    const args = prisma.incidentEvent.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ occurred_at: 'desc' });
    expect(args.select).not.toHaveProperty('notes');
    expect(feed).toEqual([{
      id: 'e-1', incidentId: 'inc-1', publicReference: 'INC-2026-000101',
      fromStatus: 'ACKNOWLEDGED', toStatus: 'DISPATCHED',
      actor: { id: 'u-2', name: 'Ben', role: 'DISPATCHER' }, occurredAt: minutesAgo(2).toISOString(),
    }]);
  });
});

// ─── ICS situation notes are stored ───────────────────────────────────────────

describe('IncidentsService.updateIcs() situation notes', () => {
  function makeIncidents() {
    const prisma = {
      incident_command_structures: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ics-1', incident_id: 'inc-1' }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'ics-1', ...data })),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const realtime = { incidentUpdated: jest.fn() };
    const service = new IncidentsService(
      prisma as any, {} as any, {} as any, {} as any, realtime as any, audit as any, {} as any,
    );
    return { service, prisma, audit };
  }

  it('writes situation_notes (trimmed) and audits the change', async () => {
    const { service, prisma, audit } = makeIncidents();
    await service.updateIcs('inc-1', { situationNotes: '  Fire contained at Bundukan warehouse.  ' }, 'sup-1');

    const data = prisma.incident_command_structures.update.mock.calls[0][0].data;
    expect(data.situation_notes).toBe('Fire contained at Bundukan warehouse.');
    expect(data).not.toHaveProperty('objectives');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'sup-1', moduleId: 'MOD-36' }));
  });

  it('clears notes with an empty string and leaves them alone when omitted', async () => {
    const { service, prisma } = makeIncidents();
    await service.updateIcs('inc-1', { situationNotes: '   ' }, 'sup-1');
    await service.updateIcs('inc-1', { objectives: ['Contain fire'] }, 'sup-1');

    expect(prisma.incident_command_structures.update.mock.calls[0][0].data.situation_notes).toBeNull();
    expect(prisma.incident_command_structures.update.mock.calls[1][0].data).not.toHaveProperty('situation_notes');
  });

  it('rejects oversized notes and non-text objectives', async () => {
    const { service } = makeIncidents();
    await expect(service.updateIcs('inc-1', { situationNotes: 'x'.repeat(4001) }, 'sup-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateIcs('inc-1', { objectives: [42 as unknown as string] }, 'sup-1'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
