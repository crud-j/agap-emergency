import { ConflictException } from '@nestjs/common';
import { IncidentStatus } from '@agap/shared';
import { RespondersService } from '../../src/responders/responders.service';
import { TransportService } from '../../src/incidents/transport/transport.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';

const INCIDENT = 'incident-1';
const AMBULANCE_DISPATCH = 'dispatch-ambulance';
const FIRE_DISPATCH = 'dispatch-fire';
const AMBULANCE_CREW = 'crew-ambulance';
const FIRE_CREW = 'crew-fire';

function createHarness(incidentStatus: IncidentStatus) {
  const activeDispatches = [
    { id: AMBULANCE_DISPATCH, resource_id: 'resource-ambulance', status: 'ACCEPTED' },
    { id: FIRE_DISPATCH, resource_id: 'resource-fire', status: 'ACCEPTED' },
  ];
  const dispatches = new Map([
    [
      AMBULANCE_DISPATCH,
      {
        id: AMBULANCE_DISPATCH,
        incident_id: INCIDENT,
        resource_id: 'resource-ambulance',
        status: 'ACCEPTED',
        dispatch_crew: [{ user_id: AMBULANCE_CREW }],
        resources: { call_sign: 'AMB-1' },
      },
    ],
    [
      FIRE_DISPATCH,
      {
        id: FIRE_DISPATCH,
        incident_id: INCIDENT,
        resource_id: 'resource-fire',
        status: 'ACCEPTED',
        dispatch_crew: [{ user_id: FIRE_CREW }],
        resources: { call_sign: 'FIRE-1' },
      },
    ],
  ]);
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ status: incidentStatus }]),
    dispatch_crew: {
      findUnique: jest.fn().mockResolvedValue({ dispatch_id: AMBULANCE_DISPATCH, user_id: AMBULANCE_CREW }),
    },
    dispatches: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => dispatches.get(where.id)),
      findMany: jest.fn().mockResolvedValue(activeDispatches),
      update: jest.fn().mockResolvedValue({}),
    },
    transportRecord: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { dispatch_id: string } }) =>
        where.dispatch_id === AMBULANCE_DISPATCH ? { id: 'open-transport' } : null,
      ),
      create: jest.fn().mockResolvedValue({
        id: 'transport-1',
        incident_id: INCIDENT,
        dispatch_id: AMBULANCE_DISPATCH,
        patient_id: null,
        destination_id: null,
        transport_started_at: new Date('2026-10-31T00:00:00Z'),
      }),
    },
    incident: { update: jest.fn().mockResolvedValue({ id: INCIDENT }) },
    incidentEvent: { create: jest.fn().mockResolvedValue({}) },
    resources: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    $transaction: jest.fn((fn: (transaction: typeof tx) => unknown) => fn(tx)),
    incident: {
      findUnique: jest.fn().mockResolvedValue({ status: incidentStatus }),
    },
    dispatches: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => dispatches.get(where.id)),
    },
    dispatch_crew: tx.dispatch_crew,
  };
  const realtime = {
    notifyIncidentStatusChanged: jest.fn(),
    statusChanged: jest.fn(),
    responderStatus: jest.fn(),
    incidentTransporting: jest.fn(),
    transportUpdated: jest.fn(),
    resourceStatusChanged: jest.fn(),
    dispatchUpdated: jest.fn(),
    notifyDispatchCancelled: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const audience = {
    invalidate: jest.fn(),
    roomsForDispatch: jest.fn().mockResolvedValue({ incidentRoom: false, userIds: [] }),
    confirmedReporter: jest.fn().mockResolvedValue(null),
  };
  const notifier = { notifyReporter: jest.fn(), notifyDispatcher: jest.fn() };
  const transport = {
    once: jest.fn((_dispatchId: string, _incidentId: string, _requestId: string | undefined, callback: () => unknown) =>
      callback(),
    ),
  };
  const responders = new RespondersService(
    prisma as any,
    realtime as any,
    audit as any,
    new IncidentStatusService(),
    transport as any,
    audience as any,
    notifier as any,
  );
  return { tx, prisma, responders, realtime, audit, audience };
}

describe('multi-unit responder progress proof (Phase 0)', () => {
  it('does not resolve the incident or complete the ambulance when the fire crew finishes', async () => {
    const { tx, responders } = createHarness(IncidentStatus.ON_SCENE);

    await responders.updateStatus(FIRE_DISPATCH, FIRE_CREW, { status: 'RESOLVED' } as any);

    expect(tx.incident.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: IncidentStatus.RESOLVED }) }),
    );
    expect(tx.dispatches.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: AMBULANCE_DISPATCH } }),
    );
  });

  it('allows the ambulance to begin transport after another unit starts assisting', async () => {
    const { tx, prisma } = createHarness(IncidentStatus.ASSISTING);
    tx.transportRecord.findFirst.mockResolvedValue(null);
    const transport = new TransportService(
      prisma as any,
      { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) } as any,
      { statusChanged: jest.fn(), incidentTransporting: jest.fn() } as any,
      new IncidentStatusService(),
      { requestImmediateRefresh: jest.fn().mockResolvedValue(undefined) } as any,
      { clear: jest.fn().mockResolvedValue(undefined) } as any,
      { invalidate: jest.fn(), roomsForDispatch: jest.fn(), confirmedReporter: jest.fn() } as any,
      { get: jest.fn(), set: jest.fn() } as any,
    );

    await expect(
      transport.startTransport(INCIDENT, { dispatchId: AMBULANCE_DISPATCH } as any, AMBULANCE_CREW, 'RESPONDER'),
    ).resolves.toEqual(expect.objectContaining({ id: 'transport-1' }));
    expect(tx.transportRecord.create).toHaveBeenCalled();
  });

  it('allows the second unit to report EN_ROUTE and ON_SCENE after the first arrives', async () => {
    const { responders } = createHarness(IncidentStatus.ON_SCENE);

    await expect(
      responders.updateStatus(FIRE_DISPATCH, FIRE_CREW, { status: 'EN_ROUTE' } as any),
    ).resolves.toEqual(expect.objectContaining({ incidentStatus: IncidentStatus.ON_SCENE }));
    await expect(
      responders.updateStatus(FIRE_DISPATCH, FIRE_CREW, { status: 'ON_SCENE' } as any),
    ).resolves.toEqual(expect.objectContaining({ incidentStatus: IncidentStatus.ON_SCENE }));
  });

  it('resolves and completes the last active crew dispatch', async () => {
    const { tx, responders } = createHarness(IncidentStatus.ON_SCENE);
    tx.dispatches.findMany.mockResolvedValue([
      { id: FIRE_DISPATCH, resource_id: 'resource-fire', status: 'ACCEPTED' },
    ]);
    tx.dispatches.update.mockResolvedValue({
      id: FIRE_DISPATCH,
      resource_id: 'resource-fire',
      status: 'COMPLETED',
      field_done_at: new Date('2026-10-31T00:00:00Z'),
    });

    await expect(
      responders.updateStatus(FIRE_DISPATCH, FIRE_CREW, { status: 'RESOLVED' } as any),
    ).resolves.toEqual(expect.objectContaining({ incidentStatus: IncidentStatus.RESOLVED }));
    expect(tx.dispatches.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: FIRE_DISPATCH },
      data: expect.objectContaining({ status: 'COMPLETED', field_done_at: expect.any(Date) }),
    }));
    expect(tx.incident.update).toHaveBeenCalled();
  });

  it('checks every dispatch transport before resolving the last crew', async () => {
    const { tx, responders } = createHarness(IncidentStatus.TRANSPORTING);
    tx.dispatches.findMany.mockResolvedValue([
      { id: FIRE_DISPATCH, resource_id: 'resource-fire', status: 'ACCEPTED' },
    ]);
    tx.transportRecord.findFirst.mockResolvedValue({ id: 'ambulance-open-transport' });

    await expect(
      responders.updateStatus(FIRE_DISPATCH, FIRE_CREW, { status: 'RESOLVED' } as any),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'TRANSPORT_OPEN' }) });
    expect(tx.transportRecord.findFirst).toHaveBeenCalledWith({
      where: { incident_id: INCIDENT, arrived_at: null, incidents: { status: IncidentStatus.TRANSPORTING } },
      select: { id: true },
    });
  });

  it('two crews finishing at once: the incident row is locked, and a changed status is refused, not raced', async () => {
    const { tx, responders } = createHarness(IncidentStatus.ON_SCENE);
    // Another crew moved the incident between our read and our lock.
    tx.$queryRaw.mockResolvedValue([{ status: IncidentStatus.RESOLVED }]);

    await expect(
      responders.updateStatus(FIRE_DISPATCH, FIRE_CREW, { status: 'RESOLVED' } as any),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'INCIDENT_STATUS_CHANGED' }) });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.dispatches.update).not.toHaveBeenCalled();
  });

  it('a late EN_ROUTE / ON_SCENE on a resolved incident is refused, not silently stamped', async () => {
    const { tx, responders } = createHarness(IncidentStatus.RESOLVED);

    await expect(
      responders.updateStatus(FIRE_DISPATCH, FIRE_CREW, { status: 'ON_SCENE' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.dispatches.update).not.toHaveBeenCalled();
  });

  it('keeps the single-unit resolve flow unchanged', async () => {
    const { tx, responders } = createHarness(IncidentStatus.ON_SCENE);
    tx.dispatches.findMany.mockResolvedValue([
      { id: FIRE_DISPATCH, resource_id: 'resource-fire', status: 'ACCEPTED' },
    ]);
    tx.dispatches.update.mockResolvedValue({
      id: FIRE_DISPATCH,
      resource_id: 'resource-fire',
      status: 'COMPLETED',
      field_done_at: new Date('2026-10-31T00:00:00Z'),
    });

    await expect(
      responders.updateStatus(FIRE_DISPATCH, FIRE_CREW, { status: 'RESOLVED' } as any),
    ).resolves.toEqual(expect.objectContaining({ incidentStatus: IncidentStatus.RESOLVED }));
    expect(tx.resources.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'resource-fire' }),
    }));
  });

  it('two dispatched units finishing: the first leaves the incident open, the last resolves it (testing-errors Phase 5)', async () => {
    const { tx, responders } = createHarness(IncidentStatus.ON_SCENE);
    tx.transportRecord.findFirst.mockResolvedValue(null);

    // The fire unit finishes first while the ambulance is still active.
    await expect(
      responders.updateStatus(FIRE_DISPATCH, FIRE_CREW, { status: 'RESOLVED' } as any),
    ).resolves.toEqual(expect.objectContaining({ incidentStatus: IncidentStatus.ON_SCENE }));
    expect(tx.incident.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: IncidentStatus.RESOLVED }) }),
    );
    expect(tx.incidentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ to_status: IncidentStatus.ON_SCENE, notes: 'FIRE-1 finished field work' }),
    });

    // Now the ambulance is the last active unit; its finish resolves the incident.
    tx.dispatches.findMany.mockResolvedValue([
      { id: AMBULANCE_DISPATCH, resource_id: 'resource-ambulance', status: 'ACCEPTED' },
    ]);
    tx.dispatches.update.mockResolvedValue({
      id: AMBULANCE_DISPATCH,
      resource_id: 'resource-ambulance',
      status: 'COMPLETED',
      field_done_at: new Date('2026-11-02T00:00:00Z'),
    });

    await expect(
      responders.updateStatus(AMBULANCE_DISPATCH, AMBULANCE_CREW, { status: 'RESOLVED' } as any),
    ).resolves.toEqual(expect.objectContaining({ incidentStatus: IncidentStatus.RESOLVED }));
    expect(tx.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: IncidentStatus.RESOLVED }) }),
    );
  });
});
