import { Module } from '@nestjs/common';
import { TransportLegService } from './transport-leg.service';
import { TransportAudienceService } from './transport-audience.service';

/**
 * Where a dispatch is heading and who may see it (MOD-40/43). Depends only on the
 * global PrismaModule, so LocationsModule can import it although IncidentsModule
 * imports LocationsModule (no cycle, no forwardRef). IncidentsModule re-exports it.
 */
@Module({
  providers: [TransportLegService, TransportAudienceService],
  exports: [TransportLegService, TransportAudienceService],
})
export class TransportLegModule {}
