import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { ResourceMatchingService } from './resource-matching/resource-matching.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuditModule } from '../audit/audit.module';
import { QUEUE_NAMES } from '@agap/shared';

@Module({
  imports: [
    RealtimeModule,
    AuditModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
  ],
  controllers: [DispatchController],
  providers: [DispatchService, ResourceMatchingService],
  exports: [DispatchService, ResourceMatchingService],
})
export class DispatchModule {}
