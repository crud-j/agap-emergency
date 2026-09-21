import { Module } from '@nestjs/common';
import { RespondersController } from './responders.controller';
import { RespondersService } from './responders.service';

@Module({
  controllers: [RespondersController],
  providers: [RespondersService],
  exports: [RespondersService],
})
export class RespondersModule {}
