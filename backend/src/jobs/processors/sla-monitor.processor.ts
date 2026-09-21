import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';

@Processor(QUEUE_NAMES.SLA_MONITOR)
export class SlaMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaMonitorProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.log(`Running SLA monitor check`);
    // TODO: Scan active incidents for SLA breaches, enqueue escalation jobs
  }
}
