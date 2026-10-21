import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TRUSTED_DEVICE_TTL_MS } from './mfa.constants';
import type { AuthRequestContext } from '../request-context';

/** "Chrome on Windows" from a user-agent. Only for display on the security page. */
export function describeUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown browser';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'unknown OS';
  return `${browser} on ${os}`;
}

/**
 * "Trust this browser for this shift" (plan §6.4). The password is still required on a
 * trusted browser — only the second step is skipped. The cookie value is a 32-byte
 * random token; the database keeps only its SHA-256.
 */
@Injectable()
export class TrustedDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async create(userId: string, ctx: AuthRequestContext = {}): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_TTL_MS);
    await this.prisma.trusted_devices.create({
      data: {
        user_id: userId,
        token_hash: this.hash(token),
        label: describeUserAgent(ctx.userAgent),
        ip_address: ctx.ipAddress ?? null,
        expires_at: expiresAt,
      },
    });
    return { token, expiresAt };
  }

  /** True when `token` is a live trusted-browser token that belongs to `userId`. */
  async isTrusted(userId: string, token: string | undefined): Promise<boolean> {
    if (!token) return false;
    const row = await this.prisma.trusted_devices.findUnique({ where: { token_hash: this.hash(token) } });
    if (!row || row.user_id !== userId || row.revoked_at || row.expires_at.getTime() <= Date.now()) {
      return false;
    }
    // Bookkeeping only — never fail a sign-in over it.
    await this.prisma.trusted_devices
      .update({ where: { id: row.id }, data: { last_used_at: new Date() } })
      .catch(() => undefined);
    return true;
  }

  async list(userId: string, currentToken?: string) {
    const currentHash = currentToken ? this.hash(currentToken) : null;
    const rows = await this.prisma.trusted_devices.findMany({
      where: { user_id: userId, revoked_at: null, expires_at: { gt: new Date() } },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      current: currentHash !== null && row.token_hash === currentHash,
    }));
  }

  /** Revoke one browser. Returns false when it isn't this user's (or is already revoked). */
  async revoke(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.trusted_devices.updateMany({
      where: { id, user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return count === 1;
  }

  /** Password change, MFA reset and admin revoke end every trusted browser. */
  async revokeAllForUser(db: Prisma.TransactionClient | PrismaService, userId: string): Promise<number> {
    const { count } = await db.trusted_devices.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return count;
  }
}
