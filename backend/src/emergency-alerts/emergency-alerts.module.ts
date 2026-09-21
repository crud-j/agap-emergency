import { Module } from '@nestjs/common';
import { EmergencyAlertsController } from './emergency-alerts.controller';
import { EmergencyAlertsService } from './emergency-alerts.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [EmergencyAlertsController],
  providers: [EmergencyAlertsService],
  exports: [EmergencyAlertsService],
})
export class EmergencyAlertsModule {}
