import { Module } from '@nestjs/common';
import { RiskIntelligenceController } from './risk-intelligence.controller';
import { RiskIntelligenceService } from './risk-intelligence.service';
import { HotspotDiscoveryService } from './hotspot-discovery.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [RiskIntelligenceController],
  providers: [RiskIntelligenceService, HotspotDiscoveryService],
  exports: [RiskIntelligenceService],
})
export class RiskIntelligenceModule {}
