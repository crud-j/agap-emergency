import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';

@Injectable()
export class AnalyticsCronService {
  private readonly logger = new Logger(AnalyticsCronService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ANALYTICS_AGGREGATION) private readonly analyticsQueue: Queue,
  ) {}

  @Cron('0 1 * * *')
  async scheduleDailySummary() {
    this.logger.log('Scheduling daily analytics aggregation');
    await this.analyticsQueue.add('daily-summary', { triggeredAt: new Date().toISOString() });
  }
}
