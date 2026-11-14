import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DispatchService } from '../../src/dispatch/dispatch.service';
import { ASSIGNMENT_PUSH_JOB } from '../../src/dispatch/assignment-push';
import { CancelDispatchDto, ReassignDispatchDto } from '../../src/dispatch/dto/dispatch-actions.dto';
import { RespondersService } from '../../src/responders/responders.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';

/**
 * MOD-31 — the dispatcher recalls (cancel) or replaces (reassign) a unit that has
 * not reached the scene. Both are locked, reasoned, audited and never leave the
 * incident claiming "help is on the way" with no unit coming.
 */

const NEW_UNIT = 'res-new';

function build(opts: {
  incidentStatus?: string;
  dispatchStatus?: string;
  onSceneAt?: Date | null;
  otherActiveUnits?: number;
  unitStillOnIncident?: boolean;
  newUnitStatus?: string;
} = {}) {
  const incidentStatus = opts.incidentStatus ?? 'DISPATCHED';
  const old = {
    id: 'disp-1', incident_id: 'inc-1', resource_id: 'res-old', status: opts.dispatchStatus ?? 'ACCEPTED',
    dispatch_notes: 'Use the back gate', created_at: new Date('2026-11-13T01:00:00Z'),
    dispatch_crew: [{ dispatch_id: 'disp-1', user_id: 'resp-old' }],
    incidents: { id: 'inc-1', category: 'MEDICAL', public_reference: 'INC-2026-000777' },
    resources: { id: 'res-old', call_sign: 'AMB-1', name: 'Ambulance 1' },
  };
  const created = {
    id: 'disp-2', incident_id: 'inc-1', resource_id: NEW_UNIT, status: 'PENDING',
    created_at: new Date('2026-11-13T01:05:00Z'), dispatch_notes: old.dispatch_notes,
  };
  const tx = {
    $queryRaw: jest.fn(async (sql: TemplateStringsArray | { sql?: string }) => {
      const text = Array.isArray(sql) ? sql.join('') : String((sql as { sql?: string }).sql ?? '');
      if (text.includes('FROM incidents')) return [{ status: incidentStatus }];
      if (text.includes('FROM dispatches')) return [{ status: old.status, on_scene_at: opts.onSceneAt ?? null }];
      if (text.includes('FROM resources')) return [{ status: opts.newUnitStatus ?? 'AVAILABLE' }];
      return [{ user_id: 'resp-new', status: 'AVAILABLE' }];
    }),
    dispatches: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...old, ...data })),
      create: jest.fn().mockResolvedValue(created),
      count: jest.fn().mockResolvedValue(opts.otherActiveUnits ?? 0),
    },
    dispatch_crew: { createMany: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    resources: {
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: opts.unitStillOnIncident === false ? 0 : 1 }),
    },
    incident: { update: jest.fn() },
    incidentEvent: { create: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    dispatches: { findUnique: jest.fn().mockResolvedValue(old) },
    incident: { findUnique: jest.fn().mockResolvedValue({ ...old.incidents, status: incidentStatus, incident_reporters: null }) },
    resources: {
      findUnique: jest.fn().mockResolvedValue({
        id: NEW_UNIT, call_sign: 'AMB-2', name: 'Ambulance 2', status: 'AVAILABLE', organization_id: 'org-1', resource_type: 'AMBULANCE',
      }),
    },
    dispatch_crew: { findMany: jest.fn().mockResolvedValue([{ user_id: 'resp-new' }]) },
  };
  const realtime: any = {
    incidentAssigned: jest.fn(), notifyIncidentStatusChanged: jest.fn(), notifyDispatchCreated: jest.fn(),
    notifyDispatchCancelled: jest.fn(), resourceStatusChanged: jest.fn(),
  };
  const audit: any = { log: jest.fn() };
  const queue: any = { add: jest.fn().mockResolvedValue({}) };
  const service = new DispatchService(prisma, audit, realtime, queue);
  const pushes = () => queue.add.mock.calls.filter((c: any[]) => c[0] === ASSIGNMENT_PUSH_JOB).map((c: any[]) => c[1]);
  return { service, tx, prisma, realtime, audit, pushes };
}

describe('DispatchService.cancel (recall a unit)', () => {
  it('frees the only unit and sends the incident back to DISPATCH_PENDING', async () => {
    const b = build();

    const result = await b.service.cancel('disp-1', 'dispatcher-1', { reason: 'UNIT_BREAKDOWN', notes: 'Flat tire' });

    expect(result).toMatchObject({ status: 'CANCELLED', incidentStatus: 'DISPATCH_PENDING' });
    expect(b.tx.resources.updateMany).toHaveBeenCalledWith({
      where: { id: 'res-old', current_incident_id: 'inc-1' },
      data: { status: 'AVAILABLE', current_incident_id: null },
    });
    expect(b.tx.incident.update).toHaveBeenCalledWith({ where: { id: 'inc-1' }, data: { status: 'DISPATCH_PENDING' } });
    expect(b.tx.incidentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from_status: 'DISPATCHED', to_status: 'DISPATCH_PENDING', triggered_by_id: 'dispatcher-1',
        notes: "Unit AMB-1 recalled: Vehicle broke down or can't go — Flat tire",
      }),
    });
    expect(b.realtime.notifyIncidentStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ incidentId: 'inc-1', previousStatus: 'DISPATCHED', newStatus: 'DISPATCH_PENDING' }),
    );
    expect(b.realtime.resourceStatusChanged).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'res-old', newStatus: 'AVAILABLE' }));
    expect(b.pushes()).toEqual([expect.objectContaining({ userId: 'resp-old', data: expect.objectContaining({ type: 'ASSIGNMENT_CANCELLED' }) })]);
    expect(b.audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE', entityId: 'disp-1', oldValues: { status: 'ACCEPTED' },
      newValues: { status: 'CANCELLED', reason: 'UNIT_BREAKDOWN', notes: 'Flat tire', incidentStatus: 'DISPATCH_PENDING' },
    }));
  });

  it('keeps the incident status while another unit is still responding', async () => {
    const b = build({ incidentStatus: 'EN_ROUTE', otherActiveUnits: 1 });
    const result = await b.service.cancel('disp-1', 'dispatcher-1', { reason: 'NOT_NEEDED' });
    expect(result).toMatchObject({ incidentStatus: 'EN_ROUTE' });
    expect(b.tx.incident.update).not.toHaveBeenCalled();
    expect(b.realtime.notifyIncidentStatusChanged).not.toHaveBeenCalled();
  });

  it('keeps an ON_SCENE incident as it is when a second unit is recalled', async () => {
    const b = build({ incidentStatus: 'ON_SCENE', dispatchStatus: 'PENDING' });
    await b.service.cancel('disp-1', 'dispatcher-1', { reason: 'NOT_NEEDED' });
    expect(b.tx.dispatches.count).not.toHaveBeenCalled();
    expect(b.tx.incident.update).not.toHaveBeenCalled();
  });

  it('does not free a unit that has already moved to another incident', async () => {
    const b = build({ unitStillOnIncident: false });
    await b.service.cancel('disp-1', 'dispatcher-1', { reason: 'WRONG_UNIT' });
    expect(b.realtime.resourceStatusChanged).not.toHaveBeenCalled();
  });

  it('refuses a unit that is already on scene, and changes nothing', async () => {
    const b = build({ onSceneAt: new Date() });
    await expect(b.service.cancel('disp-1', 'dispatcher-1', { reason: 'WRONG_UNIT' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'UNIT_ON_SCENE' }) });
    expect(b.tx.dispatches.update).not.toHaveBeenCalled();
    expect(b.pushes()).toHaveLength(0);
  });

  it.each(['CANCELLED', 'REJECTED', 'COMPLETED'])('refuses a %s dispatch', async (status) => {
    const b = build({ dispatchStatus: status });
    await expect(b.service.cancel('disp-1', 'dispatcher-1', { reason: 'WRONG_UNIT' })).rejects.toBeInstanceOf(ConflictException);
    expect(b.tx.dispatches.update).not.toHaveBeenCalled();
  });
});

describe('DispatchService.reassign (replace a unit)', () => {
  const dto = { resourceId: NEW_UNIT, reason: 'CLOSER_UNIT' as const, crewIds: ['resp-new'] };

  it('cancels the old dispatch and creates the new one with its crew, in one transaction', async () => {
    const b = build();

    await expect(b.service.reassign('disp-1', dto, 'dispatcher-1')).resolves.toMatchObject({ id: 'disp-2' });

    expect(b.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(b.tx.dispatches.update).toHaveBeenCalledWith({ where: { id: 'disp-1' }, data: { status: 'CANCELLED' } });
    expect(b.tx.dispatches.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ incident_id: 'inc-1', resource_id: NEW_UNIT, dispatch_notes: 'Use the back gate' }),
    });
    expect(b.tx.dispatch_crew.createMany).toHaveBeenCalledWith({ data: [{ dispatch_id: 'disp-2', user_id: 'resp-new' }], skipDuplicates: true });
    expect(b.tx.resources.update).toHaveBeenCalledWith({ where: { id: NEW_UNIT }, data: { status: 'DISPATCHED', current_incident_id: 'inc-1' } });
    // The replacement keeps the incident DISPATCHED; it never drops to DISPATCH_PENDING in between.
    expect(b.tx.incident.update).not.toHaveBeenCalled();
    expect(b.tx.incidentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ notes: 'Unit AMB-1 replaced by AMB-2: A closer unit is available' }),
    });

    const types = b.pushes().map((p: any) => `${p.data.type}:${p.userId}`);
    expect(types).toEqual(expect.arrayContaining(['ASSIGNMENT_CANCELLED:resp-old', 'ASSIGNMENT:resp-new']));
    expect(b.audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DISPATCH', entityId: 'disp-2', newValues: expect.objectContaining({ replacesDispatchId: 'disp-1' }),
    }));
  });

  it('steps an EN_ROUTE incident back to DISPATCHED when the replaced unit was the only one on the road', async () => {
    const b = build({ incidentStatus: 'EN_ROUTE' });
    await b.service.reassign('disp-1', dto, 'dispatcher-1');
    expect(b.tx.incident.update).toHaveBeenCalledWith({ where: { id: 'inc-1' }, data: { status: 'DISPATCHED' } });
    expect(b.realtime.notifyIncidentStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ previousStatus: 'EN_ROUTE', newStatus: 'DISPATCHED' }),
    );
  });

  it('keeps the original unit when the replacement was just taken', async () => {
    const b = build({ newUnitStatus: 'DISPATCHED' });
    await expect(b.service.reassign('disp-1', dto, 'dispatcher-1'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'RESOURCE_NOT_AVAILABLE' }) });
    expect(b.tx.dispatches.update).not.toHaveBeenCalled();
    expect(b.tx.dispatches.create).not.toHaveBeenCalled();
  });

  it('refuses the same unit', async () => {
    const b = build();
    await expect(b.service.reassign('disp-1', { ...dto, resourceId: 'res-old' }, 'dispatcher-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a unit already on scene', async () => {
    const b = build({ onSceneAt: new Date() });
    await expect(b.service.reassign('disp-1', dto, 'dispatcher-1'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'UNIT_ON_SCENE' }) });
  });

  it('refuses a replacement on an incident that is no longer being responded to', async () => {
    const b = build({ incidentStatus: 'RESOLVED', dispatchStatus: 'PENDING' });
    await expect(b.service.reassign('disp-1', dto, 'dispatcher-1'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'INCIDENT_STATUS_CHANGED' }) });
    expect(b.tx.dispatches.create).not.toHaveBeenCalled();
  });
});

describe('Dispatch change DTOs', () => {
  it('requires a known reason', async () => {
    expect(await validate(plainToInstance(CancelDispatchDto, { reason: 'BORED' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(CancelDispatchDto, { reason: 'WRONG_UNIT' }))).toHaveLength(0);
  });

  it('requires a note for "Other"', async () => {
    expect(await validate(plainToInstance(CancelDispatchDto, { reason: 'OTHER' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(CancelDispatchDto, { reason: 'OTHER', notes: 'Road closed by flood' }))).toHaveLength(0);
  });

  it('checks the replacement unit and crew ids', async () => {
    const ok = { reason: 'CLOSER_UNIT', resourceId: '00000000-0000-0000-0002-000000000006', crewIds: ['00000000-0000-0000-0001-000000000004'] };
    expect(await validate(plainToInstance(ReassignDispatchDto, ok))).toHaveLength(0);
    expect(await validate(plainToInstance(ReassignDispatchDto, { ...ok, crewIds: ['nope'] }))).not.toHaveLength(0);
  });
});

describe('Crew answers on a recalled assignment', () => {
  function responders(dispatchStatus: string) {
    const row = { id: 'disp-1', incident_id: 'inc-1', resource_id: 'res-old', status: dispatchStatus, resources: { call_sign: 'AMB-1' } };
    const tx = {
      $queryRaw: jest.fn(async (sql: TemplateStringsArray) => {
        const text = sql.join('');
        if (text.includes('responder_availability')) return [{ user_id: 'resp-1', status: 'AVAILABLE' }];
        if (text.includes('FROM incidents')) return [{ status: 'DISPATCHED' }];
        if (text.includes('FROM dispatches')) return [{ status: dispatchStatus, on_scene_at: null }];
        return [];
      }),
      dispatches: {
        findUnique: jest.fn().mockResolvedValue({ ...row, dispatch_crew: [{ user_id: 'resp-1' }] }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data })),
        count: jest.fn().mockResolvedValue(0),
      },
      resources: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      incident: { update: jest.fn() },
      incidentEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      dispatches: { findUnique: jest.fn().mockResolvedValue({ ...row, dispatch_crew: [{ user_id: 'resp-1' }] }) },
    };
    const realtime = { dispatchUpdated: jest.fn(), notifyIncidentStatusChanged: jest.fn(), resourceStatusChanged: jest.fn() };
    const audit = { log: jest.fn() };
    const service = new RespondersService(prisma as any, realtime as any, audit as any, new IncidentStatusService(), {} as any, {} as any);
    return { service, tx, realtime, audit };
  }

  it('refuses to accept a cancelled assignment', async () => {
    const r = responders('CANCELLED');
    await expect(r.service.acceptAssignment('disp-1', 'resp-1'))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'ASSIGNMENT_CLOSED' }) });
    expect(r.tx.dispatches.update).not.toHaveBeenCalled();
  });

  it('treats a second accept as a no-op', async () => {
    const r = responders('ACCEPTED');
    await expect(r.service.acceptAssignment('disp-1', 'resp-1')).resolves.toMatchObject({ status: 'ACCEPTED' });
    expect(r.tx.dispatches.update).not.toHaveBeenCalled();
    expect(r.audit.log).not.toHaveBeenCalled();
  });

  it('refuses to decline a cancelled assignment', async () => {
    const r = responders('CANCELLED');
    await expect(r.service.declineAssignment('disp-1', 'resp-1', 'Busy')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a decline frees the unit and returns a unit-less incident to the dispatch queue', async () => {
    const r = responders('PENDING');
    await r.service.declineAssignment('disp-1', 'resp-1', 'Vehicle down');
    expect(r.tx.resources.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'res-old', current_incident_id: 'inc-1' } }));
    expect(r.tx.incident.update).toHaveBeenCalledWith({ where: { id: 'inc-1' }, data: { status: 'DISPATCH_PENDING' } });
    expect(r.realtime.notifyIncidentStatusChanged).toHaveBeenCalledWith(expect.objectContaining({ newStatus: 'DISPATCH_PENDING' }));
    expect(r.realtime.resourceStatusChanged).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 'res-old', newStatus: 'AVAILABLE' }));
  });
});
