import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { MapsModule } from './maps/maps.module';

@Module({
  imports: [
    RealtimeModule,
    MapsModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.LOCATION_PROCESSING }),
  ],
  controllers: [LocationsController],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
