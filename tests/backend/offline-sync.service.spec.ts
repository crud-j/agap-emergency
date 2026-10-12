import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { OfflineSyncService } from '@backend/offline-sync/offline-sync.service';
import { PrismaService } from '@backend/common/prisma/prisma.service';
import { QUEUE_NAMES } from '@agap/shared';
import { createMockPrisma } from './helpers/prisma.mock';

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockSyncQueue: { add: jest.Mock; addBulk: jest.Mock };

  const mockQueueRecord = {
    id: 'sync-rec-1',
    client_event_id: 'offline-evt-1',
    sync_status: 'PENDING',
    created_at: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockSyncQueue = {
      add: jest.fn().mockResolvedValue({}),
      addBulk: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfflineSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken(QUEUE_NAMES.OFFLINE_SYNC), useValue: mockSyncQueue },
      ],
    }).compile();

    service = module.get<OfflineSyncService>(OfflineSyncService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── queueSync ─────────────────────────────────────────────────────────────

  describe('queueSync', () => {
    it('creates a queue record and enqueues a sync job for a new idempotency key', async () => {
      mockPrisma.offline_event_queue.findUnique.mockResolvedValue(null);
      mockPrisma.offline_event_queue.create.mockResolvedValue(mockQueueRecord);

      const result = await service.queueSync({
        idempotencyKey: 'offline-evt-new',
        deviceId: 'device-abc',
        payload: { incidentType: 'MEDICAL', lat: 14.79, lng: 120.88 },
      });

      expect(result.queued).toBe(true);
      expect(result.syncRecordId).toBe('sync-rec-1');
      expect(mockPrisma.offline_event_queue.create).toHaveBeenCalled();
      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync',
        expect.objectContaining({ idempotencyKey: 'offline-evt-new' }),
        expect.objectContaining({ attempts: expect.any(Number) }),
      );
    });

    it('returns the existing record without re-queuing for a duplicate idempotency key', async () => {
      mockPrisma.offline_event_queue.findUnique.mockResolvedValue(mockQueueRecord);

      const result = await service.queueSync({
        idempotencyKey: 'offline-evt-1',
        payload: { incidentType: 'MEDICAL' },
      });

      expect(result.queued).toBe(false);
      expect(result.syncRecordId).toBe('sync-rec-1');
      expect(mockPrisma.offline_event_queue.create).not.toHaveBeenCalled();
      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('configures exponential backoff retry on the queued job', async () => {
      mockPrisma.offline_event_queue.findUnique.mockResolvedValue(null);
      mockPrisma.offline_event_queue.create.mockResolvedValue(mockQueueRecord);

      await service.queueSync({
        idempotencyKey: 'offline-evt-retry',
        payload: { incidentType: 'FIRE' },
      });

      const queueOptions = mockSyncQueue.add.mock.calls[0]?.[2] as any;
      expect(queueOptions.backoff?.type).toBe('exponential');
    });

    it('stores the device id alongside the payload for diagnostics', async () => {
      mockPrisma.offline_event_queue.findUnique.mockResolvedValue(null);
      mockPrisma.offline_event_queue.create.mockResolvedValue(mockQueueRecord);

      await service.queueSync({
        idempotencyKey: 'offline-evt-device',
        deviceId: 'device-xyz',
        payload: { incidentType: 'FLOOD' },
      });

      const createCall = mockPrisma.offline_event_queue.create.mock.calls[0]?.[0] as any;
      expect(createCall.data.device_info).toEqual({ deviceId: 'device-xyz' });
    });
  });

  // ── flush ──────────────────────────────────────────────────────────────────

  describe('flush', () => {
    it('accepts a new INCIDENT_SUBMIT event and enqueues a batch job', async () => {
      mockPrisma.offline_event_queue.findUnique.mockResolvedValue(null);
      mockPrisma.offline_event_queue.create.mockResolvedValue(mockQueueRecord);

      const result = await service.flush(
        [
          {
            clientEventId: 'flush-evt-001',
            type: 'INCIDENT_SUBMIT',
            payload: { type: 'MEDICAL', reporter: { type: 'REGISTERED_CITIZEN' } },
          },
        ],
        'user-citizen-1',
      );

      expect(result.accepted).toBe(1);
      expect(result.results[0]).toMatchObject({
        clientEventId: 'flush-evt-001',
        status: 'QUEUED',
      });
      expect(mockSyncQueue.add).toHaveBeenCalledWith(
        'sync',
        expect.objectContaining({
          events: expect.arrayContaining([
            expect.objectContaining({ client_event_id: 'flush-evt-001', type: 'INCIDENT_SUBMIT' }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('rejects a duplicate clientEventId without re-enqueuing', async () => {
      mockPrisma.offline_event_queue.findUnique.mockResolvedValue(mockQueueRecord);

      const result = await service.flush([
        {
          clientEventId: 'flush-evt-001',
          type: 'INCIDENT_SUBMIT',
          payload: {},
        },
      ]);

      expect(result.accepted).toBe(0);
      expect(result.results[0]).toMatchObject({
        clientEventId: 'flush-evt-001',
        status: 'DUPLICATE_REJECTED',
      });
      expect(mockPrisma.offline_event_queue.create).not.toHaveBeenCalled();
      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('handles a mixed batch: new event accepted, duplicate rejected, one BullMQ job for new events only', async () => {
      mockPrisma.offline_event_queue.findUnique
        .mockResolvedValueOnce(null)            // first event: new
        .mockResolvedValueOnce(mockQueueRecord); // second event: duplicate

      mockPrisma.offline_event_queue.create.mockResolvedValue(mockQueueRecord);

      const result = await service.flush([
        { clientEventId: 'flush-new-1', type: 'INCIDENT_SUBMIT', payload: {} },
        { clientEventId: 'flush-dup-1', type: 'INCIDENT_SUBMIT', payload: {} },
      ]);

      expect(result.accepted).toBe(1);
      expect(result.results).toEqual([
        expect.objectContaining({ clientEventId: 'flush-new-1', status: 'QUEUED' }),
        expect.objectContaining({ clientEventId: 'flush-dup-1', status: 'DUPLICATE_REJECTED' }),
      ]);
      // BullMQ job contains only the new event
      const jobPayload = mockSyncQueue.add.mock.calls[0]?.[1] as any;
      expect(jobPayload.events).toHaveLength(1);
      expect(jobPayload.events[0].client_event_id).toBe('flush-new-1');
    });

    it('does not call syncQueue.add when all events are duplicates', async () => {
      mockPrisma.offline_event_queue.findUnique.mockResolvedValue(mockQueueRecord);

      await service.flush([
        { clientEventId: 'dup-a', type: 'INCIDENT_SUBMIT', payload: {} },
        { clientEventId: 'dup-b', type: 'INCIDENT_SUBMIT', payload: {} },
      ]);

      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });

    it('merges userId into each batch event payload for processor use', async () => {
      mockPrisma.offline_event_queue.findUnique.mockResolvedValue(null);
      mockPrisma.offline_event_queue.create.mockResolvedValue(mockQueueRecord);

      await service.flush(
        [{ clientEventId: 'flush-user-1', type: 'INCIDENT_SUBMIT', payload: { type: 'FIRE' } }],
        'citizen-xyz',
      );

      const jobPayload = mockSyncQueue.add.mock.calls[0]?.[1] as any;
      expect(jobPayload.events[0].payload.userId).toBe('citizen-xyz');
    });

    it('returns accepted: 0 and no BullMQ job for an empty events array', async () => {
      const result = await service.flush([]);
      expect(result).toEqual({ accepted: 0, results: [] });
      expect(mockSyncQueue.add).not.toHaveBeenCalled();
    });
  });
});
