import {
  AUDIENCE_CACHE_TTL_MS,
  TransportAudienceService,
  audienceRooms,
} from '../../src/incidents/transport/transport-audience.service';
import { RealtimeService } from '../../src/realtime/realtime.service';

/**
 * Plan §17 / C6 / C17 / C18: where a dispatch's leg-sensitive events go. Real
 * TransportAudienceService + real RealtimeService; only Prisma, the leg resolver
 * and the socket gateway are mocked, so the assertions are about actual rooms.
 */

const INCIDENT = 'incident-1';
const DISPATCH = 'dispatch-1';
const REPORTER = 'reporter-1';
const CREW = ['crew-1', 'crew-2'];
const hospital = { kind: 'FACILITY', name: 'Joni Villanueva General Hospital', latitude: 14.79679, longitude: 120.94358, locationVerified: true };

/** REPORTER_DESTINATION_SHARING_ENABLED as the ConfigService returns it. */
const configWith = (flag: string | undefined) => ({ get: jest.fn((key: string) => (key === 'REPORTER_DESTINATION_SHARING_ENABLED' ? flag : undefined)) });

function setup(
  opts: { leg?: 'TO_SCENE' | 'TO_FACILITY' | 'AT_FACILITY'; confirmed?: boolean; reporterUserId?: string | null; sharing?: string } = {},
) {
  const state = { leg: opts.leg ?? 'TO_FACILITY', confirmed: opts.confirmed ?? false };
  const prisma = {
    incidentReporter: {
      findUnique: jest.fn(async () => ({ user_id: opts.reporterUserId === undefined ? REPORTER : opts.reporterUserId })),
    },
    dispatches: {
      findMany: jest.fn(async () => [
        {
          id: DISPATCH,
          dispatch_crew: CREW.map((user_id) => ({ user_id })),
          transport_records: [{ reporter_patient_confirmed_at: state.confirmed ? new Date() : null }],
        },
      ]),
    },
  };
  const legs = {
    resolve: jest.fn(async () => ({
      leg: state.leg,
      target: null,
      destination: state.leg === 'TO_SCENE' ? null : hospital,
      transportId: 'tr-1',
      incidentId: INCIDENT,
    })),
  };
  const gateway = { emitToOps: jest.fn(), emitToIncident: jest.fn(), emitToUser: jest.fn() };
  // Most tests describe the behaviour with the launch switch on; the switch tests below turn it off.
  const audience = new TransportAudienceService(prisma as any, legs as any, configWith('sharing' in opts ? opts.sharing : 'true') as any);
  const realtime = new RealtimeService(gateway as any);
  return { state, prisma, legs, gateway, audience, realtime };
}

const location = { responderId: 'crew-1', dispatchId: DISPATCH, callSign: 'AMB-1', lat: 14.81, lng: 120.95, heading: null, speed: null, updatedAt: '2026-10-28T01:00:00Z' };
const usersOf = (gateway: { emitToUser: jest.Mock }) => gateway.emitToUser.mock.calls.map((c) => c[1]);

/** Sends one of each leg-sensitive event through the audience rule. */
async function emitAll(ctx: ReturnType<typeof setup>, leg?: 'TO_SCENE' | 'TO_FACILITY' | 'AT_FACILITY') {
  const rooms = await ctx.audience.roomsForDispatch(INCIDENT, DISPATCH, leg);
  ctx.realtime.responderLocation(INCIDENT, location, rooms);
  ctx.realtime.routeUpdated({ incidentId: INCIDENT, dispatchId: DISPATCH, leg: ctx.state.leg, destination: hospital, route: null }, rooms);
  ctx.realtime.notifyEtaUpdated(INCIDENT, { dispatchId: DISPATCH, etaSeconds: 300, isEstimate: true, calculatedAt: 'now' }, rooms);
  ctx.realtime.transportUpdated(
    { incidentId: INCIDENT, dispatchId: DISPATCH, transportId: 'tr-1', destination: { ...hospital, id: 'fac-1' }, changedAt: 'now' },
    rooms.userIds,
  );
  return rooms;
}

describe('REPORTER_DESTINATION_SHARING_ENABLED launch switch (C17)', () => {
  it.each([undefined, 'false', 'TRUE', '1', ''])(
    'flag %p: a stored crew confirmation never puts the reporter in the audience',
    async (flag) => {
      const ctx = setup({ confirmed: true, sharing: flag as string });

      await emitAll(ctx);

      expect(ctx.audience.reporterSharingEnabled()).toBe(false);
      expect(usersOf(ctx.gateway)).not.toContain(REPORTER);
      expect(ctx.gateway.emitToIncident).not.toHaveBeenCalled();
      await expect(ctx.audience.confirmedReporter(INCIDENT, DISPATCH)).resolves.toBeNull();
      const loaded = await ctx.audience.load(INCIDENT);
      expect(loaded.dispatches.get(DISPATCH)?.reporterConfirmedPatient).toBe(false);
    },
  );

  it("flag 'true': the confirmed reporter is in the audience (current behaviour)", async () => {
    const ctx = setup({ confirmed: true, sharing: 'true' });

    await emitAll(ctx);

    expect(ctx.audience.reporterSharingEnabled()).toBe(true);
    expect(usersOf(ctx.gateway).filter((u) => u === REPORTER)).toHaveLength(4);
    await expect(ctx.audience.confirmedReporter(INCIDENT, DISPATCH)).resolves.toBe(REPORTER);
  });
});

describe('Hospital-leg event audience (C6/C17/C18)', () => {
  it.each(['TO_FACILITY', 'AT_FACILITY'] as const)(
    '%s: nothing reaches the incident room; ops and each crew member get every event; an unconfirmed reporter gets none',
    async (leg) => {
      const ctx = setup({ leg });

      await emitAll(ctx);

      expect(ctx.gateway.emitToIncident).not.toHaveBeenCalled();
      expect(ctx.gateway.emitToOps).toHaveBeenCalledTimes(4);
      expect(usersOf(ctx.gateway).sort()).toEqual([...CREW, ...CREW, ...CREW, ...CREW].sort());
      expect(usersOf(ctx.gateway)).not.toContain(REPORTER);
    },
  );

  it("a crew-confirmed reporter's own room gets every event; still nothing in the incident room", async () => {
    const ctx = setup({ confirmed: true });

    await emitAll(ctx);

    expect(ctx.gateway.emitToIncident).not.toHaveBeenCalled();
    expect(usersOf(ctx.gateway).filter((u) => u === REPORTER)).toHaveLength(4);
    // The user copy of transport_updated has no facility id.
    const transportUpdated = ctx.gateway.emitToUser.mock.calls.find((c) => c[0] === 'incident.transport_updated' && c[1] === REPORTER)!;
    expect(transportUpdated[2].destination).not.toHaveProperty('id');
  });

  it('TO_SCENE: ops and the incident room, no user rooms (unchanged)', async () => {
    const ctx = setup({ leg: 'TO_SCENE', confirmed: true });

    const rooms = await emitAll(ctx);

    expect(rooms).toEqual({ incidentRoom: true, userIds: [] });
    expect(ctx.gateway.emitToIncident).toHaveBeenCalledTimes(3); // location, route, ETA (transport_updated never)
    expect(ctx.gateway.emitToUser).not.toHaveBeenCalled();
  });

  it('a guest report (no reporter account): no user-room emit is attempted for a reporter', async () => {
    const ctx = setup({ confirmed: true, reporterUserId: null });

    await emitAll(ctx);

    expect(usersOf(ctx.gateway).every((u) => CREW.includes(u))).toBe(true);
    expect(usersOf(ctx.gateway)).not.toContain(null);
  });

  it('a leg passed by the caller wins over the cached one', async () => {
    const ctx = setup({ leg: 'TO_SCENE' });
    await ctx.audience.roomsForDispatch(INCIDENT, DISPATCH); // caches TO_SCENE

    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH, 'TO_FACILITY')).resolves.toEqual({
      incidentRoom: false,
      userIds: CREW,
    });
  });

  it('fails closed: when the audience cannot be read, a hospital or unknown leg goes to ops only', async () => {
    const ctx = setup();
    ctx.prisma.dispatches.findMany.mockRejectedValue(new Error('db down'));

    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH)).resolves.toEqual({ incidentRoom: false, userIds: [] });
    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH, 'TO_FACILITY')).resolves.toEqual({ incidentRoom: false, userIds: [] });
    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH, 'TO_SCENE')).resolves.toEqual({ incidentRoom: true, userIds: [] });
    await expect(ctx.audience.confirmedReporter(INCIDENT, DISPATCH)).resolves.toBeNull();
  });

  it('an unknown dispatch on the hospital leg goes to ops only', () => {
    expect(audienceRooms({ reporterUserId: REPORTER, dispatches: new Map() }, 'other', 'TO_FACILITY')).toEqual({
      incidentRoom: false,
      userIds: [],
    });
    expect(audienceRooms({ reporterUserId: REPORTER, dispatches: new Map() }, 'other')).toEqual({
      incidentRoom: false,
      userIds: [],
    });
  });
});

describe('incident.transporting / incident.facility_arrival copies', () => {
  const transporting = {
    incidentId: INCIDENT, transportId: 'tr-1', dispatchId: DISPATCH, destinationId: 'fac-1',
    destination: hospital, patientId: 'patient-1', transportStartedAt: '2026-10-28T01:00:00Z',
  };
  const arrival = { incidentId: INCIDENT, transportId: 'tr-1', dispatchId: DISPATCH, destinationId: 'fac-1', destination: hospital, arrivedAt: '2026-10-28T01:10:00Z' };

  it('the incident room keeps the status-only copy; a confirmed reporter also gets the destination, never the patient or facility id', () => {
    const { realtime, gateway } = setup();

    realtime.incidentTransporting(transporting, REPORTER);
    realtime.facilityArrival(arrival, REPORTER);

    for (const [, , payload] of gateway.emitToIncident.mock.calls) {
      expect(JSON.stringify(payload)).not.toMatch(/patientId|destinationId|destination|Joni/);
    }
    const [transportingUser, arrivalUser] = gateway.emitToUser.mock.calls;
    expect(transportingUser).toEqual([
      'incident.transporting',
      REPORTER,
      { incidentId: INCIDENT, transportId: 'tr-1', dispatchId: DISPATCH, transportStartedAt: transporting.transportStartedAt, destination: hospital },
    ]);
    expect(arrivalUser).toEqual([
      'incident.facility_arrival',
      REPORTER,
      { incidentId: INCIDENT, transportId: 'tr-1', dispatchId: DISPATCH, arrivedAt: arrival.arrivedAt, destination: hospital },
    ]);
  });

  it('no confirmed reporter → no user copy', () => {
    const { realtime, gateway } = setup();
    realtime.incidentTransporting(transporting);
    realtime.facilityArrival(arrival, null);
    expect(gateway.emitToUser).not.toHaveBeenCalled();
  });
});

describe('Audience cache', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reuses one lookup per incident within the TTL (no query per GPS fix)', async () => {
    const ctx = setup();

    for (let i = 0; i < 5; i++) await ctx.audience.roomsForDispatch(INCIDENT, DISPATCH);

    expect(ctx.prisma.dispatches.findMany).toHaveBeenCalledTimes(1);
  });

  it('expires after the TTL', async () => {
    const ctx = setup();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await ctx.audience.roomsForDispatch(INCIDENT, DISPATCH);

    now.mockReturnValue(1_000_000 + AUDIENCE_CACHE_TTL_MS + 1);
    await ctx.audience.roomsForDispatch(INCIDENT, DISPATCH);

    expect(ctx.prisma.dispatches.findMany).toHaveBeenCalledTimes(2);
  });

  it('confirm then withdraw: after each invalidation the next emit uses the new audience', async () => {
    const ctx = setup();
    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH)).resolves.toEqual({ incidentRoom: false, userIds: CREW });

    ctx.state.confirmed = true; // the crew confirms (Prompt 08B endpoint) …
    ctx.audience.invalidate(INCIDENT); // … and TransportService drops the entry
    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH)).resolves.toEqual({ incidentRoom: false, userIds: [...CREW, REPORTER] });

    ctx.state.confirmed = false;
    ctx.audience.invalidate(INCIDENT);
    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH)).resolves.toEqual({ incidentRoom: false, userIds: CREW });
  });

  it('transport start: after invalidation the next fix stops going to the incident room', async () => {
    const ctx = setup({ leg: 'TO_SCENE' });
    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH)).resolves.toMatchObject({ incidentRoom: true });

    ctx.state.leg = 'TO_FACILITY';
    ctx.audience.invalidate(INCIDENT);

    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH)).resolves.toMatchObject({ incidentRoom: false });
  });

  it('a lookup that overlapped an invalidation is not cached (it may predate the change)', async () => {
    const ctx = setup({ leg: 'TO_SCENE' });
    let release!: () => void;
    ctx.prisma.dispatches.findMany.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve([{ id: DISPATCH, dispatch_crew: CREW.map((user_id) => ({ user_id })), transport_records: [] }] as any);
        }),
    );

    const stale = ctx.audience.roomsForDispatch(INCIDENT, DISPATCH); // reads before the transport starts
    await new Promise((r) => setImmediate(r));
    ctx.state.leg = 'TO_FACILITY';
    ctx.audience.invalidate(INCIDENT); // the transport committed meanwhile
    release();
    await stale;

    await expect(ctx.audience.roomsForDispatch(INCIDENT, DISPATCH)).resolves.toMatchObject({ incidentRoom: false });
    expect(ctx.prisma.dispatches.findMany).toHaveBeenCalledTimes(2);
  });

  it('the uncached load always reads the database', async () => {
    const ctx = setup();
    await ctx.audience.load(INCIDENT);
    await ctx.audience.load(INCIDENT);
    expect(ctx.prisma.dispatches.findMany).toHaveBeenCalledTimes(2);
  });
});
