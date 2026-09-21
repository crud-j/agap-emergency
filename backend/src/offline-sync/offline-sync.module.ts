import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { OfflineSyncController } from './offline-sync.controller';
import { OfflineSyncService } from './offline-sync.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.OFFLINE_SYNC })],
  controllers: [OfflineSyncController],
  providers: [OfflineSyncService],
  exports: [OfflineSyncService],
})
export class OfflineSyncModule {}
