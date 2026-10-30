import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { AuditModule } from '../audit/audit.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { BarangayCoordinationModule } from './barangay-coordination.module';
import { BarangayCallbackController } from './barangay-callback.controller';
import { BarangayLinkController } from './barangay-link.controller';
import { BarangayCallbackService } from './barangay-callback.service';
import { BarangayReplyService } from './barangay-reply.service';
import { BARANGAY_INBOUND_QUEUE, BarangaySmsPollProcessor, BarangaySmsPoller } from './barangay-sms-poller';

/**
 * Phase 4 callback actions and Phase 5 SMS replies. A separate module because they call
 * IncidentsService, and IncidentsModule already imports BarangayCoordinationModule (a cycle
 * otherwise). AnnouncementsModule: the same inbound SMS path processes subscribers' STOP.
 */
@Module({
  imports: [
    AuditModule,
    AnnouncementsModule,
    IncidentsModule,
    BarangayCoordinationModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.SMS }, { name: BARANGAY_INBOUND_QUEUE }),
  ],
  controllers: [BarangayCallbackController, BarangayLinkController],
  providers: [BarangayCallbackService, BarangayReplyService, BarangaySmsPoller, BarangaySmsPollProcessor],
})
export class BarangayCallbackModule {}
