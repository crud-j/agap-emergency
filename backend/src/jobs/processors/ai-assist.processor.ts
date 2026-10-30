import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { AiTaskRunner } from '../../ai-assist/ai-task-runner.service';
import type { AiAssistJobData } from '../../ai-assist/ai-assist.jobs';

/**
 * AI Assist jobs (`reply-<inboundId>`). One at a time: the free-tier Gemini key allows only
 * a few calls a minute. The runner stores a row for every outcome (FAILED included) and
 * never throws, so BullMQ never retries a bad answer.
 */
@Processor(QUEUE_NAMES.AI_ASSIST, { concurrency: 1 })
export class AiAssistProcessor extends WorkerHost {
  constructor(private readonly runner: AiTaskRunner) {
    super();
  }

  async process(job: Job<AiAssistJobData>): Promise<void> {
    await this.runner.run(job.data);
  }
}
