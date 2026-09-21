import { Module } from '@nestjs/common';
import { RiskIntelligenceController } from './risk-intelligence.controller';
import { RiskIntelligenceService } from './risk-intelligence.service';

@Module({
  controllers: [RiskIntelligenceController],
  providers: [RiskIntelligenceService],
  exports: [RiskIntelligenceService],
})
export class RiskIntelligenceModule {}
