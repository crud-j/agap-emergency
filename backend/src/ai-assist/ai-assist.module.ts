import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BarangayCallbackModule } from '../barangay-coordination/barangay-callback.module';
import { AiClientService } from './ai-client.service';
import { AiSuggestionsController } from './ai-suggestions.controller';
import { AiSuggestionsService } from './ai-suggestions.service';
import { AiTaskRunner } from './ai-task-runner.service';

/**
 * AI Assist (AI_ASSIST_PLAN; AUTOMATION_NEEDS_PLAN Phase 3, C4): Gemini suggestions a
 * dispatcher accepts or dismisses. Imports the barangay callback module (accept records the
 * report through reportBySms); that module never imports this one (K10), it only queues
 * AI_ASSIST jobs, which JobsModule's processor hands to AiTaskRunner.
 */
@Module({
  imports: [AuditModule, BarangayCallbackModule],
  controllers: [AiSuggestionsController],
  providers: [AiClientService, AiSuggestionsService, AiTaskRunner],
  exports: [AiTaskRunner],
})
export class AiAssistModule {}
