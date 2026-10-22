import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { IncidentStatusNotifier } from './incident-status-notifier';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS })],
  controllers: [NotificationsController],
  providers: [NotificationsService, IncidentStatusNotifier],
  exports: [NotificationsService, IncidentStatusNotifier],
})
export class NotificationsModule {}
