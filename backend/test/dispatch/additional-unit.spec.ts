import { BadRequestException, ConflictException } from '@nestjs/common';
import { DispatchService } from '../../src/dispatch/dispatch.service';
import { ASSIGNMENT_PUSH_JOB } from '../../src/dispatch/assignment-push';

/**
 * Testing-errors plan Phase 5 (MOD-30/31): a second unit can be dispatched to an
 * incident that is already being responded to. The first unit's behaviour is unchanged.
 */

function build(opts: {
  status: string;
  lockedStatus?: string;
  resourceStatus?: string;
  crew?: string[];
  crewAlreadyOnIncident?: boolean;
}) {
  const crew = opts.crew ?? ['resp-fire'];
  const dispatchRow = {
    id: 'disp-2', incident_id: 'inc-1', resource_id: 'res-fire', status: 'PENDING',
    created_at: new Date('2026-11-02T01:00:00Z'), dispatch_notes: null,
  };
  const tx = {
    $queryRaw: jest.fn(async (sql: TemplateStringsArray | { sql?: string }) =>
      (Array.isArray(sql) ? sql.join('') : String((sql as { sql?: string }).sql ?? '')).includes('FROM incidents')
        ? [{ status: opts.lockedStatus ?? opts.status }]
        : crew.map((user_id) => ({ user_id, status: 'AVAILABLE' }))),
    dispatches: { create: jest.fn().mockResolvedValue(dispatchRow) },
    dispatch_crew: {
      createMany: jest.fn().mockResolvedValue({ count: crew.length }),
      findFirst: jest.fn().mockResolvedValue(opts.crewAlreadyOnIncident ? { user_id: crew[0] } : null),
    },
    resources: { update: jest.fn() },
    incident: { update: jest.fn() },
    incidentEvent: { create: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    incident: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'inc-1', status: opts.status, category: 'FIRE', public_reference: 'INC-2026-000123',
        incident_reporters: { user_id: 'reporter-1' },
      }),
    },
    resources: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'res-fire', name: 'BFP Fire Truck 1', call_sign: 'CHARLIE-1', status: opts.resourceStatus ?? 'AVAILABLE',
        organization_id: null, resource_type: 'FIRE_TRUCK',
      }),
    },
    dispatch_crew: { findMany: jest.fn().mockResolvedValue(crew.map((user_id) => ({ user_id }))) },
  };
  const realtime: any = {
    incidentAssigned: jest.fn(),
    notifyIncidentStatusChanged: jest.fn(),
    notifyDispatchCreated: jest.fn(),
    resourceStatusChanged: jest.fn(),
  };
  const audit: any = { log: jest.fn() };
  const queue: any = { add: jest.fn().mockResolvedValue({}) };
  const notifier: any = { notifyReporter: jest.fn() };
  const service = new DispatchService(prisma, audit, realtime, queue, notifier);
  const dto = { incidentId: 'inc-1', resourceId: 'res-fire', initialCrewIds: crew };
  return { service, prisma, tx, realtime, audit, queue, notifier, dto };
}

describe('DispatchService.create: additional unit (Phase 5)', () => {
  it('a second unit on an ON_SCENE incident keeps ON_SCENE and writes a same-status note', async () => {
    const b = build({ status: 'ON_SCENE' });

    await expect(b.service.create(b.dto as any, 'dispatcher-1')).resolves.toMatchObject({ id: 'disp-2' });

    expect(b.tx.incident.update).not.toHaveBeenCalled(); // no status change, no dispatched_at overwrite
    expect(b.tx.incidentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        incident_id: 'inc-1',
        from_status: 'ON_SCENE',
        to_status: 'ON_SCENE',
        triggered_by_id: 'dispatcher-1',
        notes: 'Additional unit CHARLIE-1 dispatched',
      }),
    });
    expect(b.tx.dispatches.create).toHaveBeenCalled();
    expect(b.tx.resources.update).toHaveBeenCalledWith({
      where: { id: 'res-fire' },
      data: { status: 'DISPATCHED', current_incident_id: 'inc-1' },
    });
  });

  it('emits the assignment and dispatch but no incident status change, and tells no one "help is on the way" again', async () => {
    const b = build({ status: 'ON_SCENE' });
    await b.service.create(b.dto as any, 'dispatcher-1');

    expect(b.realtime.incidentAssigned).toHaveBeenCalled();
    expect(b.realtime.notifyDispatchCreated).toHaveBeenCalledWith('inc-1', expect.objectContaining({ dispatchId: 'disp-2' }));
    expect(b.realtime.notifyIncidentStatusChanged).not.toHaveBeenCalled();
    expect(b.notifier.notifyReporter).not.toHaveBeenCalled();
    expect(b.queue.add).not.toHaveBeenCalledWith('dispatch-contact-notify', expect.anything());
    // The second crew still gets its assignment push.
    expect(b.queue.add.mock.calls.filter((c: any[]) => c[0] === ASSIGNMENT_PUSH_JOB)).toHaveLength(1);
  });

  it('audits DISPATCH under MOD-31 marked as an additional unit', async () => {
    const b = build({ status: 'EN_ROUTE' });
    await b.service.create(b.dto as any, 'dispatcher-1');

    expect(b.audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DISPATCH',
      moduleId: 'MOD-31',
      newValues: expect.objectContaining({ resourceId: 'res-fire', additionalUnit: true }),
    }));
  });

  it.each(['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'ASSISTING', 'TRANSPORTING'])('accepts an additional unit on %s', async (status) => {
    const b = build({ status });
    await b.service.create(b.dto as any, 'dispatcher-1');
    expect(b.tx.incident.update).not.toHaveBeenCalled();
  });

  it('refuses the same unit twice (it is no longer AVAILABLE)', async () => {
    const b = build({ status: 'ON_SCENE', resourceStatus: 'DISPATCHED' });
    await expect(b.service.create(b.dto as any, 'dispatcher-1')).rejects.toThrow(new BadRequestException('Resource is not available'));
    expect(b.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['RESOLVED', 'CLOSED', 'CANCELLED', 'SUBMITTED'])('refuses an incident that is %s', async (status) => {
    const b = build({ status });
    await expect(b.service.create(b.dto as any, 'dispatcher-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(b.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('re-checks the status under the incident lock: a resolve that won the race is refused', async () => {
    const b = build({ status: 'ON_SCENE', lockedStatus: 'RESOLVED' });
    await expect(b.service.create(b.dto as any, 'dispatcher-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INCIDENT_STATUS_CHANGED' }),
    });
    expect(b.tx.dispatches.create).not.toHaveBeenCalled();
  });

  it('decides from the locked status: a first dispatch that lost the race becomes an additional unit', async () => {
    const b = build({ status: 'ASSESSED', lockedStatus: 'DISPATCHED' });
    await b.service.create(b.dto as any, 'dispatcher-1');
    expect(b.tx.incident.update).not.toHaveBeenCalled();
    expect(b.realtime.notifyIncidentStatusChanged).not.toHaveBeenCalled();
  });

  it("refuses a responder already crewed on this incident's active dispatch", async () => {
    const b = build({ status: 'ON_SCENE', crewAlreadyOnIncident: true });
    await expect(b.service.create(b.dto as any, 'dispatcher-1')).rejects.toThrow(
      new ConflictException('RESPONDER_ALREADY_ON_INCIDENT'),
    );
    expect(b.tx.dispatch_crew.findFirst).toHaveBeenCalledWith({
      where: {
        user_id: { in: ['resp-fire'] },
        dispatches: { incident_id: 'inc-1', status: { in: ['PENDING', 'SENT', 'ACCEPTED'] } },
      },
      select: { user_id: true },
    });
    expect(b.tx.dispatch_crew.createMany).not.toHaveBeenCalled();
  });
});

describe('DispatchService.create: first unit unchanged', () => {
  it('moves the incident to DISPATCHED, emits the status change and tells the reporter', async () => {
    const b = build({ status: 'ASSESSED' });
    await b.service.create(b.dto as any, 'dispatcher-1');

    expect(b.tx.incident.update).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
      data: { status: 'DISPATCHED', dispatched_at: expect.any(Date) },
    });
    expect(b.tx.incidentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ from_status: 'ASSESSED', to_status: 'DISPATCHED' }),
    });
    expect(b.tx.dispatch_crew.findFirst).not.toHaveBeenCalled();
    expect(b.realtime.notifyIncidentStatusChanged).toHaveBeenCalledWith(expect.objectContaining({
      previousStatus: 'ASSESSED', newStatus: 'DISPATCHED',
    }));
    expect(b.notifier.notifyReporter).toHaveBeenCalledWith('inc-1', 'DISPATCHED');
    expect(b.queue.add).toHaveBeenCalledWith('dispatch-contact-notify', expect.anything());
    expect(b.audit.log.mock.calls[0][0].newValues).not.toHaveProperty('additionalUnit');
  });
});
