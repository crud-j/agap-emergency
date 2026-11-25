import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import { IncidentStatus, type GuestReportStatus } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  GUEST_FINISHED_STATUSES,
  GUEST_FOLLOW_TTL_MS,
  MAX_GUEST_FOLLOWERS_PER_INCIDENT,
} from './guest-follow.constants';

/** Merge chains followed upward (a report merged into a report that was merged again). */
const MAX_MERGE_DEPTH = 3;

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Tokens are 32 random bytes, base64url: 43 characters. Anything else is refused unread. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface FollowerRow {
  id: string;
  incident_id: string;
  push_token: string | null;
  expires_at: Date;
}

/**
 * Lets a guest (no account) follow their own report from the phone that sent it
 * (MOD-42, Rule 14). The token is the only key: it is returned once, to the request
 * that sent the report, and only its hash is stored. Never throws into the report path.
 */
@Injectable()
export class GuestFollowService {
  private readonly logger = new Logger(GuestFollowService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * A follow token for a report a guest sent from the app, or null. Never throws: the
   * report is already saved, and following it is optional.
   *
   * Only app reports qualify. An SMS report's event id is printed in the text message,
   * so a resend carrying it proves nothing about who sent it.
   */
  async issue(incidentId: string, now = new Date()): Promise<string | null> {
    try {
      const incident = await this.prisma.incident.findUnique({
        where: { id: incidentId },
        select: {
          report_channel: true,
          incident_reporters: { select: { user_id: true, is_guest: true } },
          _count: { select: { guest_followers: true } },
        },
      });
      const reporter = incident?.incident_reporters;
      if (!incident || String(incident.report_channel) !== 'APP') return null;
      if (!reporter || reporter.user_id || !reporter.is_guest) return null;
      if (incident._count.guest_followers >= MAX_GUEST_FOLLOWERS_PER_INCIDENT) return null;

      const token = randomBytes(32).toString('base64url');
      await this.prisma.guest_report_followers.create({
        data: {
          incident_id: incidentId,
          token_hash: hashGuestToken(token),
          expires_at: new Date(now.getTime() + GUEST_FOLLOW_TTL_MS),
        },
      });
      return token;
    } catch (err) {
      this.logger.warn(`Guest follow token not issued for incidentId=${incidentId}: ${String(err)}. Report unaffected.`);
      return null;
    }
  }

  /** What the guest's phone shows. 401 for an unknown or expired token. */
  async status(token: string | undefined, now = new Date()): Promise<GuestReportStatus> {
    const follower = await this.resolve(token, now);
    const own = await this.prisma.incident.findUnique({
      where: { id: follower.incident_id },
      select: {
        public_reference: true,
        category: true,
        status: true,
        submitted_at: true,
        duplicate_of_id: true,
        incident_events: { select: { occurred_at: true }, orderBy: { occurred_at: 'desc' }, take: 1 },
      },
    });
    if (!own) throw new UnauthorizedException('This report can no longer be followed.');

    const ownUpdatedAt = own.incident_events[0]?.occurred_at ?? own.submitted_at;
    const merged = String(own.status) === IncidentStatus.DUPLICATE;
    const current = merged ? await this.mergedInto(own.duplicate_of_id) : null;
    const effectiveStatus = current?.status ?? String(own.status);

    return {
      publicReference: own.public_reference,
      category: String(own.category),
      status: String(own.status),
      submittedAt: own.submitted_at.toISOString(),
      updatedAt: (current ? new Date(current.updatedAt) : ownUpdatedAt).toISOString(),
      merged,
      current,
      effectiveStatus,
      finished: GUEST_FINISHED_STATUSES.has(effectiveStatus),
      pushEnabled: !!follower.push_token,
      followUntil: follower.expires_at.toISOString(),
    };
  }

  /** Store (or with null, remove) this phone's FCM token for push updates. */
  async setPushToken(token: string | undefined, pushToken: string | null, now = new Date()): Promise<{ pushEnabled: boolean }> {
    const follower = await this.resolve(token, now);
    await this.prisma.guest_report_followers.update({
      where: { id: follower.id },
      data: { push_token: pushToken },
    });
    return { pushEnabled: !!pushToken };
  }

  /** Deletes expired links, and with them the device tokens. Daily, 03:40. */
  @Cron('40 3 * * *', { name: 'guest-follow-retention' })
  async prune(now = new Date()): Promise<number> {
    try {
      const { count } = await this.prisma.guest_report_followers.deleteMany({ where: { expires_at: { lt: now } } });
      if (count > 0) this.logger.log(`Deleted ${count} expired guest report links`);
      return count;
    } catch (err) {
      this.logger.warn(`Guest report link pruning failed: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }

  private async resolve(token: string | undefined, now: Date): Promise<FollowerRow> {
    if (!token || !TOKEN_PATTERN.test(token)) {
      throw new UnauthorizedException('This report can no longer be followed.');
    }
    const follower = await this.prisma.guest_report_followers.findUnique({
      where: { token_hash: hashGuestToken(token) },
      select: { id: true, incident_id: true, push_token: true, expires_at: true },
    });
    if (!follower || follower.expires_at <= now) {
      throw new UnauthorizedException('This report can no longer be followed.');
    }
    return follower;
  }

  /** The report this one was merged into (following further merges): status and time only. */
  private async mergedInto(id: string | null): Promise<{ status: string; updatedAt: string } | null> {
    let current: { status: string; updatedAt: string } | null = null;
    for (let depth = 0; id && depth < MAX_MERGE_DEPTH; depth++) {
      const row = await this.prisma.incident.findUnique({
        where: { id },
        select: {
          status: true,
          submitted_at: true,
          duplicate_of_id: true,
          incident_events: { select: { occurred_at: true }, orderBy: { occurred_at: 'desc' }, take: 1 },
        },
      });
      if (!row) break;
      current = {
        status: String(row.status),
        updatedAt: (row.incident_events[0]?.occurred_at ?? row.submitted_at).toISOString(),
      };
      id = String(row.status) === IncidentStatus.DUPLICATE ? row.duplicate_of_id : null;
    }
    return current;
  }
}
