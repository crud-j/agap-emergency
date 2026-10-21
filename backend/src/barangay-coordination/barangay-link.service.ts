import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

const SIGNATURE_LENGTH = 12;

/** Shape of a link token: the 4-digit notice code followed by the signature. */
const TOKEN_PATTERN = new RegExp(`^\\d{4}[A-Za-z0-9_-]{${SIGNATURE_LENGTH}}$`);

/** Letters of the typed access code. No I, L or O, so nothing reads as 1 or 0. */
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LETTER_COUNT = 4;

/** A typed access code once spaces and dashes are removed: `3470KXPM`. */
const ACCESS_CODE_PATTERN = new RegExp(`^(\\d{4})([A-Z]{${CODE_LETTER_COUNT}})$`);

const NOTICE_INCLUDE = { barangay: { select: { id: true, name: true } } } as const;
export type LinkedNotice = Prisma.incident_barangay_noticesGetPayload<{ include: typeof NOTICE_INCLUDE }>;

/**
 * Credentials for the public barangay status page (`/b/<code>`).
 *
 * Carriers drop P2P SMS that contain any web address, so the alert SMS carries an access
 * code instead: the notice's 4-digit code plus 4 letters derived from an HMAC of the
 * notice id (`3470-KXPM`). The barangay types it on the saved `/b` page. The older
 * 16-character link token (`<code><12-char signature>`) still resolves. Neither needs an
 * extra table: the 4 digits find the candidate notices (codes are reused after closure),
 * the HMAC part picks the real one, so a guessed number alone opens nothing. The page is
 * read-mostly and carries no reporter or patient data.
 */
@Injectable()
export class BarangayLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** The code printed in the alert SMS, e.g. `3470-KXPM`. */
  accessCodeFor(notice: { id: string; short_code: string }): string {
    return `${notice.short_code}-${this.letters(notice.id)}`;
  }

  /** True when `letters` are this notice's access-code letters (the `KXPM` of `3470-KXPM`). */
  lettersMatch(noticeId: string, letters: string): boolean {
    return this.matches(letters.toUpperCase(), this.letters(noticeId));
  }

  tokenFor(notice: { id: string; short_code: string }): string {
    return `${notice.short_code}${this.sign(notice.id)}`;
  }

  /**
   * The notice a link token or typed access code belongs to (open or closed), or null for
   * a malformed or forged one. The access code ignores case, spaces and dashes.
   */
  async resolve(token: string): Promise<LinkedNotice | null> {
    const typed = ACCESS_CODE_PATTERN.exec(token.replace(/[\s-]/g, '').toUpperCase());
    if (!typed && !TOKEN_PATTERN.test(token)) return null;

    const code = typed ? typed[1]! : token.slice(0, 4);
    const isMatch = typed
      ? (id: string) => this.matches(typed[2]!, this.letters(id))
      : (id: string) => this.matches(token.slice(4), this.sign(id));

    const candidates = await this.prisma.incident_barangay_notices.findMany({
      where: { short_code: code },
      include: NOTICE_INCLUDE,
      orderBy: { created_at: 'desc' },
      take: 25,
    });
    return candidates.find((n) => isMatch(n.id)) ?? null;
  }

  private sign(noticeId: string): string {
    return createHmac('sha256', this.key()).update(noticeId).digest('base64url').slice(0, SIGNATURE_LENGTH);
  }

  private letters(noticeId: string): string {
    const bytes = createHmac('sha256', this.key()).update(`access-code:${noticeId}`).digest();
    return Array.from(bytes.subarray(0, CODE_LETTER_COUNT), (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
  }

  private matches(given: string, expected: string): boolean {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** A dedicated secret when set; otherwise derived from the JWT secret so the link works out of the box. */
  private key(): string {
    const dedicated = this.config.get<string>('BARANGAY_LINK_SECRET')?.trim();
    if (dedicated) return dedicated;
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET')).update('agap-barangay-link-v1').digest('hex');
  }
}
