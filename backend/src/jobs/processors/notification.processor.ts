import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';

export interface NotificationJobData {
  userId?: string;
  phone?: string;
  channel: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
}

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing notification job ${job.id}: channel=${job.data.channel}`);
    // TODO: Route to SMS, push, or in-app notification service
    // Notification failure must NOT affect incident record
    try {
      switch (job.data.channel) {
        case 'SMS':
          // Delegate to SMS queue
          break;
        case 'PUSH':
          // Delegate to push notification service
          break;
        case 'IN_APP':
          // Deliver via WebSocket
          break;
      }
    } catch (err) {
      this.logger.error(`Notification job ${job.id} failed: ${err}. Incident not affected.`);
    }
  }
}
