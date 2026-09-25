import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../common/prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EmergencyAlertsModule } from '../emergency-alerts/emergency-alerts.module';
import { LocationsModule } from '../locations/locations.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { QUEUE_NAMES } from '@agap/shared';
import { NotificationProcessor } from './processors/notification.processor';
import { SmsProcessor } from './processors/sms.processor';
import { EscalationProcessor } from './processors/escalation.processor';
import { SlaMonitorProcessor } from './processors/sla-monitor.processor';
import { OfflineSyncProcessor } from './processors/offline-sync.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { AnalyticsCronService } from './analytics-cron.service';
import { EtaRefreshProcessor } from './processors/eta-refresh.processor';
import { AnnouncementPushProcessor } from './processors/announcement-push.processor';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RealtimeModule,
    EmergencyAlertsModule,
    LocationsModule,
    AnalyticsModule,
    ScheduleModule.forRoot(),
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
    AnalyticsCronService,
    EtaRefreshProcessor,
    AnnouncementPushProcessor,
  ],
})
export class JobsModule {}
