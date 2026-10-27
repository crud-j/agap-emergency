import { Module } from '@nestjs/common';
import { RiskIntelligenceController } from './risk-intelligence.controller';
import { RiskIntelligenceService } from './risk-intelligence.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [RiskIntelligenceController],
  providers: [RiskIntelligenceService],
  exports: [RiskIntelligenceService],
})
export class RiskIntelligenceModule {}
