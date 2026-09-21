import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { NotificationProcessor } from './processors/notification.processor';
import { SmsProcessor } from './processors/sms.processor';
import { EscalationProcessor } from './processors/escalation.processor';
import { SlaMonitorProcessor } from './processors/sla-monitor.processor';
import { OfflineSyncProcessor } from './processors/offline-sync.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SMS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.PUSH_NOTIFICATIONS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.INCIDENT_RETRY }),
    BullModule.registerQueue({ name: QUEUE_NAMES.OFFLINE_SYNC }),
    BullModule.registerQueue({ name: QUEUE_NAMES.ESCALATION }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SLA_MONITOR }),
    BullModule.registerQueue({ name: QUEUE_NAMES.LOCATION_PROCESSING }),
    BullModule.registerQueue({ name: QUEUE_NAMES.ANALYTICS_AGGREGATION }),
    BullModule.registerQueue({ name: QUEUE_NAMES.AUDIT_PROCESSING }),
  ],
  providers: [
    NotificationProcessor,
    SmsProcessor,
    EscalationProcessor,
    SlaMonitorProcessor,
    OfflineSyncProcessor,
    AnalyticsProcessor,
  ],
})
export class JobsModule {}
