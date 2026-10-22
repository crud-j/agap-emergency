import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IncidentStatus, QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/** Android channel for incident updates; mobile creates it in push-registration.ts. */
export const INCIDENT_UPDATES_CHANNEL = 'incident-updates';

interface Message {
  type: string;
  title: string;
  body: (ref: string) => string;
}

// Every step of the reporter's timeline (MOD-42). CANCELLED is left out: only the
// reporter cancels. No names, medical data or addresses — only the public reference.
const REPORTER_MESSAGES: Partial<Record<IncidentStatus, Message>> = {
  [IncidentStatus.ACKNOWLEDGED]: {
    type: 'INCIDENT_ACKNOWLEDGED',
    title: 'Report received',
    body: (ref) => `MDRRMO has received your report ${ref} and is reviewing it.`,
  },
  [IncidentStatus.DISPATCHED]: {
    type: 'INCIDENT_DISPATCHED',
    title: 'Help is on the way',
    body: (ref) => `Responders have been dispatched for ${ref}.`,
  },
  [IncidentStatus.EN_ROUTE]: {
    type: 'INCIDENT_EN_ROUTE',
    title: 'Responders on the way',
    body: (ref) => `Responders are travelling to the scene for ${ref}. Open AGAP for the estimated arrival.`,
  },
  [IncidentStatus.ON_SCENE]: {
    type: 'INCIDENT_ON_SCENE',
    title: 'Responders have arrived',
    body: (ref) => `Responders are now at the scene for ${ref}.`,
  },
  [IncidentStatus.TRANSPORTING]: {
    type: 'INCIDENT_TRANSPORTING',
    title: 'Patient being transported',
    body: (ref) => `Responders are taking the patient to a receiving facility for ${ref}.`,
  },
  [IncidentStatus.ASSISTING]: {
    type: 'INCIDENT_ASSISTING',
    title: 'Responders assisting',
    body: (ref) => `Responders are assisting at the scene for ${ref}.`,
  },
  [IncidentStatus.RESOLVED]: {
    type: 'INCIDENT_RESOLVED',
    title: 'Incident resolved',
    body: (ref) => `Responders have finished at the scene for ${ref}.`,
  },
  [IncidentStatus.CLOSED]: {
    type: 'INCIDENT_CLOSED',
    title: 'Incident closed',
    body: (ref) => `${ref} is now closed. Thank you for reporting through AGAP. You are a Verified Reporter.`,
  },
  [IncidentStatus.REFERRED]: {
    type: 'INCIDENT_REFERRED',
    title: 'Report referred',
    body: (ref) => `${ref} has been referred to a partner agency, which will follow up.`,
  },
  [IncidentStatus.UNABLE_TO_RESPOND]: {
    type: 'INCIDENT_UNABLE_TO_RESPOND',
    title: 'Unable to respond',
    body: (ref) => `MDRRMO could not send responders for ${ref}. If you still need help, call 911 or the MDRRMO hotline.`,
  },
  [IncidentStatus.FALSE_ALERT]: {
    type: 'INCIDENT_FALSE_ALERT',
    title: 'Report closed',
    body: (ref) => `${ref} was reviewed and closed as a false alert. If you still need help, call 911 or report again.`,
  },
  [IncidentStatus.DUPLICATE]: {
    type: 'INCIDENT_DUPLICATE',
    title: 'Report merged',
    body: (ref) => `${ref} matched another report of the same emergency. Responders are handling it there.`,
  },
};

// Responder progress the assigning dispatcher hears about. RESOLVED asks them to close.
const DISPATCHER_MESSAGES: Partial<Record<IncidentStatus, { type: string; title: string; body: (unit: string, ref: string) => string }>> = {
  [IncidentStatus.EN_ROUTE]: {
    type: 'RESPONDER_EN_ROUTE',
    title: 'Unit en route',
    body: (unit, ref) => `${unit} is en route to ${ref}.`,
  },
  [IncidentStatus.ON_SCENE]: {
    type: 'RESPONDER_ON_SCENE',
    title: 'Unit on scene',
    body: (unit, ref) => `${unit} has arrived at ${ref}.`,
  },
  [IncidentStatus.TRANSPORTING]: {
    type: 'RESPONDER_TRANSPORTING',
    title: 'Unit transporting',
    body: (unit, ref) => `${unit} is transporting the patient for ${ref}.`,
  },
  [IncidentStatus.ASSISTING]: {
    type: 'RESPONDER_ASSISTING',
    title: 'Unit assisting',
    body: (unit, ref) => `${unit} is assisting on scene at ${ref}.`,
  },
  [IncidentStatus.RESOLVED]: {
    type: 'INCIDENT_AWAITING_CLOSURE',
    title: 'Awaiting closure',
    body: (unit, ref) => `${unit} marked ${ref} resolved. Record the outcome and close it.`,
  },
};

/**
 * Status notifications for an incident (MOD-16/MOD-42/MOD-45). Call only after the
 * status change commits; neither method throws, so a notification failure can't
 * touch the incident.
 */
@Injectable()
export class IncidentStatusNotifier {
  private readonly logger = new Logger(IncidentStatusNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
  ) {}

  /**
   * Tells the reporter (never the patient or anyone nearby): an in-app feed row
   * first, then a push so a closed app still hears about it.
   */
  async notifyReporter(incidentId: string, newStatus: IncidentStatus): Promise<void> {
    const message = REPORTER_MESSAGES[newStatus];
    if (!message) return;
    try {
      const incident = await this.prisma.incident.findUnique({
        where: { id: incidentId },
        select: { public_reference: true, incident_reporters: { select: { user_id: true } } },
      });
      const userId = incident?.incident_reporters?.user_id;
      if (!incident || !userId) return;

      const publicReference = incident.public_reference;
      const body = message.body(publicReference);
      const data = { incidentId, publicReference, status: newStatus, type: message.type };

      // PostgreSQL first: the feed row survives a missed push.
      await this.notifications.create({
        userId,
        eventType: message.type,
        title: message.title,
        body,
        channel: 'PUSH',
        incidentId,
        dataPayload: data,
      });

      // Stable jobId: a retry or double call for the same transition sends once.
      await this.notificationQueue.add(
        'incident-status-push',
        {
          userId,
          channel: 'PUSH',
          title: message.title,
          body,
          data,
          androidChannelId: INCIDENT_UPDATES_CHANNEL,
        },
        { jobId: `reporter-status:${incidentId}:${newStatus}` },
      );
    } catch (err) {
      this.logger.error(
        `Reporter ${newStatus} notification failed for incidentId=${incidentId}: ${String(err)}. Incident unaffected.`,
      );
    }
  }

  /**
   * Tells the dispatcher who assigned the unit about a responder's progress, in the
   * console's notification bell (the web console has no device push).
   */
  async notifyDispatcher(incidentId: string, newStatus: IncidentStatus, dispatchId: string): Promise<void> {
    const message = DISPATCHER_MESSAGES[newStatus];
    if (!message) return;
    try {
      const dispatch = await this.prisma.dispatches.findUnique({
        where: { id: dispatchId },
        select: {
          dispatcher_id: true,
          resources: { select: { call_sign: true } },
          incidents: { select: { public_reference: true } },
        },
      });
      if (!dispatch) return;

      const unit = dispatch.resources?.call_sign ?? 'The unit';
      const publicReference = dispatch.incidents.public_reference;
      await this.notifications.create({
        userId: dispatch.dispatcher_id,
        eventType: message.type,
        title: message.title,
        body: message.body(unit, publicReference),
        channel: 'IN_APP',
        incidentId,
        dataPayload: { incidentId, publicReference, dispatchId, status: newStatus, type: message.type },
      });
    } catch (err) {
      this.logger.error(
        `Dispatcher ${newStatus} notification failed for incidentId=${incidentId}: ${String(err)}. Incident unaffected.`,
      );
    }
  }
}
