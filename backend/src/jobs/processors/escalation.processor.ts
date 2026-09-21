import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';

export interface EscalationJobData {
  incidentId: string;
  slaThresholdMinutes: number;
  escalationType: 'ACKNOWLEDGEMENT' | 'DISPATCH' | 'RESPONSE';
}

@Processor(QUEUE_NAMES.ESCALATION)
export class EscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(EscalationProcessor.name);

  async process(job: Job<EscalationJobData>): Promise<void> {
    this.logger.log(`Processing escalation for incident ${job.data.incidentId}`);
    // TODO: Check if incident has breached SLA threshold
    // If so, escalate and notify supervisors
  }
}
