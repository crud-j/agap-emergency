import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { QUEUE_NAMES } from '@agap/shared';
import type { SmsJobData } from '../jobs/processors/sms.processor';

@Injectable()
export class EmergencyContactNotificationService {
  private readonly logger = new Logger(EmergencyContactNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {}

  /**
   * MOD-16: Fire-and-forget. Resolves the reporter's active notify_on_alert
   * contacts and queues one SMS per contact via Textbee. Never throws —
   * a failure here must never affect the incident record (Reliability Rule).
   */
  async notifyContactsOfIncident(
    reporterUserId: string,
    incidentId: string,
    publicReference: string,
    category: string,
  ): Promise<void> {
    try {
      const [contacts, reporter] = await Promise.all([
        this.prisma.emergencyContact.findMany({
          where: { user_id: reporterUserId, is_active: true, notify_on_alert: true },
          orderBy: { priority_order: 'asc' },
        }),
        this.prisma.user.findUnique({
          where: { id: reporterUserId },
          select: { full_name: true },
        }),
      ]);

      if (contacts.length === 0) return;

      const name = reporter?.full_name ?? 'A user';
      const type = category.replace(/_/g, ' ');
      const text = `AGAP: ${name} reported a ${type} emergency. Ref: ${publicReference}. Please stand by. -MDRRMO Bocaue`;
      const message = text.length > 160 ? text.slice(0, 159) + '…' : text;

      const jobs = contacts.map((c) => ({
        name: 'contact-alert' as const,
        data: { phone: c.phone_number, message, incidentId } satisfies SmsJobData,
        opts: { attempts: 2, backoff: { type: 'fixed' as const, delay: 5000 } },
      }));

      await this.smsQueue.addBulk(jobs);

      this.logger.log(
        `Queued ${contacts.length} contact alert(s) for ${publicReference}`,
      );
    } catch (err) {
      this.logger.warn(
        `Contact notification skipped for ${publicReference}: ${String(err)}. Incident unaffected.`,
      );
    }
  }
}
