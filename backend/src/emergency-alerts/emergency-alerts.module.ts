import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmergencyAlertsController } from './emergency-alerts.controller';
import { EmergencyAlertsService } from './emergency-alerts.service';
import { OpsAlertService } from './ops-alert.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { BarangayCoordinationModule } from '../barangay-coordination/barangay-coordination.module';
import { GuestReportLimitModule } from './guest-report-limit/guest-report-limit.module';
import { QUEUE_NAMES } from '@agap/shared';
import { SlaPoliciesModule } from '../sla-policies/sla-policies.module';

@Module({
  imports: [
    RealtimeModule,
    BarangayCoordinationModule,
    GuestReportLimitModule,
    SlaPoliciesModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SMS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
  ],
  controllers: [EmergencyAlertsController],
  providers: [EmergencyAlertsService, OpsAlertService],
  exports: [EmergencyAlertsService, OpsAlertService, GuestReportLimitModule],
})
export class EmergencyAlertsModule {}
