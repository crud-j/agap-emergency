import { LocationsService } from '../../src/locations/locations.service';
import { TransportAudienceService } from '../../src/incidents/transport/transport-audience.service';

/**
 * Plan §17 / C17: GET /locations/tracking/:id/latest on the hospital leg. Real
 * LocationsService + real TransportAudienceService; Prisma, the leg resolver and
 * the route cache are mocked.
 */

const INCIDENT = 'incident-1';
const REPORTER = 'reporter-1';
const NO_ETA = { seconds: null, isEstimate: true, calculatedAt: null };

const joni = { kind: 'FACILITY', name: 'Joni Villanueva General Hospital', latitude: 14.79679, longitude: 120.94358, locationVerified: true };
const malolos = { kind: 'FACILITY', name: 'Bulacan Medical Center', latitude: 14.8433, longitude: 120.8114, locationVerified: true };

type Leg = 'TO_SCENE' | 'TO_FACILITY' | 'AT_FACILITY';

interface UnitFixture {
  id: string;
  crew: string;
  leg: Leg;
  destination: typeof joni | null;
  confirmed: boolean;
}

function routeFor(destination: typeof joni | null) {
  return {
    geometry: [[120.9266, 14.7993], [destination?.longitude ?? 120.92, destination?.latitude ?? 14.79]] as [number, number][],
    distanceMeters: 3160,
    durationSeconds: 426,
    isEstimate: true as const,
    calculatedAt: '2026-10-28T01:00:00.000Z',
    stale: false,
  };
}

function setup(
  units: UnitFixture[],
  opts: { participation?: string; reporterUserId?: string | null; cached?: boolean; sharing?: string } = {},
) {
  const prisma = {
    dispatches: {
      findMany: jest.fn(async (args: { select: Record<string, unknown> }) =>
        'transport_records' in args.select
          ? // TransportAudienceService.load
            units.map((u) => ({
              id: u.id,
              dispatch_crew: [{ user_id: u.crew }],
              transport_records: u.leg === 'TO_SCENE' ? [] : [{ reporter_patient_confirmed_at: u.confirmed ? new Date() : null }],
            }))
          : // getLatestUnitPositions
            units.map((u) => ({
              id: u.id,
              resources: { name: `Ambulance ${u.id}`, call_sign: `AMB-${u.id}`, resource_type: 'AMBULANCE' },
              dispatch_crew: [{ user_id: u.crew }],
            })),
      ),
    },
    location_history: {
      findMany: jest.fn(async () =>
        units.map((u) => ({
          incident_id: INCIDENT,
          user_id: u.crew,
          latitude: 14.81,
          longitude: 120.95,
          heading_degrees: 90,
          speed_kmh: 40,
          recorded_at: new Date('2026-10-28T01:00:00Z'),
        })),
      ),
    },
    incidentReporter: {
      findUnique: jest.fn(async () => ({ user_id: opts.reporterUserId === undefined ? REPORTER : opts.reporterUserId })),
    },
    // The reporter's own claim. The audience must never read it.
    incident_patients: { count: jest.fn(), findMany: jest.fn() },
  };
  const legs = {
    resolve: jest.fn(async (dispatchId: string) => {
      const u = units.find((x) => x.id === dispatchId)!;
      return {
        leg: u.leg,
        target: u.leg === 'TO_SCENE' ? { lat: 14.79, lng: 120.92 } : u.leg === 'TO_FACILITY' && u.destination ? { lat: u.destination.latitude, lng: u.destination.longitude } : null,
        destination: u.leg === 'TO_SCENE' ? null : u.destination,
        transportId: u.leg === 'TO_SCENE' ? null : `tr-${u.id}`,
        incidentId: INCIDENT,
      };
    }),
  };
  const routeCache = {
    get: jest.fn(async (dispatchId: string) => {
      if (opts.cached === false) return null;
      const u = units.find((x) => x.id === dispatchId)!;
      if (u.leg === 'AT_FACILITY') return null; // arrival clears the cache
      const destination = u.leg === 'TO_SCENE' ? null : u.destination;
      return { leg: u.leg, destination, route: routeFor(destination), fromFix: { lat: 14.81, lng: 120.95 } };
    }),
  };
  const maps = { route: jest.fn().mockResolvedValue({ durationSeconds: 300, distanceMeters: 2000, geometry: [] }) };
  const participants = { assertParticipant: jest.fn().mockResolvedValue(opts.participation ?? 'reporter') };
  // REPORTER_DESTINATION_SHARING_ENABLED: on unless a test turns it off.
  const config = { get: jest.fn((key: string) => (key === 'REPORTER_DESTINATION_SHARING_ENABLED' ? opts.sharing ?? 'true' : undefined)) };
  const audience = new TransportAudienceService(prisma as any, legs as any, config as any);
  const service = new LocationsService(
    prisma as any, {} as any, maps as any, participants as any, {} as any, audience, routeCache as any,
  );
  return { service, prisma, maps, routeCache };
}

const asReporter = { id: REPORTER, role: 'CITIZEN' };
const toJoni = (confirmed: boolean): UnitFixture => ({ id: 'A', crew: 'crew-a', leg: 'TO_FACILITY', destination: joni, confirmed });

function expectRedacted(unit: unknown, leg: Leg) {
  expect(unit).toMatchObject({ leg, position: null, route: null, destination: null, eta: NO_ETA });
}

describe('GET tracking/:id/latest — destination privacy on the hospital leg (C17)', () => {
  it('a crew-confirmed reporter gets destination, route, position and ETA on TO_FACILITY', async () => {
    const { service } = setup([toJoni(true)]);

    const [unit] = await service.getLatestUnitPositions(INCIDENT, asReporter);

    expect(unit).toMatchObject({
      dispatchId: 'A',
      callSign: 'AMB-A',
      leg: 'TO_FACILITY',
      destination: joni,
      route: routeFor(joni),
      position: { lat: 14.81, lng: 120.95 },
      eta: { seconds: 426, isEstimate: true, calculatedAt: '2026-10-28T01:00:00.000Z' },
    });
  });

  it.each<Leg>(['TO_FACILITY', 'AT_FACILITY'])(
    'launch switch off: a crew-confirmed reporter still gets nulls on %s; staff unaffected',
    async (leg) => {
      const unit = { ...toJoni(true), leg };
      const { service } = setup([unit], { sharing: 'false' });

      const [asReporterView] = await service.getLatestUnitPositions(INCIDENT, asReporter);
      expect(asReporterView).toMatchObject({ leg, destination: null, route: null, position: null });
      expect(JSON.stringify(asReporterView)).not.toContain(joni.name);

      const staff = setup([unit], { sharing: 'false', participation: 'staff' });
      const [staffView] = await staff.service.getLatestUnitPositions(INCIDENT, { id: 'dispatcher-1', role: 'DISPATCHER' });
      expect(staffView).toMatchObject({ leg, destination: joni });
    },
  );

  it('a crew-confirmed reporter sees the hospital on AT_FACILITY too (no route after arrival)', async () => {
    const { service } = setup([{ ...toJoni(true), leg: 'AT_FACILITY' }]);

    const [unit] = await service.getLatestUnitPositions(INCIDENT, asReporter);

    expect(unit).toMatchObject({ leg: 'AT_FACILITY', destination: joni, route: null, position: { lat: 14.81 } });
  });

  it.each<Leg>(['TO_FACILITY', 'AT_FACILITY'])('a bystander reporter (not confirmed) gets nulls on %s; the leg stays', async (leg) => {
    const { service } = setup([{ ...toJoni(false), leg }]);

    const [unit] = await service.getLatestUnitPositions(INCIDENT, asReporter);

    expectRedacted(unit, leg);
  });

  it('a reporter who claimed to be the patient but was not confirmed gets nulls; the claim is never read', async () => {
    const { service, prisma } = setup([toJoni(false)]);
    // What the reporter ticked on the SOS form: "it's me" and "I need help too".
    prisma.incident_patients.count.mockResolvedValue(1);
    prisma.incidentReporter.findUnique.mockResolvedValue({ user_id: REPORTER, reporter_status: 'NEEDS_HELP' } as any);

    const [unit] = await service.getLatestUnitPositions(INCIDENT, asReporter);

    expectRedacted(unit, 'TO_FACILITY');
    expect(prisma.incident_patients.count).not.toHaveBeenCalled();
    expect(prisma.incident_patients.findMany).not.toHaveBeenCalled();
    expect(prisma.incidentReporter.findUnique).toHaveBeenCalledWith({ where: { incident_id: INCIDENT }, select: { user_id: true } });
  });

  it('two units to two hospitals, reporter confirmed on one: the other unit is redacted', async () => {
    const { service } = setup([
      toJoni(true),
      { id: 'B', crew: 'crew-b', leg: 'TO_FACILITY', destination: malolos, confirmed: false },
    ]);

    const units = await service.getLatestUnitPositions(INCIDENT, asReporter);

    expect(units.find((u) => u.dispatchId === 'A')).toMatchObject({ destination: joni, route: routeFor(joni) });
    expectRedacted(units.find((u) => u.dispatchId === 'B'), 'TO_FACILITY');
    expect(JSON.stringify(units)).not.toContain(malolos.name);
  });

  it('the scene leg is unchanged for the reporter (position, route and ETA to the scene)', async () => {
    const { service } = setup([{ id: 'A', crew: 'crew-a', leg: 'TO_SCENE', destination: null, confirmed: false }]);

    const [unit] = await service.getLatestUnitPositions(INCIDENT, asReporter);

    expect(unit).toMatchObject({ leg: 'TO_SCENE', destination: null, route: routeFor(null), position: { lat: 14.81 } });
  });

  it.each([
    ['staff', { id: 'dispatcher-1', role: 'DISPATCHER' }, 'staff'],
    ['crew', { id: 'crew-b', role: 'RESPONDER' }, 'crew'],
    // A reporter who also crews a unit on the incident sees what the crew sees.
    ['the reporter who also crews a unit', { id: 'crew-b', role: 'RESPONDER' }, 'reporter'],
  ])('%s get full data on every unit', async (_label, actor, participation) => {
    const { service } = setup(
      [toJoni(false), { id: 'B', crew: 'crew-b', leg: 'TO_FACILITY', destination: malolos, confirmed: false }],
      { participation },
    );

    const units = await service.getLatestUnitPositions(INCIDENT, actor);

    expect(units.map((u) => u.destination)).toEqual([joni, malolos]);
    expect(units.every((u) => u.position !== null && u.route !== null)).toBe(true);
  });

  it('a guest report has no reporter to unlock anything; staff still get full data', async () => {
    const { service } = setup([toJoni(true)], { participation: 'staff', reporterUserId: null });

    const [unit] = await service.getLatestUnitPositions(INCIDENT, { id: 'dispatcher-1', role: 'DISPATCHER' });

    expect(unit).toMatchObject({ destination: joni });
  });

  it.each([
    ['reporter (confirmed)', asReporter, 'reporter', true],
    ['reporter (not confirmed)', asReporter, 'reporter', false],
    ['staff', { id: 'dispatcher-1', role: 'DISPATCHER' }, 'staff', false],
  ])('the %s response carries no patient identifier or responder name', async (_label, actor, participation, confirmed) => {
    const { service } = setup([toJoni(confirmed)], { participation });

    const json = JSON.stringify(await service.getLatestUnitPositions(INCIDENT, actor));

    expect(json).not.toMatch(/patientId|patient_id|patient_name|patientName|assessment|full_name|responder_name|phone/i);
  });

  describe('route source (C5)', () => {
    it('a cached route is served without routing inline', async () => {
      const { service, maps } = setup([{ id: 'A', crew: 'crew-a', leg: 'TO_SCENE', destination: null, confirmed: false }]);
      await service.getLatestUnitPositions(INCIDENT, asReporter);
      expect(maps.route).not.toHaveBeenCalled();
    });

    it('cache miss on TO_FACILITY: route null and no inline routing (the next job fills it)', async () => {
      const { service, maps } = setup([toJoni(true)], { cached: false });

      const [unit] = await service.getLatestUnitPositions(INCIDENT, asReporter);

      expect(unit).toMatchObject({ leg: 'TO_FACILITY', destination: joni, route: null, eta: NO_ETA });
      expect(maps.route).not.toHaveBeenCalled();
    });

    it('cache miss on TO_SCENE with a fix: routes inline to the scene', async () => {
      const { service, maps } = setup([{ id: 'A', crew: 'crew-a', leg: 'TO_SCENE', destination: null, confirmed: false }], { cached: false });

      const [unit] = await service.getLatestUnitPositions(INCIDENT, asReporter);

      expect(maps.route).toHaveBeenCalledWith({ lat: 14.81, lng: 120.95 }, { lat: 14.79, lng: 120.92 });
      expect(unit!.eta).toMatchObject({ seconds: 300, isEstimate: true });
      expect(unit!.route).toMatchObject({ durationSeconds: 300, isEstimate: true, stale: false });
    });

    it("a cached route for another hospital (destination changed) is not served", async () => {
      const { service, routeCache } = setup([toJoni(true)]);
      routeCache.get.mockResolvedValue({ leg: 'TO_FACILITY', destination: malolos, route: routeFor(malolos), fromFix: { lat: 0, lng: 0 } });

      const [unit] = await service.getLatestUnitPositions(INCIDENT, asReporter);

      expect(unit).toMatchObject({ destination: joni, route: null });
    });

    it('a redacted unit does not read the route cache at all', async () => {
      const { service, routeCache } = setup([toJoni(false)]);
      await service.getLatestUnitPositions(INCIDENT, asReporter);
      expect(routeCache.get).not.toHaveBeenCalled();
    });
  });
});
