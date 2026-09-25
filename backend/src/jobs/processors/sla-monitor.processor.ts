import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import type { NotificationJobData } from './notification.processor';

type EscalationType = 'ACKNOWLEDGEMENT' | 'DISPATCH' | 'RESPONSE';

interface SlaJobData {
  incidentId: string;
  escalationType: EscalationType;
}

const TERMINAL_STATUSES = [
  'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND',
  'REFERRED', 'CLOSED', 'RESOLVED',
];

const PROGRESSION_MAP: Record<EscalationType, string[]> = {
  ACKNOWLEDGEMENT: ['RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING'],
  DISPATCH:        ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING'],
  RESPONSE:        ['ON_SCENE', 'TRANSPORTING', 'ASSISTING'],
};

const ESCALATION_LEVEL_MAP: Record<EscalationType, string> = {
  ACKNOWLEDGEMENT: 'LEVEL_1_SUPERVISOR',
  DISPATCH:        'LEVEL_2_INCIDENT_COMMANDER',
  RESPONSE:        'LEVEL_3_ADMINISTRATOR',
};

const NEXT_ESCALATION: Partial<Record<EscalationType, EscalationType>> = {
  ACKNOWLEDGEMENT: 'DISPATCH',
  DISPATCH:        'RESPONSE',
};

const NEXT_SLA_ENV: Partial<Record<EscalationType, string>> = {
  ACKNOWLEDGEMENT: 'DEFAULT_SLA_DISPATCH_SECONDS',
  DISPATCH:        'DEFAULT_SLA_RESPONSE_SECONDS',
};

@Processor(QUEUE_NAMES.SLA_MONITOR)
export class SlaMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaMonitorProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SLA_MONITOR) private readonly slaQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<SlaJobData>): Promise<void> {
    const { incidentId, escalationType } = job.data;
    try {
      const incident = await this.prisma.incident.findUnique({
        where: { id: incidentId },
      });

      if (!incident) {
        this.logger.warn(`SLA job ${job.id}: incident ${incidentId} not found — stale job, skipping`);
        return;
      }

      if (TERMINAL_STATUSES.includes(incident.status)) {
        this.logger.log(`SLA job ${job.id}: incident ${incident.public_reference} is terminal (${incident.status}) — no escalation needed`);
        return;
      }

      const progressedStatuses = PROGRESSION_MAP[escalationType];
      if (progressedStatuses.includes(incident.status)) {
        this.logger.log(`SLA job ${job.id}: incident ${incident.public_reference} status=${incident.status} — SLA met for ${escalationType}`);
        return;
      }

      // SLA breached — persist escalation record
      const escalation = await this.prisma.escalation.create({
        data: {
          incident_id: incidentId,
          escalation_level: ESCALATION_LEVEL_MAP[escalationType] as any,
          triggered_reason: `SLA breach: ${escalationType} — incident ${incident.public_reference} status was ${incident.status} at deadline`,
          sla_breach_at: new Date(),
        },
      });

      this.logger.log(`SLA breach: ${escalationType} for incident ${incident.public_reference} (escalation ${escalation.id})`);

      // Notify all active SUPERVISOR users
      const supervisors = await this.prisma.user.findMany({
        where: { role: 'SUPERVISOR', status: 'ACTIVE' },
        select: { id: true },
      });

      await Promise.allSettled(
        supervisors.map((s) =>
          this.notificationQueue.add('sla-escalation', {
            userId: s.id,
            channel: 'PUSH',
            title: 'SLA Breach',
            body: `Incident ${incident.public_reference} not ${escalationType.toLowerCase()} within SLA`,
            data: { incidentId, escalationId: escalation.id, escalationType },
          } satisfies NotificationJobData),
        ),
      );

      // Emit WebSocket event to ops room — failure must not affect DB record
      try {
        this.realtime.notifyEscalation(incidentId, {
          escalationId: escalation.id,
          escalationType,
          incidentStatus: incident.status,
        });
      } catch (wsErr) {
        this.logger.warn(`WS emit failed for SLA escalation ${escalation.id}: ${String(wsErr)}`);
      }

      // Chain next SLA tier if one exists
      const nextType = NEXT_ESCALATION[escalationType];
      if (nextType) {
        const envKey = NEXT_SLA_ENV[escalationType] ?? '';
        const delaySecs = Number(process.env[envKey] ?? 300);
        await this.slaQueue.add(
          'sla-monitor',
          { incidentId, escalationType: nextType },
          { delay: delaySecs * 1000 },
        );
        this.logger.log(`Scheduled next SLA tier: ${nextType} in ${delaySecs}s for incident ${incident.public_reference}`);
      }
    } catch (err) {
      this.logger.error(`SLA processor error for job ${job.id} (incident ${incidentId}): ${String(err)}`);
    }
  }
}
