import { Module } from '@nestjs/common';
import { HospitalsController } from './hospitals.controller';
import { HospitalsService } from './hospitals.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  controllers: [HospitalsController],
  providers: [HospitalsService],
  imports: [AuditModule, NotificationsModule],
  exports: [HospitalsService],
})
export class HospitalsModule {}
