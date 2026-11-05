import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  AuditAction,
  ID_IMAGE_MAX_BYTES,
  ID_SCAN_CLAIM_TTL_MINUTES,
  ID_SCAN_MAX_ATTEMPTS,
  ID_VERIFICATION_CONSENT_TYPE,
  IdVerificationErrorCode,
  looksLikePhilHealthId,
  matchIdName,
  parsePhilHealthName,
  parsePhilHealthPin,
  type IdName,
  type IdScanResponse,
} from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { IdDocumentCryptoService } from './id-document-crypto.service';
import { PhilhealthOcrService } from './philhealth-ocr.service';

/**
 * Below this OCR confidence, text that isn't a PhilHealth ID is treated as unreadable (retry)
 * rather than "not a PhilHealth ID". Phase 0: an uncropped photo read at 28, a cropped card at 57.
 */
const MIN_OCR_CONFIDENCE = 40;

/** Statuses that hold a PhilHealth ID for an account (one per account; partial unique index). */
const ACTIVE_STATUSES = ['AUTO_VERIFIED', 'PENDING_REVIEW', 'APPROVED'] as const;

/**
 * Statuses of a scan still waiting for its registration: AUTO_VERIFIED (read, name to be
 * matched) or PENDING_REVIEW (unreadable, sent to staff review after the third attempt).
 */
const CLAIMABLE_STATUSES = ['AUTO_VERIFIED', 'PENDING_REVIEW'] as const;

type ScanFailure = IdVerificationErrorCode.UNREADABLE | IdVerificationErrorCode.NOT_PHILHEALTH_ID;

/** Statuses whose image is no longer needed (plan §5.2a). AUTO_VERIFIED only once claimed. */
const DECIDED_STATUSES = ['EXPIRED', 'APPROVED', 'REJECTED'] as const;

const CLEANUP_BATCH = 200;

/** JPEG and PNG by their first bytes, not by the client's declared type. */
function imageKind(buffer: Buffer): 'jpeg' | 'png' | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  return null;
}

/** An error the app branches on by its stable `code`. Messages never contain card data. */
export function idVerificationError(
  status: HttpStatus,
  code: IdVerificationErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): HttpException {
  return new HttpException({ statusCode: status, code, message, ...extra }, status);
}

const scanExpired = () =>
  idVerificationError(
    HttpStatus.BAD_REQUEST,
    IdVerificationErrorCode.ID_SCAN_EXPIRED,
    'Your PhilHealth ID scan has expired. Please scan it again.',
  );

const alreadyRegistered = () =>
  idVerificationError(
    HttpStatus.CONFLICT,
    IdVerificationErrorCode.ID_ALREADY_REGISTERED,
    'This PhilHealth ID is already linked to an AGAP account. Sign in or reset your password.',
  );

export interface IdScanInput {
  /** The phone's own reading. Compared with the server's, never trusted, stored or logged. */
  clientText?: string | undefined;
  attemptNumber?: number | undefined;
  /**
   * The citizen asked for MDRRMO staff review. Only honoured from attempt ID_SCAN_MAX_ATTEMPTS
   * on, and only when the server can't read the card: a readable card goes the normal way.
   */
  requestReview?: boolean | undefined;
}

/** A scan checked against the typed name, ready to be claimed inside the registration transaction. */
export interface PreparedClaim {
  verificationId: string;
  outcome: 'AUTO_VERIFIED' | 'PENDING_REVIEW';
  /** Stored as match_result: which name parts matched, or why the scan went to review. No names, no PIN. */
  matchResult: Prisma.InputJsonObject;
  imageLocation: string | null;
}

/**
 * PhilHealth ID verification at citizen registration (MOD-01 / MOD-48, plan §5). The server
 * reads the card itself; text from the phone is never enough to verify. Gates account
 * creation only — guest SOS never comes here (rule 14).
 */
@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: IdDocumentCryptoService,
    private readonly ocr: PhilhealthOcrService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * POST /auth/id-verification after consent and the geo-fence passed. Reads the card,
   * stores the sealed image and an unclaimed row, and returns a claim token, the name as
   * read (the citizen's own card) and the PIN's last 4 digits — never the full PIN.
   *
   * A card the server can't read is refused (422), except when the citizen asks for staff
   * review on attempt ID_SCAN_MAX_ATTEMPTS or later: then the image is stored for MDRRMO
   * staff (status PENDING_REVIEW, no name) and the response says `reviewRequired`.
   */
  async scan(file: Express.Multer.File | undefined, input: IdScanInput): Promise<IdScanResponse> {
    if (!this.crypto.isConfigured()) {
      throw new HttpException('PhilHealth ID verification is not configured on this server', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const image = this.checkImage(file);
    const attemptNumber = Math.min(Math.max(Math.trunc(input.attemptNumber ?? 1), 1), 99);

    const read = await this.ocr.read(image);
    const isPhilHealth = read !== null && looksLikePhilHealthId(read.text);
    const pin = isPhilHealth ? parsePhilHealthPin(read.text) : null;
    const nameOnId = isPhilHealth ? parsePhilHealthName(read.text) : null;

    let failure: ScanFailure | null = null;
    if (!pin || !nameOnId) {
      failure =
        read && !isPhilHealth && read.confidence >= MIN_OCR_CONFIDENCE
          ? IdVerificationErrorCode.NOT_PHILHEALTH_ID
          : IdVerificationErrorCode.UNREADABLE;
      if (input.requestReview !== true || attemptNumber < ID_SCAN_MAX_ATTEMPTS) throw this.scanFailed(failure);
    }

    // A readable PIN is checked even on a review scan: one PhilHealth ID per account.
    const pinHmac = pin ? this.crypto.pinHmac(pin) : null;
    if (pinHmac) {
      const taken = await this.prisma.identity_verifications.findFirst({
        where: { pin_hmac: pinHmac, user_id: { not: null }, status: { in: [...ACTIVE_STATUSES] } },
        select: { id: true },
      });
      if (taken) throw alreadyRegistered();
    }

    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const imageLocation = await this.media.putPrivateObject(`id-documents/${id}`, this.crypto.sealImage(id, image));
    const review = failure !== null;

    try {
      await this.prisma.identity_verifications.create({
        data: {
          id,
          status: review ? 'PENDING_REVIEW' : 'AUTO_VERIFIED',
          claim_token_hash: this.hashToken(token),
          claim_expires_at: new Date(Date.now() + ID_SCAN_CLAIM_TTL_MINUTES * 60 * 1000),
          pin_hmac: pinHmac,
          pin_last4: pin ? pin.slice(-4) : null,
          name_on_id_sealed: nameOnId && !review ? this.crypto.sealName(id, nameOnId) : null,
          image_storage_key: imageLocation,
          client_read_ok: input.clientText === undefined || !pin ? null : parsePhilHealthPin(input.clientText) === pin,
          attempt_number: attemptNumber,
          // Why staff are asked to look: a fixed code, never OCR text.
          ...(failure ? { match_result: { scanFailure: failure } } : {}),
        },
      });
    } catch (err) {
      await this.media.deletePrivateObject(imageLocation).catch(() => undefined);
      throw err;
    }

    return {
      token,
      nameOnId: review ? null : nameOnId,
      pinLast4: pin ? pin.slice(-4) : null,
      reviewRequired: review,
    };
  }

  /**
   * Registration step 1, before its transaction: the scan must be unclaimed and unexpired,
   * and the typed name must match the card unless the citizen asked for staff review.
   * A mismatch creates nothing and leaves the scan claimable, so the citizen can fix a typo.
   * A review scan (unreadable card) has no name to match: the account is always created
   * with its ID under review.
   */
  async prepareClaim(token: string, typed: IdName, requestReview: boolean): Promise<PreparedClaim> {
    const row = await this.prisma.identity_verifications.findUnique({
      where: { claim_token_hash: this.hashToken(token) },
      select: {
        id: true,
        user_id: true,
        status: true,
        claim_expires_at: true,
        name_on_id_sealed: true,
        image_storage_key: true,
        match_result: true,
      },
    });
    const claimable = (CLAIMABLE_STATUSES as readonly string[]).includes(row?.status ?? '');
    if (!row || row.user_id || !claimable || row.claim_expires_at <= new Date()) {
      throw scanExpired();
    }

    if (row.status === 'PENDING_REVIEW' || !row.name_on_id_sealed) {
      const stored = row.match_result;
      return {
        verificationId: row.id,
        outcome: 'PENDING_REVIEW',
        matchResult: stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Prisma.InputJsonObject) : {},
        imageLocation: row.image_storage_key,
      };
    }

    const match = matchIdName(typed, this.crypto.openName(row.id, row.name_on_id_sealed));
    if (!match.matches && !requestReview) {
      throw idVerificationError(
        HttpStatus.BAD_REQUEST,
        IdVerificationErrorCode.NAME_DOES_NOT_MATCH_ID,
        "The name you typed doesn't match your PhilHealth ID.",
        { parts: match.parts },
      );
    }
    return {
      verificationId: row.id,
      outcome: match.matches ? 'AUTO_VERIFIED' : 'PENDING_REVIEW',
      matchResult: match.parts,
      imageLocation: row.image_storage_key,
    };
  }

  /**
   * Registration step 2, inside its transaction: record consent and claim the scan for the
   * new user. The claim re-checks "unclaimed and unexpired" atomically, so two registrations
   * racing for one token can't both win. A PhilHealth ID already on another account trips
   * the partial unique index. Either failure rolls the whole registration back.
   */
  async claim(tx: Prisma.TransactionClient, prepared: PreparedClaim, userId: string): Promise<void> {
    const consent = await tx.consent_records.create({
      data: { user_id: userId, consent_type: ID_VERIFICATION_CONSENT_TYPE, status: 'GRANTED' },
      select: { id: true },
    });

    let claimed: number;
    try {
      ({ count: claimed } = await tx.identity_verifications.updateMany({
        where: {
          id: prepared.verificationId,
          user_id: null,
          status: { in: [...CLAIMABLE_STATUSES] },
          claim_expires_at: { gt: new Date() },
        },
        data: {
          user_id: userId,
          status: prepared.outcome,
          consent_record_id: consent.id,
          match_result: prepared.matchResult,
        },
      }));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw alreadyRegistered();
      throw err;
    }
    if (claimed !== 1) throw scanExpired();

    await this.audit.logInTransaction(tx, {
      action: AuditAction.IDENTITY_VERIFICATION_CLAIMED,
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      moduleId: 'MOD-01',
      newValues: { outcome: prepared.outcome },
    });
  }

  /**
   * Deletes a stored ID image and clears its key. Never throws: a failure is logged without
   * personal data and the cleanup job tries again (plan §5.2a).
   */
  async deleteImage(verificationId: string, location: string): Promise<boolean> {
    try {
      await this.media.deletePrivateObject(location);
      await this.prisma.identity_verifications.updateMany({
        where: { id: verificationId, image_storage_key: location },
        data: { image_storage_key: null },
      });
      return true;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.name : 'unknown error';
      this.logger.warn(`Could not delete the ID image of verification ${verificationId} (${reason}); cleanup will retry`);
      return false;
    }
  }

  /**
   * The cleanup job (every 10 minutes): expire scans nobody claimed in time, then delete
   * every image that is no longer needed, including ones whose earlier delete failed.
   */
  async cleanup(now = new Date()): Promise<{ expired: number; deleted: number; failed: number }> {
    const { count: expired } = await this.prisma.identity_verifications.updateMany({
      where: { user_id: null, status: { in: [...CLAIMABLE_STATUSES] }, claim_expires_at: { lt: now } },
      data: { status: 'EXPIRED' },
    });

    const stale = await this.prisma.identity_verifications.findMany({
      where: {
        image_storage_key: { not: null },
        OR: [{ status: { in: [...DECIDED_STATUSES] } }, { status: 'AUTO_VERIFIED', user_id: { not: null } }],
      },
      select: { id: true, image_storage_key: true },
      take: CLEANUP_BATCH,
    });

    let deleted = 0;
    for (const row of stale) {
      if (row.image_storage_key && (await this.deleteImage(row.id, row.image_storage_key))) deleted++;
    }
    return { expired, deleted, failed: stale.length - deleted };
  }

  private checkImage(file: Express.Multer.File | undefined): Buffer {
    if (!file?.buffer?.length) {
      throw idVerificationError(
        HttpStatus.BAD_REQUEST,
        IdVerificationErrorCode.UNSUPPORTED_IMAGE_TYPE,
        'Attach a JPEG or PNG image of the front of your PhilHealth ID.',
      );
    }
    if (file.size > ID_IMAGE_MAX_BYTES || file.buffer.length > ID_IMAGE_MAX_BYTES) {
      throw idVerificationError(
        HttpStatus.PAYLOAD_TOO_LARGE,
        IdVerificationErrorCode.IMAGE_TOO_LARGE,
        'The ID image is too large (2 MB maximum).',
      );
    }
    const kind = imageKind(file.buffer);
    if (!kind || !['image/jpeg', 'image/png'].includes(file.mimetype)) {
      throw idVerificationError(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        IdVerificationErrorCode.UNSUPPORTED_IMAGE_TYPE,
        'Only JPEG or PNG images are accepted.',
      );
    }
    return file.buffer;
  }

  private scanFailed(failure: ScanFailure): HttpException {
    if (failure === IdVerificationErrorCode.NOT_PHILHEALTH_ID) {
      return idVerificationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        IdVerificationErrorCode.NOT_PHILHEALTH_ID,
        "This isn't a PhilHealth ID. Only a PhilHealth ID can be used to create an account.",
      );
    }
    return idVerificationError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      IdVerificationErrorCode.UNREADABLE,
      "We couldn't read your PhilHealth ID. Hold it flat, avoid glare, and try again.",
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
