import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';

@Processor(QUEUE_NAMES.ANALYTICS_AGGREGATION)
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing analytics aggregation job ${job.id}`);
    // TODO: Aggregate incident statistics, response times, resolution rates
  }
}
