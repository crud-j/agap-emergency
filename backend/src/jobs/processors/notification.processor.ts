import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { getApps } from 'firebase-admin/app';
import { getMessaging, type Message } from 'firebase-admin/messaging';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { tokenFromConfig } from '../../notifications/push-token';
import { ensureFirebaseApp } from '../../notifications/firebase-admin';
import { RealtimeService } from '../../realtime/realtime.service';
import { runAssignmentReminder } from '../assignment-reminder';

export interface NotificationJobData {
  userId?: string;
  /** A guest following their report (no account): the device token is read from that row. */
  guestFollowerId?: string;
  phone?: string;
  channel: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android notification channel; omitted → the app's `default` channel. */
  androidChannelId?: string;
  /** Android tag: a later push with the same tag replaces this one in the shade (and alerts again). */
  androidTag?: string;
  /**
   * Send as a data-only FCM message (no `notification` block), so the app's code runs
   * even when it is closed: a new assignment rings until answered (mobile
   * assignment-ring-task.ts). The app still shows it like a normal push without that code.
   */
  androidDataOnly?: boolean;
  /** How long FCM keeps trying to deliver it, in ms (FCM default: 4 weeks). */
  androidTtlMs?: number;
}

/**
 * The FCM message for one push. A data-only message carries its text in `data`: `title`,
 * `message` (expo-notifications reads these and shows the push itself when the app is in
 * the background), `channelId` and `tag` (the shade entry that later pushes replace).
 * Never put a `body` key in `data`: expo-notifications parses it as JSON.
 */
export function buildFcmMessage(token: string, data: NotificationJobData): Message {
  const payload: Record<string, string> = data.data
    ? Object.fromEntries(Object.entries(data.data).map(([k, v]) => [k, String(v)]))
    : {};
  const android = {
    ...(data.androidTtlMs !== undefined && { ttl: data.androidTtlMs }),
  };
  if (data.androidDataOnly) {
    return {
      token,
      data: {
        ...payload,
        ...(data.title !== undefined && { title: data.title }),
        message: data.body,
        ...(data.androidChannelId && { channelId: data.androidChannelId }),
        ...(data.androidTag && { tag: data.androidTag }),
      },
      android: { ...android, priority: 'high' },
    };
  }
  return {
    token,
    notification: {
      body: data.body,
      ...(data.title !== undefined && { title: data.title }),
    },
    data: payload,
    ...((data.androidChannelId || data.androidTag || data.androidTtlMs !== undefined) && {
      android: {
        ...android,
        priority: 'high',
        notification: {
          ...(data.androidChannelId && { channelId: data.androidChannelId }),
          ...(data.androidTag && { tag: data.androidTag }),
        },
      },
    }),
  };
}

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
    /** For assignment reminders: the next check goes on this same queue. */
    @Optional() @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue?: Queue,
    @Optional() private readonly realtime?: RealtimeService,
  ) {
    super();
    ensureFirebaseApp(config, this.logger);
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.log(`Processing notification job ${job.id}: channel=${job.data.channel}`);
    try {
      switch (job.data.channel) {
        case 'PUSH':
          await this.sendPush(job.data);
          break;
        case 'SMS':
          await this.smsQueue.add('notification-sms', {
            phone: job.data.phone ?? '',
            message: job.data.body,
          });
          break;
        case 'IN_APP':
          this.logger.log(`IN_APP notification queued for userId=${job.data.userId}`);
          break;
        case 'EMERGENCY_CONTACTS':
          await this.notifyEmergencyContacts(job.data);
          break;
        case 'ASSIGNMENT_REMINDER':
          await runAssignmentReminder(
            {
              prisma: this.prisma,
              queue: this.notificationQueue,
              realtime: this.realtime,
              push: (data) => this.sendPush(data),
              logger: this.logger,
            },
            { userId: job.data.userId, ...job.data.data },
          );
          break;
        default:
          this.logger.warn(`Unknown channel: ${job.data.channel}`);
      }
    } catch (err) {
      this.logger.error(`Notification job ${job.id} failed: ${String(err)}. Incident not affected.`);
    }
  }

  private async sendPush(data: NotificationJobData): Promise<void> {
    if (data.guestFollowerId) return this.sendGuestPush(data, data.guestFollowerId);
    if (!data.userId) return;
    try {
      // FCM tokens stored in system_configurations with key `fcm_token:{userId}`
      const tokenRecord = await this.prisma.system_configurations.findFirst({
        where: { config_key: `fcm_token:${data.userId}` },
      });

      // No row = the user never signed in to the mobile app (normal for console-only staff
      // such as Dispatchers and Supervisors); the in-app notification already covers them.
      if (!tokenRecord) {
        this.logger.debug(`No push device registered for userId=${data.userId}; PUSH skipped`);
        return;
      }
      const token = tokenFromConfig(tokenRecord.config_value);
      if (!token) {
        this.logger.warn(`Unreadable FCM token record for userId=${data.userId}; PUSH skipped`);
        return;
      }

      if (getApps().length === 0) {
        this.logger.warn('Firebase not initialized — PUSH skipped');
        return;
      }

      await this.sendFcm(token, data);

      this.logger.log(`Push sent to userId=${data.userId}`);
    } catch (err) {
      this.logger.error(`Push failed for userId=${data.userId}: ${String(err)}`);
    }
  }

  /** Push to a guest's phone (MOD-42). Skipped once the link expired or push was turned off. */
  private async sendGuestPush(data: NotificationJobData, followerId: string): Promise<void> {
    try {
      const follower = await this.prisma.guest_report_followers.findUnique({
        where: { id: followerId },
        select: { push_token: true, expires_at: true },
      });
      if (!follower?.push_token || follower.expires_at <= new Date()) {
        this.logger.debug(`Guest follower ${followerId} has no live push token; PUSH skipped`);
        return;
      }
      if (getApps().length === 0) {
        this.logger.warn('Firebase not initialized — PUSH skipped');
        return;
      }
      try {
        await this.sendFcm(follower.push_token, data);
        this.logger.log(`Push sent to guest follower ${followerId}`);
      } catch (err) {
        // The app was uninstalled or the token rotated: stop trying this device.
        const code = (err as { code?: unknown })?.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          await this.prisma.guest_report_followers.update({ where: { id: followerId }, data: { push_token: null } });
        }
        throw err;
      }
    } catch (err) {
      this.logger.error(`Push failed for guest follower ${followerId}: ${String(err)}`);
    }
  }

  private async sendFcm(token: string, data: NotificationJobData): Promise<void> {
    await getMessaging().send(buildFcmMessage(token, data));
  }

  private async notifyEmergencyContacts(data: NotificationJobData): Promise<void> {
    if (!data.userId) return;
    try {
      // Same opt-in as the first alert (MOD-16): a contact who switched off alerts
      // must not get the "responders on the way" follow-up either.
      const contacts = await this.prisma.emergencyContact.findMany({
        where: { user_id: data.userId, is_active: true, notify_on_alert: true },
        orderBy: { priority_order: 'asc' },
      });

      for (const contact of contacts) {
        if (contact.phone_number) {
          await this.smsQueue.add('emergency-contact-sms', {
            phone: contact.phone_number,
            message: data.body,
          });
        }
      }

      this.logger.log(`Enqueued SMS for ${contacts.length} emergency contact(s) of userId=${data.userId}`);
    } catch (err) {
      this.logger.error(`Emergency contact notify failed for userId=${data.userId}: ${String(err)}`);
    }
  }
}
