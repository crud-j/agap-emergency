import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { LocationsService } from '../../src/locations/locations.service';
import { MapsService } from '../../src/locations/maps/maps.service';
import { RouteCacheService } from '../../src/locations/route-cache.service';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { IncidentParticipantService } from '../../src/realtime/incident-participant.service';
import { TransportAudienceService } from '../../src/incidents/transport/transport-audience.service';
import { atFacilityTransportWhere, openTransportWhere } from '../../src/incidents/transport/open-transport';
import { RespondersService } from '../../src/responders/responders.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';

const OUT_OF_BOUNDS = 'Location must be within Bocaue Municipality, Bulacan.';
/** Outside Bocaue, inside the Bulacan service area (Malolos). */
const MALOLOS = { latitude: 14.8433, longitude: 120.8114 };
/** Outside the service area (Manila). */
const MANILA = { latitude: 14.5995, longitude: 120.9842 };
const BOCAUE = { latitude: 14.7993, longitude: 120.9266 };
const CREWED_ON_INCIDENT = {
  incident_id: 'incident-id',
  dispatches: { dispatch_crew: { some: { user_id: 'responder-id' } } },
};
/** The geofence's one query: open transport OR arrived and the incident not RESOLVED/CLOSED. */
const AREA_WHERE = {
  where: { OR: [openTransportWhere(CREWED_ON_INCIDENT), atFacilityTransportWhere(CREWED_ON_INCIDENT)] },
};

describe('LocationsService Bocaue bounds', () => {
  let service: LocationsService;
  const prismaMock = {
    incident_locations: { upsert: jest.fn() },
    location_history: { create: jest.fn() },
    dispatches: { findFirst: jest.fn() },
    transportRecord: { count: jest.fn() },
  };
  const realtimeMock = { incidentLocationUpdated: jest.fn(), notifyResponderLocationUpdated: jest.fn() };
  const mapsMock = { reverseGeocode: jest.fn(), route: jest.fn(), clientConfig: jest.fn() };
  const audienceMock = { roomsForDispatch: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    audienceMock.roomsForDispatch.mockResolvedValue({ incidentRoom: true, userIds: [] });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RealtimeService, useValue: realtimeMock },
        { provide: IncidentParticipantService, useValue: { assertParticipant: jest.fn() } },
        { provide: MapsService, useValue: mapsMock },
        { provide: getQueueToken(QUEUE_NAMES.LOCATION_PROCESSING), useValue: { add: jest.fn() } },
        { provide: TransportAudienceService, useValue: audienceMock },
        { provide: RouteCacheService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
  });

  function crewed() {
    prismaMock.dispatches.findFirst.mockResolvedValueOnce({
      id: 'dispatch-id',
      resources: { call_sign: 'AMB-1' },
      incidents: { incident_locations: null },
    });
    prismaMock.location_history.create.mockResolvedValue({ id: 'loc-id', recorded_at: new Date('2026-01-01T00:00:00Z') });
  }

  it('rejects an out-of-bound capture before persisting it (intake stays Bocaue-only)', async () => {
    await expect(service.capture({ ...MALOLOS })).rejects.toThrow(OUT_OF_BOUNDS);
    expect(prismaMock.incident_locations.upsert).not.toHaveBeenCalled();
  });

  it('reverse geocoding stays Bocaue-only', async () => {
    await expect(service.reverseGeocode(MALOLOS.latitude, MALOLOS.longitude)).rejects.toThrow(OUT_OF_BOUNDS);
    expect(mapsMock.reverseGeocode).not.toHaveBeenCalled();
  });

  describe('trackResponder outside Bocaue (G4)', () => {
    it('inside the service area with an open transport on a dispatch the user crews → accepted', async () => {
      prismaMock.transportRecord.count.mockResolvedValue(1);
      crewed();

      await service.trackResponder({ incidentId: 'incident-id', ...MALOLOS }, 'responder-id');

      expect(prismaMock.transportRecord.count).toHaveBeenCalledWith(AREA_WHERE);
      expect(prismaMock.location_history.create).toHaveBeenCalledTimes(1);
    });

    it('the filter accepts an open transport, or an arrived one while the incident is not RESOLVED/CLOSED', () => {
      expect(openTransportWhere(CREWED_ON_INCIDENT)).toEqual({
        ...CREWED_ON_INCIDENT,
        arrived_at: null,
        incidents: { status: 'TRANSPORTING' },
      });
      expect(atFacilityTransportWhere(CREWED_ON_INCIDENT)).toEqual({
        ...CREWED_ON_INCIDENT,
        arrived_at: { not: null },
        incidents: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
      });
    });

    it('at the hospital (arrived, incident not finished) inside the service area → accepted', async () => {
      // The count matches the arrived transport through the at-facility branch of AREA_WHERE.
      prismaMock.transportRecord.count.mockResolvedValue(1);
      crewed();

      await service.trackResponder({ incidentId: 'incident-id', ...MALOLOS }, 'responder-id');

      expect(prismaMock.transportRecord.count).toHaveBeenCalledWith(AREA_WHERE);
      expect(prismaMock.location_history.create).toHaveBeenCalledTimes(1);
    });

    it('inside the service area without an open transport → 400, before persisting', async () => {
      prismaMock.transportRecord.count.mockResolvedValue(0);

      await expect(
        service.trackResponder({ incidentId: 'incident-id', ...MALOLOS }, 'responder-id'),
      ).rejects.toThrow(new BadRequestException(OUT_OF_BOUNDS));
      expect(prismaMock.dispatches.findFirst).not.toHaveBeenCalled();
      expect(prismaMock.location_history.create).not.toHaveBeenCalled();
    });

    it('outside the service area → 400 even with an open transport, without querying', async () => {
      prismaMock.transportRecord.count.mockResolvedValue(1);

      await expect(
        service.trackResponder({ incidentId: 'incident-id', ...MANILA }, 'responder-id'),
      ).rejects.toThrow(OUT_OF_BOUNDS);
      expect(prismaMock.transportRecord.count).not.toHaveBeenCalled();
      expect(prismaMock.location_history.create).not.toHaveBeenCalled();
    });

    it('inside Bocaue → accepted without the open-transport query (as before)', async () => {
      crewed();

      await service.trackResponder({ incidentId: 'incident-id', ...BOCAUE }, 'responder-id');

      expect(prismaMock.transportRecord.count).not.toHaveBeenCalled();
      expect(prismaMock.location_history.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /locations/route uses the service area', () => {
    it('routes to a hospital outside Bocaue but inside the service area', async () => {
      mapsMock.route.mockResolvedValue({ durationSeconds: 900 });

      await service.getRouteBetween(BOCAUE.latitude, BOCAUE.longitude, MALOLOS.latitude, MALOLOS.longitude);

      expect(mapsMock.route).toHaveBeenCalledWith(
        { lat: BOCAUE.latitude, lng: BOCAUE.longitude },
        { lat: MALOLOS.latitude, lng: MALOLOS.longitude },
      );
    });

    it.each([
      ['destination', BOCAUE, MANILA],
      ['origin', MANILA, BOCAUE],
    ])('refuses a %s outside the service area', (_label, from, to) => {
      expect(() => service.getRouteBetween(from.latitude, from.longitude, to.latitude, to.longitude)).toThrow(
        new BadRequestException('Route points must be within the service area.'),
      );
      expect(mapsMock.route).not.toHaveBeenCalled();
    });
  });

  describe('trackResponder crew authorization', () => {
    const inBocaue = { incidentId: 'incident-id', ...BOCAUE };

    it('rejects a responder who is not crewed on the incident, without persisting or broadcasting', async () => {
      prismaMock.dispatches.findFirst.mockResolvedValue(null);

      await expect(service.trackResponder(inBocaue, 'responder-id')).rejects.toThrow(
        'Not an active responder for this incident',
      );
      expect(prismaMock.location_history.create).not.toHaveBeenCalled();
      expect(realtimeMock.notifyResponderLocationUpdated).not.toHaveBeenCalled();
    });

    it('persists and broadcasts for a crewed responder, to the rooms the audience rule picks', async () => {
      crewed();

      await service.trackResponder(inBocaue, 'responder-id');

      expect(prismaMock.dispatches.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            incident_id: 'incident-id',
            dispatch_crew: { some: { user_id: 'responder-id' } },
          }),
        }),
      );
      expect(prismaMock.location_history.create).toHaveBeenCalledTimes(1);
      expect(audienceMock.roomsForDispatch).toHaveBeenCalledWith('incident-id', 'dispatch-id');
      expect(realtimeMock.notifyResponderLocationUpdated).toHaveBeenCalledWith(
        'incident-id',
        expect.objectContaining({ responderId: 'responder-id', lat: 14.7993, lng: 120.9266 }),
        { incidentRoom: true, userIds: [] },
      );
    });
  });
});

describe('RespondersService.pushLocation bounds (same rule as /locations/track)', () => {
  function build(openTransports: number) {
    const prisma = {
      transportRecord: { count: jest.fn().mockResolvedValue(openTransports) },
      dispatches: { findFirst: jest.fn().mockResolvedValue({ id: 'dispatch-id', resources: { call_sign: 'AMB-1' } }) },
      location_history: { create: jest.fn().mockResolvedValue({ id: 'loc-id', recorded_at: new Date() }) },
    };
    const realtime = { notifyResponderLocationUpdated: jest.fn() };
    const audience = { roomsForDispatch: jest.fn().mockResolvedValue({ incidentRoom: false, userIds: ['responder-id'] }) };
    const service = new RespondersService(
      prisma as any, realtime as any, {} as any, new IncidentStatusService(), {} as any, audience as any,
    );
    return { service, prisma, realtime };
  }

  it('outside Bocaue without an open transport → 400, before persisting', async () => {
    const { service, prisma } = build(0);
    await expect(service.pushLocation({ incidentId: 'incident-id', ...MALOLOS }, 'responder-id')).rejects.toThrow(
      OUT_OF_BOUNDS,
    );
    expect(prisma.location_history.create).not.toHaveBeenCalled();
  });

  it('outside Bocaue with an open transport → accepted and sent to the hospital-leg rooms', async () => {
    const { service, prisma, realtime } = build(1);
    await service.pushLocation({ incidentId: 'incident-id', ...MALOLOS }, 'responder-id');
    expect(prisma.location_history.create).toHaveBeenCalledTimes(1);
    expect(realtime.notifyResponderLocationUpdated.mock.calls[0][2]).toEqual({ incidentRoom: false, userIds: ['responder-id'] });
  });

  it('outside Bocaue at the hospital (arrived, incident not finished) → accepted, same filter', async () => {
    const { service, prisma } = build(1);
    await service.pushLocation({ incidentId: 'incident-id', ...MALOLOS }, 'responder-id');
    expect(prisma.transportRecord.count).toHaveBeenCalledWith(AREA_WHERE);
    expect(prisma.location_history.create).toHaveBeenCalledTimes(1);
  });

  it('outside the service area → 400', async () => {
    const { service } = build(1);
    await expect(service.pushLocation({ incidentId: 'incident-id', ...MANILA }, 'responder-id')).rejects.toThrow(
      OUT_OF_BOUNDS,
    );
  });
});
