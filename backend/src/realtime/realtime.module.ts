import { Module } from '@nestjs/common';
import { AgapGateway } from './agap.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  providers: [AgapGateway, RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
