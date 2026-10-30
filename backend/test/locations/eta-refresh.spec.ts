import { EtaRefreshProcessor } from '../../src/jobs/processors/eta-refresh.processor';
import type { TransportLegResolution } from '../../src/incidents/transport/transport-leg.service';

const job = {
  data: {
    dispatchId: 'dispatch-1',
    incidentId: 'inc-1',
    responderLat: 14.79,
    responderLng: 120.92,
    incidentLat: 14.8,
    incidentLng: 120.93,
  },
} as any;

const hospital = {
  kind: 'FACILITY' as const,
  name: 'DOH — Joni Villanueva General Hospital',
  latitude: 14.79679,
  longitude: 120.94358,
  locationVerified: true,
};

const toScene: TransportLegResolution = {
  leg: 'TO_SCENE',
  target: { lat: 14.8, lng: 120.93 },
  destination: null,
  transportId: null,
  incidentId: 'inc-1',
};

const toHospital: TransportLegResolution = {
  leg: 'TO_FACILITY',
  target: { lat: 14.79679, lng: 120.94358 },
  destination: hospital,
  transportId: 'tr-1',
  incidentId: 'inc-1',
};

const atHospital: TransportLegResolution = {
  leg: 'AT_FACILITY',
  target: null,
  destination: hospital,
  transportId: 'tr-1',
  incidentId: 'inc-1',
};

const geometry: [number, number][] = [[120.925, 14.795], [120.93, 14.796], [120.94358, 14.79679]];

function setup(
  dispatchStatus: string | null,
  freshest: { latitude: number; longitude: number } | null,
  opts: { leg?: TransportLegResolution | null; flag?: string } = {},
) {
  const prisma = {
    dispatches: { findUnique: jest.fn().mockResolvedValue(dispatchStatus ? { status: dispatchStatus } : null) },
    location_history: { findFirst: jest.fn().mockResolvedValue(freshest) },
    transportRecord: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const realtime = { notifyEtaUpdated: jest.fn(), routeUpdated: jest.fn() };
  const maps = {
    route: jest.fn().mockResolvedValue({ durationSeconds: 240, distanceMeters: 1800, isEstimate: true, geometry }),
  };
  const legs = { resolve: jest.fn().mockResolvedValue(opts.leg === undefined ? toScene : opts.leg) };
  const routeCache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  const values: Record<string, string> = opts.flag === undefined ? {} : { TRANSPORT_ROUTING_ENABLED: opts.flag };
  const config = { get: jest.fn((key: string) => values[key]) };
  // The audience rule: scene leg → incident room; hospital leg → the crew's user rooms.
  const audience = {
    roomsForDispatch: jest.fn(async (_incidentId: string, _dispatchId: string, leg: string) =>
      leg === 'TO_SCENE' ? { incidentRoom: true, userIds: [] } : { incidentRoom: false, userIds: ['crew-1'] },
    ),
  };
  const processor = new EtaRefreshProcessor(
    prisma as any, realtime as any, maps as any, legs as any, routeCache as any, config as any, audience as any,
  );
  return { processor, prisma, realtime, maps, legs, routeCache, audience };
}

describe('EtaRefreshProcessor', () => {
  it("routes from the freshest fix of this dispatch's crew, not the enqueued point", async () => {
    const { processor, prisma, maps, realtime } = setup('ACCEPTED', { latitude: 14.795, longitude: 120.925 });

    await processor.process(job);

    expect(prisma.location_history.findFirst.mock.calls[0][0].where).toEqual({
      incident_id: 'inc-1',
      users: { is: { dispatch_crew: { some: { dispatch_id: 'dispatch-1' } } } },
    });
    expect(maps.route).toHaveBeenCalledWith({ lat: 14.795, lng: 120.925 }, { lat: 14.8, lng: 120.93 });
    expect(realtime.notifyEtaUpdated).toHaveBeenCalledWith(
      'inc-1',
      expect.objectContaining({ dispatchId: 'dispatch-1', etaSeconds: 240, isEstimate: true }),
      { incidentRoom: true, userIds: [] },
    );
  });

  it('falls back to the enqueued point when no fix is stored', async () => {
    const { processor, maps } = setup('ACCEPTED', null);
    await processor.process(job);
    expect(maps.route).toHaveBeenCalledWith({ lat: 14.79, lng: 120.92 }, { lat: 14.8, lng: 120.93 });
  });

  it.each(['COMPLETED', 'CANCELLED', null])('skips a %s dispatch without routing', async (status) => {
    const { processor, maps, realtime, legs } = setup(status, null);
    await processor.process(job);
    expect(legs.resolve).not.toHaveBeenCalled();
    expect(maps.route).not.toHaveBeenCalled();
    expect(realtime.notifyEtaUpdated).not.toHaveBeenCalled();
    expect(realtime.routeUpdated).not.toHaveBeenCalled();
  });

  describe('scene leg', () => {
    it('caches the route, sends it to ops and the incident room, and never writes transport_records', async () => {
      const { processor, prisma, realtime, routeCache } = setup('ACCEPTED', { latitude: 14.795, longitude: 120.925 });

      await processor.process(job);

      expect(prisma.transportRecord.updateMany).not.toHaveBeenCalled();
      const [payload, audience] = realtime.routeUpdated.mock.calls[0];
      expect(audience).toEqual({ incidentRoom: true, userIds: [] });
      expect(payload).toMatchObject({ incidentId: 'inc-1', dispatchId: 'dispatch-1', leg: 'TO_SCENE', destination: null });
      expect(payload.route).toMatchObject({
        geometry, distanceMeters: 1800, durationSeconds: 240, isEstimate: true, stale: false,
      });
      expect(routeCache.set).toHaveBeenCalledWith('dispatch-1', {
        leg: 'TO_SCENE',
        destination: null,
        route: payload.route,
        fromFix: { lat: 14.795, lng: 120.925 },
      });
    });

    it('simplifies a long route to at most 300 points', async () => {
      const { processor, maps, realtime } = setup('ACCEPTED', null);
      const long = Array.from({ length: 1000 }, (_, i) => [120.92 + i * 1e-5, 14.79 + Math.sin(i / 30) * 1e-3]);
      maps.route.mockResolvedValue({ durationSeconds: 240, distanceMeters: 1800, isEstimate: true, geometry: long });

      await processor.process(job);

      const route = realtime.routeUpdated.mock.calls[0][0].route;
      expect(route.geometry.length).toBeLessThanOrEqual(300);
      expect(route.geometry[0]).toEqual(long[0]);
      expect(route.geometry.at(-1)).toEqual(long.at(-1));
    });
  });

  describe('hospital leg', () => {
    it('routes to the hospital when a transport is open', async () => {
      const { processor, maps } = setup('ACCEPTED', { latitude: 14.795, longitude: 120.925 }, { leg: toHospital });
      await processor.process(job);
      expect(maps.route).toHaveBeenCalledWith({ lat: 14.795, lng: 120.925 }, { lat: 14.79679, lng: 120.94358 });
    });

    it('writes estimated_arrival_at only for the open transport', async () => {
      const { processor, prisma } = setup('ACCEPTED', null, { leg: toHospital });
      const before = Date.now();

      await processor.process(job);

      expect(prisma.transportRecord.updateMany).toHaveBeenCalledTimes(1);
      const { where, data } = prisma.transportRecord.updateMany.mock.calls[0][0];
      expect(where).toEqual({ id: 'tr-1', arrived_at: null, incidents: { status: 'TRANSPORTING' } });
      const eta = data.estimated_arrival_at.getTime();
      expect(eta).toBeGreaterThanOrEqual(before + 240_000);
      expect(eta).toBeLessThanOrEqual(Date.now() + 240_000);
    });

    it('sends the route and the hospital ETA to the hospital-leg audience, never to the incident room', async () => {
      const { processor, realtime, audience: rooms } = setup('ACCEPTED', null, { leg: toHospital });

      await processor.process(job);

      // The leg resolved by this run decides, not a cached one.
      expect(rooms.roomsForDispatch).toHaveBeenCalledWith('inc-1', 'dispatch-1', 'TO_FACILITY');
      const [payload, audience] = realtime.routeUpdated.mock.calls[0];
      expect(audience).toEqual({ incidentRoom: false, userIds: ['crew-1'] });
      expect(payload).toMatchObject({ leg: 'TO_FACILITY', destination: hospital });
      expect(realtime.notifyEtaUpdated.mock.calls[0][2]).toEqual({ incidentRoom: false, userIds: ['crew-1'] });
    });

    it('uses the destination at run time, not when the job was enqueued', async () => {
      const moved = { ...toHospital, target: { lat: 14.8007783, lng: 120.9218925 }, destination: { ...hospital, name: 'Other' } };
      const { processor, maps } = setup('ACCEPTED', null, { leg: moved });

      await processor.process({ data: { ...job.data, reason: 'destination_changed' } } as any);

      expect(maps.route).toHaveBeenCalledWith({ lat: 14.79, lng: 120.92 }, { lat: 14.8007783, lng: 120.9218925 });
    });

    it('destination not set or without coordinates: clears the cache and emits route null', async () => {
      const noTarget = { ...toHospital, target: null, destination: { ...hospital, latitude: null, longitude: null } };
      const { processor, maps, realtime, routeCache, prisma } = setup('ACCEPTED', null, { leg: noTarget });

      await processor.process(job);

      expect(maps.route).not.toHaveBeenCalled();
      expect(routeCache.clear).toHaveBeenCalledWith('dispatch-1');
      expect(prisma.transportRecord.updateMany).not.toHaveBeenCalled();
      expect(realtime.routeUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ leg: 'TO_FACILITY', route: null }),
        { incidentRoom: false, userIds: ['crew-1'] },
      );
    });

    it('AT_FACILITY clears the cache and emits route null', async () => {
      const { processor, maps, realtime, routeCache, prisma } = setup('ACCEPTED', null, { leg: atHospital });

      await processor.process({ data: { dispatchId: 'dispatch-1', incidentId: 'inc-1', reason: 'arrived' } } as any);

      expect(maps.route).not.toHaveBeenCalled();
      expect(routeCache.clear).toHaveBeenCalledWith('dispatch-1');
      expect(prisma.transportRecord.updateMany).not.toHaveBeenCalled();
      expect(realtime.notifyEtaUpdated).not.toHaveBeenCalled();
      expect(realtime.routeUpdated).toHaveBeenCalledWith(
        { incidentId: 'inc-1', dispatchId: 'dispatch-1', leg: 'AT_FACILITY', destination: hospital, route: null },
        { incidentRoom: false, userIds: ['crew-1'] },
      );
    });
  });

  describe('routing failure (never throws)', () => {
    const cachedRoute = (calculatedAt: string, destination = hospital) => ({
      leg: 'TO_FACILITY',
      destination,
      route: { geometry, distanceMeters: 1800, durationSeconds: 240, isEstimate: true, calculatedAt, stale: false },
      fromFix: { lat: 14.79, lng: 120.92 },
    });

    it('re-emits a fresh cached route for the same destination as stale', async () => {
      const { processor, maps, realtime, routeCache, prisma } = setup('ACCEPTED', null, { leg: toHospital });
      maps.route.mockRejectedValue(new Error('OSRM down'));
      routeCache.get.mockResolvedValue(cachedRoute(new Date(Date.now() - 30_000).toISOString()));

      await expect(processor.process(job)).resolves.toBeUndefined();

      const payload = realtime.routeUpdated.mock.calls[0][0];
      expect(payload.route).toMatchObject({ durationSeconds: 240, stale: true });
      expect(routeCache.set).not.toHaveBeenCalled();
      expect(prisma.transportRecord.updateMany).not.toHaveBeenCalled();
      expect(realtime.notifyEtaUpdated).not.toHaveBeenCalled();
    });

    it('emits route null when the provider returns no duration and nothing is cached', async () => {
      const { processor, maps, realtime } = setup('ACCEPTED', null, { leg: toHospital });
      maps.route.mockResolvedValue({ durationSeconds: null, distanceMeters: null, isEstimate: true });

      await processor.process(job);

      expect(realtime.routeUpdated.mock.calls[0][0].route).toBeNull();
      expect(realtime.notifyEtaUpdated).not.toHaveBeenCalled();
    });

    it('does not reuse a cached route older than 120 s', async () => {
      const { processor, maps, realtime, routeCache } = setup('ACCEPTED', null, { leg: toHospital });
      maps.route.mockRejectedValue(new Error('OSRM down'));
      routeCache.get.mockResolvedValue(cachedRoute(new Date(Date.now() - 121_000).toISOString()));

      await processor.process(job);

      expect(realtime.routeUpdated.mock.calls[0][0].route).toBeNull();
    });

    it('does not reuse a cached route to a different destination', async () => {
      const { processor, maps, realtime, routeCache } = setup('ACCEPTED', null, { leg: toHospital });
      maps.route.mockRejectedValue(new Error('OSRM down'));
      routeCache.get.mockResolvedValue(cachedRoute(new Date().toISOString(), { ...hospital, name: 'Old hospital' }));

      await processor.process(job);

      expect(realtime.routeUpdated.mock.calls[0][0].route).toBeNull();
    });

    it('emits route null when there is no crew fix and no enqueued point', async () => {
      const { processor, maps, realtime } = setup('ACCEPTED', null, { leg: toHospital });

      await processor.process({ data: { dispatchId: 'dispatch-1', incidentId: 'inc-1', reason: 'transport_started' } } as any);

      expect(maps.route).not.toHaveBeenCalled();
      expect(realtime.routeUpdated.mock.calls[0][0].route).toBeNull();
    });
  });

  describe('TRANSPORT_ROUTING_ENABLED=false (Prompt 04 behaviour)', () => {
    it('routes to the enqueued scene point with no leg, cache, route event or transport write', async () => {
      const { processor, maps, realtime, legs, routeCache, prisma } = setup(
        'ACCEPTED', { latitude: 14.795, longitude: 120.925 }, { leg: toHospital, flag: 'false' },
      );

      await processor.process(job);

      expect(legs.resolve).not.toHaveBeenCalled();
      expect(maps.route).toHaveBeenCalledWith({ lat: 14.795, lng: 120.925 }, { lat: 14.8, lng: 120.93 });
      expect(realtime.notifyEtaUpdated).toHaveBeenCalledWith(
        'inc-1', expect.objectContaining({ dispatchId: 'dispatch-1', etaSeconds: 240, isEstimate: true }),
      );
      expect(realtime.routeUpdated).not.toHaveBeenCalled();
      expect(routeCache.get).not.toHaveBeenCalled();
      expect(routeCache.set).not.toHaveBeenCalled();
      expect(routeCache.clear).not.toHaveBeenCalled();
      expect(prisma.transportRecord.updateMany).not.toHaveBeenCalled();
    });

    it('swallows routing failures and emits nothing', async () => {
      const { processor, maps, realtime } = setup('ACCEPTED', null, { flag: 'false' });
      maps.route.mockRejectedValue(new Error('OSRM down'));
      await expect(processor.process(job)).resolves.toBeUndefined();
      expect(realtime.notifyEtaUpdated).not.toHaveBeenCalled();
    });

    it('skips an immediate refresh, which carries no scene point', async () => {
      const { processor, maps } = setup('ACCEPTED', null, { flag: 'false' });
      await processor.process({ data: { dispatchId: 'dispatch-1', incidentId: 'inc-1', reason: 'arrived' } } as any);
      expect(maps.route).not.toHaveBeenCalled();
    });
  });
});
