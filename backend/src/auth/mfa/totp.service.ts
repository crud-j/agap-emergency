import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../common/prisma/prisma.service';
import { open, parseEncryptionKey, seal } from '../../common/crypto/secret-box';

const ISSUER = 'AGAP Bocaue';
const STEP_SECONDS = 30;

/**
 * Authenticator-app (RFC 6238) second factor: SHA-1, 6 digits, 30 s step, ±1 step of
 * clock drift. Seeds are AES-256-GCM sealed and bound to their owner.
 */
@Injectable()
export class TotpService {
  private readonly totp = authenticator.clone({ digits: 6, step: STEP_SECONDS, window: 1 });

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Whether this server can seal TOTP seeds at all (MFA_ENCRYPTION_KEY set). */
  isConfigured(): boolean {
    try {
      return parseEncryptionKey(this.config.get<string>('MFA_ENCRYPTION_KEY')) !== null;
    } catch {
      return false;
    }
  }

  private key(): Buffer {
    const key = parseEncryptionKey(this.config.get<string>('MFA_ENCRYPTION_KEY'));
    if (!key) {
      throw new ServiceUnavailableException('Authenticator-app enrollment is not configured on this server');
    }
    return key;
  }

  async isEnrolled(userId: string): Promise<boolean> {
    const row = await this.prisma.user_mfa_totp.findUnique({ where: { user_id: userId } });
    return !!row?.confirmed_at;
  }

  /**
   * Begin (or restart) enrollment: a fresh unconfirmed seed. Refused once a confirmed
   * authenticator exists — remove it first, so a stolen session can't silently swap it.
   */
  async startEnrollment(userId: string, accountName: string) {
    const key = this.key();
    const existing = await this.prisma.user_mfa_totp.findUnique({ where: { user_id: userId } });
    if (existing?.confirmed_at) {
      throw new ConflictException('An authenticator app is already set up. Remove it before adding a new one.');
    }

    const secret = this.totp.generateSecret(20);
    await this.prisma.user_mfa_totp.deleteMany({ where: { user_id: userId, confirmed_at: null } });
    await this.prisma.user_mfa_totp.create({
      data: { user_id: userId, secret_encrypted: seal(secret, key, userId) },
    });

    const otpauthUrl = this.totp.keyuri(accountName, ISSUER, secret);
    return { otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 224 }), secret };
  }

  /** Check the first code of a pending enrollment and activate it. */
  async confirmEnrollment(userId: string, code: string): Promise<boolean> {
    const row = await this.prisma.user_mfa_totp.findUnique({ where: { user_id: userId } });
    if (!row || row.confirmed_at) return false;
    const step = this.matchStep(row.secret_encrypted, userId, code);
    if (step === null) return false;
    const { count } = await this.prisma.user_mfa_totp.updateMany({
      where: { id: row.id, confirmed_at: null },
      data: { confirmed_at: new Date(), last_used_step: BigInt(step) },
    });
    return count === 1;
  }

  /** Verify a sign-in code. A code from an already-used (or earlier) step is a replay. */
  async verify(userId: string, code: string): Promise<boolean> {
    const row = await this.prisma.user_mfa_totp.findUnique({ where: { user_id: userId } });
    if (!row?.confirmed_at) return false;
    const step = this.matchStep(row.secret_encrypted, userId, code);
    if (step === null) return false;
    // Conditional update: of two requests presenting the same code, only one wins.
    const { count } = await this.prisma.user_mfa_totp.updateMany({
      where: { id: row.id, OR: [{ last_used_step: null }, { last_used_step: { lt: BigInt(step) } }] },
      data: { last_used_step: BigInt(step) },
    });
    return count === 1;
  }

  async remove(userId: string): Promise<boolean> {
    const { count } = await this.prisma.user_mfa_totp.deleteMany({ where: { user_id: userId } });
    return count > 0;
  }

  /** The time step `code` belongs to, or null when it matches nothing in the ±1 window. */
  private matchStep(sealedSecret: string, userId: string, code: string): number | null {
    const normalized = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) return null;
    let secret: string;
    try {
      secret = open(sealedSecret, this.key(), userId);
    } catch {
      return null;
    }
    const delta = this.totp.checkDelta(normalized, secret);
    if (delta === null) return null;
    return Math.floor(Date.now() / 1000 / STEP_SECONDS) + delta;
  }
}
