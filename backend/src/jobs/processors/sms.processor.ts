import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';

export interface SmsJobData {
  phone: string;
  message: string;
  incidentId?: string;
}

@Processor(QUEUE_NAMES.SMS)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  async process(job: Job<SmsJobData>): Promise<void> {
    this.logger.log(`Processing SMS job ${job.id} to ${job.data.phone}`);
    // TODO: Implement SMS provider (Semaphore or configured provider)
    // This is a pending implementation — interface is defined
  }
}
