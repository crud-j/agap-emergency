import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BarangayCallbackModule } from '../barangay-coordination/barangay-callback.module';
import { AiClientService } from './ai-client.service';
import { AiSuggestionsController } from './ai-suggestions.controller';
import { AiSuggestionsService } from './ai-suggestions.service';
import { AiTaskRunner } from './ai-task-runner.service';
import { AnalyticsNarrativeService } from './analytics-narrative/analytics-narrative.service';
import { AnalyticsSummaryController } from './analytics-narrative/analytics-summary.controller';

/**
 * AI Assist (AI_ASSIST_PLAN; AUTOMATION_NEEDS_PLAN Phase 3, C4): Gemini suggestions a
 * dispatcher accepts or dismisses. Imports the barangay callback module (accept records the
 * report through reportBySms); that module never imports this one (K10), it only queues
 * AI_ASSIST jobs, which JobsModule's processor hands to AiTaskRunner.
 *
 * Also the MOD-50 AI summary on the Analytics page: AnalyticsModule computes the facts
 * (it never imports this module), and this module only words them.
 */
@Module({
  imports: [AuditModule, AnalyticsModule, BarangayCallbackModule],
  controllers: [AiSuggestionsController, AnalyticsSummaryController],
  providers: [AiClientService, AiSuggestionsService, AiTaskRunner, AnalyticsNarrativeService],
  exports: [AiTaskRunner],
})
export class AiAssistModule {}
