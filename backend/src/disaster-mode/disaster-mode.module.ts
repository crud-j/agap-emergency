import { Module } from '@nestjs/common';
import { DisasterModeController } from './disaster-mode.controller';
import { DisasterModeService } from './disaster-mode.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [DisasterModeController],
  providers: [DisasterModeService],
  exports: [DisasterModeService],
})
export class DisasterModeModule {}
