import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmergencyAlertsService } from '../../emergency-alerts/emergency-alerts.service';
import { LocationsService } from '../../locations/locations.service';
import { SosAlertDto } from '../../emergency-alerts/dto/sos-alert.dto';
import { TrackLocationDto } from '../../locations/dto/track-location.dto';

/** Legacy single-event job shape (from queueSync). */
export interface OfflineSyncJobData {
  syncRecordId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attempt: number;
}

/** Batch job shape — used by /offline-sync/flush and updated syncBatch. */
export interface OfflineSyncBatchJobData {
  events: Array<{
    client_event_id: string;
    type: string;
    payload: Record<string, unknown>;
  }>;
}

@Processor(QUEUE_NAMES.OFFLINE_SYNC)
export class OfflineSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(OfflineSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emergencyAlertsService: EmergencyAlertsService,
    private readonly locationsService: LocationsService,
  ) {
    super();
  }

  async process(job: Job<OfflineSyncBatchJobData>): Promise<{ processed: number; failed: number }> {
    const events = job.data.events ?? [];
    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        switch (event.type) {
          case 'SOS':
          case 'INCIDENT_SUBMIT':
            // INCIDENT_SUBMIT is written by the legacy queueSync() path; its payload
            // shape matches SosAlertDto. clientEventId is the idempotency key — the
            // backend deduplicates so a replayed event never creates a second incident.
            await this.emergencyAlertsService.createFromSos(
              { ...event.payload, clientEventId: event.client_event_id } as unknown as SosAlertDto,
              'SOS_BUTTON',
              (event.payload['userId'] as string | undefined) ?? undefined,
            );
            break;

          case 'LOCATION_UPDATE':
            await this.locationsService.trackResponder(
              event.payload as unknown as TrackLocationDto,
              event.payload['userId'] as string,
            );
            break;

          case 'STATUS_UPDATE':
            // Status updates from mobile are read-only views — not replayed in offline sync.
            this.logger.log(`STATUS_UPDATE skipped in offline sync: ${event.client_event_id}`);
            break;

          default:
            this.logger.warn(`Unknown offline event type "${event.type}" for ${event.client_event_id}`);
        }

        // Mark the queue record as successfully synced so getStatus() reflects reality.
        await this.prisma.offline_event_queue.updateMany({
          where: { client_event_id: event.client_event_id, sync_status: 'PENDING' },
          data: { sync_status: 'SYNCED', processed_at: new Date() },
        });
        processed++;
      } catch (err) {
        this.logger.error(
          `Offline event failed (${event.type}/${event.client_event_id}): ${String(err)}`,
        );
        // Persist the failure so users and operators can see which events need attention.
        await this.prisma.offline_event_queue.updateMany({
          where: { client_event_id: event.client_event_id, sync_status: 'PENDING' },
          data: { sync_status: 'FAILED', error_message: String(err) },
        }).catch((updateErr) => {
          this.logger.warn(
            `Could not persist failure status for ${event.client_event_id}: ${String(updateErr)}`,
          );
        });
        failed++;
      }
    }

    this.logger.log(`Offline sync complete: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }
}
