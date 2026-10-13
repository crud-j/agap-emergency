import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { LocationsService } from '../../src/locations/locations.service';
import { MapsService } from '../../src/locations/maps/maps.service';
import { RealtimeService } from '../../src/realtime/realtime.service';

describe('LocationsService Bocaue bounds', () => {
  let service: LocationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        { provide: PrismaService, useValue: { incident_locations: { upsert: jest.fn() }, location_history: { create: jest.fn() } } },
        { provide: RealtimeService, useValue: { incidentLocationUpdated: jest.fn(), notifyResponderLocationUpdated: jest.fn() } },
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
});
