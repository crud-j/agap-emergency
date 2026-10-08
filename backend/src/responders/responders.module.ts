import { Module } from '@nestjs/common';
import { RespondersController } from './responders.controller';
import { RespondersService } from './responders.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [RespondersController],
  providers: [RespondersService],
  exports: [RespondersService],
})
export class RespondersModule {}
