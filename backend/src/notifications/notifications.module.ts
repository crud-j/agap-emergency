import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { IncidentStatusNotifier } from './incident-status-notifier';
import { IcsNotifier } from './ics-notifier';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS })],
  controllers: [NotificationsController],
  providers: [NotificationsService, IncidentStatusNotifier, IcsNotifier],
  exports: [NotificationsService, IncidentStatusNotifier, IcsNotifier],
})
export class NotificationsModule {}
