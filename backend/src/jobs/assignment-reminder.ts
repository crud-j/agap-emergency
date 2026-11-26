import type { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  ASSIGNMENT_REMINDER_JOB,
  ASSIGNMENT_REMINDER_MAX,
  ASSIGNMENT_WAITING_STATUSES,
  NO_ANSWER_REASON_PREFIX,
  assignmentPush,
  assignmentReminderJob,
} from '../dispatch/assignment-push';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { RealtimeService } from '../realtime/realtime.service';
import { findEscalationRecipients } from './escalation-recipients';
import type { NotificationJobData } from './processors/notification.processor';

/** Incident statuses after which nobody needs to answer an assignment any more. */
const INCIDENT_ENDED = new Set(['RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED']);

export interface AssignmentReminderDeps {
  prisma: PrismaService;
  /** The notifications queue: the next check is scheduled on it. */
  queue: Queue | undefined;
  realtime: RealtimeService | undefined;
  /** Sends one push (NotificationProcessor.sendPush). */
  push: (data: NotificationJobData) => Promise<void>;
  logger: Logger;
}

export type ReminderOutcome = 'answered' | 'reminded' | 'escalated' | 'skipped';

/**
 * MOD-18 / MOD-41: one check of a crew member's unanswered assignment, 30 s after the
 * last push. Still waiting → buzz the phone again and schedule the next check; after the
 * last repeat → raise one escalation so the Operations Center can reassign. Answered,
 * cancelled, crew removed or incident over → stop. Never throws: the dispatch stands.
 */
export async function runAssignmentReminder(
  deps: AssignmentReminderDeps,
  job: { userId?: string | undefined; dispatchId?: unknown; attempt?: unknown; chain?: unknown },
): Promise<ReminderOutcome> {
  const { prisma, logger } = deps;
  const { userId } = job;
  const dispatchId = typeof job.dispatchId === 'string' ? job.dispatchId : null;
  const attempt = Number(job.attempt);
  const chain = Number(job.chain) || Date.now();
  if (!userId || !dispatchId || !Number.isInteger(attempt) || attempt < 1) return 'skipped';

  try {
    const dispatch = await prisma.dispatches.findUnique({
      where: { id: dispatchId },
      select: {
        status: true,
        incident_id: true,
        created_at: true,
        incidents: { select: { category: true, public_reference: true, status: true } },
        resources: { select: { name: true, call_sign: true } },
        dispatch_crew: { where: { user_id: userId }, select: { users: { select: { full_name: true } } } },
      },
    });
    const crew = dispatch?.dispatch_crew[0];
    if (
      !dispatch ||
      !crew ||
      !ASSIGNMENT_WAITING_STATUSES.has(String(dispatch.status)) ||
      INCIDENT_ENDED.has(String(dispatch.incidents.status))
    ) {
      return 'answered';
    }

    const incident = { category: String(dispatch.incidents.category), public_reference: dispatch.incidents.public_reference };
    await deps.push(assignmentPush('ASSIGNMENT', incident, dispatchId, userId, attempt));

    if (attempt < ASSIGNMENT_REMINDER_MAX) {
      const next = assignmentReminderJob(dispatchId, userId, attempt + 1, chain);
      await deps.queue?.add(ASSIGNMENT_REMINDER_JOB, next.data, {
        jobId: next.jobId,
        delay: next.delay,
        removeOnComplete: true,
        removeOnFail: 100,
      });
      return 'reminded';
    }

    await escalateNoAnswer(deps, dispatchId, dispatch, crew.users.full_name, incident.public_reference);
    return 'escalated';
  } catch (err) {
    logger.error(`Assignment reminder failed for dispatch ${dispatchId}: ${String(err)}. Dispatch unaffected.`);
    return 'skipped';
  }
}

/** One escalation per dispatch, however many crew members stayed silent. */
async function escalateNoAnswer(
  deps: AssignmentReminderDeps,
  dispatchId: string,
  dispatch: {
    incident_id: string;
    created_at: Date | null;
    incidents: { status: unknown };
    resources: { name: string; call_sign: string | null } | null;
  },
  responderName: string,
  reference: string,
): Promise<void> {
  const { prisma, logger } = deps;
  const since = dispatch.created_at ?? new Date(Date.now() - 60 * 60_000);
  const already = await prisma.escalation.findFirst({
    where: {
      incident_id: dispatch.incident_id,
      created_at: { gte: since },
      AND: [{ triggered_reason: { startsWith: NO_ANSWER_REASON_PREFIX } }],
    },
    select: { id: true },
  });
  if (already) return;

  const unit = dispatch.resources?.call_sign || dispatch.resources?.name || 'the unit';
  const minutes = Math.round((ASSIGNMENT_REMINDER_MAX * 30) / 60);
  const escalation = await prisma.escalation.create({
    data: {
      incident_id: dispatch.incident_id,
      escalation_level: 'LEVEL_1_SUPERVISOR',
      triggered_reason:
        `${NO_ANSWER_REASON_PREFIX} — ${reference}: ${responderName} (${unit}) has not accepted or declined ` +
        `in ${minutes} min. Consider reassigning.`,
      sla_breach_at: new Date(),
    },
  });
  logger.warn(`No answer to dispatch ${dispatchId} after ${minutes} min: escalation ${escalation.id}`);

  try {
    deps.realtime?.notifyEscalation(dispatch.incident_id, {
      escalationId: escalation.id,
      escalationType: 'RESPONDER_NO_ANSWER',
      incidentStatus: String(dispatch.incidents.status),
    });
  } catch (err) {
    logger.warn(`WS emit failed for no-answer escalation ${escalation.id}: ${String(err)}`);
  }

  // Supervisors (Dispatchers if none can sign in), same as an SLA breach.
  const recipients = await findEscalationRecipients(prisma, ['SUPERVISOR']).catch(() => []);
  await Promise.allSettled(
    recipients.map((r) =>
      deps.queue?.add('no-answer-escalation', {
        userId: r.id,
        channel: 'PUSH',
        title: 'Responder not answering',
        body: `${reference}: ${unit} has not answered its assignment in ${minutes} min.`,
        data: { incidentId: dispatch.incident_id, escalationId: escalation.id, escalationType: 'RESPONDER_NO_ANSWER' },
      } satisfies NotificationJobData),
    ),
  );
}
