import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { EmergencyContactsController } from './emergency-contacts.controller';
import { EmergencyContactsService } from './emergency-contacts.service';
import { EmergencyContactNotificationService } from './emergency-contact-notification.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SMS })],
  controllers: [EmergencyContactsController],
  providers: [EmergencyContactsService, EmergencyContactNotificationService],
  exports: [EmergencyContactsService, EmergencyContactNotificationService],
})
export class EmergencyContactsModule {}
