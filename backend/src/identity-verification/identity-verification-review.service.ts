import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  DEFAULT_ID_DOCUMENT_TYPE,
  ID_DOCUMENT_RULES,
  ID_REVIEW_STATUSES,
  IdVerificationErrorCode,
  UserRole,
  type IdCardHolder,
  type IdCardReleaseReason,
  type IdCardReleaseResult,
  type IdDocumentType,
  type IdNamePart,
  type IdRejectionReason,
  type IdReviewDecisionResult,
  type IdReviewItem,
  type IdReviewReason,
  type IdReviewStatus,
  type PaginatedResult,
} from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { IdDocumentCryptoService } from './id-document-crypto.service';
import { ACTIVE_STATUSES, IdentityVerificationService, idVerificationError } from './identity-verification.service';
import { IdReviewNotifier } from './id-review-notifier';
import { isAccountBlocked } from '../auth/account-status';

/** The signed-in staff member (JwtStrategy's request user). */
export interface ReviewActor {
  id: string;
  role: string;
}

const MAX_PER_PAGE = 100;

const NAME_PARTS: readonly IdNamePart[] = ['last', 'first', 'middle', 'suffix'];

/**
 * Why a scan is under review, from its `match_result` (plan §5.3): `{ scanFailure }` for a card
 * the server couldn't use, or the matcher's parts for a typed name that didn't match.
 */
export function reviewReasonOf(matchResult: Prisma.JsonValue | null): IdReviewReason {
  if (!matchResult || typeof matchResult !== 'object' || Array.isArray(matchResult)) return { kind: 'UNKNOWN' };
  const stored = matchResult as Record<string, unknown>;
  if (
    stored['scanFailure'] === IdVerificationErrorCode.UNREADABLE ||
    stored['scanFailure'] === IdVerificationErrorCode.NOT_PHILHEALTH_ID ||
    stored['scanFailure'] === IdVerificationErrorCode.NOT_NATIONAL_ID
  ) {
    return { kind: 'SCAN_FAILURE', code: stored['scanFailure'] };
  }
  const failedParts = NAME_PARTS.filter((part) => {
    const value = stored[part];
    return part === 'middle' ? value === 'mismatch' : value === false;
  });
  // A row with no parts recorded at all can't say why; one with all parts fine is still a review.
  return NAME_PARTS.some((part) => part in stored) ? { kind: 'NAME_MISMATCH', failedParts } : { kind: 'UNKNOWN' };
}

/** Is this one of the "not this ID" reasons, as opposed to one that fits any card? */
const isWrongCardReason = (reason: IdRejectionReason): boolean =>
  Object.values(ID_DOCUMENT_RULES).some((rules) => rules.rejectionReason === reason);

const imageType = (image: Buffer): string =>
  image.length > 3 && image[0] === 0x89 && image[1] === 0x50 ? 'image/png' : 'image/jpeg';

/**
 * Staff review of ID checks, either ID (MOD-01 / MOD-48, plan §7). Reviewers: System Administrators,
 * and Org Administrators of an MDRRMO organization (Part B Q1). Every image view and decision is
 * audited; the image is deleted once a decision commits (plan §5.2a).
 */
@Injectable()
export class IdentityVerificationReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: IdDocumentCryptoService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly verification: IdentityVerificationService,
    private readonly notifier: IdReviewNotifier,
  ) {}

  /** System Administrator, or an Org Administrator with an active membership in an active MDRRMO organization. */
  async assertReviewer(actor: ReviewActor): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMINISTRATOR) return;
    if (actor.role === UserRole.ORG_ADMINISTRATOR) {
      const membership = await this.prisma.organization_memberships.findFirst({
        where: {
          user_id: actor.id,
          is_active: true,
          organizations: { is: { organization_type: 'MDRRMO', is_active: true } },
        },
        select: { id: true },
      });
      if (membership) return;
    }
    throw new ForbiddenException('Only MDRRMO administrators review ID checks.');
  }

  /** The queue: claimed scans in one status, oldest first for pending ones. No image, no card number. */
  async list(
    actor: ReviewActor,
    query: { status?: string | undefined; page?: number | undefined; perPage?: number | undefined },
  ): Promise<PaginatedResult<IdReviewItem>> {
    await this.assertReviewer(actor);
    const status: IdReviewStatus = (ID_REVIEW_STATUSES as readonly string[]).includes(query.status ?? '')
      ? (query.status as IdReviewStatus)
      : 'PENDING_REVIEW';
    const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Math.trunc(query.perPage ?? 25) || 25));
    const where: Prisma.identity_verificationsWhereInput = { status, user_id: { not: null } };

    const [total, rows] = await Promise.all([
      this.prisma.identity_verifications.count({ where }),
      this.prisma.identity_verifications.findMany({
        where,
        orderBy: { created_at: status === 'PENDING_REVIEW' ? 'asc' : 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          document_type: true,
          // Only to say whether a number is stored. It never leaves this method.
          pin_hmac: true,
          status: true,
          created_at: true,
          attempt_number: true,
          match_result: true,
          image_storage_key: true,
          reviewed_at: true,
          rejection_reason: true,
          user: { select: { id: true, full_name: true, phone_number: true } },
          reviewer: { select: { full_name: true } },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    return {
      data: rows.map((row) => ({
        id: row.id,
        documentType: row.document_type,
        hasCardNumber: row.pin_hmac !== null,
        status: row.status as IdReviewStatus,
        submittedAt: row.created_at.toISOString(),
        attemptNumber: row.attempt_number,
        account: {
          id: row.user?.id ?? '',
          name: row.user?.full_name ?? '',
          phoneNumber: row.user?.phone_number ?? null,
        },
        reason: reviewReasonOf(row.match_result),
        hasImage: row.status === 'PENDING_REVIEW' && row.image_storage_key !== null,
        reviewedAt: row.reviewed_at?.toISOString() ?? null,
        reviewedByName: row.reviewer?.full_name ?? null,
        rejectionReason: (row.rejection_reason as IdRejectionReason | null) ?? null,
      })),
      meta: { total, page, perPage, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  /**
   * Opens the stored image for a reviewer. Audited before it is returned: if the audit row
   * can't be written, the image isn't shown. 410 once the image has been deleted, or once nothing
   * needs it: a failed delete can leave the file stored for the cleanup job (plan §5.2a).
   */
  async openImage(actor: ReviewActor, id: string): Promise<{ image: Buffer; contentType: string }> {
    await this.assertReviewer(actor);
    const row = await this.prisma.identity_verifications.findFirst({
      where: { id, user_id: { not: null } },
      select: { id: true, status: true, image_storage_key: true },
    });
    if (!row) throw new NotFoundException('ID check not found.');
    if (row.status !== 'PENDING_REVIEW' || !row.image_storage_key) {
      throw new GoneException('This ID image has been deleted.');
    }

    const image = this.crypto.openImage(row.id, await this.media.getPrivateObject(row.image_storage_key));
    // Not AuditService.log(): that one swallows failures, and an unaudited view is not allowed.
    await this.audit.logInTransaction(this.prisma as unknown as Prisma.TransactionClient, {
      action: AuditAction.ID_IMAGE_VIEWED,
      actorId: actor.id,
      actorRole: actor.role,
      entityType: 'identity_verification',
      entityId: row.id,
      moduleId: 'MOD-48',
    });
    return { image, contentType: imageType(image) };
  }

  /**
   * Which account holds this card? Staff type the number from a card the citizen is showing them,
   * when its owner finds it already taken (plan §7). The lookup is audited, found or not, and the
   * number itself goes nowhere: only its HMAC is compared, as at registration. It is parsed by the
   * chosen ID, so a PhilSys Number typed by mistake is refused.
   */
  async findCardHolder(actor: ReviewActor, rawPin: string, documentType: IdDocumentType = DEFAULT_ID_DOCUMENT_TYPE): Promise<IdCardHolder> {
    await this.assertReviewer(actor);
    const rules = ID_DOCUMENT_RULES[documentType];
    const pin = rules.parseNumber(rawPin);
    if (!pin) throw new BadRequestException(`Enter ${rules.numberPrompt}.`);

    const row = await this.prisma.identity_verifications.findFirst({
      where: {
        pin_hmac: this.crypto.pinHmac(pin),
        document_type: documentType,
        user_id: { not: null },
        status: { in: [...ACTIVE_STATUSES] },
      },
      select: {
        id: true,
        status: true,
        created_at: true,
        user: { select: { id: true, full_name: true, phone_number: true, status: true, is_phone_verified: true } },
      },
    });
    await this.audit.logInTransaction(this.prisma as unknown as Prisma.TransactionClient, {
      action: AuditAction.ID_CARD_LOOKUP,
      actorId: actor.id,
      actorRole: actor.role,
      entityType: 'identity_verification',
      entityId: row?.id,
      moduleId: 'MOD-48',
      newValues: { found: !!row?.user },
    });
    if (!row?.user) throw new NotFoundException(`No account holds this ${rules.label}. The citizen can scan it now.`);

    return {
      id: row.id,
      status: row.status as IdCardHolder['status'],
      submittedAt: row.created_at.toISOString(),
      account: {
        id: row.user.id,
        name: row.user.full_name,
        phoneNumber: row.user.phone_number,
        status: row.user.status,
        phoneVerified: row.user.is_phone_verified,
      },
    };
  }

  /**
   * Releases a card from the account holding it, so its owner can scan it. Erases the card data
   * and marks the account not verified in one transaction, then deletes any image and tells the
   * citizen; neither of those can undo the release. A blocked account isn't messaged.
   */
  async releaseCard(actor: ReviewActor, id: string, reason: IdCardReleaseReason): Promise<IdCardReleaseResult> {
    await this.assertReviewer(actor);
    const row = await this.prisma.identity_verifications.findFirst({
      where: { id, user_id: { not: null } },
      select: { user_id: true, status: true, user: { select: { status: true } } },
    });
    if (!row?.user_id) throw new NotFoundException('ID check not found.');
    const userId = row.user_id;
    const notLinked = () => new ConflictException('This ID is no longer linked to the account.');
    if (!(ACTIVE_STATUSES as readonly string[]).includes(row.status)) throw notLinked();

    const released = await this.prisma.$transaction(async (tx) => {
      const rows = await this.verification.releaseInTransaction(tx, userId, reason, actor);
      if (!rows.some((scan) => scan.id === id)) throw notLinked();
      return rows;
    });

    const imageDeleted = await this.verification.deleteReleasedImages(released);
    if (!isAccountBlocked(row.user?.status)) await this.notifier.notifyDecision(userId, 'RELEASED');
    return { id, imageDeleted };
  }

  /** `cardNumber`: what staff typed from the image, when the ID's rules need one and none is stored (plan §7). */
  approve(actor: ReviewActor, id: string, cardNumber?: string): Promise<IdReviewDecisionResult> {
    return this.decide(actor, id, { status: 'APPROVED', cardNumber });
  }

  reject(actor: ReviewActor, id: string, reason: IdRejectionReason): Promise<IdReviewDecisionResult> {
    return this.decide(actor, id, { status: 'REJECTED', reason });
  }

  /**
   * One decision: the status change, a number staff typed, `identity_verified_at` on approval and
   * the audit row commit together. Then, outside the transaction, the image is deleted and the
   * citizen notified; neither can undo the decision (plan §5.2a, §7). A typed number appears in no
   * audit row, log or response.
   */
  private async decide(
    actor: ReviewActor,
    id: string,
    decision: { status: 'APPROVED'; cardNumber?: string | undefined } | { status: 'REJECTED'; reason: IdRejectionReason },
  ): Promise<IdReviewDecisionResult> {
    await this.assertReviewer(actor);
    const row = await this.prisma.identity_verifications.findFirst({
      where: { id, user_id: { not: null } },
      select: { id: true, user_id: true, status: true, document_type: true, pin_hmac: true },
    });
    if (!row || !row.user_id) throw new NotFoundException('ID check not found.');
    const userId = row.user_id;
    const now = new Date();
    const rules = ID_DOCUMENT_RULES[row.document_type];

    // The wrong-card reason of the other ID makes no sense on this row, and would mislead later readers.
    if (decision.status === 'REJECTED' && decision.reason !== rules.rejectionReason && isWrongCardReason(decision.reason)) {
      throw new BadRequestException(`That reason doesn't apply to a ${rules.label} check.`);
    }
    const heldCard = decision.status === 'APPROVED' ? this.cardToHold(row, rules, decision.cardNumber) : {};

    const imageKey = await this.prisma.$transaction(async (tx) => {
      // Re-checked inside the write: two reviewers deciding at once can't both win.
      let count: number;
      try {
        ({ count } = await tx.identity_verifications.updateMany({
          where: { id, user_id: userId, status: 'PENDING_REVIEW' },
          data: {
            status: decision.status,
            reviewed_by_id: actor.id,
            reviewed_at: now,
            rejection_reason: decision.status === 'REJECTED' ? decision.reason : null,
            ...heldCard,
          },
        }));
      } catch (err) {
        // The typed number is on another account: uq_identity_verifications_pin_active. Nothing changes.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw idVerificationError(
            HttpStatus.CONFLICT,
            IdVerificationErrorCode.ID_ALREADY_REGISTERED,
            `This ${rules.label} is already linked to another account. Look up who holds it before approving.`,
          );
        }
        throw err;
      }
      if (count !== 1) throw new ConflictException('This ID check has already been decided.');

      if (decision.status === 'APPROVED') {
        await tx.user.update({ where: { id: userId }, data: { identity_verified_at: now } });
      }
      await this.audit.logInTransaction(tx, {
        action:
          decision.status === 'APPROVED'
            ? AuditAction.IDENTITY_VERIFICATION_APPROVED
            : AuditAction.IDENTITY_VERIFICATION_REJECTED,
        actorId: actor.id,
        actorRole: actor.role,
        entityType: 'identity_verification',
        entityId: id,
        moduleId: 'MOD-01',
        oldValues: { status: 'PENDING_REVIEW' },
        newValues: decision.status === 'REJECTED' ? { status: 'REJECTED', reason: decision.reason } : { status: 'APPROVED' },
      });
      // Read here: after the commit, a failed read would answer 500 for a saved decision and skip the notification.
      const stored = await tx.identity_verifications.findFirst({ where: { id }, select: { image_storage_key: true } });
      return stored?.image_storage_key ?? null;
    });

    // After the commit. Neither step can throw. A concurrent cleanup deleting the same file is harmless.
    const imageDeleted = imageKey ? await this.verification.deleteImage(id, imageKey) : true;

    await this.notifier.notifyDecision(userId, decision.status);
    return { id, status: decision.status, imageDeleted };
  }

  /**
   * What approving stores so the card is held. Without this, an approved scan with no number holds no
   * card, and the same card could verify any number of other accounts (plan §7, N8). A number is only
   * taken when the ID's rules need one and none is stored; anything else stays as it is.
   */
  private cardToHold(
    row: { status: string; pin_hmac: string | null },
    rules: (typeof ID_DOCUMENT_RULES)[IdDocumentType],
    cardNumber: string | undefined,
  ): { pin_hmac?: string; pin_last4?: string } {
    if (!rules.approvalNeedsNumber || row.pin_hmac !== null || row.status !== 'PENDING_REVIEW') return {};
    const number = cardNumber ? rules.parseNumber(cardNumber) : null;
    if (!number) throw new BadRequestException(`Enter ${rules.numberPrompt} to approve this check.`);
    return { pin_hmac: this.crypto.pinHmac(number), pin_last4: number.slice(-4) };
  }
}
