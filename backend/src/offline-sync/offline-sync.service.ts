import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { QUEUE_NAMES, MAX_OFFLINE_RETRY_ATTEMPTS, OFFLINE_RETRY_BASE_DELAY_MS } from '@agap/shared';
import type { OfflineSyncJobData } from '../jobs/processors/offline-sync.processor';

@Injectable()
export class OfflineSyncService {
  private readonly logger = new Logger(OfflineSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.OFFLINE_SYNC) private readonly syncQueue: Queue,
  ) {}

  /**
   * Queue an offline-originated incident submission for processing.
   * Idempotency key prevents duplicate incidents from repeated retries.
   */
  async queueSync(params: {
    idempotencyKey: string;
    deviceId?: string;
    payload: Record<string, unknown>;
  }): Promise<{ syncRecordId: string; queued: boolean }> {
    const existing = await this.prisma.offline_event_queue.findUnique({
      where: { client_event_id: params.idempotencyKey },
    });

    if (existing) {
      this.logger.log(`Duplicate offline sync submission for key ${params.idempotencyKey}`);
      return { syncRecordId: existing.id, queued: false };
    }

    const record = await this.prisma.offline_event_queue.create({
      data: {
        client_event_id: params.idempotencyKey,
        ...(params.deviceId !== undefined && { device_info: { deviceId: params.deviceId } }),
        payload: params.payload as any,
        sync_status: 'PENDING',
        event_type: 'INCIDENT_SUBMIT',
        queued_at_device: new Date(),
      } as any,
    });

    const jobData: OfflineSyncJobData = {
      syncRecordId: record.id,
      idempotencyKey: params.idempotencyKey,
      payload: params.payload,
      attempt: 0,
    };

    await this.syncQueue.add('sync', jobData, {
      attempts: MAX_OFFLINE_RETRY_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: OFFLINE_RETRY_BASE_DELAY_MS,
      },
    });

    this.logger.log(`Queued offline sync for key ${params.idempotencyKey}`);
    return { syncRecordId: record.id, queued: true };
  }

  /**
   * Flush a batch of offline events. Each event is deduplicated by client_event_id.
   * All new events are dispatched as a single BullMQ batch job so the processor
   * can replay them in order and report per-event success/failure.
   */
  async syncBatch(
    events: {
      clientEventId: string;
      eventType: string;
      payload: Record<string, unknown>;
      queuedAtDevice: string | Date;
    }[],
    userId?: string,
  ) {
    const results: { clientEventId: string; status: string; syncRecordId?: string }[] = [];
    const batchEvents: Array<{ client_event_id: string; type: string; payload: Record<string, unknown> }> = [];

    for (const event of events) {
      const existing = await this.prisma.offline_event_queue.findUnique({
        where: { client_event_id: event.clientEventId },
      });
      if (existing) {
        results.push({
          clientEventId: event.clientEventId,
          status: 'DUPLICATE_REJECTED',
          syncRecordId: existing.id,
        });
        continue;
      }

      const record = await this.prisma.offline_event_queue.create({
        data: {
          client_event_id: event.clientEventId,
          user_id: userId ?? null,
          event_type: event.eventType,
          payload: event.payload as any,
          sync_status: 'PENDING',
          queued_at_device: new Date(event.queuedAtDevice),
        },
      });

      batchEvents.push({
        client_event_id: event.clientEventId,
        type: event.eventType,
        payload: { ...event.payload, ...(userId !== undefined && { userId }) },
      });

      results.push({
        clientEventId: event.clientEventId,
        status: 'PENDING',
        syncRecordId: record.id,
      });
    }

    if (batchEvents.length > 0) {
      await this.syncQueue.add(
        'sync',
        { events: batchEvents },
        {
          attempts: MAX_OFFLINE_RETRY_ATTEMPTS,
          backoff: { type: 'exponential', delay: OFFLINE_RETRY_BASE_DELAY_MS },
        },
      );
    }

    return { accepted: results.length, results };
  }

  /**
   * Direct batch flush from mobile clients using the canonical snake_case event format.
   * Deduplicated by client_event_id; emits a single BullMQ job for the whole batch.
   */
  async flush(
    events: Array<{ clientEventId: string; type: string; payload: Record<string, unknown> }>,
    userId?: string,
  ) {
    const results: { clientEventId: string; status: string }[] = [];
    const batchEvents: Array<{ client_event_id: string; type: string; payload: Record<string, unknown> }> = [];

    for (const event of events) {
      const existing = await this.prisma.offline_event_queue.findUnique({
        where: { client_event_id: event.clientEventId },
      });
      if (existing) {
        results.push({ clientEventId: event.clientEventId, status: 'DUPLICATE_REJECTED' });
        continue;
      }

      await this.prisma.offline_event_queue.create({
        data: {
          client_event_id: event.clientEventId,
          user_id: userId ?? null,
          event_type: event.type,
          payload: event.payload as any,
          sync_status: 'PENDING',
          queued_at_device: new Date(),
        },
      });

      batchEvents.push({
        client_event_id: event.clientEventId,
        type: event.type,
        payload: { ...event.payload, ...(userId !== undefined && { userId }) },
      });
      results.push({ clientEventId: event.clientEventId, status: 'QUEUED' });
    }

    if (batchEvents.length > 0) {
      await this.syncQueue.add(
        'sync',
        { events: batchEvents },
        {
          attempts: MAX_OFFLINE_RETRY_ATTEMPTS,
          backoff: { type: 'exponential', delay: OFFLINE_RETRY_BASE_DELAY_MS },
        },
      );
    }

    return { accepted: batchEvents.length, results };
  }

  async getStatus(userId: string) {
    const [pending, synced, failed] = await this.prisma.$transaction([
      this.prisma.offline_event_queue.count({
        where: { user_id: userId, sync_status: 'PENDING' },
      }),
      this.prisma.offline_event_queue.count({
        where: { user_id: userId, sync_status: 'SYNCED' },
      }),
      this.prisma.offline_event_queue.count({
        where: { user_id: userId, sync_status: 'FAILED' },
      }),
    ]);
    return { pending, synced, failed };
  }
}
