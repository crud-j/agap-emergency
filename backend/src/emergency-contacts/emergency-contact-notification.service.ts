import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { QUEUE_NAMES, SMS_SEGMENT_MAX, fitGsm7, gsm7Length, incidentTypeSmsLabel, toGsm7 } from '@agap/shared';
import type { SmsJobData } from '../jobs/processors/sms.processor';

/**
 * MOD-16: the text to the reporter's emergency contacts. Says who, what, that MDRRMO
 * knows, and that this person was listed as their contact (so it doesn't read as spam).
 * The name is shortened, never the rest. One GSM-7 segment.
 *
 * `AGAP: Juan Dela Cruz reported an emergency (Road accident) and named you as their
 * emergency contact. MDRRMO has been alerted. Ref INC-2026-001234.`
 */
export function buildContactAlertSms(fullName: string | null, category: string, publicReference: string): string {
  const label = incidentTypeSmsLabel(category);
  const rest =
    ` reported an emergency (${label}) and named you as their emergency contact.` +
    ` MDRRMO has been alerted. Ref ${publicReference}.`;
  const name = toGsm7(fullName ?? '') || 'Someone';
  const room = SMS_SEGMENT_MAX - gsm7Length('AGAP: ') - gsm7Length(rest);
  return `AGAP: ${fitGsm7(name, room)}${rest}`;
}

@Injectable()
export class EmergencyContactNotificationService {
  private readonly logger = new Logger(EmergencyContactNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {}

  /**
   * MOD-16: Fire-and-forget. Resolves the reporter's active emergency
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

      const message = buildContactAlertSms(reporter?.full_name ?? null, category, publicReference);

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
