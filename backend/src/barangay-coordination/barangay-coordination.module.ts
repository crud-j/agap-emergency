import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { AuditModule } from '../audit/audit.module';
import { BarangayCoordinationController } from './barangay-coordination.controller';
import { BarangayContactsController } from './barangay-contacts.controller';
import { BarangayContactsService } from './barangay-contacts.service';
import { BarangayDirectoryService } from './barangay-directory.service';
import { BarangayLinkService } from './barangay-link.service';
import { BarangayNotifyService } from './barangay-notify.service';

/** MOD-17 / MOD-34: tells the right barangay (BDRRMC/BPSO) about an incident in its area. */
@Module({
  imports: [AuditModule, BullModule.registerQueue({ name: QUEUE_NAMES.SMS })],
  controllers: [BarangayCoordinationController, BarangayContactsController],
  providers: [BarangayDirectoryService, BarangayNotifyService, BarangayLinkService, BarangayContactsService],
  exports: [BarangayNotifyService, BarangayDirectoryService, BarangayLinkService],
})
export class BarangayCoordinationModule {}
