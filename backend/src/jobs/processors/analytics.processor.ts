import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { AnalyticsService, manilaDateKey } from '../../analytics/analytics.service';

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
      // Yesterday in Bocaue, not in the server's (or UTC's) calendar.
      const yesterday = manilaDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

      const summary = await this.analyticsService.getDailySummary(yesterday);

      this.logger.log(
        `Analytics: ${summary.date} — ${summary.total} incidents, by category: ${JSON.stringify(summary.byCategory)}`,
      );
    } catch (err) {
      this.logger.error(`Analytics aggregation failed: ${String(err)}`);
    }
  }
}
