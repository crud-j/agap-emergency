import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditAction, IdVerificationErrorCode, QUEUE_NAMES, composeFullName, type IdName } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  IdentityVerificationService,
  idVerificationError,
} from '../identity-verification/identity-verification.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { isAccountBlocked } from './account-status';
import { AuthRequestContext } from './request-context';
import { SessionRevocationService } from './sessions/session-revocation.service';
import { LOCKOUT_RESET, LoginLockoutService } from './lockout/login-lockout.service';
import { TrustedDeviceService } from './mfa/trusted-device.service';
import { SESSION_TTL_MS } from './sessions/session-cookie';
import { RegisterDto } from './dto/register.dto';
import { GeoCheckResult } from './dto/geo-check.dto';
import { RegisterGuestDto } from './dto/register-guest.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { assertPasswordPolicy } from './password-policy';

/** Wrong guesses allowed against a single password-reset code before it is expired. */
const MAX_RESET_CODE_ATTEMPTS = 5;
/**
 * Per-account caps over a rolling window, so requesting fresh codes does not buy
 * fresh guesses: at most 3 codes and 10 wrong guesses per account per hour
 * (≈ 1 in 100,000 odds of guessing a 6-digit code per hour, from any number of IPs).
 */
const RESET_WINDOW_MS = 60 * 60 * 1000;
const MAX_RESET_CODES_PER_WINDOW = 3;
const MAX_RESET_GUESSES_PER_WINDOW = 10;
const PREHASHED_PASSWORD_PREFIX = 'agap$sha256$v1$';

function prehashPassword(password: string): string {
  return crypto
    .createHash('sha256')
    .update('AGAP password v1\0', 'utf8')
    .update(password, 'utf8')
    .digest('base64url');
}

type LoginFailureReason = 'UNKNOWN_ACCOUNT' | 'NO_PASSWORD' | 'BAD_PASSWORD' | 'ACCOUNT_BLOCKED';

/** What the web console keeps in memory about the signed-in user. */
export interface SessionUser {
  id: string;
  email: string | null;
  role: string;
  name: string;
  orgId: string | null;
  orgName: string | null;
  /** That organization's type (e.g. MDRRMO). Shapes the console's navigation only; the API checks access itself. */
  orgType: string | null;
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Compared against when the account does not exist, so unknown accounts and
   * wrong passwords take the same bcrypt time (no enumeration by timing).
   * Same cost factor as real hashes (see hashPassword).
   */
  private readonly dummyPasswordHash = bcrypt
    .hash(prehashPassword(crypto.randomBytes(16).toString('hex')), 12)
    .then((hash) => `${PREHASHED_PASSWORD_PREFIX}${hash}`);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
    private readonly audit: AuditService,
    private readonly sessions: SessionRevocationService,
    private readonly lockout: LoginLockoutService,
    private readonly trustedDevices: TrustedDeviceService,
    private readonly config: ConfigService,
    private readonly idVerification: IdentityVerificationService,
  ) {}

  async validateUser(identifier: string, password: string, ctx: AuthRequestContext = {}) {
    // Look up by email or phone depending on what the client sent, so accounts
    // registered with a phone number (email optional) can log in with a password.
    const user = identifier?.includes('@')
      ? await this.prisma.user.findUnique({ where: { email: identifier } })
      : await this.prisma.user.findUnique({
          where: { phone_number: this.normalizePhone(identifier) },
        });

    // Always run exactly one bcrypt comparison, whatever the outcome.
    const storedHash = user?.password_hash ?? (await this.dummyPasswordHash);
    const valid = await this.comparePassword(password ?? '', storedHash);

    let failure: LoginFailureReason | null = null;
    if (!user) failure = 'UNKNOWN_ACCOUNT';
    else if (!user.password_hash) failure = 'NO_PASSWORD';
    else if (!valid) failure = 'BAD_PASSWORD';
    else if (isAccountBlocked(user.status)) failure = 'ACCOUNT_BLOCKED';

    // Wrong passwords count toward the lock — unless the account is already locked
    // (nothing more to learn from guessing, and a stranger shouldn't extend the lock).
    const locked = !!user && this.lockout.remainingMinutes(user) > 0;
    if (failure === 'BAD_PASSWORD' && user && !locked) {
      await this.lockout.recordFailure(user, ctx);
    }

    // The lock is only disclosed once the password is right, so it can't be probed.
    // A browser holding a valid trusted-device cookie is exempt: an attacker guessing
    // from outside cannot lock a dispatcher out of their own console.
    if (!failure && user && locked && this.lockout.appliesTo(user.role)) {
      if (!(await this.trustedDevices.isTrusted(user.id, ctx.trustedDeviceToken))) {
        const minutes = this.lockout.remainingMinutes(user);
        void this.audit.log({
          action: AuditAction.LOGIN_FAILED,
          entityType: 'user',
          entityId: user.id,
          moduleId: 'MOD-01',
          newValues: { reason: 'ACCOUNT_LOCKED', method: 'password' },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        });
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

    if (failure || !user) {
      // The caller always gets the same generic 401; the reason is audit-only.
      // The identifier itself is not recorded (personal data, and may be a typo).
      void this.audit.log({
        action: AuditAction.LOGIN_FAILED,
        entityType: user ? 'user' : undefined,
        entityId: user?.id,
        moduleId: 'MOD-01',
        newValues: { reason: failure, method: 'password' },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
      return null;
    }

    const { password_hash: _, ...result } = user;
    return result;
  }

  async login(
    user: { id: string; email?: string | null; role: string; must_change_password?: boolean },
    ctx: AuthRequestContext = {},
    method: 'password' | 'passkey' = 'password',
    amr: string[] = method === 'passkey' ? ['hwk'] : ['pwd'],
  ) {
    const sessionId = crypto.randomUUID();
    const authTime = Math.floor(Date.now() / 1000);
    const accessToken = this.signAccessToken(user, sessionId, { amr, authTime });
    const refreshToken = this.generateRefreshToken();

    await this.prisma.user_sessions.create({
      data: {
        id: sessionId,
        user_id: user.id,
        token_hash: this.hashToken(accessToken),
        refresh_token_hash: this.hashToken(refreshToken),
        ip_address: ctx.ipAddress ?? null,
        // amr / authTime ride along so every refreshed token keeps the original sign-in's proof.
        device_info: { ...(ctx.userAgent && { userAgent: ctx.userAgent }), amr, authTime },
        expires_at: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    // Bookkeeping only — a failure here must never fail a successful sign-in.
    // A completed sign-in also clears the failed-attempt counter and any lock level.
    await this.prisma.user
      .update({ where: { id: user.id }, data: { last_login_at: new Date(), ...LOCKOUT_RESET } })
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to record last_login_at: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    void this.audit.log({
      action: AuditAction.LOGIN,
      actorId: user.id,
      actorRole: user.role,
      entityType: 'user',
      entityId: user.id,
      moduleId: 'MOD-01',
      newValues: { method, amr },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    // Callers pass whole user rows from several flows; never let the hash leave this method.
    const {
      must_change_password: _mustChangePassword,
      password_hash: _passwordHash,
      ...responseUser
    } = user as typeof user & { password_hash?: unknown };
    return { accessToken, refreshToken, user: responseUser };
  }

  /** Re-check a signed-in user's password (sensitive MFA changes ask for it again). */
  async verifyPassword(user: { password_hash: string | null }, password: string): Promise<boolean> {
    if (!user.password_hash) return false;
    return this.comparePassword(password ?? '', user.password_hash);
  }

  async hashPassword(password: string): Promise<string> {
    const hash = await bcrypt.hash(prehashPassword(password), 12);
    return `${PREHASHED_PASSWORD_PREFIX}${hash}`;
  }

  private async comparePassword(password: string, storedHash: string): Promise<boolean> {
    if (storedHash.startsWith(PREHASHED_PASSWORD_PREFIX)) {
      return bcrypt.compare(prehashPassword(password), storedHash.slice(PREHASHED_PASSWORD_PREFIX.length));
    }
    return bcrypt.compare(password, storedHash);
  }

  async checkGeoFence(lat: number, lng: number): Promise<GeoCheckResult> {
    const rows = await this.prisma.$queryRaw<Array<{ inside: boolean }>>`
      SELECT ST_Within(
        ST_SetSRID(ST_Point(${lng}::float8, ${lat}::float8), 4326),
        boundary
      ) AS inside
      FROM geo_regions
      WHERE name = 'Bocaue' AND region_type = 'municipality'
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      throw new ServiceUnavailableException('Geo-fence boundary not configured');
    }

    const inside = row.inside === true;
    return {
      inside,
      barangay:     inside ? null : null,
      municipality: inside ? 'Bocaue'  : null,
      province:     inside ? 'Bulacan' : null,
    };
  }

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const phoneNumber = this.normalizePhone(dto.phoneNumber);

    // Geo-fence gate: when coordinates are provided, reject registrations
    // from outside Bocaue. Coordinates are always sent by the mobile client
    // after the on-device GPS check passes.
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      const geo = await this.checkGeoFence(dto.latitude, dto.longitude);
      if (!geo.inside) {
        throw new BadRequestException(
          'Registration is only available for residents and workers within Bocaue, Bulacan.',
        );
      }
    }

    const existing = await this.prisma.user.findUnique({
      where: { phone_number: phoneNumber },
    });
    if (existing) throw new BadRequestException('Phone number already registered');

    if (dto.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) throw new BadRequestException('Email already registered');
    }

    // MOD-01 PhilHealth ID verification (plan §5.3). Gates account creation only; guest
    // SOS (registerGuest) never needs it.
    const typedName = this.typedName(dto);
    if (!dto.idVerificationToken && this.config.get<string>('ID_VERIFICATION_REQUIRED') === 'true') {
      throw idVerificationError(
        400,
        IdVerificationErrorCode.ID_VERIFICATION_REQUIRED,
        'Scan your PhilHealth ID before creating an account. For emergencies, use Report an emergency.',
      );
    }
    if (dto.idVerificationToken && !typedName) {
      throw new BadRequestException('lastName and firstName are required with a PhilHealth ID scan');
    }
    const fullName = typedName ? composeFullName(typedName) : dto.fullName?.trim();
    if (!fullName) throw new BadRequestException('fullName is required');
    const idClaim = dto.idVerificationToken
      ? await this.idVerification.prepareClaim(dto.idVerificationToken, typedName!, dto.requestReview === true)
      : null;

    const passwordHash = await this.hashPassword(dto.password);

    const data = {
      full_name:    fullName,
      phone_number: phoneNumber,
      email:        dto.email ?? null,
      password_hash: passwordHash,
      // Optional — older app builds omit it, and null means "never asked".
      sex:          dto.sex ?? null,
      status:       'PENDING_VERIFICATION',
      barangay:     null,
      municipality: 'Bocaue',
      province:     'Bulacan',
      full_address: null,
      identity_verified_at: idClaim?.outcome === 'AUTO_VERIFIED' ? new Date() : null,
    } satisfies Prisma.UserCreateInput;

    // The account and the scan claim commit together: a lost race for the token or a
    // PhilHealth ID already on another account creates nothing.
    const user = idClaim
      ? await this.prisma.$transaction(async (tx) => {
          const created = await tx.user.create({ data });
          await this.idVerification.claim(tx, idClaim, created.id);
          return created;
        })
      : await this.prisma.user.create({ data });

    // Matched: the image is no longer needed (plan §5.2a). Never fails the registration.
    if (idClaim?.outcome === 'AUTO_VERIFIED' && idClaim.imageLocation) {
      await this.idVerification.deleteImage(idClaim.verificationId, idClaim.imageLocation);
    }

    // Issue a 6-digit OTP and send it via the backend SMS gateway (MOD-17).
    const otp = this.generateOtp();
    await this.prisma.user_verifications.create({
      data: {
        user_id: user.id,
        verification_type: 'PHONE',
        token: otp,
        status: 'PENDING',
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    this.devLog(`[DEV] Registration OTP for ${phoneNumber}: ${otp} (expires in 15 min)`);
    // Enqueue delivery. When Textbee is not configured the SMS processor logs
    // and no-ops — registration must never fail because SMS delivery cannot run.
    void this.smsQueue.add('otp-sms', {
      phone: phoneNumber,
      message: `Your AGAP verification code is ${otp}. Expires in 15 minutes. Do not share this code.`,
    }).catch((error: unknown) => {
      this.logger.error(
        `Failed to queue registration OTP delivery: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    const { password_hash: _, ...safeUser } = user;
    // PENDING_REVIEW: the account works (sign-in, SOS) while MDRRMO staff check the ID.
    return { user: safeUser, identityVerification: idClaim?.outcome ?? null };
  }

  /** The name parts typed at registration, or null when last or first name is missing. */
  private typedName(dto: RegisterDto): IdName | null {
    const last = dto.lastName?.trim();
    const first = dto.firstName?.trim();
    if (!last || !first) return null;
    const name: IdName = { last, first };
    const middle = dto.middleName?.trim();
    const suffix = dto.suffix?.trim();
    if (middle) name.middle = middle;
    if (suffix) name.suffix = suffix;
    return name;
  }

  async registerGuest(dto: RegisterGuestDto) {
    const user = await this.prisma.user.create({
      data: {
        full_name: dto.reporterName ?? 'Guest Reporter',
        phone_number: dto.reporterPhone ?? null,
        is_guest: true,
        role: 'BYSTANDER',
        status: 'ACTIVE',
      },
    });

    const payload = { sub: user.id, role: user.role, guest: true };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '2h' });
    const { password_hash: _, ...safeUser } = user;
    return { user: safeUser, accessToken };
  }

  async refreshToken(token: string) {
    const tokenHash = this.hashToken(token);
    const session = await this.prisma.user_sessions.findUnique({
      where: { refresh_token_hash: tokenHash },
      include: { users: true },
    });

    if (!session || session.is_revoked || session.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = session.users;
    if (isAccountBlocked(user.status)) {
      // Suspended/deactivated after this session started — end it now.
      await this.prisma.user_sessions.update({
        where: { id: session.id },
        data: { is_revoked: true },
      });
      await this.sessions.markRevoked([session.id]);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const newRefresh = this.generateRefreshToken();
    const accessToken = this.signAccessToken(user, session.id, this.sessionClaims(session.device_info));

    // Rotate in place: the session id (the token's `sid`) stays stable for the whole
    // login, so revoking it cuts every access token issued during that login. The
    // conditional update makes a replayed, already-rotated refresh token lose.
    const rotated = await this.prisma.user_sessions.updateMany({
      where: { id: session.id, refresh_token_hash: tokenHash, is_revoked: false },
      data: {
        token_hash: this.hashToken(accessToken),
        refresh_token_hash: this.hashToken(newRefresh),
        last_active_at: new Date(),
        expires_at: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    if (rotated.count !== 1) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return { accessToken, refreshToken: newRefresh, userId: user.id };
  }

  /**
   * End one session, identified by (in order) its id from the access token, its
   * refresh token, or its access token. With only a userId, ends all of that
   * user's sessions (legacy behaviour). Unknown sessions are a no-op.
   */
  async logout(params: {
    userId?: string | undefined;
    sessionId?: string | undefined;
    accessToken?: string | undefined;
    refreshToken?: string | undefined;
  }, ctx: AuthRequestContext = {}) {
    const { userId, sessionId, accessToken, refreshToken } = params;
    const where: Prisma.user_sessionsWhereInput | null = sessionId
      ? { id: sessionId }
      : refreshToken
        ? { refresh_token_hash: this.hashToken(refreshToken) }
        : accessToken
          ? { token_hash: this.hashToken(accessToken) }
          : userId
            ? { user_id: userId }
            : null;
    if (!where) return { message: 'Logged out' };

    const live = await this.prisma.user_sessions.findMany({
      where: { ...where, ...(userId && { user_id: userId }), is_revoked: false },
      select: { id: true, user_id: true },
    });
    if (live.length > 0) {
      await this.prisma.user_sessions.updateMany({
        where: { id: { in: live.map((s) => s.id) } },
        data: { is_revoked: true },
      });
      await this.sessions.markRevoked(live.map((s) => s.id));
      const owner = live[0]!.user_id;
      void this.audit.log({
        action: AuditAction.LOGOUT,
        actorId: owner,
        entityType: 'user',
        entityId: owner,
        moduleId: 'MOD-01',
        newValues: { sessionsEnded: live.length },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }
    return { message: 'Logged out' };
  }

  async stepUp(userId: string, sessionId: string | undefined, password: string, ctx: AuthRequestContext) {
    if (!sessionId) throw new UnauthorizedException('Session cannot be re-authenticated');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const session = await this.prisma.user_sessions.findFirst({
      where: { id: sessionId, user_id: userId, is_revoked: false, expires_at: { gt: new Date() } },
    });
    if (!user || !session || !(await this.verifyPassword(user, password))) {
      throw new UnauthorizedException('Password is incorrect');
    }

    const authTime = Math.floor(Date.now() / 1000);
    const prior = this.sessionClaims(session.device_info);
    const accessToken = this.signAccessToken(user, session.id, {
      amr: [...new Set([...(prior.amr ?? ['pwd']), 'pwd'])],
      authTime,
    });
    const deviceInfo =
      session.device_info && typeof session.device_info === 'object'
        ? { ...(session.device_info as Record<string, unknown>), authTime }
        : { authTime };
    await this.prisma.user_sessions.update({
      where: { id: session.id },
      data: { token_hash: this.hashToken(accessToken), device_info: deviceInfo, last_active_at: new Date() },
    });
    void this.audit.log({
      action: AuditAction.LOGIN,
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      moduleId: 'MOD-01',
      newValues: { method: 'STEP_UP' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return { accessToken, user: await this.getSessionUser(userId) };
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const rows = await this.prisma.user_sessions.findMany({
      where: { user_id: userId, is_revoked: false, expires_at: { gt: new Date() } },
      orderBy: { last_active_at: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      device: this.sessionDeviceLabel(row.device_info),
      ipAddress: row.ip_address,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
      expiresAt: row.expires_at,
      current: row.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string, ctx: AuthRequestContext) {
    const row = await this.prisma.user_sessions.findFirst({
      where: { id: sessionId, user_id: userId, is_revoked: false },
      select: { id: true },
    });
    if (!row) throw new UnauthorizedException('Session not found');
    await this.prisma.user_sessions.update({ where: { id: row.id }, data: { is_revoked: true } });
    await this.sessions.markRevoked([row.id]);
    void this.audit.log({
      action: AuditAction.SESSION_REVOKED,
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      moduleId: 'MOD-01',
      newValues: { sessionId: row.id, method: 'SELF_SERVICE' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    return { message: 'Session revoked' };
  }

  /** The non-sensitive user summary the web console keeps in memory. */
  async getSessionUser(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        must_change_password: true,
        organization_memberships: {
          where: { is_active: true },
          orderBy: { joined_at: 'asc' },
          take: 1,
          select: { organizations: { select: { id: true, name: true, organization_type: true } } },
        },
      },
    });
    if (!user) throw new UnauthorizedException('Invalid or expired refresh token');
    const org = user.organization_memberships[0]?.organizations;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.full_name,
      orgId: org?.id ?? null,
      orgName: org?.name ?? null,
      orgType: org?.organization_type ?? null,
      mustChangePassword: user.must_change_password,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const verification = await this.prisma.user_verifications.findFirst({
      where: {
        user_id: dto.userId,
        token: dto.token,
        verification_type: dto.type,
        status: 'PENDING',
      },
      orderBy: { created_at: 'desc' },
    });

    if (!verification) throw new BadRequestException('Invalid verification token');
    if (verification.expires_at < new Date()) {
      throw new BadRequestException('Verification token expired');
    }

    // Verifying a contact must never re-activate a suspended/deactivated account.
    const owner = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { status: true },
    });
    if (!owner || isAccountBlocked(owner.status)) {
      throw new BadRequestException('Invalid verification token');
    }

    await this.prisma.$transaction([
      this.prisma.user_verifications.update({
        where: { id: verification.id },
        data: { status: 'VERIFIED', verified_at: new Date() },
      }),
      this.prisma.user.update({
        where: { id: dto.userId },
        data: {
          ...(dto.type === 'EMAIL' && { is_email_verified: true }),
          ...(dto.type === 'PHONE' && { is_phone_verified: true }),
          status: 'ACTIVE',
        },
      }),
    ]);

    return { message: 'Verification successful' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    // Stored numbers are E.164; without this, 09XX… input never matched.
    const phoneNumber = this.normalizePhone(dto.phoneNumber);
    const user = await this.prisma.user.findUnique({
      where: { phone_number: phoneNumber },
    });

    // Do not reveal whether the account exists (or is blocked / a guest).
    if (user && !user.is_guest && !isAccountBlocked(user.status) && (await this.canIssueResetCode(user.id))) {
      const code = this.generateOtp();
      await this.prisma.$transaction([
        // Only the newest reset code is ever valid.
        this.prisma.user_verifications.updateMany({
          where: { user_id: user.id, verification_type: 'PASSWORD_RESET', status: 'PENDING' },
          data: { status: 'EXPIRED' },
        }),
        this.prisma.user_verifications.create({
          data: {
            user_id: user.id,
            verification_type: 'PASSWORD_RESET',
            token: this.hashToken(code),
            status: 'PENDING',
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
          },
        }),
      ]);

      this.devLog(`[DEV] Password reset code for ${phoneNumber}: ${code} (expires in 15 min)`);
      void this.smsQueue.add('otp-sms', {
        phone: phoneNumber,
        message: `Your AGAP password reset code is ${code}. Expires in 15 minutes. Do not share this code.`,
      }).catch((error: unknown) => {
        this.logger.error(
          `Failed to queue password reset SMS: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    return { message: 'If the account exists, a reset OTP has been sent via SMS' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    // One message for every failure so the endpoint reveals nothing about the account.
    const invalid = () => new BadRequestException('Invalid or expired reset code');

    const user = await this.prisma.user.findUnique({
      where: { phone_number: this.normalizePhone(dto.phoneNumber) },
    });
    if (!user || user.is_guest || isAccountBlocked(user.status)) throw invalid();

    // The code is bound to this user and to the PASSWORD_RESET type only —
    // registration and login OTPs can never reset a password.
    const verification = await this.prisma.user_verifications.findFirst({
      where: { user_id: user.id, verification_type: 'PASSWORD_RESET', status: 'PENDING' },
      orderBy: { created_at: 'desc' },
    });
    if (!verification) throw invalid();

    // Requesting a fresh code must not buy fresh guesses: cap wrong guesses per
    // account across all codes in the window, whichever IPs they come from.
    if ((await this.recentResetGuesses(user.id)) >= MAX_RESET_GUESSES_PER_WINDOW) {
      await this.prisma.user_verifications.updateMany({
        where: { id: verification.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      throw invalid();
    }

    const expire = () =>
      this.prisma.user_verifications.updateMany({
        where: { id: verification.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });

    if (verification.expires_at.getTime() < Date.now()) {
      await expire();
      throw invalid();
    }

    if (!this.hashesMatch(this.hashToken(dto.token.trim()), verification.token)) {
      // Count only wrong guesses; an unacceptable replacement password must not
      // consume one of the code's verification attempts.
      const counted = await this.prisma.user_verifications.updateMany({
        where: {
          id: verification.id,
          status: 'PENDING',
          attempt_count: { lt: MAX_RESET_CODE_ATTEMPTS },
        },
        data: { attempt_count: { increment: 1 } },
      });
      if (counted.count !== 1) {
        await expire();
        throw invalid();
      }
      const current = await this.prisma.user_verifications.findUnique({
        where: { id: verification.id },
      });
      if (typeof current?.attempt_count === 'number' && current.attempt_count >= MAX_RESET_CODE_ATTEMPTS) {
        await expire();
      }
      throw invalid();
    }

    assertPasswordPolicy(dto.newPassword, { email: user.email, name: user.full_name });
    const passwordHash = await this.hashPassword(dto.newPassword);

    const revokedSessionIds = await this.prisma.$transaction(async (tx) => {
      // Claim the code; a concurrent request that already used it gets nothing.
      const claimed = await tx.user_verifications.updateMany({
        where: {
          id: verification.id,
          status: 'PENDING',
          attempt_count: { lt: MAX_RESET_CODE_ATTEMPTS },
        },
        data: { status: 'VERIFIED', verified_at: new Date() },
      });
      if (claimed.count !== 1) {
        await tx.user_verifications.updateMany({
          where: {
            id: verification.id,
            status: 'PENDING',
            attempt_count: { gte: MAX_RESET_CODE_ATTEMPTS },
          },
          data: { status: 'EXPIRED' },
        });
        throw invalid();
      }

      await tx.user.update({
        where: { id: user.id },
        data: {
          password_hash: passwordHash,
          must_change_password: false,
          password_changed_at: new Date(),
        },
      });
      const revokedIds = await this.sessions.revokeAllForUser(tx, user.id);
      await this.trustedDevices.revokeAllForUser(tx, user.id);
      await this.audit.logInTransaction(tx, {
        action: AuditAction.PASSWORD_CHANGE,
        actorId: user.id,
        actorRole: user.role,
        entityType: 'user',
        entityId: user.id,
        moduleId: 'MOD-01',
        newValues: { method: 'SELF_SERVICE_RESET', sessionsRevoked: revokedIds.length },
      });
      return revokedIds;
    });
    // After commit: cut access tokens and sockets of the old sessions immediately.
    await this.sessions.markRevoked(revokedSessionIds);

    return { message: 'Password reset successful' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, currentSessionId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.password_hash) {
      throw new BadRequestException('Account has no password set');
    }

    const valid = await this.comparePassword(dto.currentPassword, user.password_hash);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    assertPasswordPolicy(dto.newPassword, { email: user.email, name: user.full_name });
    const passwordHash = await this.hashPassword(dto.newPassword);

    const revokedSessionIds = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          password_hash: passwordHash,
          must_change_password: false,
          password_changed_at: new Date(),
        },
      });
      const revokedIds = await this.sessions.revokeAllForUser(tx, userId, currentSessionId);
      // A new password ends "trust this browser" everywhere — the next sign-in does the full dance.
      await this.trustedDevices.revokeAllForUser(tx, userId);
      await this.audit.logInTransaction(tx, {
        action: AuditAction.PASSWORD_CHANGE,
        actorId: userId,
        actorRole: user.role,
        entityType: 'user',
        entityId: userId,
        moduleId: 'MOD-01',
        newValues: { method: 'SELF_SERVICE_CHANGE', sessionsRevoked: revokedIds.length },
      });
      return revokedIds;
    });
    await this.sessions.markRevoked(revokedSessionIds);

    return { message: 'Password changed' };
  }

  async loginPhone(rawPhoneNumber: string) {
    const phoneNumber = this.normalizePhone(rawPhoneNumber);
    const user = await this.prisma.user.findUnique({ where: { phone_number: phoneNumber } });

    if (user && !isAccountBlocked(user.status)) {
      // Expire any pending phone OTPs before issuing a fresh one (prevents replay)
      await this.prisma.user_verifications.updateMany({
        where: { user_id: user.id, verification_type: 'PHONE', status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });

      const otp = this.generateOtp();
      await this.prisma.user_verifications.create({
        data: {
          user_id: user.id,
          verification_type: 'PHONE',
          token: otp,
          status: 'PENDING',
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      this.devLog(`[DEV] Login OTP for ${phoneNumber}: ${otp} (expires in 10 min)`);
      await this.smsQueue.add('otp-sms', {
        phone: phoneNumber,
        message: `Your AGAP login code is ${otp}. Expires in 10 minutes. Do not share this code.`,
      });
    }

    // Never reveal whether the phone number has an account
    return { message: 'If this number is registered, an OTP has been sent.' };
  }

  /**
   * Demo-only recovery for environments where Textbee is unavailable.
   * OTPs are already persisted before SMS delivery is queued; this exposes the
   * pending value without weakening the production verification flow.
   */
  async getDemoOtp(userId?: string, rawPhoneNumber?: string) {
    const phoneNumber = rawPhoneNumber ? this.normalizePhone(rawPhoneNumber) : undefined;
    const user = userId
      ? await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      : phoneNumber
        ? await this.prisma.user.findUnique({ where: { phone_number: phoneNumber }, select: { id: true } })
        : null;

    if (!user) {
      throw new NotFoundException('No user was found for the demo OTP lookup');
    }

    const verification = await this.prisma.user_verifications.findFirst({
      where: {
        user_id: user.id,
        verification_type: 'PHONE',
        status: 'PENDING',
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
      select: {
        token: true,
        verification_type: true,
        expires_at: true,
        created_at: true,
      },
    });

    if (!verification) {
      throw new NotFoundException('No pending demo OTP was found for this user');
    }

    return {
      code: verification.token,
      type: verification.verification_type,
      expiresAt: verification.expires_at,
      createdAt: verification.created_at,
    };
  }

  async verifyPhoneOtp(phoneNumber: string, code: string) {
    try {
      return await this.verifyPhoneOtpInternal(phoneNumber, code);
    } catch (err) {
      // Preserve genuine domain outcomes (invalid OTP, expired, user not found)
      // as-is. Everything else here is an infrastructure failure — most notably
      // "Server has closed the connection" from a dropped Postgres client.
      // Surfacing it as 503 stops the mobile client from mislabelling a DB
      // outage as an "invalid or expired code".
      if (err instanceof HttpException) throw err;
      if (this.isDatabaseConnectivityError(err)) {
        this.logger.error(
          `[OTP verify] database connectivity failure: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new ServiceUnavailableException(
          'Verification service is temporarily unavailable. Please try again in a moment.',
        );
      }
      throw err;
    }
  }

  private isDatabaseConnectivityError(err: unknown): boolean {
    // Initialization / panic / unknown-request errors are always infrastructure.
    if (
      err instanceof Prisma.PrismaClientInitializationError ||
      err instanceof Prisma.PrismaClientRustPanicError ||
      err instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      return true;
    }
    // A KnownRequestError is usually a *query* problem (e.g. P2002 unique
    // violation) — NOT an outage. Only the P1xxx connection codes and P2024
    // (pool timeout) indicate connectivity, so classify narrowly.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      const connectionCodes = ['P1000', 'P1001', 'P1002', 'P1008', 'P1010', 'P1017', 'P2024'];
      if (connectionCodes.includes(err.code)) return true;
    }
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    return (
      message.includes('closed the connection') ||
      message.includes('connection terminated') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('connection timeout') ||
      message.includes('connection pool')
    );
  }

  private async verifyPhoneOtpInternal(rawPhoneNumber: string, code: string) {
    const phoneNumber = this.normalizePhone(rawPhoneNumber);
    const user = await this.prisma.user.findUnique({ where: { phone_number: phoneNumber } });
    // A blocked account must not sign in — nor be flipped back to ACTIVE below.
    if (!user || isAccountBlocked(user.status)) throw new UnauthorizedException('Invalid OTP');

    const sessionId = crypto.randomUUID();
    const accessToken = this.signAccessToken(user, sessionId);
    const refreshToken = this.generateRefreshToken();

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const verification = await tx.user_verifications.findFirst({
        where: {
          user_id: user.id,
          verification_type: 'PHONE',
          token: code,
          status: 'PENDING',
        },
        orderBy: { created_at: 'desc' },
      });

      // Never log the submitted code or phone number.
      this.logger.log(
        `[OTP verify] found=${!!verification}` +
          (verification
            ? ` expires_at=${String(verification.expires_at)} now=${new Date().toISOString()}`
            : ' no matching PENDING record'),
      );

      if (!verification) throw new UnauthorizedException('Invalid OTP');

      // Safe comparison: handles both Date objects and ISO strings Prisma may return.
      const expiresMs = new Date(verification.expires_at as any).getTime();
      if (isNaN(expiresMs) || expiresMs < Date.now()) {
        this.logger.warn(`[OTP verify] expired: expiresMs=${expiresMs} now=${Date.now()}`);
        throw new UnauthorizedException('OTP has expired');
      }

      // Claim the OTP conditionally. Concurrent requests may both read PENDING,
      // but only one can change that row from PENDING to VERIFIED.
      const claimed = await tx.user_verifications.updateMany({
        where: { id: verification.id, status: 'PENDING' },
        data: { status: 'VERIFIED', verified_at: new Date() },
      });
      if (claimed.count !== 1) throw new UnauthorizedException('Invalid OTP');

      await tx.user_sessions.create({
        data: {
          id: sessionId,
          user_id: user.id,
          token_hash: this.hashToken(accessToken),
          refresh_token_hash: this.hashToken(refreshToken),
          expires_at: new Date(Date.now() + SESSION_TTL_MS),
        },
      });

      return tx.user.update({
        where: { id: user.id },
        data: { is_phone_verified: true, status: 'ACTIVE' },
        select: {
          id: true,
          full_name: true,
          email: true,
          phone_number: true,
          role: true,
          status: true,
          is_guest: true,
          is_email_verified: true,
          is_phone_verified: true,
          barangay: true,
          municipality: true,
          province: true,
          full_address: true,
          preferred_language: true,
          text_size: true,
          high_contrast: true,
          reduced_motion: true,
          sex: true,
          profile_completeness: true,
          last_login_at: true,
          created_at: true,
        },
      });
    });

    return {
      message: 'Phone verification successful',
      accessToken,
      refreshToken,
      user: updatedUser,
    };
  }

  /**
   * Canonicalise a Philippine mobile number to E.164 (+63XXXXXXXXXX) so that a
   * number stored at registration always matches at login/verify regardless of
   * how the client formatted it: 09171234567 / 9171234567 / 639171234567 /
   * +639171234567 all collapse to +639171234567. This is the single source of
   * truth — clients may send any of these forms.
   */
  private normalizePhone(input: string): string {
    if (!input) return input;
    let digits = input.trim().replace(/[\s()-]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    digits = digits.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '63' + digits.slice(1); // 09XX… → 639XX…
    else if (digits.startsWith('9')) digits = '63' + digits;      // 9XX…  → 639XX…
    // already starts with 63 → leave as-is
    return '+' + digits;
  }

  /** False once the account has been sent MAX_RESET_CODES_PER_WINDOW codes in the window. */
  private async canIssueResetCode(userId: string): Promise<boolean> {
    const issued = await this.prisma.user_verifications.count({
      where: {
        user_id: userId,
        verification_type: 'PASSWORD_RESET',
        created_at: { gte: new Date(Date.now() - RESET_WINDOW_MS) },
      },
    });
    if (issued >= MAX_RESET_CODES_PER_WINDOW) {
      this.logger.warn(`Password reset code limit reached for user ${userId}; no new code issued`);
      return false;
    }
    return true;
  }

  /** Guesses made against this account's reset codes in the window (all codes, all IPs). */
  private async recentResetGuesses(userId: string): Promise<number> {
    const result = await this.prisma.user_verifications.aggregate({
      where: {
        user_id: userId,
        verification_type: 'PASSWORD_RESET',
        created_at: { gte: new Date(Date.now() - RESET_WINDOW_MS) },
      },
      _sum: { attempt_count: true },
    });
    return result._sum.attempt_count ?? 0;
  }

  /** Access token for a session. `sid` lets every token of the session be revoked at once. */
  private signAccessToken(
    user: { id: string; email?: string | null; role: string; must_change_password?: boolean },
    sessionId: string,
    claims: { amr?: string[]; authTime?: number } = {},
  ): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: sessionId,
      ...(claims.amr && { amr: claims.amr }),
      ...(claims.authTime !== undefined && { auth_time: claims.authTime }),
      ...(user.must_change_password && { pwc: true }),
    });
  }

  /** Read back what login() stored on the session (older sessions have neither). */
  private sessionClaims(deviceInfo: unknown): { amr?: string[]; authTime?: number } {
    if (!deviceInfo || typeof deviceInfo !== 'object') return {};
    const { amr, authTime } = deviceInfo as { amr?: unknown; authTime?: unknown };
    return {
      ...(Array.isArray(amr) && amr.every((v) => typeof v === 'string') && { amr: amr as string[] }),
      ...(typeof authTime === 'number' && { authTime }),
    };
  }

  private sessionDeviceLabel(deviceInfo: unknown): string {
    if (!deviceInfo || typeof deviceInfo !== 'object') return 'Unknown browser';
    const userAgent = (deviceInfo as { userAgent?: unknown }).userAgent;
    return typeof userAgent === 'string' ? userAgent : 'Unknown browser';
  }

  /** OTPs and codes may only ever reach the log outside production. */
  private devLog(message: string): void {
    if (process.env['NODE_ENV'] !== 'production') this.logger.warn(message);
  }

  /** Constant-time comparison of two hex SHA-256 digests. */
  private hashesMatch(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    return bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB);
  }

  private generateOtp(): string {
    return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
