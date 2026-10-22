import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { OversightController } from './oversight.controller';
import { OversightService } from './oversight.service';

@Module({
  imports: [AnalyticsModule],
  controllers: [OversightController],
  providers: [OversightService],
})
export class OversightModule {}
