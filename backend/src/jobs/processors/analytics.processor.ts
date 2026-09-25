import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { AnalyticsService } from '../../analytics/analytics.service';

@Processor(QUEUE_NAMES.ANALYTICS_AGGREGATION)
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(private readonly analyticsService: AnalyticsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'daily-summary') return;
    this.logger.log('Running daily analytics aggregation');
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      const summary = await this.analyticsService.getDailySummary(yesterdayStr);

      this.logger.log(
        `Analytics: ${summary.date} — ${summary.total} incidents, by category: ${JSON.stringify(summary.byCategory)}`,
      );
    } catch (err) {
      this.logger.error(`Analytics aggregation failed: ${String(err)}`);
    }
  }
}
