import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmergencyAlertsController } from './emergency-alerts.controller';
import { EmergencyAlertsService } from './emergency-alerts.service';
import { OpsAlertService } from './ops-alert.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { BarangayCoordinationModule } from '../barangay-coordination/barangay-coordination.module';
import { QUEUE_NAMES } from '@agap/shared';

@Module({
  imports: [
    RealtimeModule,
    BarangayCoordinationModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SMS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.SLA_MONITOR }),
  ],
  controllers: [EmergencyAlertsController],
  providers: [EmergencyAlertsService, OpsAlertService],
  exports: [EmergencyAlertsService, OpsAlertService],
})
export class EmergencyAlertsModule {}
