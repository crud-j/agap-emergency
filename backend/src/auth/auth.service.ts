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
import { Prisma } from '@prisma/client';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { RegisterGuestDto } from './dto/register-guest.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {}

  async validateUser(identifier: string, password: string) {
    // Look up by email or phone depending on what the client sent, so accounts
    // registered with a phone number (email optional) can log in with a password.
    const user = identifier?.includes('@')
      ? await this.prisma.user.findUnique({ where: { email: identifier } })
      : await this.prisma.user.findUnique({
          where: { phone_number: this.normalizePhone(identifier) },
        });
    if (!user || !user.password_hash) return null;
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;
    const { password_hash: _, ...result } = user;
    return result;
  }

  async login(user: { id: string; email?: string | null; role: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.generateRefreshToken();

    await this.prisma.user_sessions.create({
      data: {
        user_id: user.id,
        token_hash: this.hashToken(accessToken),
        refresh_token_hash: this.hashToken(refreshToken),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken, user };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const phoneNumber = this.normalizePhone(dto.phoneNumber);

    const existing = await this.prisma.user.findUnique({
      where: { phone_number: phoneNumber },
    });
    if (existing) throw new BadRequestException('Phone number already registered');

    if (dto.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) throw new BadRequestException('Email already registered');
    }

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        full_name: dto.fullName,
        phone_number: phoneNumber,
        email: dto.email ?? null,
        password_hash: passwordHash,
        status: 'PENDING_VERIFICATION',
      },
    });

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

    this.logger.warn(`[DEV] Registration OTP for ${phoneNumber}: ${otp} (expires in 15 min)`);
    // Enqueue delivery. When Textbee is not configured the SMS processor logs
    // and no-ops — registration must never fail because SMS delivery cannot run.
    await this.smsQueue.add('otp-sms', {
      phone: phoneNumber,
      message: `Your AGAP verification code is ${otp}. Expires in 15 minutes. Do not share this code.`,
    });

    const { password_hash: _, ...safeUser } = user;
    return { user: safeUser };
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
    const newRefresh = this.generateRefreshToken();
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.prisma.$transaction([
      this.prisma.user_sessions.update({
        where: { id: session.id },
        data: { is_revoked: true },
      }),
      this.prisma.user_sessions.create({
        data: {
          user_id: user.id,
          token_hash: this.hashToken(accessToken),
          refresh_token_hash: this.hashToken(newRefresh),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    return { accessToken, refreshToken: newRefresh };
  }

  async logout(userId: string, token?: string) {
    if (token) {
      await this.prisma.user_sessions.updateMany({
        where: { user_id: userId, token_hash: this.hashToken(token) },
        data: { is_revoked: true },
      });
    } else {
      await this.prisma.user_sessions.updateMany({
        where: { user_id: userId },
        data: { is_revoked: true },
      });
    }
    return { message: 'Logged out' };
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
    const user = await this.prisma.user.findUnique({
      where: { phone_number: dto.phoneNumber },
    });

    // Do not reveal whether the account exists.
    if (user) {
      const resetOtp = this.generateOtp();
      await this.prisma.user_verifications.create({
        data: {
          user_id: user.id,
          verification_type: 'PHONE',
          token: resetOtp,
          status: 'PENDING',
          expires_at: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      this.logger.warn(`[DEV] Password reset OTP for ${dto.phoneNumber}: ${resetOtp} (expires in 15 min)`);
    }

    return { message: 'If the account exists, a reset OTP has been sent via SMS' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const verification = await this.prisma.user_verifications.findFirst({
      where: { token: dto.token, status: 'PENDING' },
      orderBy: { created_at: 'desc' },
    });

    if (!verification) throw new BadRequestException('Invalid reset token');
    if (verification.expires_at < new Date()) {
      throw new BadRequestException('Reset token expired');
    }

    const passwordHash = await this.hashPassword(dto.newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verification.user_id },
        data: { password_hash: passwordHash },
      }),
      this.prisma.user_verifications.update({
        where: { id: verification.id },
        data: { status: 'VERIFIED', verified_at: new Date() },
      }),
      this.prisma.user_sessions.updateMany({
        where: { user_id: verification.user_id },
        data: { is_revoked: true },
      }),
    ]);

    return { message: 'Password reset successful' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.password_hash) {
      throw new BadRequestException('Account has no password set');
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password_hash);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await this.hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: passwordHash },
    });

    return { message: 'Password changed' };
  }

  async loginPhone(rawPhoneNumber: string) {
    const phoneNumber = this.normalizePhone(rawPhoneNumber);
    const user = await this.prisma.user.findUnique({ where: { phone_number: phoneNumber } });

    if (user) {
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

      this.logger.warn(`[DEV] Login OTP for ${phoneNumber}: ${otp} (expires in 10 min)`);
      await this.smsQueue.add('otp-sms', {
        phone: phoneNumber,
        message: `Your AGAP login code is ${otp}. Expires in 10 minutes. Do not share this code.`,
      });
    }

    // Never reveal whether the phone number has an account
    return { message: 'If this number is registered, an OTP has been sent.' };
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
    if (!user) throw new UnauthorizedException('Invalid OTP');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);
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

      this.logger.log(
        `[OTP verify] found=${!!verification}` +
          (verification
            ? ` expires_at=${String(verification.expires_at)} now=${new Date().toISOString()}`
            : ` no PENDING record for phone=${phoneNumber} code=${code}`),
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
          user_id: user.id,
          token_hash: this.hashToken(accessToken),
          refresh_token_hash: this.hashToken(refreshToken),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
