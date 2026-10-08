import { Module } from '@nestjs/common';
import { FalseAlertsController } from './false-alerts.controller';
import { FalseAlertsService } from './false-alerts.service';
import { IncidentsModule } from '../incidents/incidents.module';
import { AuditModule } from '../audit/audit.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [IncidentsModule, AuditModule, RealtimeModule],
  controllers: [FalseAlertsController],
  providers: [FalseAlertsService],
  exports: [FalseAlertsService],
})
export class FalseAlertsModule {}
