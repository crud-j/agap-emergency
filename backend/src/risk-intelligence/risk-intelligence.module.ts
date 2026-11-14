import { Module } from '@nestjs/common';
import { RiskIntelligenceController } from './risk-intelligence.controller';
import { RiskIntelligenceService } from './risk-intelligence.service';
import { HotspotDiscoveryService } from './hotspot-discovery.service';
import { RiskPlaceSearchService } from './place-search.service';
import { AuditModule } from '../audit/audit.module';
import { MapsModule } from '../locations/maps/maps.module';

@Module({
  imports: [AuditModule, MapsModule],
  controllers: [RiskIntelligenceController],
  providers: [RiskIntelligenceService, HotspotDiscoveryService, RiskPlaceSearchService],
  exports: [RiskIntelligenceService],
})
export class RiskIntelligenceModule {}
