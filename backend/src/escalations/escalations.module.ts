import { Module } from '@nestjs/common';
import { EscalationsController } from './escalations.controller';
import { EscalationsService } from './escalations.service';

@Module({
  controllers: [EscalationsController],
  providers: [EscalationsService],
  exports: [EscalationsService],
})
export class EscalationsModule {}
