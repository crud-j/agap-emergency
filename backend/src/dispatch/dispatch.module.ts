import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { QUEUE_NAMES } from '@agap/shared';

@Module({
  imports: [
    RealtimeModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
  ],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
