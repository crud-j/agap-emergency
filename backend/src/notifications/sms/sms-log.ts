import { Logger } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Outbound SMS log (MOD-17, MOD-49): one row per gateway attempt, written by SmsProcessor.
 * Never the message text (OTP codes) and only the recipient's last 4 digits.
 */
export const SMS_LOG_KINDS = [
  'OPS_ALERT',
  'BARANGAY_ALERT',
  'BARANGAY_REPLY',
  'SOS_REPLY',
  'CONTACT_ALERT',
  'AUTH',
  'ID_REVIEW',
  'ANNOUNCEMENT',
  'NOTIFICATION',
  'OTHER',
] as const;
export type SmsLogKind = (typeof SMS_LOG_KINDS)[number];

export const SMS_LOG_STATUSES = ['ACCEPTED', 'FAILED', 'NOT_CONFIGURED'] as const;
export type SmsLogStatus = (typeof SMS_LOG_STATUSES)[number];

/** BullMQ job name → kind. Every `smsQueue.add` / `addBulk` names its job. */
const KIND_BY_JOB: Record<string, SmsLogKind> = {
  'emergency-sms': 'OPS_ALERT',
  'barangay-alert-sms': 'BARANGAY_ALERT',
  'barangay-followup-sms': 'BARANGAY_ALERT',
  'barangay-reply-ack': 'BARANGAY_REPLY',
  'citizen-sos-reply': 'SOS_REPLY',
  'contact-alert': 'CONTACT_ALERT',
  'emergency-contact-sms': 'CONTACT_ALERT',
  'otp-sms': 'AUTH',
  'id-review-sms': 'ID_REVIEW',
  'announcement-sms': 'ANNOUNCEMENT',
  'sms-opt-out-confirm': 'ANNOUNCEMENT',
  'notification-sms': 'NOTIFICATION',
};

export function smsKindForJob(jobName: string | undefined, data?: { noticeId?: string; announcementDeliveryId?: string }): SmsLogKind {
  const byName = jobName ? KIND_BY_JOB[jobName] : undefined;
  if (byName) return byName;
  if (data?.noticeId) return 'BARANGAY_ALERT';
  if (data?.announcementDeliveryId) return 'ANNOUNCEMENT';
  return 'OTHER';
}

/** Last 4 digits of a phone number, or null when there aren't 4. */
export function phoneLast4(phone: string | undefined | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Strip anything that could be a phone number or a credential; keep it short. */
export function scrubSmsError(reason: string | undefined): string | null {
  if (!reason) return null;
  return reason
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[number]')
    .replace(/[A-Za-z0-9_\-+/=]{24,}/g, '[redacted]')
    .slice(0, 200);
}

export interface SmsLogEntry {
  kind: SmsLogKind;
  jobName: string;
  phone: string | undefined;
  status: SmsLogStatus;
  gatewayStatus?: number | undefined;
  error?: string | undefined;
  attempt: number;
  chars: number;
  durationMs: number;
  incidentId?: string | undefined;
}

const logger = new Logger('SmsLog');

/** Best effort: a failed log write never fails or retries the SMS itself. */
export async function recordSmsAttempt(prisma: PrismaService | undefined, entry: SmsLogEntry): Promise<void> {
  if (!prisma) return;
  try {
    await prisma.sms_log.create({
      data: {
        kind: entry.kind,
        job_name: entry.jobName.slice(0, 60),
        recipient_last4: phoneLast4(entry.phone),
        status: entry.status,
        gateway_status: entry.gatewayStatus ?? null,
        error: scrubSmsError(entry.error),
        attempt: Math.min(entry.attempt, 32767),
        chars: Math.min(entry.chars, 32767),
        duration_ms: Math.round(entry.durationMs),
        incident_id: isUuid(entry.incidentId) ? entry.incidentId : null,
      },
    });
  } catch (err) {
    logger.warn(`Writing the SMS log row failed (${err instanceof Error ? err.name : 'error'}); the SMS is unaffected`);
  }
}

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
