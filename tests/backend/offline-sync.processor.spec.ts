import 'reflect-metadata';
import { OfflineSyncProcessor, OfflineSyncBatchJobData } from '@backend/jobs/processors/offline-sync.processor';
import { EmergencyAlertsService } from '@backend/emergency-alerts/emergency-alerts.service';
import { LocationsService } from '@backend/locations/locations.service';
import { PrismaService } from '@backend/common/prisma/prisma.service';
import type { Job } from 'bullmq';

describe('OfflineSyncProcessor', () => {
  let processor: OfflineSyncProcessor;
  let createFromSos: jest.Mock;
  let trackResponder: jest.Mock;
  let updateMany: jest.Mock;
  let mockPrisma: { offline_event_queue: { updateMany: jest.Mock } };

  function makeJob(
    events: OfflineSyncBatchJobData['events'],
  ): Job<OfflineSyncBatchJobData> {
    return { data: { events } } as unknown as Job<OfflineSyncBatchJobData>;
  }

  beforeEach(() => {
    createFromSos = jest.fn().mockResolvedValue({ id: 'inc-1', public_reference: 'INC-2026-000001' });
    trackResponder = jest.fn().mockResolvedValue(undefined);
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    mockPrisma = { offline_event_queue: { updateMany } };

    processor = new OfflineSyncProcessor(
      mockPrisma as unknown as PrismaService,
      { createFromSos } as unknown as EmergencyAlertsService,
      { trackResponder } as unknown as LocationsService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── INCIDENT_SUBMIT ────────────────────────────────────────────────────────

  describe('INCIDENT_SUBMIT events', () => {
    it('calls createFromSos and injects clientEventId as the idempotency key', async () => {
      const result = await processor.process(
        makeJob([
          {
            client_event_id: 'evt-submit-001',
            type: 'INCIDENT_SUBMIT',
            payload: { type: 'MEDICAL', reporter: { type: 'REGISTERED_CITIZEN' } },
          },
        ]),
      );

      expect(createFromSos).toHaveBeenCalledTimes(1);
      expect(createFromSos).toHaveBeenCalledWith(
        expect.objectContaining({ clientEventId: 'evt-submit-001' }),
        'SOS_BUTTON',
        undefined,
      );
      expect(result).toEqual({ processed: 1, failed: 0 });
      // DB record must be marked SYNCED after successful processing
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ client_event_id: 'evt-submit-001', sync_status: 'PENDING' }),
          data: expect.objectContaining({ sync_status: 'SYNCED' }),
        }),
      );
    });

    it('passes userId from payload as the third argument to createFromSos', async () => {
      await processor.process(
        makeJob([
          {
            client_event_id: 'evt-submit-002',
            type: 'INCIDENT_SUBMIT',
            payload: { type: 'FIRE', userId: 'citizen-abc' },
          },
        ]),
      );

      expect(createFromSos).toHaveBeenCalledWith(
        expect.objectContaining({ clientEventId: 'evt-submit-002' }),
        'SOS_BUTTON',
        'citizen-abc',
      );
    });

    it('falls back to undefined userId when payload has no userId field', async () => {
      await processor.process(
        makeJob([
          {
            client_event_id: 'evt-submit-003',
            type: 'INCIDENT_SUBMIT',
            payload: { type: 'FLOOD' },
          },
        ]),
      );

      expect(createFromSos).toHaveBeenCalledWith(
        expect.anything(),
        'SOS_BUTTON',
        undefined,
      );
    });

    it('increments failed and continues the batch when createFromSos throws', async () => {
      createFromSos
        .mockRejectedValueOnce(new Error('DB connection lost'))
        .mockResolvedValue({ id: 'inc-2' });

      const result = await processor.process(
        makeJob([
          { client_event_id: 'evt-fail-1', type: 'INCIDENT_SUBMIT', payload: {} },
          { client_event_id: 'evt-ok-1', type: 'INCIDENT_SUBMIT', payload: {} },
        ]),
      );

      expect(createFromSos).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ processed: 1, failed: 1 });
      // Failure event must be marked FAILED in DB
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ client_event_id: 'evt-fail-1' }),
          data: expect.objectContaining({ sync_status: 'FAILED' }),
        }),
      );
      // Successful event must be marked SYNCED in DB
      expect(updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ client_event_id: 'evt-ok-1' }),
          data: expect.objectContaining({ sync_status: 'SYNCED' }),
        }),
      );
    });

    it('does NOT fall through to the default warn branch (the pre-fix bug)', async () => {
      const warnSpy = jest.spyOn(processor['logger'], 'warn');

      await processor.process(
        makeJob([
          { client_event_id: 'evt-submit-004', type: 'INCIDENT_SUBMIT', payload: {} },
        ]),
      );

      expect(warnSpy).not.toHaveBeenCalled();
      expect(createFromSos).toHaveBeenCalledTimes(1);
    });
  });

  // ── SOS ────────────────────────────────────────────────────────────────────

  describe('SOS events', () => {
    it('calls createFromSos — regression guard on the original case', async () => {
      const result = await processor.process(
        makeJob([
          {
            client_event_id: 'evt-sos-001',
            type: 'SOS',
            payload: { type: 'ROAD_ACCIDENT' },
          },
        ]),
      );

      expect(createFromSos).toHaveBeenCalledTimes(1);
      expect(createFromSos).toHaveBeenCalledWith(
        expect.objectContaining({ clientEventId: 'evt-sos-001' }),
        'SOS_BUTTON',
        undefined,
      );
      expect(result).toEqual({ processed: 1, failed: 0 });
    });
  });

  // ── LOCATION_UPDATE ────────────────────────────────────────────────────────

  describe('LOCATION_UPDATE events', () => {
    it('calls trackResponder with the raw payload and userId', async () => {
      const payload = { lat: 14.79, lng: 120.88, userId: 'responder-1' };

      const result = await processor.process(
        makeJob([{ client_event_id: 'evt-loc-001', type: 'LOCATION_UPDATE', payload }]),
      );

      expect(trackResponder).toHaveBeenCalledWith(payload, 'responder-1');
      expect(createFromSos).not.toHaveBeenCalled();
      expect(result).toEqual({ processed: 1, failed: 0 });
    });
  });

  // ── STATUS_UPDATE ──────────────────────────────────────────────────────────

  describe('STATUS_UPDATE events', () => {
    it('skips without calling any downstream service', async () => {
      const result = await processor.process(
        makeJob([
          {
            client_event_id: 'evt-status-001',
            type: 'STATUS_UPDATE',
            payload: { status: 'ON_SCENE' },
          },
        ]),
      );

      expect(createFromSos).not.toHaveBeenCalled();
      expect(trackResponder).not.toHaveBeenCalled();
      expect(result).toEqual({ processed: 1, failed: 0 });
    });
  });

  // ── Unknown types ──────────────────────────────────────────────────────────

  describe('unknown event types', () => {
    it('logs a warning and calls no service', async () => {
      const warnSpy = jest.spyOn(processor['logger'], 'warn');

      const result = await processor.process(
        makeJob([
          {
            client_event_id: 'evt-unknown-001',
            type: 'TOTALLY_UNKNOWN',
            payload: {},
          },
        ]),
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('TOTALLY_UNKNOWN'),
      );
      expect(createFromSos).not.toHaveBeenCalled();
      expect(trackResponder).not.toHaveBeenCalled();
      // warn branch does not throw, so it still counts as processed
      expect(result).toEqual({ processed: 1, failed: 0 });
    });
  });

  // ── Mixed batch ────────────────────────────────────────────────────────────

  describe('mixed batch', () => {
    it('routes each event type correctly and returns accurate counts', async () => {
      const result = await processor.process(
        makeJob([
          { client_event_id: 'b-1', type: 'INCIDENT_SUBMIT', payload: { type: 'MEDICAL' } },
          { client_event_id: 'b-2', type: 'SOS', payload: { type: 'FIRE' } },
          { client_event_id: 'b-3', type: 'LOCATION_UPDATE', payload: { lat: 14.0, lng: 121.0, userId: 'u-1' } },
          { client_event_id: 'b-4', type: 'STATUS_UPDATE', payload: {} },
        ]),
      );

      expect(createFromSos).toHaveBeenCalledTimes(2); // INCIDENT_SUBMIT + SOS
      expect(trackResponder).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ processed: 4, failed: 0 });
    });

    it('continues processing remaining events after one fails', async () => {
      createFromSos.mockRejectedValueOnce(new Error('transient error'));

      const result = await processor.process(
        makeJob([
          { client_event_id: 'b-fail', type: 'INCIDENT_SUBMIT', payload: {} },
          { client_event_id: 'b-ok-loc', type: 'LOCATION_UPDATE', payload: { userId: 'u-1' } },
          { client_event_id: 'b-ok-sos', type: 'SOS', payload: {} },
        ]),
      );

      expect(result).toEqual({ processed: 2, failed: 1 });
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns zero counts immediately for an empty batch', async () => {
      const result = await processor.process(makeJob([]));
      expect(result).toEqual({ processed: 0, failed: 0 });
      expect(createFromSos).not.toHaveBeenCalled();
      expect(trackResponder).not.toHaveBeenCalled();
    });

    it('handles a job with no events property gracefully', async () => {
      const job = { data: {} } as unknown as Job<OfflineSyncBatchJobData>;
      const result = await processor.process(job);
      expect(result).toEqual({ processed: 0, failed: 0 });
    });
  });
});
