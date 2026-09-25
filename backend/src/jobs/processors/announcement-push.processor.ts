import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

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

    if (getApps().length === 0) {
      this.logger.warn('Firebase not initialized — announcement push skipped');
      return;
    }

    try {
      // 1. Fetch all registered FCM tokens from system_configurations
      const tokenRecords = await this.prisma.system_configurations.findMany({
        where: { config_key: { startsWith: 'fcm_token:' } },
      });

      if (tokenRecords.length === 0) {
        this.logger.log(`No FCM tokens registered — announcement ${announcementId} push skipped`);
        return;
      }

      // 2. Extract userIds from keys
      let recipientIds = tokenRecords.map((r) => r.config_key.replace('fcm_token:', ''));

      // 3. If barangay-scoped, filter to users in target barangays
      if (targetBarangays.length > 0) {
        const usersInScope = await this.prisma.user.findMany({
          where: {
            id: { in: recipientIds },
            barangay: { in: targetBarangays },
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        const scopedIds = new Set(usersInScope.map((u) => u.id));
        recipientIds = recipientIds.filter((id) => scopedIds.has(id));
      }

      const filteredRecords = tokenRecords.filter((r) =>
        recipientIds.includes(r.config_key.replace('fcm_token:', '')),
      );

      // 4. Fan-out FCM sends — per-token try/catch, never abort batch
      let sent = 0;
      for (const record of filteredRecords) {
        const token = record.config_value as string;
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

      // 5. Update push_sent_count on announcement
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
