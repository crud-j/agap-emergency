import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { findEscalationRecipients } from '../escalation-recipients';
import { SlaPoliciesService } from '../../sla-policies/sla-policies.service';
import { SlaScheduleService, type SlaJobData } from '../../sla-policies/sla-schedule.service';
import {
  SLA_TERMINAL_STATUSES,
  deadlineFor,
  formatTarget,
  stepForEscalation,
  stepReached,
} from '../../sla-policies/sla-rules';
import type { NotificationJobData } from './notification.processor';

/** A check that wakes this much before its deadline still counts as on time (queue jitter). */
const EARLY_TOLERANCE_MS = 1_000;

/** Prefix of Escalation.triggered_reason; also how a repeat breach of the same step is spotted. */
export function slaBreachReasonPrefix(escalationType: string): string {
  return `SLA breach: ${escalationType}`;
}

/**
 * MOD-41 SLA alarm. One job per incident and step (acknowledge, dispatch, on scene),
 * scheduled by SlaScheduleService at the deadline from the incident's SLA policy.
 *
 * When a job runs it re-reads the incident and its policy, because the priority (or the
 * policy) may have changed since it was queued:
 *  - finished incident, or step already reached → nothing to do;
 *  - deadline now later than this run → re-queue for the new deadline;
 *  - otherwise → one Escalation per incident and step, a push to Supervisors and a
 *    socket event. A failed push or socket emit never undoes the escalation record.
 */
@Processor(QUEUE_NAMES.SLA_MONITOR)
export class SlaMonitorProcessor extends WorkerHost {
  private readonly logger = new Logger(SlaMonitorProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
    private readonly policies: SlaPoliciesService,
    private readonly schedule: SlaScheduleService,
  ) {
    super();
  }

  async process(job: Job<SlaJobData>): Promise<void> {
    await this.check(job.data, String(job.id));
  }

  /** The check itself; `now` is a parameter so tests can fix the clock. */
  async check(data: SlaJobData, jobId = 'manual', now: Date = new Date()): Promise<void> {
    const { incidentId, escalationType } = data;
    const step = stepForEscalation(escalationType);
    if (!step) {
      this.logger.warn(`SLA job ${jobId}: unknown step ${escalationType}, skipping`);
      return;
    }
    try {
      const incident = await this.prisma.incident.findUnique({
        where: { id: incidentId },
        select: {
          id: true,
          public_reference: true,
          status: true,
          priority: true,
          category: true,
          submitted_at: true,
          acknowledged_at: true,
          dispatched_at: true,
          on_scene_at: true,
        },
      });

      if (!incident) {
        this.logger.warn(`SLA job ${jobId}: incident ${incidentId} not found (stale job), skipping`);
        return;
      }
      const status = String(incident.status);
      if (SLA_TERMINAL_STATUSES.includes(status)) return;
      if (stepReached(step, { ...incident, status })) return;

      const sla = await this.policies.resolveForIncident({
        category: String(incident.category),
        priority: String(incident.priority),
      });
      const deadline = deadlineFor(incident.submitted_at, sla.thresholds, step);
      if (now.getTime() < deadline.getTime() - EARLY_TOLERANCE_MS) {
        // The target got longer (lower priority or a policy change) after this job was queued.
        await this.schedule.scheduleStep(incident.id, step, deadline, now);
        return;
      }

      const reasonPrefix = slaBreachReasonPrefix(escalationType);
      const already = await this.prisma.escalation.findFirst({
        where: { incident_id: incidentId, triggered_reason: { startsWith: reasonPrefix } },
        select: { id: true },
      });
      if (already) return; // e.g. the check queued before a priority change also ran

      const target = formatTarget(sla.thresholds[step.key]);
      const priority = String(incident.priority);
      const escalation = await this.prisma.escalation.create({
        data: {
          incident_id: incidentId,
          sla_policy_id: sla.policyId,
          escalation_level: step.escalationLevel as any,
          triggered_reason:
            `${reasonPrefix} — incident ${incident.public_reference} not ${step.verb} within ${target} ` +
            `(${priority} target); status was ${status} at deadline`,
          sla_breach_at: deadline,
        },
      });

      this.logger.log(`SLA breach: ${escalationType} for ${incident.public_reference} (escalation ${escalation.id})`);

      // Notify Supervisors who can sign in; Dispatchers if there are none (D5)
      const supervisors = await findEscalationRecipients(this.prisma, ['SUPERVISOR']);
      await Promise.allSettled(
        supervisors.map((s) =>
          this.notificationQueue.add('sla-escalation', {
            userId: s.id,
            channel: 'PUSH',
            title: 'Response target missed',
            body: `${incident.public_reference} not ${step.verb} within ${target} (${priority} target)`,
            data: { incidentId, escalationId: escalation.id, escalationType },
          } satisfies NotificationJobData),
        ),
      );

      // Socket event to the ops room; failure must not affect the DB record
      try {
        this.realtime.notifyEscalation(incidentId, {
          escalationId: escalation.id,
          escalationType,
          incidentStatus: incident.status,
        });
      } catch (wsErr) {
        this.logger.warn(`WS emit failed for SLA escalation ${escalation.id}: ${String(wsErr)}`);
      }
    } catch (err) {
      this.logger.error(`SLA processor error for job ${jobId} (incident ${incidentId}): ${String(err)}`);
    }
  }
}
