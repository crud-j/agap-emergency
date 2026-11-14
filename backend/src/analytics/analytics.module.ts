import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsExportService } from './export/analytics-export.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsExportService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
