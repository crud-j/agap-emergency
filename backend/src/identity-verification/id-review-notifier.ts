import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** The exact texts of plan §7: no names, no ID number. Push and SMS say the same thing. */
export const ID_REVIEW_MESSAGES = {
  APPROVED: {
    type: 'ID_VERIFICATION_APPROVED',
    title: 'ID check approved',
    body: 'Your AGAP account ID check was approved.',
  },
  REJECTED: {
    type: 'ID_VERIFICATION_REJECTED',
    title: 'ID check not approved',
    body: 'Your AGAP account ID check was not approved. Open AGAP to scan again.',
  },
  /** Staff released the card from this account. Says why only as far as the citizen must act. */
  RELEASED: {
    type: 'ID_VERIFICATION_RELEASED',
    title: 'ID check removed',
    body: 'Your AGAP account ID check was removed. Open AGAP to scan again.',
  },
} as const;

/**
 * Tells the citizen how staff decided their PhilHealth ID check (plan §7): an in-app row and a
 * push, then an SMS. Call only after the decision commits. Never throws: a notification failure
 * can't undo the decision. Logs carry the user id only, never the phone number.
 */
@Injectable()
export class IdReviewNotifier {
  private readonly logger = new Logger(IdReviewNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {}

  async notifyDecision(userId: string, decision: keyof typeof ID_REVIEW_MESSAGES): Promise<void> {
    const message = ID_REVIEW_MESSAGES[decision];
    const data = { type: message.type };

    try {
      // PostgreSQL first: the feed row survives a missed push.
      await this.notifications.create({
        userId,
        eventType: message.type,
        title: message.title,
        body: message.body,
        channel: 'PUSH',
        dataPayload: data,
      });
      await this.notificationQueue.add('id-review-push', {
        userId,
        channel: 'PUSH',
        title: message.title,
        body: message.body,
        data,
      });
    } catch (err) {
      this.logger.warn(`ID review push failed for userId=${userId} (${errorName(err)}); the decision stands`);
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone_number: true } });
      if (user?.phone_number) {
        await this.smsQueue.add('id-review-sms', { phone: user.phone_number, message: message.body });
      }
    } catch (err) {
      this.logger.warn(`ID review SMS failed for userId=${userId} (${errorName(err)}); the decision stands`);
    }
  }
}

const errorName = (err: unknown): string => (err instanceof Error ? err.name : 'unknown error');
