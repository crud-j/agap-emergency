import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';

export interface AnnouncementPushJobData {
  announcementId: string;
  title: string;
  body: string;
  targetBarangays: string[];
}

@Processor(QUEUE_NAMES.PUSH_NOTIFICATIONS)
export class AnnouncementPushProcessor extends WorkerHost {
  private readonly logger = new Logger(AnnouncementPushProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {
    super();
    if (getApps().length === 0) {
      const projectId = config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = config.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
      if (projectId && clientEmail && privateKey) {
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
        this.logger.log('Firebase Admin initialized for announcement push');
      } else {
        this.logger.warn('Firebase not configured — announcement push broadcasts will be skipped');
      }
    }
  }

  async process(job: Job<AnnouncementPushJobData>): Promise<void> {
    const { announcementId, title, body, targetBarangays } = job.data;
    this.logger.log(`Processing announcement push broadcast for ${announcementId}`);

    try {
      // 1. Resolve active citizen recipients first. In-app notifications are
      // persisted for every citizen, while push is sent only where a device
      // token is registered.
      const users = await this.prisma.user.findMany({
        where: {
          role: 'CITIZEN',
          status: 'ACTIVE',
          ...(targetBarangays.length > 0 ? { barangay: { in: targetBarangays } } : {}),
        },
        select: { id: true },
      });
      const recipientIds = users.map((user) => user.id);

      const existingNotifications = await this.prisma.notification.findMany({
        where: {
          recipient_user_id: { in: recipientIds },
          event_type: 'ANNOUNCEMENT',
        },
        select: { recipient_user_id: true, data_payload: true },
      });
      const alreadyNotified = new Set(
        existingNotifications
          .filter((notification) => {
            const payload = notification.data_payload;
            return (
              payload !== null &&
              typeof payload === 'object' &&
              !Array.isArray(payload) &&
              'announcementId' in payload &&
              payload.announcementId === announcementId
            );
          })
          .map((notification) => notification.recipient_user_id),
      );

      for (const userId of recipientIds.filter((id) => !alreadyNotified.has(id))) {
        try {
          const notification = await this.prisma.notification.create({
            data: {
              recipient_user_id: userId,
              channel: 'IN_APP',
              event_type: 'ANNOUNCEMENT',
              title,
              body,
              data_payload: { announcementId, type: 'ANNOUNCEMENT' },
            },
          });
          this.realtime.notificationCreated({
            notificationId: notification.id,
            userId,
            type: 'ANNOUNCEMENT',
            title,
            body,
            createdAt: notification.created_at.toISOString(),
          });
        } catch (err) {
          this.logger.warn(`In-app notification failed for user ${userId}: ${String(err)}`);
        }
      }

      if (getApps().length === 0) {
        this.logger.warn('Firebase not initialized — announcement push skipped');
        return;
      }

      // 2. Fetch all registered FCM tokens from system_configurations
      const tokenRecords = await this.prisma.system_configurations.findMany({
        where: { config_key: { startsWith: 'fcm_token:' } },
      });

      if (tokenRecords.length === 0) {
        this.logger.log(`No FCM tokens registered — announcement ${announcementId} push skipped`);
        return;
      }

      const filteredRecords = tokenRecords.filter((r) =>
        recipientIds.includes(r.config_key.replace('fcm_token:', '')),
      );

      // 3. Fan-out FCM sends — per-token try/catch, never abort batch.
      // Tokens are stored as JSON objects by NotificationsService, but accept
      // the legacy raw-string shape as well.
      let sent = 0;
      for (const record of filteredRecords) {
        const value = record.config_value;
        const token =
          typeof value === 'string'
            ? value
            : value && typeof value === 'object' && !Array.isArray(value) && 'fcmToken' in value
              ? value.fcmToken
              : null;
        if (!token || typeof token !== 'string') continue;
        try {
          await getMessaging().send({
            token,
            notification: { title, body },
            data: { announcementId, type: 'ANNOUNCEMENT' },
          });
          sent++;
        } catch (err) {
          this.logger.warn(`FCM send failed (token …${token.slice(-6)}): ${String(err)}`);
        }
      }

      // 4. Update push_sent_count on announcement
      await this.prisma.announcement.update({
        where: { id: announcementId },
        data: { push_sent_count: sent },
      });

      this.logger.log(`Announcement push broadcast complete: ${sent}/${filteredRecords.length} sent`);
    } catch (err) {
      this.logger.error(`Announcement push broadcast failed for ${announcementId}: ${String(err)}`);
    }
  }
}
