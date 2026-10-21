import { Module } from '@nestjs/common';
import { FalseAlertsController } from './false-alerts.controller';
import { FalseAlertsService } from './false-alerts.service';
import { IncidentsModule } from '../incidents/incidents.module';
import { AuditModule } from '../audit/audit.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { BarangayCoordinationModule } from '../barangay-coordination/barangay-coordination.module';

@Module({
  imports: [IncidentsModule, AuditModule, RealtimeModule, BarangayCoordinationModule],
  controllers: [FalseAlertsController],
  providers: [FalseAlertsService],
  exports: [FalseAlertsService],
})
export class FalseAlertsModule {}
