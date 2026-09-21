import { Module } from '@nestjs/common';
import { FalseAlertsController } from './false-alerts.controller';
import { FalseAlertsService } from './false-alerts.service';

@Module({
  controllers: [FalseAlertsController],
  providers: [FalseAlertsService],
  exports: [FalseAlertsService],
})
export class FalseAlertsModule {}
