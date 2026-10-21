import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditAction, QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { MFA_ROLES } from '../mfa/mfa.constants';
import type { AuthRequestContext } from '../request-context';

/** Failed attempts that trigger a lock. */
export const LOCKOUT_THRESHOLD = 5;
/** Lock length by `lockout_level` (15 → 30 → 60 min, then capped). */
export const LOCKOUT_MINUTES = [15, 30, 60] as const;

/** Cleared by every completed sign-in. */
export const LOCKOUT_RESET = {
  failed_login_count: 0,
  lockout_level: 0,
  locked_until: null,
} as const;

/**
 * Per-account lockout for web-console roles (plan §6.3).
 *
 * Only roles that sign in to the console are lockable: citizens and bystanders keep
 * the per-IP throttle alone, so a stranger can never lock someone out of reporting an
 * emergency. A browser that holds a valid trusted-device cookie is exempt from the
 * lock (checked by the caller), so guessing from outside cannot lock a dispatcher out
 * of their own console mid-incident. Every lock has a human override (Phase 4).
 */
@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {}

  appliesTo(role: string): boolean {
    return MFA_ROLES.has(role);
  }

  /** Whole minutes left on the lock, or 0 when not locked. */
  remainingMinutes(user: { locked_until?: Date | null }, now = Date.now()): number {
    const until = user.locked_until?.getTime();
    if (!until || until <= now) return 0;
    return Math.max(1, Math.ceil((until - now) / 60_000));
  }

  /**
   * Count one failed password or second-factor attempt. At the threshold the account is
   * locked for the current level's duration and the level escalates. Never throws:
   * bookkeeping must not turn a wrong password into a 500.
   */
  async recordFailure(
    user: { id: string; role: string },
    ctx: AuthRequestContext = {},
  ): Promise<{ locked: boolean }> {
    if (!this.appliesTo(user.role)) return { locked: false };
    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { failed_login_count: { increment: 1 } },
        select: { failed_login_count: true, lockout_level: true, phone_number: true },
      });
      if (updated.failed_login_count < LOCKOUT_THRESHOLD) return { locked: false };

      const level = updated.lockout_level;
      const minutes = LOCKOUT_MINUTES[Math.min(level, LOCKOUT_MINUTES.length - 1)]!;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failed_login_count: 0,
          lockout_level: { increment: 1 },
          locked_until: new Date(Date.now() + minutes * 60_000),
        },
      });

      void this.audit.log({
        action: AuditAction.ACCOUNT_LOCKED,
        actorRole: user.role,
        entityType: 'user',
        entityId: user.id,
        moduleId: 'MOD-01',
        newValues: { durationMinutes: minutes, level: level + 1 },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      if (updated.phone_number) {
        void this.smsQueue
          .add('otp-sms', {
            phone: updated.phone_number,
            message: "AGAP: your account was locked after failed sign-ins. If this wasn't you, tell your Supervisor.",
          })
          .catch((error: unknown) => {
            this.logger.error(
              `Failed to queue lockout SMS: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }
      return { locked: true };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to record login failure: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { locked: false };
    }
  }
}
