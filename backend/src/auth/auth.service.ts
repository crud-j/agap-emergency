import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtService } from '@nestjs/jwt';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
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

    const existing = await this.prisma.user.findUnique({
      where: { phone_number: dto.phoneNumber },
    });
    if (existing) throw new BadRequestException('Phone number already registered');

    const passwordHash = await this.hashPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        full_name: dto.fullName,
        phone_number: dto.phoneNumber,
        password_hash: passwordHash,
        status: 'PENDING_VERIFICATION',
      },
    });

    // Issue a 6-digit OTP for SMS verification (delivery not yet wired — MOD-17).
    const otp = this.generateOtp();
    await this.prisma.user_verifications.create({
      data: {
        user_id: user.id,
        verification_type: 'PHONE',
        token: otp,
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    const { password_hash: _, ...safeUser } = user;
    const { accessToken, refreshToken } = await this.login({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return { user: safeUser, accessToken, refreshToken };
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
      await this.prisma.user_verifications.create({
        data: {
          user_id: user.id,
          verification_type: 'PHONE',
          token: this.generateOtp(),
          expires_at: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
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

  async loginPhone(phoneNumber: string) {
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
          expires_at: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      await this.smsQueue.add('otp-sms', {
        phone: phoneNumber,
        message: `Your AGAP login code is ${otp}. Expires in 10 minutes. Do not share this code.`,
      });
    }

    // Never reveal whether the phone number has an account
    return { message: 'If this number is registered, an OTP has been sent.' };
  }

  async verifyPhoneOtp(phoneNumber: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { phone_number: phoneNumber } });
    if (!user) throw new UnauthorizedException('Invalid OTP');

    const verification = await this.prisma.user_verifications.findFirst({
      where: {
        user_id: user.id,
        verification_type: 'PHONE',
        token: code,
        status: 'PENDING',
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });
    if (!verification) throw new UnauthorizedException('Invalid or expired OTP');

    await this.prisma.user_verifications.update({
      where: { id: verification.id },
      data: { status: 'VERIFIED', verified_at: new Date() },
    });

    return this.login({ id: user.id, email: user.email, role: user.role });
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
