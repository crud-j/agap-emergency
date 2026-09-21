import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, MAX_OFFLINE_RETRY_ATTEMPTS, OFFLINE_RETRY_BASE_DELAY_MS } from '@agap/shared';

export interface OfflineSyncJobData {
  syncRecordId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attempt: number;
}

@Processor(QUEUE_NAMES.OFFLINE_SYNC)
export class OfflineSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(OfflineSyncProcessor.name);

  async process(job: Job<OfflineSyncJobData>): Promise<void> {
    const { attempt, idempotencyKey } = job.data;

    if (attempt >= MAX_OFFLINE_RETRY_ATTEMPTS) {
      this.logger.error(`Max retries reached for sync record ${job.data.syncRecordId}`);
      return;
    }

    this.logger.log(`Processing offline sync attempt ${attempt + 1} for key ${idempotencyKey}`);
    // TODO: Process queued offline incident submission using idempotency key
    // Exponential backoff is handled by BullMQ job delay
  }
}
