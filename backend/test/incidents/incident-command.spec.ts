import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { IncidentCommandService } from '../../src/incidents/incident-command/incident-command.service';

/**
 * MOD-36 Incident Command: nothing is deleted, one commander at a time, people are
 * told when they get or lose a job, and a finished incident freezes its command.
 */

const INC = 'inc-1';
const ICS = { id: 'ics-1', incident_id: INC, activated_at: new Date(), deactivated_at: null, objectives: ['Contain fire'], situation_notes: 'Two units on scene' };

function setup(opts: {
  ics?: Record<string, unknown> | null;
  incidentStatus?: string;
  user?: { role: string; status: string } | null;
  commander?: Record<string, unknown> | null;
} = {}) {
  const ics = opts.ics === undefined ? ICS : opts.ics;
  const prisma: any = {
    incident: { findUnique: jest.fn().mockResolvedValue({ status: opts.incidentStatus ?? 'ON_SCENE' }) },
    user: { findUnique: jest.fn().mockResolvedValue(opts.user === undefined ? { role: 'RESPONDER', status: 'ACTIVE' } : opts.user) },
    incident_command_structures: {
      findUnique: jest.fn(async (args: { include?: { incidents?: unknown } }) => {
        if (!ics) return null;
        return args?.include?.incidents
          ? { ...ics, incidents: { status: opts.incidentStatus ?? 'ON_SCENE' } }
          : { ...ics, ics_assignments: [] };
      }),
      create: jest.fn(async ({ data }: any) => ({ id: 'ics-new', ...data })),
      update: jest.fn(async ({ data }: any) => ({ ...ics, ...data })),
    },
    ics_assignments: {
      findFirst: jest.fn().mockResolvedValue(opts.commander ?? null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(async ({ data }: any) => ({ id: `asg-${data.position}`, ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const realtime = { incidentUpdated: jest.fn() };
  const notifier = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new IncidentCommandService(prisma, audit as any, realtime as any, notifier as any);
  return { service, prisma, audit, realtime, notifier };
}

describe('IncidentCommandService — start', () => {
  it('starts command and names the commander in one transaction, and tells them', async () => {
    const { service, prisma, notifier } = setup({ ics: null });
    // After creation, get() reads the new structure.
    prisma.incident_command_structures.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...ICS, ics_assignments: [] });

    await service.start(INC, { objectives: ['  Get everyone out  ', ''], commanderUserId: 'resp-1' }, 'sup-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.incident_command_structures.create.mock.calls[0][0].data.objectives).toEqual(['Get everyone out']);
    expect(prisma.ics_assignments.create.mock.calls[0][0].data).toMatchObject({ user_id: 'resp-1', position: 'INCIDENT_COMMANDER' });
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'ASSIGNED', userId: 'resp-1', incidentId: INC }));
  });

  it('does not notify a supervisor who names themselves', async () => {
    const { service, prisma, notifier } = setup({ ics: null });
    prisma.incident_command_structures.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...ICS, ics_assignments: [] });
    await service.start(INC, { commanderUserId: 'sup-1' }, 'sup-1');
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('refuses a second start while command is running', async () => {
    const { service } = setup();
    await expect(service.start(INC, {}, 'sup-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('restarts an ended command with a fresh plan instead of creating a second one', async () => {
    const { service, prisma } = setup({ ics: { ...ICS, deactivated_at: new Date() } });
    await service.start(INC, { objectives: ['New goal'] }, 'sup-1');
    expect(prisma.incident_command_structures.create).not.toHaveBeenCalled();
    expect(prisma.incident_command_structures.update.mock.calls[0][0].data).toMatchObject({
      deactivated_at: null, objectives: ['New goal'], situation_notes: null,
    });
  });

  it('refuses to start command on a closed incident', async () => {
    const { service } = setup({ ics: null, incidentStatus: 'CLOSED' });
    await expect(service.start(INC, {}, 'sup-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a commander who cannot hold a command job', async () => {
    const { service } = setup({ ics: null, user: { role: 'CITIZEN', status: 'ACTIVE' } });
    await expect(service.start(INC, { commanderUserId: 'cit-1' }, 'sup-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('IncidentCommandService — jobs', () => {
  it('refuses a second Incident Commander through the plain assign call', async () => {
    const { service, prisma } = setup({ commander: { id: 'asg-ic', user_id: 'sup-2', users: { full_name: 'Ana Cruz' } } });
    await expect(service.assign(INC, { userId: 'resp-1', position: 'INCIDENT_COMMANDER' }, 'sup-1'))
      .rejects.toThrow(/Ana Cruz is already the Incident Commander/);
    expect(prisma.ics_assignments.create).not.toHaveBeenCalled();
  });

  it('turns the one-commander database rule into a clear 409', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002', clientVersion: 'test', meta: { target: 'uq_ics_assignments_one_commander' },
      }),
    );
    await expect(service.assign(INC, { userId: 'resp-1', position: 'SAFETY_OFFICER' }, 'sup-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('hands command over: relieves the current commander and names the new one in one transaction', async () => {
    const { service, prisma, notifier } = setup();
    prisma.ics_assignments.findFirst.mockResolvedValueOnce({ id: 'asg-old', user_id: 'sup-2', position: 'INCIDENT_COMMANDER' });

    await service.setCommander(INC, { userId: 'resp-1' }, 'sup-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.ics_assignments.update).toHaveBeenCalledWith({
      where: { id: 'asg-old' }, data: { relieved_at: expect.any(Date) },
    });
    expect(prisma.ics_assignments.create.mock.calls[0][0].data).toMatchObject({ user_id: 'resp-1', position: 'INCIDENT_COMMANDER' });
    const kinds = notifier.notify.mock.calls.map((c: any[]) => `${c[0].kind}:${c[0].userId}`);
    expect(kinds).toEqual(['RELIEVED:sup-2', 'ASSIGNED:resp-1']);
  });

  it('relieving someone keeps the record (stamps relieved_at) and tells them', async () => {
    const { service, prisma, notifier } = setup();
    prisma.ics_assignments.findUnique.mockResolvedValue({
      id: 'asg-1', user_id: 'resp-1', position: 'SAFETY_OFFICER', relieved_at: null,
      incident_command_structures: { incident_id: INC, deactivated_at: null },
    });

    await service.relieve(INC, 'asg-1', 'sup-1');

    expect(prisma.ics_assignments.update).toHaveBeenCalledWith({ where: { id: 'asg-1' }, data: { relieved_at: expect.any(Date) } });
    expect(prisma.ics_assignments.delete).toBeUndefined();
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'RELIEVED', userId: 'resp-1' }));
  });

  it('will not relieve a job that belongs to another incident', async () => {
    const { service, prisma } = setup();
    prisma.ics_assignments.findUnique.mockResolvedValue({
      id: 'asg-1', user_id: 'resp-1', position: 'SAFETY_OFFICER', relieved_at: null,
      incident_command_structures: { incident_id: 'other-incident', deactivated_at: null },
    });
    await expect(service.relieve(INC, 'asg-1', 'sup-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('freezes jobs and the plan once the incident is resolved or closed', async () => {
    const { service } = setup({ incidentStatus: 'RESOLVED' });
    await expect(service.assign(INC, { userId: 'resp-1', position: 'SAFETY_OFFICER' }, 'sup-1'))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(service.updatePlan(INC, { situationNotes: 'late note' }, 'sup-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('IncidentCommandService — plan', () => {
  it('writes the situation update trimmed, audits old and new values', async () => {
    const { service, prisma, audit } = setup();
    await service.updatePlan(INC, { situationNotes: '  Fire contained at Bundukan warehouse.  ' }, 'sup-1');

    const data = prisma.incident_command_structures.update.mock.calls[0][0].data;
    expect(data.situation_notes).toBe('Fire contained at Bundukan warehouse.');
    expect(data).not.toHaveProperty('objectives');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'sup-1', moduleId: 'MOD-36',
      oldValues: expect.objectContaining({ situationNotes: 'Two units on scene' }),
    }));
  });

  it('clears the update with blank text and leaves it alone when omitted', async () => {
    const { service, prisma } = setup();
    await service.updatePlan(INC, { situationNotes: '   ' }, 'sup-1');
    await service.updatePlan(INC, { objectives: ['Contain fire'] }, 'sup-1');
    expect(prisma.incident_command_structures.update.mock.calls[0][0].data.situation_notes).toBeNull();
    expect(prisma.incident_command_structures.update.mock.calls[1][0].data).not.toHaveProperty('situation_notes');
  });

  it('rejects oversized updates and non-text goals', async () => {
    const { service } = setup();
    await expect(service.updatePlan(INC, { situationNotes: 'x'.repeat(4001) }, 'sup-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updatePlan(INC, { objectives: [42 as unknown as string] }, 'sup-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses plan changes after command has ended', async () => {
    const { service } = setup({ ics: { ...ICS, deactivated_at: new Date() } });
    await expect(service.updatePlan(INC, { situationNotes: 'x' }, 'sup-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('IncidentCommandService — end', () => {
  it('stamps deactivated_at, relieves everyone, keeps the plan in the audit trail and tells the team', async () => {
    const { service, prisma, audit, notifier } = setup();
    prisma.ics_assignments.findMany.mockResolvedValue([
      { id: 'asg-ic', user_id: 'sup-1', position: 'INCIDENT_COMMANDER' },
      { id: 'asg-so', user_id: 'resp-1', position: 'SAFETY_OFFICER' },
    ]);

    await service.end(INC, 'sup-1');

    expect(prisma.ics_assignments.updateMany).toHaveBeenCalledWith({
      where: { ics_id: 'ics-1', relieved_at: null }, data: { relieved_at: expect.any(Date) },
    });
    expect(prisma.incident_command_structures.update.mock.calls[0][0].data.deactivated_at).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      oldValues: expect.objectContaining({
        objectives: ['Contain fire'],
        team: [{ position: 'INCIDENT_COMMANDER', userId: 'sup-1' }, { position: 'SAFETY_OFFICER', userId: 'resp-1' }],
      }),
      newValues: expect.objectContaining({ event: 'COMMAND_ENDED' }),
    }));
    // The supervisor who ended it is not notified; the Safety Officer is.
    expect(notifier.notify).toHaveBeenCalledTimes(1);
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: 'COMMAND_ENDED', userId: 'resp-1' }));
  });

  it('can still end command after the incident is resolved', async () => {
    const { service, prisma } = setup({ incidentStatus: 'RESOLVED' });
    await service.end(INC, 'sup-1');
    expect(prisma.incident_command_structures.update).toHaveBeenCalled();
  });

  it('endIfRunning never throws and skips an already-ended command', async () => {
    const { service, prisma } = setup({ ics: { ...ICS, deactivated_at: new Date() } });
    await expect(service.endIfRunning(INC, 'sup-1', 'Incident closed')).resolves.toBeUndefined();
    expect(prisma.incident_command_structures.update).not.toHaveBeenCalled();

    prisma.incident_command_structures.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(service.endIfRunning(INC, 'sup-1', 'Incident closed')).resolves.toBeUndefined();
  });
});
