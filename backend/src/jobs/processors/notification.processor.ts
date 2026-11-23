import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { tokenFromConfig } from '../../notifications/push-token';
import { ensureFirebaseApp } from '../../notifications/firebase-admin';

export interface NotificationJobData {
  userId?: string;
  phone?: string;
  channel: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  /** Android notification channel; omitted → the app's `default` channel. */
  androidChannelId?: string;
}

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
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
        default:
          this.logger.warn(`Unknown channel: ${job.data.channel}`);
      }
    } catch (err) {
      this.logger.error(`Notification job ${job.id} failed: ${String(err)}. Incident not affected.`);
    }
  }

  private async sendPush(data: NotificationJobData): Promise<void> {
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

      await getMessaging().send({
        token,
        notification: {
          body: data.body,
          ...(data.title !== undefined && { title: data.title }),
        },
        data: data.data
          ? Object.fromEntries(Object.entries(data.data).map(([k, v]) => [k, String(v)]))
          : {},
        ...(data.androidChannelId && {
          android: { priority: 'high', notification: { channelId: data.androidChannelId } },
        }),
      });

      this.logger.log(`Push sent to userId=${data.userId}`);
    } catch (err) {
      this.logger.error(`Push failed for userId=${data.userId}: ${String(err)}`);
    }
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
