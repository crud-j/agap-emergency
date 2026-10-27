import { Module } from '@nestjs/common';
import { RespondersController } from './responders.controller';
import { RespondersService } from './responders.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IncidentsModule } from '../incidents/incidents.module';

@Module({
  imports: [RealtimeModule, AuditModule, NotificationsModule, IncidentsModule],
  controllers: [RespondersController],
  providers: [RespondersService],
  exports: [RespondersService],
})
export class RespondersModule {}
