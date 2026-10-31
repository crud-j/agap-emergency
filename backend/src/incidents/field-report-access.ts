import { BadRequestException, ConflictException, ForbiddenException, type Logger } from '@nestjs/common';
import { fieldFlowFor, type UnitFieldFlow } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { findEscalationRecipients } from '../jobs/escalation-recipients';

/**
 * What the crew field reports (fire reports, rescue trips; unit field flow plan
 * Phases 3–4) share: who may file, the radio-relay dispatch check, idempotent resends
 * and the deduplicated staff notice. One copy, used by both services.
 */

export const ACTIVE_DISPATCH_STATUSES = ['PENDING', 'SENT', 'ACCEPTED'];
/** One notice per incident (+ reason) in this window. */
export const FIELD_REPORT_ALERT_DEDUP_MS = 10 * 60 * 1000;

/**
 * Responder: crewed on an active dispatch of this incident whose unit has `flow`.
 * 403 when not on a crew here; 409 `{ code }` when on a crew of another unit type.
 * Returns that dispatch's id: the report is filed on it, whatever the phone sends.
 */
export async function assertFlowCrew(
  prisma: PrismaService,
  input: { incidentId: string; responderId: string; flow: UnitFieldFlow; code: string; message: string },
): Promise<string> {
  const crewed = await prisma.dispatches.findMany({
    where: {
      incident_id: input.incidentId,
      dispatch_crew: { some: { user_id: input.responderId } },
      status: { in: ACTIVE_DISPATCH_STATUSES as any[] },
    },
    select: { id: true, resources: { select: { resource_type: true } } },
  });
  if (crewed.length === 0) throw new ForbiddenException('You are not on an active crew for this incident.');
  const unit = crewed.find((d) => fieldFlowFor(d.resources?.resource_type) === input.flow);
  if (!unit) throw new ConflictException({ code: input.code, message: input.message });
  return unit.id;
}

/** An AMBULANCE unit is on an active dispatch of this incident. */
export async function hasActiveAmbulance(prisma: PrismaService, incidentId: string): Promise<boolean> {
  const count = await prisma.dispatches.count({
    where: {
      incident_id: incidentId,
      status: { in: ACTIVE_DISPATCH_STATUSES as any[] },
      resources: { resource_type: 'AMBULANCE' },
    },
  });
  return count > 0;
}

/** Dispatcher/Supervisor relaying a radio report: the unit is optional, but must be on this incident. */
export async function radioDispatch(
  prisma: PrismaService,
  incidentId: string,
  dispatchId: string | undefined,
): Promise<string | null> {
  if (!dispatchId) return null;
  const dispatch = await prisma.dispatches.findFirst({
    where: { id: dispatchId, incident_id: incidentId },
    select: { id: true },
  });
  if (!dispatch) throw new BadRequestException('Dispatch not found or does not belong to this incident');
  return dispatch.id;
}

/**
 * An offline resend (same client request ID) gets the first report back. The same ID
 * on another incident or from another person is refused (409 CLIENT_REQUEST_ID_REUSED).
 */
export async function findRepeatReport<T extends { incident_id: string; reported_by_id: string }>(
  lookup: (clientRequestId: string) => Promise<T | null>,
  clientRequestId: string | undefined,
  incidentId: string,
  actorId: string,
): Promise<T | null> {
  if (!clientRequestId) return null;
  const first = await lookup(clientRequestId);
  if (!first) return null;
  if (first.incident_id !== incidentId || first.reported_by_id !== actorId) {
    throw new ConflictException({ code: 'CLIENT_REQUEST_ID_REUSED', message: 'This request ID was already used for another report.' });
  }
  return first;
}

/**
 * An IN_APP notice to everyone with `roles`, linked to the incident, unless one with
 * the same event type (and `reason`, when given) went out for this incident in the last
 * 10 minutes. Returns false when deduplicated. A notice never acts: nothing is
 * dispatched, escalated or activated here.
 */
export async function notifyStaffOnce(
  deps: { prisma: PrismaService; notifications: NotificationsService; logger: Logger },
  notice: {
    eventType: string;
    incidentId: string;
    reason?: string;
    roles: string[];
    title: string;
    body: string;
    dataPayload: Record<string, unknown>;
  },
): Promise<boolean> {
  const recent = await deps.prisma.notification.findFirst({
    where: {
      event_type: notice.eventType,
      incident_id: notice.incidentId,
      created_at: { gte: new Date(Date.now() - FIELD_REPORT_ALERT_DEDUP_MS) },
      ...(notice.reason ? { data_payload: { path: ['reason'], equals: notice.reason } } : {}),
    },
    select: { id: true },
  });
  if (recent) return false;

  const recipients = await findEscalationRecipients(deps.prisma, notice.roles);
  const results = await Promise.allSettled(
    recipients.map((r) =>
      deps.notifications.create({
        userId: r.id,
        eventType: notice.eventType,
        title: notice.title,
        body: notice.body,
        channel: 'IN_APP',
        incidentId: notice.incidentId,
        dataPayload: notice.dataPayload,
      }),
    ),
  );
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) {
    deps.logger.warn(`${notice.eventType}${notice.reason ? ` ${notice.reason}` : ''}: ${failed}/${recipients.length} notice(s) failed for ${notice.incidentId}`);
  }
  return true;
}
