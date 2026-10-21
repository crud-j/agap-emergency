import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { LocationsService } from '../../src/locations/locations.service';
import { MapsService } from '../../src/locations/maps/maps.service';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { IncidentParticipantService } from '../../src/realtime/incident-participant.service';

describe('LocationsService Bocaue bounds', () => {
  let service: LocationsService;
  const prismaMock = {
    incident_locations: { upsert: jest.fn() },
    location_history: { create: jest.fn() },
    dispatches: { findFirst: jest.fn() },
  };
  const realtimeMock = { incidentLocationUpdated: jest.fn(), notifyResponderLocationUpdated: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RealtimeService, useValue: realtimeMock },
        { provide: IncidentParticipantService, useValue: { assertParticipant: jest.fn() } },
        { provide: MapsService, useValue: { reverseGeocode: jest.fn(), route: jest.fn(), clientConfig: jest.fn() } },
        { provide: getQueueToken(QUEUE_NAMES.LOCATION_PROCESSING), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
  });

  it('rejects an out-of-bound capture before persisting it', async () => {
    await expect(
      service.capture({ latitude: 14.765, longitude: 120.906 }),
    ).rejects.toThrow('Location must be within Bocaue Municipality, Bulacan.');
  });

  it('rejects an out-of-bound responder update before persisting it', async () => {
    await expect(
      service.trackResponder(
        { incidentId: 'incident-id', latitude: 14.765, longitude: 120.906 },
        'responder-id',
      ),
    ).rejects.toThrow('Location must be within Bocaue Municipality, Bulacan.');
  });

  describe('trackResponder crew authorization', () => {
    const inBocaue = { incidentId: 'incident-id', latitude: 14.7993, longitude: 120.9266 };

    it('rejects a responder who is not crewed on the incident, without persisting or broadcasting', async () => {
      prismaMock.dispatches.findFirst.mockResolvedValue(null);

      await expect(service.trackResponder(inBocaue, 'responder-id')).rejects.toThrow(
        'Not an active responder for this incident',
      );
      expect(prismaMock.location_history.create).not.toHaveBeenCalled();
      expect(realtimeMock.notifyResponderLocationUpdated).not.toHaveBeenCalled();
    });

    it('persists and broadcasts for a crewed responder', async () => {
      // Crew check; no incident location, so the ETA enqueue is skipped.
      prismaMock.dispatches.findFirst.mockResolvedValueOnce({
        id: 'dispatch-id',
        resources: { call_sign: 'AMB-1' },
        incidents: { incident_locations: null },
      });
      prismaMock.location_history.create.mockResolvedValue({
        id: 'loc-id',
        recorded_at: new Date('2026-01-01T00:00:00Z'),
      });

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
      expect(realtimeMock.notifyResponderLocationUpdated).toHaveBeenCalledWith(
        'incident-id',
        expect.objectContaining({ responderId: 'responder-id', lat: 14.7993, lng: 120.9266 }),
      );
    });
  });
});
