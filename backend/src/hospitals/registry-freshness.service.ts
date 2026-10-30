import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserRole } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BLOCKED_ACCOUNT_STATUSES } from '../auth/account-status';
import { activeMemberOrgIds } from '../organizations/org-scope';

/** In-app notice: a facility's receiving status needs confirming (to its hospital users). */
export const HOSPITAL_STATUS_STALE = 'HOSPITAL_STATUS_STALE';
/** In-app notice: registry rows to review this month (to Org Administrators). */
export const REGISTRY_REVIEW_DUE = 'REGISTRY_REVIEW_DUE';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A receiving status older than this is chased, at most once per facility per window. */
export const STATUS_REMINDER_AFTER_MS = 6 * HOUR_MS;
/**
 * A few minutes short of 6 h: a notice is written a moment after its run starts, so a full
 * 6 h window would still see it on the run 6 h later and push the next reminder to 7 h.
 */
export const STATUS_REMINDER_DEDUP_MS = STATUS_REMINDER_AFTER_MS - 5 * 60 * 1000;
/** Facilities not verified, and resources not updated, for this long are listed monthly. */
export const REGISTRY_REVIEW_AFTER_MS = 90 * DAY_MS;
/** The digest names at most this many rows of each kind; the rest are counted. */
const DIGEST_NAMES = 5;

/** Users who can sign in (same rule as findEscalationRecipients). */
const CAN_SIGN_IN = { status: { notIn: [...BLOCKED_ACCOUNT_STATUSES] as any[] } };

/**
 * MOD-39 (AUTOMATION_NEEDS_PLAN Phase 4, C8): chases stale registry data with in-app
 * notices. It never writes a facility or a resource: the stored status stays what a
 * person reported, and the referral ranking (C6) only reads its age. A failed run logs
 * and waits for the next tick.
 */
@Injectable()
export class RegistryFreshnessService {
  private readonly logger = new Logger(RegistryFreshnessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 * * * *')
  async hourly(): Promise<void> {
    await this.remindStaleStatuses(new Date());
  }

  // 08:00 Philippine time on the 1st, whatever the server's zone.
  @Cron('0 8 1 * *', { timeZone: 'Asia/Manila' })
  async monthly(): Promise<void> {
    await this.sendRegistryDigests(new Date());
  }

  /**
   * One notice to each hospital user of the facility's organization when its receiving
   * status is older than 6 h (or was never reported), unless one went out for that
   * facility in the last 6 h. Returns how many notices were created.
   */
  async remindStaleStatuses(now: Date): Promise<number> {
    try {
      const cutoff = new Date(now.getTime() - STATUS_REMINDER_AFTER_MS);
      const stale = await this.prisma.facility.findMany({
        where: {
          is_active: true,
          organization_id: { not: null },
          OR: [{ receiving_status_updated_at: null }, { receiving_status_updated_at: { lt: cutoff } }],
        },
        select: { id: true, name: true, organization_id: true, receiving_status_updated_at: true },
      });
      let sent = 0;
      for (const facility of stale) {
        try {
          sent += await this.remindFacility(facility, now);
        } catch (err) {
          this.logger.warn(`Status reminder for facility ${facility.id} failed: ${String(err)}`);
        }
      }
      return sent;
    } catch (err) {
      this.logger.error(`Receiving status reminders failed: ${String(err)}`);
      return 0;
    }
  }

  private async remindFacility(
    facility: { id: string; name: string; organization_id: string | null; receiving_status_updated_at: Date | null },
    now: Date,
  ): Promise<number> {
    const recent = await this.prisma.notification.findFirst({
      where: {
        event_type: HOSPITAL_STATUS_STALE,
        created_at: { gte: new Date(now.getTime() - STATUS_REMINDER_DEDUP_MS) },
        data_payload: { path: ['facilityId'], equals: facility.id },
      },
      select: { id: true },
    });
    if (recent) return 0;

    // Active members of the facility's organization with the Hospital User role (the same
    // membership rule as activeMemberOrgIds, asked from the organization's side).
    const recipients = await this.prisma.user.findMany({
      where: {
        role: UserRole.HOSPITAL_USER as any,
        ...CAN_SIGN_IN,
        organization_memberships: { some: { organization_id: facility.organization_id!, is_active: true } },
      },
      select: { id: true },
    });
    if (recipients.length === 0) return 0;

    const updatedAt = facility.receiving_status_updated_at;
    const age = updatedAt
      ? `was last updated ${Math.floor((now.getTime() - updatedAt.getTime()) / HOUR_MS)} h ago`
      : 'has never been reported';
    const results = await Promise.allSettled(
      recipients.map((r) =>
        this.notifications.create({
          userId: r.id,
          eventType: HOSPITAL_STATUS_STALE,
          title: 'Confirm your receiving status',
          body: `${facility.name}: the receiving status ${age}. Confirm or update it on the Hospitals page so dispatchers refer patients correctly.`,
          channel: 'IN_APP',
          dataPayload: { facilityId: facility.id, statusUpdatedAt: updatedAt?.toISOString() ?? null },
        }),
      ),
    );
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    if (sent < recipients.length) this.logger.warn(`Status reminder for facility ${facility.id} reached ${sent}/${recipients.length}`);
    return sent;
  }

  /**
   * One notice per Org Administrator listing their organizations' facilities not verified
   * in 90 days (`last_verified_at`) and resources not updated in 90 days (`updated_at`:
   * resources have no verification date, K4). Nobody else is told; nothing is changed.
   */
  async sendRegistryDigests(now: Date): Promise<number> {
    try {
      const cutoff = new Date(now.getTime() - REGISTRY_REVIEW_AFTER_MS);
      const admins = await this.prisma.user.findMany({
        where: { role: UserRole.ORG_ADMINISTRATOR as any, ...CAN_SIGN_IN },
        select: { id: true },
      });
      let sent = 0;
      for (const admin of admins) {
        try {
          sent += await this.digestFor(admin.id, cutoff);
        } catch (err) {
          this.logger.warn(`Registry digest for user ${admin.id} failed: ${String(err)}`);
        }
      }
      return sent;
    } catch (err) {
      this.logger.error(`Registry digests failed: ${String(err)}`);
      return 0;
    }
  }

  private async digestFor(adminId: string, cutoff: Date): Promise<number> {
    const orgIds = await activeMemberOrgIds(this.prisma, adminId);
    if (orgIds.length === 0) return 0;

    const [facilities, resources] = await Promise.all([
      this.prisma.facility.findMany({
        where: {
          organization_id: { in: orgIds },
          is_active: true,
          OR: [{ last_verified_at: null }, { last_verified_at: { lt: cutoff } }],
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.resources.findMany({
        where: { organization_id: { in: orgIds }, is_active: true, updated_at: { lt: cutoff } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    if (facilities.length === 0 && resources.length === 0) return 0;

    const parts = [
      facilities.length > 0 && `${count(facilities.length, 'facility', 'facilities')} not verified in 90 days (${names(facilities)})`,
      resources.length > 0 && `${count(resources.length, 'unit', 'units')} not updated in 90 days (${names(resources)})`,
    ].filter(Boolean);
    await this.notifications.create({
      userId: adminId,
      eventType: REGISTRY_REVIEW_DUE,
      title: 'Monthly registry check',
      body: `${parts.join('; ')}. Please review them.`,
      channel: 'IN_APP',
      dataPayload: { facilityIds: facilities.map((f) => f.id), resourceIds: resources.map((r) => r.id) },
    });
    return 1;
  }
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function names(rows: { name: string }[]): string {
  const shown = rows.slice(0, DIGEST_NAMES).map((r) => r.name).join(', ');
  return rows.length > DIGEST_NAMES ? `${shown} and ${rows.length - DIGEST_NAMES} more` : shown;
}
