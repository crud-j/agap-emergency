import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import {
  AuditAction,
  DEFAULT_ID_DOCUMENT_TYPE,
  ID_DOCUMENT_RULES,
  ID_IMAGE_MAX_BYTES,
  ID_SCAN_CLAIM_TTL_MINUTES,
  ID_SCAN_MAX_ATTEMPTS,
  ID_VERIFICATION_CONSENT_TYPES,
  IdVerificationErrorCode,
  combineIdReads,
  composeFullName,
  matchIdName,
  nameVoteCounts,
  phoneReadSupport,
  type IdCardReleaseReason,
  type IdClaimResponse,
  type IdDocumentType,
  type IdName,
  type IdProfileStatus,
  type IdScanResponse,
} from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { IdDocumentCryptoService } from './id-document-crypto.service';
import { prepareIdImage, turnIdImage, uprightIdImage, type PreparedIdImage, type QuarterTurn } from './id-image-prep';
import { imageSize, regionInPixels, type ImageSize, type PixelRegion } from './id-image-size';
import { IdOcrService, type OcrLayout, type OcrResult } from './id-ocr.service';

/**
 * Below this OCR confidence, text that isn't the chosen ID is treated as unreadable (retry)
 * rather than the wrong card. PhilHealth Phase 0: an uncropped photo read at 28, a cropped card at 57.
 */
const MIN_OCR_CONFIDENCE = 40;

/** Statuses that hold a card for an account (one account per card; partial unique index). */
export const ACTIVE_STATUSES = ['AUTO_VERIFIED', 'PENDING_REVIEW', 'APPROVED'] as const;

/** A claimed row in any of these still keeps card data, so it can be released. */
const RELEASABLE_STATUSES = [...ACTIVE_STATUSES, 'REJECTED'] as const;

/** An account that hasn't confirmed its phone holds a card for this long (plan §5.2a). */
const UNVERIFIED_CLAIM_HOURS = 24;

/** Why a claim ended: the citizen withdrew consent, the phone was never confirmed, or staff released the card. */
export type IdReleaseReason = 'CONSENT_WITHDRAWN' | 'PHONE_NOT_VERIFIED' | IdCardReleaseReason;

/** Erased from a row once nothing needs it. Its status and timestamps stay. */
const CARD_DATA_ERASED = { pin_hmac: null, pin_last4: null, name_on_id_sealed: null } as const;

export interface ReleasedScan {
  id: string;
  image_storage_key: string | null;
}

/**
 * Statuses of a scan still waiting for its registration: AUTO_VERIFIED (read, name to be
 * matched) or PENDING_REVIEW (unreadable, sent to staff review after the third attempt).
 */
const CLAIMABLE_STATUSES = ['AUTO_VERIFIED', 'PENDING_REVIEW'] as const;

type ScanFailure =
  | IdVerificationErrorCode.UNREADABLE
  | IdVerificationErrorCode.NOT_PHILHEALTH_ID
  | IdVerificationErrorCode.NOT_NATIONAL_ID;

/** Statuses whose image is no longer needed (plan §5.2a). AUTO_VERIFIED only once claimed. */
const DECIDED_STATUSES = ['EXPIRED', 'APPROVED', 'REJECTED', 'RELEASED'] as const;

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
    'Your ID scan has expired. Please scan it again.',
  );

const alreadyRegistered = (documentType: IdDocumentType) =>
  idVerificationError(
    HttpStatus.CONFLICT,
    IdVerificationErrorCode.ID_ALREADY_REGISTERED,
    `This ${ID_DOCUMENT_RULES[documentType].label} is already linked to an AGAP account. Sign in or reset your password.`,
  );

/** The typed name parts as an IdName, or null while last or first name is empty. */
export function typedNameFrom(parts: {
  lastName?: string | undefined;
  firstName?: string | undefined;
  middleName?: string | undefined;
  suffix?: string | undefined;
}): IdName | null {
  const last = parts.lastName?.trim();
  const first = parts.firstName?.trim();
  if (!last || !first) return null;
  const name: IdName = { last, first };
  const middle = parts.middleName?.trim();
  const suffix = parts.suffix?.trim();
  if (middle) name.middle = middle;
  if (suffix) name.suffix = suffix;
  return name;
}

type IdRules = (typeof ID_DOCUMENT_RULES)[IdDocumentType];

/** The ID's name column in this image's pixels, or null: the ID has none, or the image's size can't be read. */
function nameRegionOf(rules: IdRules, size: ImageSize | null): PixelRegion | null {
  if (!rules.nameRegion) return null;
  return size ? regionInPixels(rules.nameRegion, size) : null;
}

const readsWholeCard = (rules: IdRules, reads: readonly OcrResult[]): boolean => {
  const found = combineIdReads(rules, reads.map((read) => read.text));
  return found.number !== null && found.name !== null;
};

/** One OCR pass over the card, named for the log: which image (`raw`, `clean`, `binary`) and which layout. */
interface CardRead {
  label: string;
  read: OcrResult | null;
  /** A read of a resized copy: it can back up or contradict the number, never supply it (combineIdReads). */
  confirmOnly?: boolean;
}

const textsByConfidence = (reads: readonly CardRead[]): string[] =>
  reads
    .flatMap(({ read }) => (read ? [read] : []))
    .sort((a, b) => b.confidence - a.confidence)
    .map((read) => read.text);

/** What the reads found between them, each kind most confident first. `first`: texts that go before all others. */
function combineCardReads(rules: IdRules, reads: readonly CardRead[], first: readonly string[] = []) {
  return combineIdReads(
    rules,
    [...first, ...textsByConfidence(reads.filter((entry) => !entry.confirmOnly))],
    textsByConfidence(reads.filter((entry) => entry.confirmOnly)),
  );
}

/**
 * The cleaned images, in order: grey, then black-and-white. Each is read with both layouts at once: block and
 * auto have a worker each, so the pair takes about as long as its slower read.
 */
const CLEANED_IMAGES = ['clean', 'binary'] as const;
const LAYOUTS: readonly OcrLayout[] = ['block', 'auto'];

/**
 * No new read starts after this long; a read already running finishes. A scan that can't settle in this time
 * won't settle with more reads either, and the citizen is waiting with the camera in hand.
 */
export const SCAN_READ_BUDGET_MS = 12_000;

/** A cleaned read normally takes 1–2 s. One that takes this long is stuck, and its worker restarts. */
export const CLEANED_READ_TIMEOUT_MS = 8_000;

/**
 * Which reads go first. The National ID's coloured waves and fine-line background drown its text in a raw
 * read, so its cleaned reads go first. PhilHealth keeps the raw read it was tuned on, and only falls back to
 * cleaned reads when that fails, so a PhilHealth card that reads today reads exactly the same way.
 */
const CLEANED_FIRST: Record<IdDocumentType, boolean> = { NATIONAL_ID: true, PHILHEALTH: false };

/** The second cleaned stage reads the image this much larger: on a real card, it read what 1× missed. */
const RESCALED_READ = 1.3;

/** The value most of `values` share has at least two votes and more than any other value. */
function clearWinner(values: readonly string[]): boolean {
  const counts = [...values.reduce((tally, value) => tally.set(value, (tally.get(value) ?? 0) + 1), new Map<string, number>()).values()];
  counts.sort((a, b) => b - a);
  return (counts[0] ?? 0) >= 2 && (counts[0] ?? 0) > (counts[1] ?? 0);
}

/**
 * Enough reads to stop: the card is whole, at least two reads found the number (one read's number may be one
 * digit off, and nothing else would catch it), and every name part has a clear winner of at least two votes.
 */
function settledReads(rules: IdRules, reads: readonly CardRead[]): boolean {
  const combined = combineCardReads(rules, reads);
  if (!combined.number || !combined.name) return false;
  const texts = textsByConfidence(reads);
  if (texts.filter((text) => rules.parseNumber(text) !== null).length < 2) return false;
  const names = texts.flatMap((text) => rules.parseName(text) ?? []);
  return (['last', 'first', 'middle', 'suffix'] as const).every((part) => clearWinner(names.map((name) => name[part] ?? '')));
}

/**
 * For the server log: which stage of one read failed. Yes/no answers and counts only, never card text,
 * a name or a digit. `number` and `name` are asked of any card, but only their yes/no leaves this function.
 */
function readSummary(rules: IdRules, read: OcrResult | null): string {
  if (!read) return 'none';
  const facts: Record<string, string | number | boolean> = {
    conf: Math.round(read.confidence),
    card: rules.looksLike(read.text),
    number: rules.parseNumber(read.text) !== null,
    name: rules.parseName(read.text) !== null,
    ...rules.readSignals(read.text),
  };
  return Object.entries(facts)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

/**
 * For the server log: whether the phone's own reading passed its check, and how much of it the server's
 * reads back up. Counts only, and it never changes the outcome: the server decides from its own reads.
 */
function phoneReadSummary(rules: IdRules, clientText: string | undefined, serverTexts: readonly string[]): string {
  if (clientText === undefined) return 'none';
  const support = Object.entries(phoneReadSupport(rules, clientText, serverTexts))
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  return `${rules.looksLike(clientText) ? 'read' : 'refused'} ${support}`;
}

export interface IdScanInput {
  /** The ID the citizen chose. Missing means an older app build: PhilHealth. */
  documentType?: IdDocumentType | undefined;
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
  /** From the scan row: which ID this is, so the claim records that ID's consent. */
  documentType: IdDocumentType;
  outcome: 'AUTO_VERIFIED' | 'PENDING_REVIEW';
  /** Stored as match_result: which name parts matched, or why the scan went to review. No names, no card number. */
  matchResult: Prisma.InputJsonObject;
  imageLocation: string | null;
}

/**
 * ID verification at citizen registration (MOD-01 / MOD-48, plan §5): a PhilHealth ID or a
 * National ID. The server reads the card itself; text from the phone is never enough to verify.
 * Gates account creation only — guest SOS never comes here (rule 14).
 */
@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: IdDocumentCryptoService,
    private readonly ocr: IdOcrService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * POST /auth/id-verification after consent and the geo-fence passed. Reads the card,
   * stores the sealed image and an unclaimed row, and returns a claim token, the name as
   * read (the citizen's own card) and the card number's last 4 digits — never the full number.
   *
   * A card the server can't read is refused (422), except when the citizen asks for staff
   * review on attempt ID_SCAN_MAX_ATTEMPTS or later: then the image is stored for MDRRMO
   * staff (status PENDING_REVIEW, no name) and the response says `reviewRequired`.
   */
  async scan(file: Express.Multer.File | undefined, input: IdScanInput): Promise<IdScanResponse> {
    if (!this.crypto.isConfigured()) {
      throw new HttpException('ID verification is not configured on this server', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const documentType = input.documentType ?? DEFAULT_ID_DOCUMENT_TYPE;
    const rules = ID_DOCUMENT_RULES[documentType];
    const image = this.checkImage(file, documentType);
    const attemptNumber = Math.min(Math.max(Math.trunc(input.attemptNumber ?? 1), 1), 99);

    // Several reads of this one image complete each other (combineIdReads): a layout that keeps the name can
    // drop the number, and each name part is voted across the reads that found a name. Each ID's parsers run
    // only for that ID, so a PIN can't be stored as a PhilSys card number or the reverse.
    const { reads, prepared, turn } = await this.readCard(image, rules, documentType);
    const serverTexts = textsByConfidence(reads);
    let combined = combineCardReads(rules, reads);

    // The whole card was read, heading and number, but not the name: read the name column alone, away from
    // the photo beside it, whose noise lands on every name line. It runs only when no other read found a
    // name, so its name is the only one. The heading, a single agreed number and the typed-name check still
    // apply, as for any read. It reads the cleaned image when there is one.
    const nameColumn =
      combined.headingSeen && combined.number && !combined.name
        ? nameRegionOf(rules, prepared ? prepared.size : imageSize(image))
        : null;
    const nameRead = !nameColumn
      ? null
      : prepared
        ? await this.ocr.read(prepared.clean, 'block', nameColumn, CLEANED_READ_TIMEOUT_MS)
        : await this.ocr.read(image, 'block', nameColumn);
    const allTexts = nameRead ? [nameRead.text, ...serverTexts] : serverTexts;
    if (nameRead) combined = combineCardReads(rules, reads, [nameRead.text]);
    const { headingSeen, number, name: nameOnId, numberConflict } = combined;

    // The raw whole-card read is what MIN_OCR_CONFIDENCE was set on; cleaned images read with higher
    // confidence, so they never decide "wrong card" on their own.
    const rawFirst = reads.find((entry) => entry.label === 'raw/block')?.read ?? null;
    let failure: ScanFailure | null = null;
    if (!number || !nameOnId) {
      // A read that saw this ID's heading didn't find the wrong card: it failed to read the right one.
      failure =
        rawFirst && !headingSeen && rawFirst.confidence >= MIN_OCR_CONFIDENCE
          ? rules.wrongCardCode
          : IdVerificationErrorCode.UNREADABLE;
    }
    // Logged when the first read alone didn't read the whole card, as before cleaned reads existed.
    const firstRead = reads[0]?.read ?? null;
    if (firstRead !== null && !readsWholeCard(rules, [firstRead])) {
      this.logger.warn(
        `ID scan needed a second read (${documentType}): phone=${phoneReadSummary(rules, input.clientText, allTexts)} conflict=${numberConflict} ` +
          `cleaned=${prepared ? 'yes' : 'no'} turned=${turn} nameVotes=${nameVoteCounts(rules, serverTexts)} ` +
          reads.map(({ label, read }) => `${label}[${readSummary(rules, read)}] `).join('') +
          `nameColumn[${nameColumn ? readSummary(rules, nameRead) : 'not run'}] ` +
          `outcome=${failure ?? (nameRead ? 'name column read passed' : `passed after ${reads.length} reads`)}`,
      );
    }
    if (failure && (input.requestReview !== true || attemptNumber < ID_SCAN_MAX_ATTEMPTS)) {
      throw this.scanFailed(failure, documentType);
    }

    // A readable number is checked even on a review scan: one account per card.
    const pinHmac = number ? this.crypto.pinHmac(number) : null;
    if (pinHmac) {
      const taken = await this.prisma.identity_verifications.findFirst({
        where: { pin_hmac: pinHmac, user_id: { not: null }, status: { in: [...ACTIVE_STATUSES] } },
        select: { id: true },
      });
      if (taken) throw alreadyRegistered(documentType);
    }

    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const imageLocation = await this.media.putPrivateObject(`id-documents/${id}`, this.crypto.sealImage(id, image));
    const review = failure !== null;

    try {
      await this.prisma.identity_verifications.create({
        data: {
          id,
          document_type: documentType,
          status: review ? 'PENDING_REVIEW' : 'AUTO_VERIFIED',
          claim_token_hash: this.hashToken(token),
          claim_expires_at: new Date(Date.now() + ID_SCAN_CLAIM_TTL_MINUTES * 60 * 1000),
          pin_hmac: pinHmac,
          pin_last4: number ? number.slice(-4) : null,
          name_on_id_sealed: nameOnId && !review ? this.crypto.sealName(id, nameOnId) : null,
          image_storage_key: imageLocation,
          client_read_ok: input.clientText === undefined || !number ? null : rules.parseNumber(input.clientText) === number,
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
      pinLast4: number ? number.slice(-4) : null,
      reviewRequired: review,
      documentType,
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
        document_type: true,
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
        documentType: row.document_type,
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
        `The name you typed doesn't match your ${ID_DOCUMENT_RULES[row.document_type].label}.`,
        { parts: match.parts },
      );
    }
    return {
      verificationId: row.id,
      documentType: row.document_type,
      outcome: match.matches ? 'AUTO_VERIFIED' : 'PENDING_REVIEW',
      matchResult: match.parts,
      imageLocation: row.image_storage_key,
    };
  }

  /**
   * Registration step 2, inside its transaction: record consent and claim the scan for the
   * new user. The claim re-checks "unclaimed and unexpired" atomically, so two registrations
   * racing for one token can't both win. A card already on another account trips the partial
   * unique index. Either failure rolls the whole registration back.
   */
  async claim(tx: Prisma.TransactionClient, prepared: PreparedClaim, userId: string): Promise<void> {
    const consent = await tx.consent_records.create({
      data: { user_id: userId, consent_type: ID_DOCUMENT_RULES[prepared.documentType].consentType, status: 'GRANTED' },
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
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw alreadyRegistered(prepared.documentType);
      throw err;
    }
    if (claimed !== 1) throw scanExpired();

    await this.audit.logInTransaction(tx, {
      action: AuditAction.IDENTITY_VERIFICATION_CLAIMED,
      actorId: userId,
      entityType: 'user',
      entityId: userId,
      moduleId: 'MOD-01',
      newValues: { outcome: prepared.outcome, documentType: prepared.documentType },
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
   * What the citizen's profile shows (plan §8), in the order claimForUser refuses: being verified,
   * then a check under review, so "Scan again" is never offered when the claim would be refused.
   * A rejection counts only with neither; a release turns every older rejection into RELEASED.
   */
  async profileStatus(userId: string): Promise<{ status: IdProfileStatus }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { identity_verified_at: true } });
    if (user?.identity_verified_at) return { status: 'VERIFIED' };

    const scans = await this.prisma.identity_verifications.findMany({
      where: { user_id: userId, status: { in: ['PENDING_REVIEW', 'REJECTED'] } },
      select: { status: true },
    });
    if (scans.some((scan) => scan.status === 'PENDING_REVIEW')) return { status: 'UNDER_REVIEW' };
    return { status: scans.length > 0 ? 'NOT_APPROVED' : 'NOT_VERIFIED' };
  }

  /**
   * Scanning again from the profile (plan §8): the same rules as registration, except the scan
   * is claimed for the signed-in citizen. The account's name becomes the name that was checked,
   * as registration sets it; otherwise "ID verified" could sit next to a different name, and
   * reviewers would compare the card with the wrong one.
   */
  async claimForUser(userId: string, token: string, typed: IdName, requestReview: boolean): Promise<IdClaimResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, is_guest: true },
    });
    if (!user || user.is_guest || user.role !== 'CITIZEN') {
      throw new ForbiddenException('Only citizen accounts scan an ID.');
    }
    await this.refuseIfChecked(this.prisma, userId);

    const prepared = await this.prepareClaim(token, typed, requestReview);
    const fullName = composeFullName(typed);
    await this.prisma.$transaction(async (tx) => {
      // The partial index keeps a card on one account, not an account on one card. Two different
      // cards claimed at once both pass the check above, so the second waits here and is refused.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      await this.refuseIfChecked(tx, userId);
      await this.claim(tx, prepared, userId);
      await tx.user.updateMany({
        where: { id: userId },
        data: { full_name: fullName, identity_verified_at: prepared.outcome === 'AUTO_VERIFIED' ? new Date() : null },
      });
    });

    // Matched: the image is no longer needed (plan §5.2a). Under review: staff still need it.
    if (prepared.outcome === 'AUTO_VERIFIED' && prepared.imageLocation) {
      await this.deleteImage(prepared.verificationId, prepared.imageLocation);
    }
    return { identityVerification: prepared.outcome, fullName };
  }

  /**
   * Ends a user's claim, inside the caller's transaction: erases the name and card number data, marks
   * the account not verified and audits why. The card is then free to be scanned again. The
   * account itself stays usable: getting help never depends on this (rule 14). Returns the rows
   * whose images the caller deletes after commit; empty when there was nothing to release.
   */
  async releaseInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    reason: IdReleaseReason,
    actor?: { id: string; role: string },
  ): Promise<ReleasedScan[]> {
    const rows = await tx.identity_verifications.findMany({
      where: { user_id: userId, status: { in: [...RELEASABLE_STATUSES] } },
      select: { id: true, image_storage_key: true },
    });
    if (rows.length === 0) return [];

    // Re-checked inside the write: of two releases at once, only one finds anything left.
    const { count } = await tx.identity_verifications.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: { in: [...RELEASABLE_STATUSES] } },
      data: { status: 'RELEASED', ...CARD_DATA_ERASED },
    });
    if (count === 0) return [];

    await tx.user.updateMany({ where: { id: userId }, data: { identity_verified_at: null } });
    await this.audit.logInTransaction(tx, {
      action: AuditAction.IDENTITY_VERIFICATION_RELEASED,
      ...(actor && { actorId: actor.id, actorRole: actor.role }),
      entityType: 'user',
      entityId: userId,
      moduleId: 'MOD-48',
      newValues: { reason, scans: count },
    });
    return rows;
  }

  /** Deletes released images after commit. Never throws; false means the cleanup job will retry. */
  async deleteReleasedImages(rows: ReleasedScan[]): Promise<boolean> {
    let allDeleted = true;
    for (const row of rows) {
      if (row.image_storage_key && !(await this.deleteImage(row.id, row.image_storage_key))) allDeleted = false;
    }
    return allDeleted;
  }

  /**
   * The citizen withdrew their ID verification consent (RA 10173): every ID consent is marked
   * withdrawn, whichever ID they name, because releasing erases every row and someone rejected on
   * one card who rescanned with the other holds two (plan §5.3). All in one transaction, then any
   * stored image is deleted. They can still sign in and send an SOS; scanning again verifies them again.
   */
  async withdrawConsent(userId: string): Promise<void> {
    const released = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.consent_records.updateMany({
        where: { user_id: userId, consent_type: { in: [...ID_VERIFICATION_CONSENT_TYPES] }, status: 'GRANTED' },
        data: { status: 'WITHDRAWN', withdrawn_at: new Date() },
      });
      if (count === 0) throw new NotFoundException('No active consent found');

      const rows = await this.releaseInTransaction(tx, userId, 'CONSENT_WITHDRAWN', { id: userId, role: 'CITIZEN' });
      // Even with no row left to release, an account without this consent isn't verified.
      await tx.user.updateMany({ where: { id: userId }, data: { identity_verified_at: null } });
      return rows;
    });
    await this.deleteReleasedImages(released);
  }

  /**
   * Part of the cleanup job: a card stays claimed by an account that never confirmed its phone
   * for only UNVERIFIED_CLAIM_HOURS, so nobody can lock out a card's owner using a number they
   * don't control. Suspended and deactivated accounts keep their claim: waiting must not undo
   * a ban. Staff can still release those (plan §7). Returns how many accounts were released.
   */
  async releaseUnverifiedClaims(now = new Date()): Promise<number> {
    const stale = await this.prisma.identity_verifications.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        created_at: { lt: new Date(now.getTime() - UNVERIFIED_CLAIM_HOURS * 60 * 60 * 1000) },
        user: { is_phone_verified: false, status: { in: ['ACTIVE', 'PENDING_VERIFICATION'] } },
      },
      select: { user_id: true },
      take: CLEANUP_BATCH,
    });

    let released = 0;
    for (const userId of new Set(stale.flatMap((row) => row.user_id ?? []))) {
      try {
        const rows = await this.prisma.$transaction((tx) => this.releaseInTransaction(tx, userId, 'PHONE_NOT_VERIFIED'));
        if (rows.length > 0) released++;
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.name : 'unknown error';
        this.logger.warn(`Could not release the ID claim of user ${userId} (${reason}); the next run retries`);
      }
    }
    return released;
  }

  /**
   * The cleanup job (every 10 minutes): expire scans nobody claimed in time, erase their name
   * and number data, then delete every image that is no longer needed, including ones whose
   * earlier delete failed.
   */
  async cleanup(now = new Date()): Promise<{ expired: number; deleted: number; failed: number }> {
    const { count: expired } = await this.prisma.identity_verifications.updateMany({
      where: { user_id: null, status: { in: [...CLAIMABLE_STATUSES] }, claim_expires_at: { lt: now } },
      data: { status: 'EXPIRED' },
    });

    // Nobody registered, so nothing needs this data and no consent record covers it. A separate
    // write so it also reaches rows that expired before this rule existed.
    await this.prisma.identity_verifications.updateMany({
      where: {
        status: 'EXPIRED',
        OR: [{ pin_hmac: { not: null } }, { pin_last4: { not: null } }, { name_on_id_sealed: { not: null } }],
      },
      data: CARD_DATA_ERASED,
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

  /**
   * Reads the card in stages:
   * - raw: the image as uploaded, block layout, then automatic layout if that missed anything. A read that
   *   timed out isn't repeated.
   * - cleaned: the darkest-ink copies (id-image-prep), grey and black-and-white, each with both layouts; then,
   *   if the reads still haven't settled, the same at 1.3× scale, since a read that fails at one size often
   *   passes at another. A cleaned stage stops as soon as the reads have settled (settledReads). A portrait image
   *   (the card on its side) tries both quarter turns first.
   * National ID: cleaned first; raw only if no cleaned read saw the heading. Once the heading is seen the card
   * is the right one, and a raw read of its busy background (the slowest read, ~6 s) has never added to the
   * cleaned reads; without it, a raw read can still tell the wrong card from an unreadable one.
   * PhilHealth: raw first, exactly as before cleaned reads existed, and cleaned only if raw didn't read the whole
   * card (CLEANED_FIRST). An image that can't be decoded gets the raw stage only.
   * After SCAN_READ_BUDGET_MS no new stage or pair of reads starts; the first stage always runs.
   */
  private async readCard(
    image: Buffer,
    rules: IdRules,
    documentType: IdDocumentType,
  ): Promise<{ reads: CardRead[]; prepared: PreparedIdImage | null; turn: number }> {
    const reads: CardRead[] = [];
    const deadline = Date.now() + SCAN_READ_BUDGET_MS;
    const overBudget = (): boolean => Date.now() >= deadline;
    const whole = (): boolean => {
      const found = combineCardReads(rules, reads);
      return found.number !== null && found.name !== null;
    };
    const settled = (): boolean => settledReads(rules, reads);
    const headingSeen = (): boolean => combineCardReads(rules, reads).headingSeen;
    const upright = await uprightIdImage(image);
    let raw = upright?.upright ?? image;
    let prepared: PreparedIdImage | null = null;
    let turn: QuarterTurn = 0;
    let cleanedFailed = false;

    const rawStage = async (): Promise<void> => {
      const first = await this.ocr.read(raw);
      reads.push({ label: 'raw/block', read: first });
      if (first !== null && !whole() && !(CLEANED_FIRST[documentType] && overBudget())) {
        reads.push({ label: 'raw/auto', read: await this.ocr.read(raw, 'auto') });
      }
    };

    /** The card's quarter turn, for an image on its side: the turn whose read looks most like the card. */
    const chooseTurn = async (portrait: Buffer): Promise<PreparedIdImage | null> => {
      let best: { prepared: PreparedIdImage; read: OcrResult; turn: QuarterTurn; score: number } | null = null;
      for (const quarter of [90, 270] as const) {
        const candidate = await prepareIdImage(portrait, quarter);
        if (!candidate) return null;
        const read = await this.ocr.read(candidate.clean, 'block', undefined, CLEANED_READ_TIMEOUT_MS);
        if (!read) continue;
        const score = (rules.hasHeading(read.text) ? 100 : 0) + read.confidence;
        if (!best || score > best.score) best = { prepared: candidate, read, turn: quarter, score };
      }
      if (!best) return null;
      turn = best.turn;
      reads.push({ label: 'clean/block', read: best.read });
      // A raw read after this one should see the card the same way up.
      raw = (await turnIdImage(portrait, best.turn)) ?? raw;
      return best.prepared;
    };

    const cleanedStage = async (scale: number): Promise<void> => {
      if (!upright || cleanedFailed) return;
      const suffix = scale === 1 ? '' : `@${scale}`;
      const images =
        scale === 1
          ? upright.portrait
            ? await chooseTurn(upright.upright)
            : await prepareIdImage(upright.upright)
          : await prepareIdImage(upright.upright, turn, scale);
      if (!images) {
        cleanedFailed = true;
        return;
      }
      if (scale === 1) prepared = images;
      for (const kind of CLEANED_IMAGES) {
        if (settled() || overBudget()) return;
        const steps = LAYOUTS.map((layout) => ({ layout, label: `${kind}${suffix}/${layout}` })).filter(
          ({ label }) => !reads.some((entry) => entry.label === label),
        );
        const results = await Promise.all(
          steps.map(({ layout }) => this.ocr.read(images[kind], layout, undefined, CLEANED_READ_TIMEOUT_MS)),
        );
        steps.forEach(({ label }, i) => {
          const read = results[i] ?? null;
          reads.push(scale === 1 ? { label, read } : { label, read, confirmOnly: true });
        });
        // A read that failed or timed out restarts its worker; more reads now would only queue behind it.
        if (results.some((read) => read === null)) {
          cleanedFailed = true;
          return;
        }
      }
    };

    if (CLEANED_FIRST[documentType]) {
      await cleanedStage(1);
      if (!settled() && !overBudget()) await cleanedStage(RESCALED_READ);
      if (!whole() && !headingSeen() && !overBudget()) await rawStage();
    } else {
      await rawStage();
      if (!whole() && !overBudget()) await cleanedStage(1);
      if (!whole() && !overBudget()) await cleanedStage(RESCALED_READ);
    }
    return { reads, prepared, turn };
  }

  /** Refuses a new claim while the account is verified or holds a check, on either ID. */
  private async refuseIfChecked(db: Prisma.TransactionClient, userId: string): Promise<void> {
    const user = await db.user.findUnique({ where: { id: userId }, select: { identity_verified_at: true } });
    const held = await db.identity_verifications.findFirst({
      where: { user_id: userId, status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true },
    });
    if (held || user?.identity_verified_at) {
      throw idVerificationError(
        HttpStatus.CONFLICT,
        IdVerificationErrorCode.ID_ALREADY_REGISTERED,
        'Your account already has an ID check.',
      );
    }
  }

  private checkImage(file: Express.Multer.File | undefined, documentType: IdDocumentType): Buffer {
    if (!file?.buffer?.length) {
      throw idVerificationError(
        HttpStatus.BAD_REQUEST,
        IdVerificationErrorCode.UNSUPPORTED_IMAGE_TYPE,
        `Attach a JPEG or PNG image of the front of your ${ID_DOCUMENT_RULES[documentType].label}.`,
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

  private scanFailed(failure: ScanFailure, documentType: IdDocumentType): HttpException {
    const { label } = ID_DOCUMENT_RULES[documentType];
    if (failure !== IdVerificationErrorCode.UNREADABLE) {
      return idVerificationError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        failure,
        `This isn't a ${label}. Scan the front of your ${label}, or choose a different ID.`,
      );
    }
    return idVerificationError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      IdVerificationErrorCode.UNREADABLE,
      `We couldn't read your ${label}. Hold it flat, avoid glare, and try again.`,
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
