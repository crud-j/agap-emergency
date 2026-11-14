import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { SlaPoliciesService } from './sla-policies.service';
import { SLA_STEPS, SLA_TERMINAL_STATUSES, deadlineFor, type SlaStep } from './sla-rules';

/** Open incidents re-queued after a target change; far above Bocaue's open load. */
const MAX_RESCHEDULE = 1000;

export interface SlaScheduleIncident {
  id: string;
  public_reference?: string;
  category: string;
  priority: string;
  submitted_at: Date;
}

export interface SlaJobData {
  incidentId: string;
  escalationType: SlaStep['escalationType'];
}

/** One job per incident, step and deadline: re-adding the same deadline is a no-op in BullMQ. */
export function slaJobId(incidentId: string, step: SlaStep, deadline: Date): string {
  return `sla_${incidentId}_${step.escalationType}_${deadline.getTime()}`;
}

/**
 * Schedules the MOD-41 checks for an incident: acknowledge, dispatch and on-scene, each
 * at its own deadline measured from the report, all at once. (The first version chained
 * them, so the dispatch check ran only after a late acknowledgement.)
 *
 * Called when a report is saved and again when its priority changes. Never throws: a
 * queue failure must not affect the incident.
 */
@Injectable()
export class SlaScheduleService {
  private readonly logger = new Logger(SlaScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: SlaPoliciesService,
    @InjectQueue(QUEUE_NAMES.SLA_MONITOR) private readonly queue: Queue,
  ) {}

  async scheduleForIncident(incident: SlaScheduleIncident, now: Date = new Date()): Promise<void> {
    try {
      const { thresholds } = await this.policies.resolveForIncident(incident);
      for (const step of SLA_STEPS) {
        await this.scheduleStep(incident.id, step, deadlineFor(incident.submitted_at, thresholds, step), now);
      }
    } catch (err) {
      this.logger.error(
        `SLA checks not scheduled for ${incident.public_reference ?? incident.id}: ${String(err)}. Incident unaffected.`,
      );
    }
  }

  /**
   * After a target changes: queue checks at the new deadlines for every open incident, so
   * a shorter target takes effect now rather than when the old check runs. Checks queued
   * for the old deadlines still run and re-read the policy; one escalation per step at most.
   * Returns how many incidents were re-queued. Never throws.
   */
  async rescheduleOpenIncidents(now: Date = new Date()): Promise<number> {
    try {
      const open = await this.prisma.incident.findMany({
        where: { status: { notIn: [...SLA_TERMINAL_STATUSES, 'DRAFT'] as any } },
        select: { id: true, public_reference: true, category: true, priority: true, submitted_at: true },
        orderBy: { submitted_at: 'desc' },
        take: MAX_RESCHEDULE,
      });
      for (const incident of open) {
        await this.scheduleForIncident(
          { ...incident, category: String(incident.category), priority: String(incident.priority) },
          now,
        );
      }
      return open.length;
    } catch (err) {
      this.logger.error(`Open incidents not re-queued after an SLA change: ${String(err)}`);
      return 0;
    }
  }

  /** Queue one check to run at `deadline` (now, if it has already passed). */
  async scheduleStep(incidentId: string, step: SlaStep, deadline: Date, now: Date = new Date()): Promise<void> {
    const data: SlaJobData = { incidentId, escalationType: step.escalationType };
    await this.queue.add('sla-monitor', data, {
      delay: Math.max(0, deadline.getTime() - now.getTime()),
      jobId: slaJobId(incidentId, step, deadline),
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }
}
