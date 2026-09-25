import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import axios from 'axios';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';

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
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {
    super();
  }

  async process(job: Job<EtaRefreshJobData>): Promise<void> {
    const { dispatchId, incidentId, responderLat, responderLng, incidentLat, incidentLng } = job.data;
    this.logger.log(`Processing ETA refresh for dispatch ${dispatchId}`);

    try {
      const routingBase =
        this.config.get<string>('MAP_PROVIDER_ROUTING_URL') ?? 'http://router.project-osrm.org';
      const url = `${routingBase}/route/v1/driving/${responderLng},${responderLat};${incidentLng},${incidentLat}?overview=false`;

      const response = await axios.get(url, { timeout: 5000 });
      const duration = response.data?.routes?.[0]?.duration as number | undefined;

      if (!duration) {
        this.logger.warn(`OSRM returned no duration for dispatch ${dispatchId}`);
        return;
      }

      const etaSeconds = Math.round(duration);
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
