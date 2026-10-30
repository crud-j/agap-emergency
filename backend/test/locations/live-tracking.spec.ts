import { ForbiddenException } from '@nestjs/common';
import { LocationsService, ETA_REFRESH_THROTTLE_MS } from '../../src/locations/locations.service';

const INCIDENT = 'incident-1';
const inBocaue = { incidentId: INCIDENT, latitude: 14.7993, longitude: 120.9266 };

function fix(userId: string, recordedAt: string, lat = 14.8, lng = 120.93, incidentId = INCIDENT) {
  return {
    incident_id: incidentId,
    user_id: userId,
    latitude: lat,
    longitude: lng,
    heading_degrees: 90,
    speed_kmh: 30,
    recorded_at: new Date(recordedAt),
  };
}

function setup() {
  const prisma = {
    dispatches: { findFirst: jest.fn(), findMany: jest.fn() },
    location_history: {
      create: jest.fn().mockResolvedValue({ id: 'loc-1', recorded_at: new Date('2026-10-18T00:00:00Z') }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const realtime = { notifyResponderLocationUpdated: jest.fn(), incidentLocationUpdated: jest.fn() };
  const maps = { route: jest.fn().mockResolvedValue({ durationSeconds: 300 }) };
  const participants = { assertParticipant: jest.fn().mockResolvedValue('reporter') };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  // Every unit on the scene leg, heading to the incident location (the pre-transport case).
  const sceneLeg = { leg: 'TO_SCENE', target: { lat: 14.79, lng: 120.92 }, destination: null, transportId: null, incidentId: INCIDENT };
  const audience = {
    roomsForDispatch: jest.fn().mockResolvedValue({ incidentRoom: true, userIds: [] }),
    load: jest.fn(async () => ({
      reporterUserId: 'reporter-1',
      dispatches: new Map(
        ['dispatch-A', 'dispatch-B'].map((id) => [id, { leg: sceneLeg, crewUserIds: [], reporterConfirmedPatient: false }]),
      ),
    })),
  };
  const routeCache = { get: jest.fn().mockResolvedValue(null) };
  const service = new LocationsService(
    prisma as any, realtime as any, maps as any, participants as any, queue as any, audience as any, routeCache as any,
  );
  return { service, prisma, realtime, maps, participants, queue, audience, routeCache };
}

describe('MOD-13 / MOD-43 live tracking (WP3)', () => {
  describe('trackResponder', () => {
    it("attributes the ETA job to the pushing crew's dispatch and throttles it per dispatch (G8)", async () => {
      const { service, prisma, queue } = setup();
      prisma.dispatches.findFirst.mockResolvedValue({
        id: 'dispatch-B',
        resources: { call_sign: 'AMB-2' },
        incidents: { incident_locations: { latitude: 14.79, longitude: 120.92 } },
      });

      await service.trackResponder(inBocaue, 'crew-b');

      // Only the crew-scoped lookup; no second "first active dispatch" query.
      expect(prisma.dispatches.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.dispatches.findFirst.mock.calls[0][0].where.dispatch_crew).toEqual({
        some: { user_id: 'crew-b' },
      });
      expect(queue.add).toHaveBeenCalledWith(
        'eta-refresh',
        expect.objectContaining({ dispatchId: 'dispatch-B', incidentId: INCIDENT }),
        expect.objectContaining({
          deduplication: { id: 'eta-dispatch-B', ttl: ETA_REFRESH_THROTTLE_MS },
          removeOnComplete: true,
        }),
      );
      expect(queue.add.mock.calls[0][2].deduplication.id).not.toContain(':');
    });

    it('broadcasts dispatchId and call sign, never a name or phone', async () => {
      const { service, prisma, realtime } = setup();
      prisma.dispatches.findFirst.mockResolvedValue({
        id: 'dispatch-A',
        resources: { call_sign: 'AMB-1' },
        incidents: { incident_locations: null },
      });

      await service.trackResponder(inBocaue, 'crew-a');

      const [incidentId, payload] = realtime.notifyResponderLocationUpdated.mock.calls[0];
      expect(incidentId).toBe(INCIDENT);
      expect(payload).toMatchObject({ responderId: 'crew-a', dispatchId: 'dispatch-A', callSign: 'AMB-1' });
      expect(Object.keys(payload)).not.toEqual(expect.arrayContaining(['responder_name']));
      expect(JSON.stringify(payload)).not.toMatch(/name|phone/i);
    });

    it('still records the fix when the ETA enqueue fails', async () => {
      const { service, prisma, queue } = setup();
      prisma.dispatches.findFirst.mockResolvedValue({
        id: 'dispatch-A',
        resources: null,
        incidents: { incident_locations: { latitude: 14.79, longitude: 120.92 } },
      });
      queue.add.mockRejectedValue(new Error('redis down'));

      await expect(service.trackResponder(inBocaue, 'crew-a')).resolves.toMatchObject({ id: 'loc-1' });
      expect(prisma.location_history.create).toHaveBeenCalledTimes(1);
    });

    it('still enqueues the ETA job when the scene has no GPS (the hospital leg does not need it)', async () => {
      const { service, prisma, queue } = setup();
      prisma.dispatches.findFirst.mockResolvedValue({
        id: 'dispatch-A',
        resources: null,
        incidents: { incident_locations: null },
      });

      await service.trackResponder(inBocaue, 'crew-a');

      const data = queue.add.mock.calls[0][1];
      expect(data).toEqual({
        dispatchId: 'dispatch-A',
        incidentId: INCIDENT,
        responderLat: inBocaue.latitude,
        responderLng: inBocaue.longitude,
        reason: 'fix',
      });
    });
  });

  describe('requestImmediateRefresh (plan §13.2)', () => {
    it('enqueues with a distinct job id and no dedup, so the throttle cannot swallow it', async () => {
      const { service, queue } = setup();

      await service.requestImmediateRefresh('dispatch-A', INCIDENT, 'destination_changed');

      const [name, data, opts] = queue.add.mock.calls[0];
      expect(name).toBe('eta-refresh');
      expect(data).toEqual({ dispatchId: 'dispatch-A', incidentId: INCIDENT, reason: 'destination_changed' });
      expect(opts.jobId).toMatch(/^eta-now-dispatch-A-\d+$/);
      expect(opts.jobId).not.toContain(':');
      expect(opts.deduplication).toBeUndefined();
    });

    it('never throws when the queue is down', async () => {
      const { service, queue } = setup();
      queue.add.mockRejectedValue(new Error('redis down'));
      await expect(service.requestImmediateRefresh('dispatch-A', INCIDENT, 'arrived')).resolves.toBeUndefined();
    });
  });

  describe('getLatestUnitPositions (G1)', () => {
    const acceptedDispatch = {
      id: 'dispatch-A',
      resources: { name: 'Ambulance 1', call_sign: 'AMB-1', resource_type: 'AMBULANCE' },
      dispatch_crew: [{ user_id: 'crew-1' }, { user_id: 'crew-2' }],
      incidents: { incident_locations: { latitude: 14.79, longitude: 120.92 } },
    };

    it('rejects a non-participant (another citizen) before reading anything', async () => {
      const { service, prisma, participants } = setup();
      participants.assertParticipant.mockRejectedValue(new ForbiddenException());

      await expect(
        service.getLatestUnitPositions(INCIDENT, { id: 'stranger', role: 'CITIZEN' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.dispatches.findMany).not.toHaveBeenCalled();
    });

    it('returns one entry per unit using the freshest crew fix, with an estimated ETA', async () => {
      const { service, prisma } = setup();
      prisma.dispatches.findMany.mockResolvedValue([acceptedDispatch]);
      prisma.location_history.findMany.mockResolvedValue([
        fix('crew-2', '2026-10-18T00:00:10Z', 14.81, 120.94), // newest first
        fix('crew-1', '2026-10-18T00:00:00Z'),
      ]);

      const [unit, ...rest] = await service.getLatestUnitPositions(INCIDENT, { id: 'reporter-1', role: 'CITIZEN' });

      expect(rest).toHaveLength(0);
      expect(unit).toMatchObject({
        dispatchId: 'dispatch-A',
        callSign: 'AMB-1',
        resourceType: 'AMBULANCE',
        position: { lat: 14.81, lng: 120.94, updatedAt: '2026-10-18T00:00:10.000Z' },
        eta: { seconds: 300, isEstimate: true },
      });
    });

    it('never exposes a responder name or phone to the reporter', async () => {
      const { service, prisma } = setup();
      prisma.dispatches.findMany.mockResolvedValue([acceptedDispatch]);
      prisma.location_history.findMany.mockResolvedValue([fix('crew-1', '2026-10-18T00:00:00Z')]);

      const result = await service.getLatestUnitPositions(INCIDENT, { id: 'reporter-1', role: 'CITIZEN' });
      const json = JSON.stringify(result);
      expect(json).not.toMatch(/full_name|phone|responder_name|crew-1/);
    });

    it('only considers ACCEPTED dispatches on an active incident', async () => {
      const { service, prisma } = setup();
      prisma.dispatches.findMany.mockResolvedValue([]);

      await expect(service.getLatestUnitPositions(INCIDENT, { id: 'd', role: 'DISPATCHER' })).resolves.toEqual([]);
      const where = prisma.dispatches.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACCEPTED');
      expect(where.incidents.status.in).toEqual(['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING']);
    });

    it('returns the unit with a null position before the first fix, and a null ETA when routing fails', async () => {
      const { service, prisma, maps } = setup();
      prisma.dispatches.findMany.mockResolvedValue([acceptedDispatch]);

      const [noFix] = await service.getLatestUnitPositions(INCIDENT, { id: 'r', role: 'CITIZEN' });
      expect(noFix).toMatchObject({ position: null, eta: { seconds: null, isEstimate: true } });

      prisma.location_history.findMany.mockResolvedValue([fix('crew-1', '2026-10-18T00:00:00Z')]);
      maps.route.mockRejectedValue(new Error('OSRM down'));
      const [routingDown] = await service.getLatestUnitPositions(INCIDENT, { id: 'r', role: 'CITIZEN' });
      expect(routingDown!.position).not.toBeNull();
      expect(routingDown!.eta).toEqual({ seconds: null, isEstimate: true, calculatedAt: null });
    });
  });

  describe('getAllResponderPositions (G3)', () => {
    it('only queries ACCEPTED dispatches whose incident is still active', async () => {
      const { service, prisma } = setup();
      prisma.dispatches.findMany.mockResolvedValue([]);

      await expect(service.getAllResponderPositions()).resolves.toEqual([]);
      const where = prisma.dispatches.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACCEPTED');
      expect(where.incidents.status.in).not.toEqual(expect.arrayContaining(['RESOLVED', 'CLOSED', 'CANCELLED']));
      expect(prisma.location_history.findMany).not.toHaveBeenCalled();
    });

    it('returns one marker per unit (freshest crew fix) with dispatch, call sign and incident status', async () => {
      const { service, prisma } = setup();
      prisma.dispatches.findMany.mockResolvedValue([
        {
          id: 'dispatch-A',
          incident_id: INCIDENT,
          incidents: { status: 'EN_ROUTE' },
          resources: { name: 'Ambulance 1', call_sign: 'AMB-1', resource_type: 'AMBULANCE' },
          dispatch_crew: [
            { user_id: 'crew-1', users: { full_name: 'Ana Cruz' } },
            { user_id: 'crew-2', users: { full_name: 'Ben Reyes' } },
          ],
        },
        {
          // Accepted, but no GPS fix yet: nothing to draw.
          id: 'dispatch-B',
          incident_id: 'incident-2',
          incidents: { status: 'DISPATCHED' },
          resources: { name: 'Ambulance 2', call_sign: 'AMB-2', resource_type: 'AMBULANCE' },
          dispatch_crew: [{ user_id: 'crew-3', users: { full_name: 'Cy Lim' } }],
        },
      ]);
      prisma.location_history.findMany.mockResolvedValue([
        fix('crew-1', '2026-10-18T00:00:20Z', 14.82, 120.95),
        fix('crew-2', '2026-10-18T00:00:05Z'),
      ]);

      const rows = await service.getAllResponderPositions();

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        responderId: 'crew-1',
        responder_name: 'Ana Cruz',
        dispatchId: 'dispatch-A',
        incident_id: INCIDENT,
        incident_status: 'EN_ROUTE',
        call_sign: 'AMB-1',
        lat: 14.82,
        lng: 120.95,
      });
      expect(rows[0]).not.toHaveProperty('status');
    });
  });
});
