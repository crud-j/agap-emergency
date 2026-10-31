import { Prisma } from '@prisma/client';
import { DispatchService } from '../../src/dispatch/dispatch.service';
import { addAgencyParticipant } from '../../src/incidents/agency-participants';

/**
 * Unit field flow plan, Phase 3, decision D5 (MOD-34): dispatching a unit adds its
 * organization to the incident's agencies, with the unit type as its role. Idempotent,
 * audited, and a failure there never breaks the dispatch.
 */

const BFP = 'org-bfp';

function build(opts: { existing?: boolean; createFails?: boolean } = {}) {
  const dispatchRow = {
    id: 'disp-1', incident_id: 'inc-1', resource_id: 'res-fire', status: 'PENDING',
    created_at: new Date('2026-10-31T01:00:00Z'), dispatch_notes: null,
  };
  const tx = {
    dispatches: { create: jest.fn().mockResolvedValue(dispatchRow) },
    $queryRaw: jest.fn(),
    dispatch_crew: { createMany: jest.fn() },
    resources: { update: jest.fn() },
    incident: { update: jest.fn() },
    incidentEvent: { create: jest.fn() },
  };
  const participants: any[] = opts.existing ? [{ id: 'part-old', incident_id: 'inc-1', organization_id: BFP }] : [];
  const prisma: any = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    incident: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'inc-1', status: 'ASSESSED', category: 'FIRE', public_reference: 'INC-2026-000123', incident_reporters: null,
      }),
    },
    resources: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'res-fire', status: 'AVAILABLE', organization_id: BFP, resource_type: 'FIRE_TRUCK',
      }),
    },
    dispatch_crew: { findMany: jest.fn().mockResolvedValue([]) },
    incident_agency_participants: {
      findUnique: jest.fn(async ({ where }: any) =>
        participants.find((p) => p.incident_id === where.incident_id_organization_id.incident_id
          && p.organization_id === where.incident_id_organization_id.organization_id) ?? null),
      findUniqueOrThrow: jest.fn(async () => participants[0]),
      create: opts.createFails
        ? jest.fn().mockRejectedValue(new Error('db down'))
        : jest.fn(async ({ data }: any) => {
            const created = { id: `part-${participants.length + 1}`, ...data };
            participants.push(created);
            return created;
          }),
    },
  };
  const realtime: any = {
    incidentAssigned: jest.fn(),
    notifyIncidentStatusChanged: jest.fn(),
    notifyDispatchCreated: jest.fn(),
    resourceStatusChanged: jest.fn(),
    incidentUpdated: jest.fn(),
  };
  const audit: any = { log: jest.fn() };
  const queue: any = { add: jest.fn().mockResolvedValue({}) };
  const service = new DispatchService(prisma, audit, realtime, queue);
  const agencyAudits = () => audit.log.mock.calls.filter(([e]: any[]) => e.entityType === 'incident_agency_participant');
  return { service, prisma, realtime, audit, agencyAudits, participants };
}

const dto = { incidentId: 'inc-1', resourceId: 'res-fire' };

describe('DispatchService.create adds the unit organization to the incident (D5)', () => {
  it('adds BFP with role_in_incident = FIRE_TRUCK, invited by the dispatcher, audited and announced', async () => {
    const { service, prisma, realtime, agencyAudits } = build();
    await service.create(dto as any, 'dispatcher-1');

    expect(prisma.incident_agency_participants.create).toHaveBeenCalledWith({
      data: { incident_id: 'inc-1', organization_id: BFP, invited_by_id: 'dispatcher-1', role_in_incident: 'FIRE_TRUCK' },
    });
    expect(agencyAudits()).toHaveLength(1);
    expect(agencyAudits()[0][0]).toMatchObject({
      action: 'CREATE', actorId: 'dispatcher-1', moduleId: 'MOD-34', incidentId: 'inc-1',
      newValues: { organization_id: BFP, role_in_incident: 'FIRE_TRUCK' },
    });
    expect(realtime.incidentUpdated).toHaveBeenCalledWith('inc-1', { agencyAdded: BFP });
  });

  it('is idempotent: an organization already on the incident is not added or audited again', async () => {
    const { service, prisma, realtime, agencyAudits } = build({ existing: true });
    await service.create(dto as any, 'dispatcher-1');
    expect(prisma.incident_agency_participants.create).not.toHaveBeenCalled();
    expect(agencyAudits()).toHaveLength(0);
    expect(realtime.incidentUpdated).not.toHaveBeenCalled();
  });

  it('a second unit of the same organization adds it once', async () => {
    const { service, prisma, participants } = build();
    await service.create(dto as any, 'dispatcher-1');
    await service.create(dto as any, 'dispatcher-1');
    expect(prisma.incident_agency_participants.create).toHaveBeenCalledTimes(1);
    expect(participants).toHaveLength(1);
  });

  it('a failure while adding the agency never fails the dispatch', async () => {
    const { service, prisma } = build({ createFails: true });
    await expect(service.create(dto as any, 'dispatcher-1')).resolves.toMatchObject({ id: 'disp-1' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('addAgencyParticipant (one copy of the MOD-34 add logic)', () => {
  it('when two adds race, the loser returns the row that won: no throw, no second audit', async () => {
    const { prisma, audit, realtime } = build();
    const winner = { id: 'part-w', incident_id: 'inc-1', organization_id: BFP };
    prisma.incident_agency_participants.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    prisma.incident_agency_participants.findUniqueOrThrow.mockResolvedValueOnce(winner);

    const result = await addAgencyParticipant(
      { prisma, audit, realtime },
      { incidentId: 'inc-1', organizationId: BFP, actorId: 'dispatcher-1', roleInIncident: 'FIRE_TRUCK' },
    );
    expect(result).toEqual({ participant: winner, added: false });
    expect(audit.log).not.toHaveBeenCalled();
  });
});
