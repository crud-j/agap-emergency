import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { INCIDENT_UPDATES_CHANNEL } from './incident-status-notifier';

/** Plain names for the ics_position enum, as people see them in the app and console. */
export const ICS_POSITION_LABELS: Record<string, string> = {
  INCIDENT_COMMANDER: 'Incident Commander',
  OPERATIONS_SECTION_CHIEF: 'Operations Chief',
  PLANNING_SECTION_CHIEF: 'Planning Chief',
  LOGISTICS_SECTION_CHIEF: 'Logistics Chief',
  SAFETY_OFFICER: 'Safety Officer',
  PUBLIC_INFORMATION_OFFICER: 'Public Information Officer',
  LIAISON_OFFICER: 'Liaison Officer',
};

export type IcsNoticeKind = 'ASSIGNED' | 'RELIEVED' | 'COMMAND_ENDED';

export interface IcsNotice {
  kind: IcsNoticeKind;
  userId: string;
  incidentId: string;
  /** The ics_assignments row; makes the push job id stable so a retry sends once. */
  assignmentId: string;
  position: string;
}

const EVENT_TYPE: Record<IcsNoticeKind, string> = {
  ASSIGNED: 'ICS_POSITION_ASSIGNED',
  RELIEVED: 'ICS_POSITION_RELIEVED',
  COMMAND_ENDED: 'ICS_COMMAND_ENDED',
};

/**
 * Tells a person when they are given an Incident Command job, relieved of it, or
 * command ends (MOD-36). Feed row first (PostgreSQL), then a push for phones; the web
 * console shows the feed row in its bell. Only the public reference and job name are
 * sent, never patient or reporter details. Failures are logged and never touch the
 * incident or the assignment.
 */
@Injectable()
export class IcsNotifier {
  private readonly logger = new Logger(IcsNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
  ) {}

  async notify(notice: IcsNotice): Promise<void> {
    try {
      const incident = await this.prisma.incident.findUnique({
        where: { id: notice.incidentId },
        select: { public_reference: true },
      });
      if (!incident) return;

      const ref = incident.public_reference;
      const job = ICS_POSITION_LABELS[notice.position] ?? 'a command job';
      const { title, body } = this.message(notice.kind, job, ref);
      const type = EVENT_TYPE[notice.kind];

      // A responder crewing a unit on this incident opens their assignment on tap.
      const crew = await this.prisma.dispatch_crew.findFirst({
        where: { user_id: notice.userId, dispatches: { incident_id: notice.incidentId } },
        orderBy: { dispatches: { created_at: 'desc' } },
        select: { dispatch_id: true },
      });

      const data: Record<string, unknown> = {
        type,
        incidentId: notice.incidentId,
        publicReference: ref,
        position: notice.position,
        ...(crew ? { dispatchId: crew.dispatch_id } : {}),
      };

      await this.notifications.create({
        userId: notice.userId,
        eventType: type,
        title,
        body,
        channel: 'PUSH',
        incidentId: notice.incidentId,
        dataPayload: data,
      });

      await this.notificationQueue.add(
        'ics-push',
        { userId: notice.userId, channel: 'PUSH', title, body, data, androidChannelId: INCIDENT_UPDATES_CHANNEL },
        { jobId: `ics:${notice.assignmentId}:${notice.kind}` },
      );
    } catch (err) {
      this.logger.error(
        `ICS ${notice.kind} notification failed for incidentId=${notice.incidentId}: ${String(err)}. Command unaffected.`,
      );
    }
  }

  private message(kind: IcsNoticeKind, job: string, ref: string): { title: string; body: string } {
    switch (kind) {
      case 'ASSIGNED':
        return {
          title: `You are the ${job}`,
          body: `MDRRMO named you ${job} for ${ref}. Open AGAP to see the plan and who does what.`,
        };
      case 'RELIEVED':
        return {
          title: 'Command job ended',
          body: `You are no longer the ${job} for ${ref}.`,
        };
      case 'COMMAND_ENDED':
        return {
          title: 'Incident Command ended',
          body: `Incident Command for ${ref} has ended. You are released as ${job}.`,
        };
    }
  }
}
