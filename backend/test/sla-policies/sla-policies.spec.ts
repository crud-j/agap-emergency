import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '@agap/shared';
import {
  FALLBACK_SLA_SECONDS,
  SLA_STEPS,
  deadlineFor,
  formatTarget,
  pickPolicy,
  stepForEscalation,
  stepReached,
  thresholdsOf,
  type SlaPolicyRow,
} from '../../src/sla-policies/sla-rules';
import { SlaPoliciesService, assertValidTargets } from '../../src/sla-policies/sla-policies.service';
import { SlaScheduleService, slaJobId } from '../../src/sla-policies/sla-schedule.service';
import { SlaPoliciesController } from '../../src/sla-policies/sla-policies.controller';
import { UpdateSlaPolicyDto } from '../../src/sla-policies/dto/update-sla-policy.dto';
import { SlaMonitorProcessor, slaBreachReasonPrefix } from '../../src/jobs/processors/sla-monitor.processor';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { AnalyticsService } from '../../src/analytics/analytics.service';
import { DispatchService } from '../../src/dispatch/dispatch.service';

const SUBMITTED = new Date('2026-11-14T02:00:00.000Z');
const after = (secs: number) => new Date(SUBMITTED.getTime() + secs * 1000);
const [ACK, DISPATCH, ON_SCENE] = SLA_STEPS as [typeof SLA_STEPS[0], typeof SLA_STEPS[0], typeof SLA_STEPS[0]];

function policy(overrides: Partial<SlaPolicyRow>): SlaPolicyRow {
  return {
    id: 'p',
    incident_category: null,
    priority: null,
    acknowledge_threshold_secs: 120,
    dispatch_threshold_secs: 300,
    on_scene_threshold_secs: 900,
    is_active: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// Seeded per-priority policies (prisma/seed/seed.ts).
const SEEDED: SlaPolicyRow[] = [
  policy({ id: 'crit', priority: 'CRITICAL', acknowledge_threshold_secs: 60, dispatch_threshold_secs: 120, on_scene_threshold_secs: 600 }),
  policy({ id: 'high', priority: 'HIGH', acknowledge_threshold_secs: 120, dispatch_threshold_secs: 300, on_scene_threshold_secs: 900 }),
  policy({ id: 'med', priority: 'MEDIUM', acknowledge_threshold_secs: 300, dispatch_threshold_secs: 600, on_scene_threshold_secs: 1800 }),
  policy({ id: 'low', priority: 'LOW', acknowledge_threshold_secs: 600, dispatch_threshold_secs: 1200, on_scene_threshold_secs: 3600 }),
];

describe('SLA rules (MOD-41)', () => {
  it('uses the policy for the incident priority', () => {
    expect(pickPolicy(SEEDED, 'FIRE', 'CRITICAL')?.id).toBe('crit');
    expect(pickPolicy(SEEDED, 'MEDICAL', 'LOW')?.id).toBe('low');
  });

  it('prefers category + priority, then either one, then a catch-all; newest wins a tie', () => {
    const policies = [
      ...SEEDED,
      policy({ id: 'catch-all' }),
      policy({ id: 'fire-any', incident_category: 'FIRE' }),
      policy({ id: 'fire-crit-old', incident_category: 'FIRE', priority: 'CRITICAL' }),
      policy({ id: 'fire-crit-new', incident_category: 'FIRE', priority: 'CRITICAL', created_at: new Date('2026-06-01Z') }),
    ];
    expect(pickPolicy(policies, 'FIRE', 'CRITICAL')?.id).toBe('fire-crit-new');
    expect(pickPolicy(policies, 'FLOOD', 'CRITICAL')?.id).toBe('crit');
    expect(pickPolicy([policy({ id: 'catch-all' })], 'FLOOD', 'HIGH')?.id).toBe('catch-all');
  });

  it('ignores inactive policies and falls back when nothing matches', () => {
    const inactive = SEEDED.map((p) => ({ ...p, is_active: false }));
    expect(pickPolicy(inactive, 'FIRE', 'CRITICAL')).toBeNull();
    expect(thresholdsOf(null)).toEqual({ acknowledge: 120, dispatch: 300, onScene: 900 });
    expect(FALLBACK_SLA_SECONDS).toEqual({ acknowledge: 120, dispatch: 300, onScene: 900 });
  });

  it('measures every deadline from the report', () => {
    const t = thresholdsOf(SEEDED[0]!);
    expect(deadlineFor(SUBMITTED, t, ACK)).toEqual(after(60));
    expect(deadlineFor(SUBMITTED, t, DISPATCH)).toEqual(after(120));
    expect(deadlineFor(SUBMITTED, t, ON_SCENE)).toEqual(after(600));
  });

  it('treats a step as reached by its timestamp or by a later status, not by a finished one', () => {
    expect(stepReached(ACK, { status: 'SUBMITTED' })).toBe(false);
    expect(stepReached(ACK, { status: 'ASSESSED' })).toBe(true);
    expect(stepReached(DISPATCH, { status: 'ACKNOWLEDGED' })).toBe(false);
    expect(stepReached(DISPATCH, { status: 'DISPATCH_PENDING', dispatched_at: after(100) })).toBe(true); // recalled
    expect(stepReached(ON_SCENE, { status: 'CANCELLED' })).toBe(false);
  });

  it('maps job names to steps and formats targets', () => {
    expect(stepForEscalation('RESPONSE')?.key).toBe('onScene');
    expect(stepForEscalation('NOPE')).toBeUndefined();
    expect(formatTarget(120)).toBe('2 min');
    expect(formatTarget(90)).toBe('90 s');
  });
});

describe('SlaScheduleService', () => {
  function build(policies: SlaPolicyRow[] = SEEDED) {
    const prisma = { sla_policies: { findMany: jest.fn().mockResolvedValue(policies) } };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new SlaScheduleService(prisma as any, new SlaPoliciesService(prisma as any, {} as any), queue as any);
    return { service, queue, prisma };
  }
  const incident = { id: 'inc-1', public_reference: 'INC-2026-000001', category: 'FIRE', priority: 'CRITICAL', submitted_at: SUBMITTED };

  it('queues all three checks at once, at the priority targets measured from the report', async () => {
    const { service, queue } = build();
    await service.scheduleForIncident(incident, after(10));

    const calls = queue.add.mock.calls.map(([, data, opts]) => ({ type: data.escalationType, delay: opts.delay, jobId: opts.jobId }));
    expect(calls).toEqual([
      { type: 'ACKNOWLEDGEMENT', delay: 50_000, jobId: slaJobId('inc-1', ACK, after(60)) },
      { type: 'DISPATCH', delay: 110_000, jobId: slaJobId('inc-1', DISPATCH, after(120)) },
      { type: 'RESPONSE', delay: 590_000, jobId: slaJobId('inc-1', ON_SCENE, after(600)) },
    ]);
  });

  it('runs a check immediately when its deadline has already passed', async () => {
    const { service, queue } = build();
    await service.scheduleForIncident(incident, after(200));
    expect(queue.add.mock.calls.map(([, , opts]) => opts.delay)).toEqual([0, 0, 400_000]);
  });

  it('re-queues every open incident after a target change', async () => {
    const { service, queue, prisma } = build();
    (prisma as any).incident = { findMany: jest.fn().mockResolvedValue([incident, { ...incident, id: 'inc-2' }]) };
    expect(await service.rescheduleOpenIncidents(after(10))).toBe(2);
    expect((prisma as any).incident.findMany.mock.calls[0][0].where.status.notIn).toEqual(
      expect.arrayContaining(['RESOLVED', 'CLOSED', 'CANCELLED', 'DRAFT']),
    );
    expect(queue.add).toHaveBeenCalledTimes(6); // 3 checks × 2 incidents
  });

  it('never throws when the queue fails', async () => {
    const { service, queue } = build();
    queue.add.mockRejectedValue(new Error('redis down'));
    await expect(service.scheduleForIncident(incident)).resolves.toBeUndefined();
  });
});

describe('SlaMonitorProcessor.check', () => {
  function build(incidentOverrides: Record<string, unknown> = {}, existingEscalation: unknown = null) {
    const incident = {
      id: 'inc-1',
      public_reference: 'INC-2026-000001',
      status: 'ACKNOWLEDGED',
      priority: 'CRITICAL',
      category: 'FIRE',
      submitted_at: SUBMITTED,
      acknowledged_at: after(30),
      dispatched_at: null,
      on_scene_at: null,
      ...incidentOverrides,
    };
    const prisma = {
      incident: { findUnique: jest.fn().mockResolvedValue(incident) },
      sla_policies: { findMany: jest.fn().mockResolvedValue(SEEDED) },
      escalation: {
        findFirst: jest.fn().mockResolvedValue(existingEscalation),
        create: jest.fn().mockResolvedValue({ id: 'esc-1' }),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'sup-1' }]) },
    };
    const realtime = { notifyEscalation: jest.fn() };
    const notifications = { add: jest.fn().mockResolvedValue(undefined) };
    const policies = new SlaPoliciesService(prisma as any, {} as any);
    const schedule = { scheduleStep: jest.fn().mockResolvedValue(undefined) };
    const processor = new SlaMonitorProcessor(prisma as any, realtime as any, notifications as any, policies, schedule as any);
    return { processor, prisma, realtime, notifications, schedule };
  }

  it('escalates a dispatch missed even though acknowledgement was on time', async () => {
    // The old chain only checked dispatch after a late acknowledgement.
    const { processor, prisma, notifications } = build();
    await processor.check({ incidentId: 'inc-1', escalationType: 'DISPATCH' }, 'j', after(121));

    expect(prisma.escalation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        incident_id: 'inc-1',
        sla_policy_id: 'crit',
        escalation_level: 'LEVEL_2_INCIDENT_COMMANDER',
        sla_breach_at: after(120),
        triggered_reason: expect.stringMatching(/^SLA breach: DISPATCH — incident INC-2026-000001 not dispatched within 2 min \(CRITICAL target\)/),
      }),
    });
    expect(notifications.add).toHaveBeenCalledWith('sla-escalation', expect.objectContaining({ userId: 'sup-1' }));
  });

  it('does nothing once the step is reached or the incident has ended', async () => {
    const reached = build({ status: 'DISPATCHED', dispatched_at: after(100) });
    await reached.processor.check({ incidentId: 'inc-1', escalationType: 'DISPATCH' }, 'j', after(121));
    expect(reached.prisma.escalation.create).not.toHaveBeenCalled();

    const ended = build({ status: 'CANCELLED' });
    await ended.processor.check({ incidentId: 'inc-1', escalationType: 'DISPATCH' }, 'j', after(121));
    expect(ended.prisma.escalation.create).not.toHaveBeenCalled();
  });

  it('re-queues instead of escalating when the target got longer (priority lowered)', async () => {
    const { processor, prisma, schedule } = build({ priority: 'LOW' });
    await processor.check({ incidentId: 'inc-1', escalationType: 'DISPATCH' }, 'j', after(121));
    expect(prisma.escalation.create).not.toHaveBeenCalled();
    expect(schedule.scheduleStep).toHaveBeenCalledWith('inc-1', DISPATCH, after(1200), after(121));
  });

  it('escalates a step only once per incident', async () => {
    const { processor, prisma } = build({}, { id: 'esc-0' });
    await processor.check({ incidentId: 'inc-1', escalationType: 'DISPATCH' }, 'j', after(500));
    expect(prisma.escalation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { incident_id: 'inc-1', triggered_reason: { startsWith: slaBreachReasonPrefix('DISPATCH') } },
    }));
    expect(prisma.escalation.create).not.toHaveBeenCalled();
  });

  it('keeps the escalation when the socket emit fails', async () => {
    const { processor, prisma, realtime } = build();
    realtime.notifyEscalation.mockImplementation(() => { throw new Error('ws down'); });
    await expect(processor.check({ incidentId: 'inc-1', escalationType: 'DISPATCH' }, 'j', after(121))).resolves.toBeUndefined();
    expect(prisma.escalation.create).toHaveBeenCalledTimes(1);
  });
});

describe('SlaPoliciesService.update', () => {
  const actor = { id: 'sup-1', role: 'SUPERVISOR', ipAddress: '10.0.0.5' };
  function build() {
    const before = SEEDED[0]!;
    const tx = {
      sla_policies: {
        findUnique: jest.fn().mockResolvedValue(before),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...before, ...data })),
      },
    };
    const prisma = { $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)) };
    const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined) };
    return { service: new SlaPoliciesService(prisma as any, audit as any), tx, audit };
  }

  it('saves the new targets and audits old and new values in the same transaction', async () => {
    const { service, tx, audit } = build();
    const view = await service.update('crit', { acknowledgeSecs: 90, dispatchSecs: 180, onSceneSecs: 600 }, actor);

    expect(view).toMatchObject({ id: 'crit', priority: 'CRITICAL', acknowledgeSecs: 90, dispatchSecs: 180, onSceneSecs: 600 });
    expect(audit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: 'UPDATE',
      entityType: 'sla_policy',
      entityId: 'crit',
      moduleId: 'MOD-41',
      actorId: 'sup-1',
      oldValues: expect.objectContaining({ acknowledgeSecs: 60, dispatchSecs: 120, onSceneSecs: 600 }),
      newValues: { acknowledgeSecs: 90, dispatchSecs: 180, onSceneSecs: 600 },
    }));
  });

  it('is not saved when the audit row cannot be written', async () => {
    const { service, audit } = build();
    audit.logInTransaction.mockRejectedValue(new Error('db down'));
    await expect(service.update('crit', { acknowledgeSecs: 90, dispatchSecs: 180, onSceneSecs: 600 }, actor)).rejects.toThrow('db down');
  });

  it('refuses targets out of order, and an unknown policy', async () => {
    expect(() => assertValidTargets({ acknowledgeSecs: 300, dispatchSecs: 120, onSceneSecs: 600 })).toThrow(BadRequestException);
    const { service, tx } = build();
    tx.sla_policies.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { acknowledgeSecs: 60, dispatchSecs: 120, onSceneSecs: 600 }, actor))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('validates the body: whole seconds, 30 s to 24 h', async () => {
    const errors = async (body: object) => (await validate(plainToInstance(UpdateSlaPolicyDto, body))).map((e) => e.property);
    expect(await errors({ acknowledgeSecs: 60, dispatchSecs: 120, onSceneSecs: 600 })).toEqual([]);
    expect(await errors({ acknowledgeSecs: 10, dispatchSecs: 120.5, onSceneSecs: 100_000 })).toEqual([
      'acknowledgeSecs', 'dispatchSecs', 'onSceneSecs',
    ]);
  });
});

describe('/sla-policies access', () => {
  it('lets Dispatchers read the targets, but only Supervisors and System Administrators change them', () => {
    const read = Reflect.getMetadata(ROLES_KEY, SlaPoliciesController.prototype.list);
    const write = Reflect.getMetadata(ROLES_KEY, SlaPoliciesController.prototype.update);
    expect([...read].sort()).toEqual([UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR].sort());
    expect([...write].sort()).toEqual([UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR].sort());
  });
});

describe('AnalyticsService.getSlaCompliance (overdue counts as missed)', () => {
  it('adds incidents still waiting past the target to the base, and says null when nothing counts', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{
        total: 10,
        acknowledge_reached: 8, acknowledge_met: 6, acknowledge_overdue: 2,
        dispatch_reached: 5, dispatch_met: 5, dispatch_overdue: 0,
        on_scene_reached: 0, on_scene_met: 0, on_scene_overdue: 0,
      }]),
    };
    const sla = await new AnalyticsService(prisma as any).getSlaCompliance(
      { from: new Date('2026-11-01Z'), to: new Date('2026-11-14Z') },
      new Date('2026-11-14Z'),
    );
    expect(sla).toMatchObject({
      acknowledgeSlaMet: 6, acknowledgeMeasured: 10, acknowledgeOverdue: 2, acknowledgeCompliancePct: 60,
      dispatchMeasured: 5, dispatchCompliancePct: 100,
      onSceneMeasured: 0, onSceneCompliancePct: null,
    });
    // Waiting lists come from sla-rules, so the alarm and the report agree.
    const values = prisma.$queryRaw.mock.calls[0].slice(1);
    expect(values).toContainEqual(['DRAFT', 'SUBMITTED', 'RECEIVED']);
  });
});

describe('DispatchService.submitTriage reschedules the SLA checks', () => {
  it('queues checks at the new priority targets when the priority changes', async () => {
    const prisma = {
      incident: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'inc-1', status: 'ACKNOWLEDGED', priority: 'MEDIUM', category: 'FIRE',
          public_reference: 'INC-2026-000001', submitted_at: SUBMITTED,
        }),
        update: jest.fn().mockResolvedValue({ id: 'inc-1', priority: 'CRITICAL' }),
      },
      incidentEvent: { create: jest.fn() },
    };
    const slaSchedule = { scheduleForIncident: jest.fn().mockResolvedValue(undefined) };
    const service = new DispatchService(
      prisma as any, { log: jest.fn().mockResolvedValue(undefined) } as any, { incidentUpdated: jest.fn() } as any,
      {} as any, undefined, slaSchedule as any,
    );
    await service.submitTriage({ incidentId: 'inc-1', priorityAssessment: 'CRITICAL' as any }, 'd-1');
    expect(slaSchedule.scheduleForIncident).toHaveBeenCalledWith({
      id: 'inc-1', public_reference: 'INC-2026-000001', category: 'FIRE', priority: 'CRITICAL', submitted_at: SUBMITTED,
    });
  });
});
