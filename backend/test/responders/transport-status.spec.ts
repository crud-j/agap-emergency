import { ConflictException } from '@nestjs/common';
import { IncidentStatus } from '@agap/shared';
import { RespondersService } from '../../src/responders/responders.service';
import { TransportService } from '../../src/incidents/transport/transport.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';

// Prompt 08: the crew's "Transporting" button and POST /transport share one path
// (TransportService.beginTransport), so an incident is never TRANSPORTING without
// an open record, and a crew cannot resolve before recording arrival.

const INCIDENT = 'inc-1';
const DISPATCH = 'dispatch-1';
const CREW = 'crew-1';
const HOSPITAL = 'fac-1';

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tr-1',
    incident_id: INCIDENT,
    dispatch_id: DISPATCH,
    patient_id: null,
    destination_id: null,
    transport_started_at: new Date('2026-10-28T01:00:00Z'),
    estimated_arrival_at: null,
    arrived_at: null,
    ...overrides,
  };
}

function setup(incidentStatus: IncidentStatus, resourceType = 'AMBULANCE') {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ status: incidentStatus }]),
    dispatches: {
      findUnique: jest.fn().mockResolvedValue({ incident_id: INCIDENT, resources: { resource_type: resourceType } }),
      findMany: jest.fn().mockResolvedValue([{ id: DISPATCH, resource_id: 'res-1', status: 'ACCEPTED' }]),
      update: jest.fn().mockResolvedValue({}),
    },
    dispatch_crew: { findUnique: jest.fn().mockResolvedValue({ id: 'crew-row' }) },
    facility: {
      findUnique: jest.fn().mockResolvedValue({
        id: HOSPITAL, name: 'DOH — Joni Villanueva General Hospital', is_active: true, facility_type: 'HOSPITAL',
        location_status: 'VERIFIED', receiving_status: 'OPEN', latitude: 14.79679, longitude: 120.94358,
      }),
    },
    transportRecord: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(record()),
      update: jest.fn().mockResolvedValue(record({ destination_id: HOSPITAL })),
    },
    incident: { update: jest.fn().mockResolvedValue({ id: INCIDENT }) },
    incidentEvent: { create: jest.fn().mockResolvedValue({}) },
    resources: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    dispatches: {
      findUnique: jest.fn().mockResolvedValue({
        id: DISPATCH, incident_id: INCIDENT, resource_id: 'res-1', status: 'ACCEPTED',
        dispatch_crew: [{ user_id: CREW }], resources: { resource_type: resourceType },
      }),
    },
    incident: { findUnique: jest.fn().mockResolvedValue({ status: incidentStatus }) },
  };
  const realtime = {
    notifyIncidentStatusChanged: jest.fn(),
    statusChanged: jest.fn(),
    incidentTransporting: jest.fn(),
    transportUpdated: jest.fn(),
    responderStatus: jest.fn(),
    resourceStatusChanged: jest.fn(),
    dispatchUpdated: jest.fn(),
    notifyDispatchCancelled: jest.fn(),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const notifier = { notifyReporter: jest.fn(), notifyDispatcher: jest.fn() };
  const locations = { requestImmediateRefresh: jest.fn().mockResolvedValue(undefined) };
  const routeCache = { clear: jest.fn().mockResolvedValue(undefined) };
  const audience = {
    invalidate: jest.fn(),
    roomsForDispatch: jest.fn().mockResolvedValue({ incidentRoom: false, userIds: [] }),
    confirmedReporter: jest.fn().mockResolvedValue(null),
  };
  const statusService = new IncidentStatusService();
  const requests = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
  const transport = new TransportService(
    prisma as any, audit as any, realtime as any, statusService, locations as any, routeCache as any, audience as any,
    requests as any,
  );
  const responders = new RespondersService(
    prisma as any, realtime as any, audit as any, statusService, transport, audience as any, notifier as any,
  );
  return { tx, prisma, realtime, audit, notifier, locations, transport, responders };
}

describe('PATCH /responders/assignments/:id/status — TRANSPORTING (Prompt 08)', () => {
  it('ON_SCENE → TRANSPORTING creates the open record (no destination) with the transition, in one transaction', async () => {
    const { tx, prisma, responders, realtime, notifier, locations, audit } = setup(IncidentStatus.ON_SCENE);

    const result = await responders.updateStatus(DISPATCH, CREW, { status: 'TRANSPORTING', notes: 'Patient loaded' } as any);

    expect(result).toEqual({ dispatchId: DISPATCH, status: 'TRANSPORTING', incidentStatus: IncidentStatus.TRANSPORTING });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.transportRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ incident_id: INCIDENT, dispatch_id: DISPATCH, destination_id: null }),
    });

    // The IncidentEvent is the same as before: the crew's note, role RESPONDER.
    expect(tx.incidentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from_status: IncidentStatus.ON_SCENE,
        to_status: IncidentStatus.TRANSPORTING,
        triggered_by_id: CREW,
        triggered_by_role: 'RESPONDER',
        notes: 'Patient loaded',
      }),
    });
    // Status side effects as today, plus the transport audit row, event and route.
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'incident', moduleId: 'MOD-32' }));
    expect(audit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ entityType: 'transport_record' }));
    expect(realtime.notifyIncidentStatusChanged).toHaveBeenCalledWith(expect.objectContaining({
      previousStatus: IncidentStatus.ON_SCENE, newStatus: IncidentStatus.TRANSPORTING,
    }));
    expect(notifier.notifyReporter).toHaveBeenCalledWith(INCIDENT, IncidentStatus.TRANSPORTING);
    expect(notifier.notifyDispatcher).toHaveBeenCalledWith(INCIDENT, IncidentStatus.TRANSPORTING, DISPATCH);
    expect(realtime.incidentTransporting).toHaveBeenCalledWith(expect.objectContaining({
      transportId: 'tr-1', dispatchId: DISPATCH, destinationId: null, destination: null,
    }), null);
    expect(locations.requestImmediateRefresh).toHaveBeenCalledWith(DISPATCH, INCIDENT, 'transport_started');
  });

  it('refuses TRANSPORTING for a fire truck', async () => {
    const { responders } = setup(IncidentStatus.ON_SCENE, 'FIRE_TRUCK');
    await expect(responders.updateStatus(DISPATCH, CREW, { status: 'TRANSPORTING' } as any))
      .rejects.toMatchObject({ response: { code: 'TRANSPORT_NOT_FOR_UNIT' } });
  });

  it('refuses ASSISTING for a fire truck', async () => {
    const { responders } = setup(IncidentStatus.ON_SCENE, 'FIRE_TRUCK');
    await expect(responders.updateStatus(DISPATCH, CREW, { status: 'ASSISTING' } as any))
      .rejects.toMatchObject({ response: { code: 'ASSISTING_NOT_FOR_UNIT' } });
  });

  it('the following POST /transport with a destination sets it on that record: no 409, no second record', async () => {
    const { tx, transport, realtime } = setup(IncidentStatus.TRANSPORTING);
    tx.transportRecord.findFirst.mockResolvedValue(record());

    const result = await transport.startTransport(INCIDENT, { dispatchId: DISPATCH, destinationId: HOSPITAL }, CREW, 'RESPONDER');

    expect(result).toMatchObject({ id: 'tr-1', destination_id: HOSPITAL });
    expect(tx.transportRecord.create).not.toHaveBeenCalled();
    expect(tx.transportRecord.update).toHaveBeenCalledWith({
      where: { id: 'tr-1' },
      data: { destination_id: HOSPITAL, updated_at: expect.any(Date) },
    });
    expect(tx.incident.update).not.toHaveBeenCalled();
    expect(realtime.transportUpdated).toHaveBeenCalledTimes(1);
  });

  it('a second unit on a TRANSPORTING incident gets its own record; the incident does not move or re-notify', async () => {
    const { tx, responders, realtime, notifier, audit } = setup(IncidentStatus.TRANSPORTING);

    await responders.updateStatus(DISPATCH, CREW, { status: 'TRANSPORTING' } as any);

    expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
    expect(tx.incident.update).not.toHaveBeenCalled();
    expect(tx.incidentEvent.create).not.toHaveBeenCalled();
    expect(realtime.notifyIncidentStatusChanged).not.toHaveBeenCalled();
    expect(notifier.notifyReporter).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(realtime.incidentTransporting).toHaveBeenCalledTimes(1);
  });

  it('ASSISTING → TRANSPORTING creates the transport record and transitions the incident', async () => {
    const { tx, responders, realtime } = setup(IncidentStatus.ASSISTING);

    await expect(responders.updateStatus(DISPATCH, CREW, { status: 'TRANSPORTING' } as any))
      .resolves.toMatchObject({ incidentStatus: IncidentStatus.TRANSPORTING });
    expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
    expect(realtime.notifyIncidentStatusChanged).toHaveBeenCalled();
  });

  it('EN_ROUTE → TRANSPORTING is refused with 409 and nothing is written', async () => {
    const { tx, responders, realtime } = setup(IncidentStatus.EN_ROUTE);

    await expect(responders.updateStatus(DISPATCH, CREW, { status: 'TRANSPORTING' } as any))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.transportRecord.create).not.toHaveBeenCalled();
    expect(tx.incident.update).not.toHaveBeenCalled();
    expect(realtime.notifyIncidentStatusChanged).not.toHaveBeenCalled();
  });

  it('rolls back: a failure inside beginTransport leaves no status change and announces nothing', async () => {
    const { tx, responders, realtime, notifier, locations } = setup(IncidentStatus.ON_SCENE);
    tx.incident.update.mockRejectedValue(new Error('db down'));

    await expect(responders.updateStatus(DISPATCH, CREW, { status: 'TRANSPORTING' } as any)).rejects.toThrow('db down');
    expect(realtime.notifyIncidentStatusChanged).not.toHaveBeenCalled();
    expect(realtime.incidentTransporting).not.toHaveBeenCalled();
    expect(notifier.notifyReporter).not.toHaveBeenCalled();
    expect(locations.requestImmediateRefresh).not.toHaveBeenCalled();
  });
});

describe('PATCH /responders/assignments/:id/status — RESOLVED before arrival (Prompt 08)', () => {
  it('a crew with an open transport gets 409 TRANSPORT_OPEN and the incident stays TRANSPORTING', async () => {
    const { tx, responders, realtime } = setup(IncidentStatus.TRANSPORTING);
    tx.transportRecord.findFirst.mockResolvedValue({ id: 'tr-1' });

    const error = await responders.updateStatus(DISPATCH, CREW, { status: 'RESOLVED' } as any).catch((e: unknown) => e);

    expect((error as ConflictException).getResponse()).toMatchObject({ code: 'TRANSPORT_OPEN', transportId: 'tr-1' });
    expect(tx.transportRecord.findFirst).toHaveBeenCalledWith({
      where: { incident_id: INCIDENT, arrived_at: null, incidents: { status: IncidentStatus.TRANSPORTING } },
      select: { id: true },
    });
    expect(tx.incident.update).not.toHaveBeenCalled();
    expect(tx.dispatches.update).not.toHaveBeenCalled();
    expect(realtime.notifyIncidentStatusChanged).not.toHaveBeenCalled();
  });

  it('after arrival (no open transport) the crew resolves as before', async () => {
    const { tx, responders, notifier } = setup(IncidentStatus.TRANSPORTING);

    await expect(responders.updateStatus(DISPATCH, CREW, { status: 'RESOLVED' } as any))
      .resolves.toMatchObject({ incidentStatus: IncidentStatus.RESOLVED });
    expect(tx.incident.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: INCIDENT, status: IncidentStatus.TRANSPORTING },
    }));
    expect(tx.dispatches.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }));
    expect(notifier.notifyReporter).toHaveBeenCalledWith(INCIDENT, IncidentStatus.RESOLVED);
  });
});
