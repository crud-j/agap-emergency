import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsExportService } from './export/analytics-export.service';
import { AnalyticsFactsService } from './narrative/analytics-facts.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsExportService, AnalyticsFactsService],
  exports: [AnalyticsService, AnalyticsFactsService],
})
export class AnalyticsModule {}
