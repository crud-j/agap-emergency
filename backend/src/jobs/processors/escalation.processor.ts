import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { findEscalationRecipients } from '../escalation-recipients';

export interface EscalationJobData {
  incidentId: string;
  slaThresholdMinutes: number;
  escalationType: 'ACKNOWLEDGEMENT' | 'DISPATCH' | 'RESPONSE';
}

const ESCALATION_ROLES: Record<EscalationJobData['escalationType'], string[]> = {
  ACKNOWLEDGEMENT: ['DISPATCHER', 'SUPERVISOR'],
  DISPATCH: ['SUPERVISOR'],
  // The System Administrator can't act on escalations (Phase 5b); Dispatchers are
  // the fallback when no Supervisor can be reached (D5, in findEscalationRecipients).
  RESPONSE: ['SUPERVISOR'],
};

@Processor(QUEUE_NAMES.ESCALATION)
export class EscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(EscalationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<EscalationJobData>): Promise<void> {
    const { incidentId, escalationType, slaThresholdMinutes } = job.data;
    this.logger.log(`Processing escalation for incident ${incidentId} (${escalationType})`);

    try {
      const targetRoles = ESCALATION_ROLES[escalationType] ?? ['SUPERVISOR'];

      const [supervisors, escalation] = await Promise.all([
        findEscalationRecipients(this.prisma, targetRoles),
        this.prisma.escalation.findFirst({
          where: { incident_id: incidentId, status: 'ACTIVE' },
          orderBy: { created_at: 'desc' },
        }),
      ]);

      if (supervisors.length === 0) {
        this.logger.warn(`No staff to notify for escalation ${escalationType} on incident ${incidentId}`);
        return;
      }

      await Promise.all(
        supervisors.map((s) =>
          this.notificationQueue.add('escalation-push', {
            userId: s.id,
            channel: 'PUSH',
            title: `SLA Breach — ${escalationType}`,
            body: `Incident requires immediate attention. Threshold: ${slaThresholdMinutes} min. Ref: ${incidentId.slice(0, 8)}…`,
            data: {
              incidentId,
              escalationId: escalation?.id ?? '',
              escalationType,
              type: 'ESCALATION',
            },
          }),
        ),
      );

      if (escalation && supervisors[0]) {
        await this.prisma.escalation.update({
          where: { id: escalation.id },
          data: { notified_user_id: supervisors[0].id },
        });
      }

      this.logger.log(`Escalation notifications enqueued for ${supervisors.length} staff — incident ${incidentId}`);
    } catch (err) {
      this.logger.error(`Escalation processor failed for incident ${incidentId}: ${String(err)}`);
    }
  }
}
