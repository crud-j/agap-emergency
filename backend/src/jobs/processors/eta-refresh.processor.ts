import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { MapsService } from '../../locations/maps/maps.service';

export interface EtaRefreshJobData {
  dispatchId: string;
  incidentId: string;
  responderLat: number;
  responderLng: number;
  incidentLat: number;
  incidentLng: number;
}

@Processor(QUEUE_NAMES.LOCATION_PROCESSING)
export class EtaRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(EtaRefreshProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly maps: MapsService,
  ) {
    super();
  }

  async process(job: Job<EtaRefreshJobData>): Promise<void> {
    const { dispatchId, incidentId, responderLat, responderLng, incidentLat, incidentLng } = job.data;
    this.logger.log(`Processing ETA refresh for dispatch ${dispatchId}`);

    try {
      const route = await this.maps.route(
        { lat: responderLat, lng: responderLng },
        { lat: incidentLat, lng: incidentLng },
      );

      if (!route.durationSeconds) {
        this.logger.warn(`Routing returned no duration for dispatch ${dispatchId}`);
        return;
      }

      const etaSeconds = route.durationSeconds;
      const estimatedAt = new Date(Date.now() + etaSeconds * 1000);

      // Update TransportRecord if one exists for this dispatch (dispatches has no ETA field)
      await this.prisma.transportRecord.updateMany({
        where: { dispatch_id: dispatchId, handover_completed_at: null },
        data: { estimated_arrival_at: estimatedAt },
      });

      // Always emit via WebSocket regardless of DB update outcome
      this.realtime.notifyEtaUpdated(incidentId, {
        dispatchId,
        etaSeconds,
        isEstimate: true,
        calculatedAt: new Date().toISOString(),
      });

      this.logger.log(`ETA updated for dispatch ${dispatchId}: ${etaSeconds}s`);
    } catch (err) {
      // A failed ETA calculation must never stop dispatch — log only
      this.logger.error(`ETA refresh failed for dispatch ${dispatchId}: ${String(err)}`);
    }
  }
}
