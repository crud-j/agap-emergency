import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { AuditAction, QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuthService } from '../auth.service';
import { WebAuthnService } from '../webauthn.service';
import { isAccountBlocked } from '../account-status';
import { LoginLockoutService } from '../lockout/login-lockout.service';
import type { AuthRequestContext } from '../request-context';
import { BackupCodesService } from './backup-codes.service';
import { TotpService } from './totp.service';
import { TrustedDeviceService } from './trusted-device.service';
import { MfaTokenService } from './mfa-token.service';
import {
  BACKUP_CODE_WARN_AT,
  MFA_ROLES,
  SMS_CODES_PER_HOUR,
  SMS_CODE_MAX_ATTEMPTS,
  SMS_CODE_TTL_MS,
  type MfaMethod,
} from './mfa.constants';

export interface MfaChallenge {
  mfaRequired: true;
  /** Single-use, 5 minutes. Held in memory by the browser, never persisted. */
  mfaToken: string;
  /** Only what this user has enrolled (plus `sms` when enabled and a phone is on file). */
  methods: MfaMethod[];
  enrollmentRequired: boolean;
}

export type LoginDecision =
  | { kind: 'session'; amr: string[] }
  | { kind: 'challenge'; challenge: MfaChallenge };

/** Who is acting on an enrollment endpoint: a signed-in user, or a forced-enrollment mfaToken. */
export interface MfaPrincipal {
  userId: string;
  /** Present only for an enrollment mfaToken. */
  jti?: string;
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
    private readonly webAuthn: WebAuthnService,
    private readonly totp: TotpService,
    private readonly backupCodes: BackupCodesService,
    private readonly trustedDevices: TrustedDeviceService,
    private readonly tokens: MfaTokenService,
    private readonly lockout: LoginLockoutService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {}

  /** AUTH_MFA_ENFORCED: staff without a second factor must enroll at sign-in. */
  get enforced(): boolean {
    return this.config.get<string>('AUTH_MFA_ENFORCED') === 'true';
  }

  /** AUTH_SMS_MFA_ENABLED: off by default (see plan §3). */
  get smsEnabled(): boolean {
    return this.config.get<string>('AUTH_SMS_MFA_ENABLED') === 'true';
  }

  requiresMfa(role: string): boolean {
    return MFA_ROLES.has(role);
  }

  // ---------------------------------------------------------------------------
  // Login decision (called after the password was accepted)
  // ---------------------------------------------------------------------------

  async evaluateLogin(
    user: { id: string; role: string; phone_number?: string | null },
    ctx: AuthRequestContext = {},
  ): Promise<LoginDecision> {
    if (!this.requiresMfa(user.role)) return { kind: 'session', amr: ['pwd'] };

    const factors = await this.factors(user.id);
    const enrolled = factors.totp || factors.passkeys > 0;

    // During the enrollment window nobody is forced; only enrolled users get a second step.
    if (!enrolled && !this.enforced) return { kind: 'session', amr: ['pwd'] };

    if (!enrolled) {
      return {
        kind: 'challenge',
        challenge: {
          mfaRequired: true,
          mfaToken: await this.tokens.issue(user.id, 'mfa-enroll'),
          methods: [],
          enrollmentRequired: true,
        },
      };
    }

    // Trusted browser: the password was still required; only the second step is skipped.
    if (await this.trustedDevices.isTrusted(user.id, ctx.trustedDeviceToken)) {
      return { kind: 'session', amr: ['pwd'] };
    }

    const methods: MfaMethod[] = [];
    if (factors.passkeys > 0) methods.push('passkey');
    if (factors.totp && this.totp.isConfigured()) methods.push('totp');
    if (factors.totp && factors.backupCodes > 0) methods.push('backup_code');
    if (this.smsEnabled && user.phone_number) methods.push('sms');

    return {
      kind: 'challenge',
      challenge: {
        mfaRequired: true,
        mfaToken: await this.tokens.issue(user.id, 'mfa'),
        methods,
        enrollmentRequired: false,
      },
    };
  }

  private async factors(userId: string) {
    const [totp, passkeys, backupCodes] = await Promise.all([
      this.totp.isEnrolled(userId),
      this.prisma.webauthn_credentials.count({ where: { user_id: userId, is_active: true } }),
      this.backupCodes.remaining(userId),
    ]);
    return { totp, passkeys, backupCodes };
  }

  // ---------------------------------------------------------------------------
  // Second step
  // ---------------------------------------------------------------------------

  async verify(
    dto: { mfaToken: string; method: 'totp' | 'backup_code' | 'sms'; code: string; trustDevice?: boolean | undefined },
    ctx: AuthRequestContext,
  ) {
    const claims = await this.tokens.verify(dto.mfaToken, 'mfa');
    const user = await this.loadUsableUser(claims.userId);
    this.assertNotLocked(user);

    const ok =
      dto.method === 'totp'
        ? await this.totp.verify(user.id, dto.code)
        : dto.method === 'backup_code'
          ? await this.backupCodes.verifyAndConsume(user.id, dto.code)
          : await this.verifySms(user.id, dto.code);
    if (!ok) await this.failSecondStep(claims.jti, user, dto.method, ctx);

    await this.tokens.consume(claims.jti);
    const amr = dto.method === 'sms' ? ['pwd', 'sms'] : ['pwd', 'otp'];
    return this.completeSignIn(user, ctx, amr, dto.trustDevice === true);
  }

  async sendSmsCode(mfaToken: string): Promise<{ message: string }> {
    const claims = await this.tokens.verify(mfaToken, 'mfa');
    if (!this.smsEnabled) throw new ForbiddenException('SMS codes are not enabled');
    const user = await this.loadUsableUser(claims.userId);
    this.assertNotLocked(user);
    if (!user.phone_number) throw new BadRequestException('No phone number on file');

    const sentThisHour = await this.prisma.user_verifications.count({
      where: {
        user_id: user.id,
        verification_type: 'MFA_SMS',
        created_at: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (sentThisHour >= SMS_CODES_PER_HOUR) {
      throw new HttpException('Too many codes requested. Use another method or try again later.', 429);
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      // Only the newest code is ever valid.
      this.prisma.user_verifications.updateMany({
        where: { user_id: user.id, verification_type: 'MFA_SMS', status: 'PENDING' },
        data: { status: 'EXPIRED' },
      }),
      this.prisma.user_verifications.create({
        data: {
          user_id: user.id,
          verification_type: 'MFA_SMS',
          token: this.sha256(code),
          status: 'PENDING',
          expires_at: new Date(Date.now() + SMS_CODE_TTL_MS),
        },
      }),
    ]);

    await this.smsQueue
      .add('otp-sms', {
        phone: user.phone_number,
        message: `Your AGAP sign-in code is ${code}. Expires in 5 minutes. Do not share this code.`,
      })
      .catch((error: unknown) => {
        this.logger.error(`Failed to queue MFA SMS: ${error instanceof Error ? error.message : String(error)}`);
      });
    return { message: 'If a phone number is on file, a code has been sent.' };
  }

  async passkeyBegin(mfaToken: string, ctx: AuthRequestContext) {
    const claims = await this.tokens.verify(mfaToken, 'mfa');
    return this.webAuthn.beginAuthenticationForUser(claims.userId, ctx.ipAddress, ctx.userAgent, ctx.origin);
  }

  async passkeyComplete(
    dto: { mfaToken: string; challengeId: string; response: Record<string, unknown>; trustDevice?: boolean | undefined },
    ctx: AuthRequestContext,
  ) {
    const claims = await this.tokens.verify(dto.mfaToken, 'mfa');
    const user = await this.loadUsableUser(claims.userId);
    this.assertNotLocked(user);

    let session: Awaited<ReturnType<WebAuthnService['completeAuthentication']>>;
    try {
      session = await this.webAuthn.completeAuthentication(dto.challengeId, dto.response, ctx.ipAddress, ctx.userAgent, {
        expectedUserId: user.id,
        amr: ['pwd', 'hwk'],
      });
    } catch (error: unknown) {
      await this.failSecondStep(claims.jti, user, 'passkey', ctx, error);
      throw error; // unreachable: failSecondStep always throws
    }
    await this.tokens.consume(claims.jti);
    const trusted = dto.trustDevice === true ? await this.trustedDevices.create(user.id, ctx) : null;
    return { session, trusted };
  }

  /** Mint the session for a verified second step, plus the trusted-browser token when asked. */
  private async completeSignIn(
    user: { id: string; email: string | null; role: string; must_change_password: boolean },
    ctx: AuthRequestContext,
    amr: string[],
    trustDevice: boolean,
  ) {
    const session = await this.authService.login(user, ctx, 'password', amr);
    const trusted = trustDevice ? await this.trustedDevices.create(user.id, ctx) : null;
    return { session, trusted };
  }

  /** Count the miss (mfaToken + account lock), audit it, and refuse. Always throws. */
  private async failSecondStep(
    jti: string,
    user: { id: string; role: string },
    method: string,
    ctx: AuthRequestContext,
    cause?: unknown,
  ): Promise<never> {
    const killed = await this.tokens.recordFailure(jti);
    await this.lockout.recordFailure(user, ctx);
    void this.audit.log({
      action: AuditAction.LOGIN_FAILED,
      entityType: 'user',
      entityId: user.id,
      moduleId: 'MOD-01',
      newValues: { reason: 'MFA_FAILED', method },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    if (killed) throw new UnauthorizedException('Too many incorrect codes. Sign in again.');
    if (cause instanceof HttpException) throw cause;
    throw new UnauthorizedException('That code is not valid');
  }

  private assertNotLocked(user: { locked_until?: Date | null }) {
    const minutes = this.lockout.remainingMinutes(user);
    if (minutes > 0) {
      throw new HttpException(
        {
          statusCode: 423,
          code: 'ACCOUNT_LOCKED',
          message: `Account temporarily locked. Try again in ${minutes} min or ask your Supervisor.`,
          retryAfterMinutes: minutes,
        },
        423,
      );
    }
  }

  private async loadUsableUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || isAccountBlocked(user.status)) {
      throw new UnauthorizedException('Your sign-in has expired. Sign in again.');
    }
    return user;
  }

  private async verifySms(userId: string, code: string): Promise<boolean> {
    const row = await this.prisma.user_verifications.findFirst({
      where: { user_id: userId, verification_type: 'MFA_SMS', status: 'PENDING' },
      orderBy: { created_at: 'desc' },
    });
    if (!row) return false;
    const expire = () =>
      this.prisma.user_verifications.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
    if (row.expires_at.getTime() < Date.now() || row.attempt_count >= SMS_CODE_MAX_ATTEMPTS) {
      await expire();
      return false;
    }
    if (!this.hashesMatch(this.sha256(code.trim()), row.token)) {
      await this.prisma.user_verifications.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { attempt_count: { increment: 1 } },
      });
      if (row.attempt_count + 1 >= SMS_CODE_MAX_ATTEMPTS) await expire();
      return false;
    }
    const { count } = await this.prisma.user_verifications.updateMany({
      where: { id: row.id, status: 'PENDING' },
      data: { status: 'VERIFIED', verified_at: new Date() },
    });
    return count === 1;
  }

  // ---------------------------------------------------------------------------
  // Enrollment and management
  // ---------------------------------------------------------------------------

  /** A signed-in user acts as themselves; otherwise a forced-enrollment mfaToken is required. */
  async resolvePrincipal(reqUser: { id: string } | undefined, mfaToken: string | undefined): Promise<MfaPrincipal> {
    if (reqUser) return { userId: reqUser.id };
    if (!mfaToken) throw new UnauthorizedException('Sign in to continue');
    const claims = await this.tokens.verify(mfaToken, 'mfa-enroll');
    return { userId: claims.userId, jti: claims.jti };
  }

  async startTotpEnrollment(principal: MfaPrincipal) {
    const user = await this.loadUsableUser(principal.userId);
    return this.totp.startEnrollment(user.id, user.email ?? user.phone_number ?? user.full_name);
  }

  async confirmTotp(principal: MfaPrincipal, code: string, ctx: AuthRequestContext) {
    const user = await this.loadUsableUser(principal.userId);
    this.assertNotLocked(user);

    const ok = await this.totp.confirmEnrollment(user.id, code);
    if (!ok) {
      if (principal.jti) {
        const killed = await this.tokens.recordFailure(principal.jti);
        await this.lockout.recordFailure(user, ctx);
        if (killed) throw new UnauthorizedException('Too many incorrect codes. Sign in again.');
      }
      throw new BadRequestException('That code is not valid. Check the time on your phone and try again.');
    }

    const backupCodes = await this.backupCodes.regenerate(user.id);
    void this.audit.log({
      action: AuditAction.MFA_CHANGE,
      actorId: user.id,
      actorRole: user.role,
      entityType: 'user',
      entityId: user.id,
      moduleId: 'MOD-01',
      newValues: { change: 'TOTP_ENROLLED' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    if (!principal.jti) return { backupCodes, session: null };
    // Forced enrollment: proving the first code completes the sign-in.
    await this.tokens.consume(principal.jti);
    const session = await this.authService.login(user, ctx, 'password', ['pwd', 'otp']);
    return { backupCodes, session };
  }

  async regenerateBackupCodes(userId: string, password: string, ctx: AuthRequestContext) {
    await this.reauthenticate(userId, password, ctx);
    if (!(await this.totp.isEnrolled(userId))) {
      throw new ConflictException('Set up an authenticator app before generating backup codes');
    }
    const backupCodes = await this.backupCodes.regenerate(userId);
    await this.auditChange(userId, 'BACKUP_CODES_REGENERATED', ctx);
    return { backupCodes };
  }

  async removeTotp(userId: string, password: string, ctx: AuthRequestContext) {
    const user = await this.reauthenticate(userId, password, ctx);
    const passkeys = await this.prisma.webauthn_credentials.count({ where: { user_id: userId, is_active: true } });
    if (this.enforced && this.requiresMfa(user.role) && passkeys === 0) {
      throw new ConflictException('This is your only second factor. Add a passkey before removing the authenticator app.');
    }
    if (!(await this.totp.remove(userId))) throw new NotFoundException('No authenticator app is set up');
    await this.backupCodes.removeAll(userId);
    await this.trustedDevices.revokeAllForUser(this.prisma, userId);
    await this.auditChange(userId, 'TOTP_REMOVED', ctx);
    return { message: 'Authenticator app removed' };
  }

  async status(userId: string, currentTrustedToken?: string) {
    const [factors, trustedDevices] = await Promise.all([
      this.factors(userId),
      this.trustedDevices.list(userId, currentTrustedToken),
    ]);
    return {
      totp: factors.totp,
      passkeys: factors.passkeys,
      backupCodesRemaining: factors.backupCodes,
      backupCodesLow: factors.totp && factors.backupCodes <= BACKUP_CODE_WARN_AT,
      totpAvailable: this.totp.isConfigured(),
      enforced: this.enforced,
      smsEnabled: this.smsEnabled,
      trustedDevices,
    };
  }

  async revokeTrustedDevice(userId: string, id: string, ctx: AuthRequestContext) {
    if (!(await this.trustedDevices.revoke(userId, id))) throw new NotFoundException('Trusted browser not found');
    await this.auditChange(userId, 'TRUSTED_DEVICE_REVOKED', ctx);
    return { message: 'Trusted browser removed' };
  }

  /**
   * Stand-in for Phase 5 step-up: sensitive changes re-ask for the password. Wrong
   * guesses count toward the account lock, so a stolen session can't be used to guess it.
   */
  private async reauthenticate(userId: string, password: string, ctx: AuthRequestContext) {
    const user = await this.loadUsableUser(userId);
    this.assertNotLocked(user);
    if (!(await this.authService.verifyPassword(user, password))) {
      await this.lockout.recordFailure(user, ctx);
      throw new ForbiddenException('Password is incorrect');
    }
    return user;
  }

  private auditChange(userId: string, change: string, ctx: AuthRequestContext): Promise<void> {
    return this.audit.log({
      action: AuditAction.MFA_CHANGE,
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      moduleId: 'MOD-01',
      newValues: { change },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }

  private sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /** Constant-time comparison of two hex SHA-256 digests. */
  private hashesMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB);
  }
}
