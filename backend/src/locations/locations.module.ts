import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { MapsModule } from './maps/maps.module';
import { RouteCacheService } from './route-cache.service';
import { TransportLegModule } from '../incidents/transport/transport-leg.module';

@Module({
  imports: [
    RealtimeModule,
    MapsModule,
    TransportLegModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.LOCATION_PROCESSING }),
  ],
  controllers: [LocationsController],
  providers: [LocationsService, RouteCacheService],
  exports: [LocationsService, RouteCacheService],
})
export class LocationsModule {}
