import type { IdName } from '../validation/philhealth-id';

/**
 * PhilHealth ID verification at registration (MOD-01, docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md).
 * Shared so the app's limits and error handling match the server's.
 */

/** Largest ID image the scan endpoint accepts (JPEG or PNG). */
export const ID_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** A scan must be claimed by a registration within this time, or it expires and the image is deleted. */
export const ID_SCAN_CLAIM_TTL_MINUTES = 30;

/** Failed scans before the app offers "Send to MDRRMO for review". */
export const ID_SCAN_MAX_ATTEMPTS = 3;

/** `consent_records.consent_type` for the ID scan. */
export const ID_VERIFICATION_CONSENT_TYPE = 'ID_VERIFICATION_PHILHEALTH';

/** Stable `code` values in error bodies from POST /auth/id-verification and POST /auth/register. */
export enum IdVerificationErrorCode {
  CONSENT_REQUIRED = 'CONSENT_REQUIRED',
  OUTSIDE_SERVICE_AREA = 'OUTSIDE_SERVICE_AREA',
  IMAGE_TOO_LARGE = 'IMAGE_TOO_LARGE',
  UNSUPPORTED_IMAGE_TYPE = 'UNSUPPORTED_IMAGE_TYPE',
  NOT_PHILHEALTH_ID = 'NOT_PHILHEALTH_ID',
  UNREADABLE = 'UNREADABLE',
  ID_ALREADY_REGISTERED = 'ID_ALREADY_REGISTERED',
  ID_SCAN_EXPIRED = 'ID_SCAN_EXPIRED',
  NAME_DOES_NOT_MATCH_ID = 'NAME_DOES_NOT_MATCH_ID',
  ID_VERIFICATION_REQUIRED = 'ID_VERIFICATION_REQUIRED',
}

/** What POST /auth/id-verification returns. Never the full PIN. */
export interface IdScanResponse {
  /** Claim token for POST /auth/register (valid ID_SCAN_CLAIM_TTL_MINUTES). */
  token: string;
  /** The name as the server read it from the citizen's own card; null on a review scan. */
  nameOnId: IdName | null;
  /** Last 4 digits of the PIN; null when the server couldn't read it. */
  pinLast4: string | null;
  /**
   * true: the server couldn't read the card, and the citizen asked (after ID_SCAN_MAX_ATTEMPTS
   * failed attempts) for MDRRMO staff to check it. Registering with this token always creates
   * the account with its ID under review.
   */
  reviewRequired: boolean;
}

// ─── Staff review (plan §7) ──────────────────────────────────────────────────

/** Why staff rejected an ID under review: fixed codes, never free text with personal data. */
export const ID_REJECTION_REASONS = ['NOT_PHILHEALTH', 'NAME_MISMATCH', 'UNREADABLE', 'SUSPECTED_FRAUD'] as const;
export type IdRejectionReason = (typeof ID_REJECTION_REASONS)[number];

/** Statuses the review queue lists. */
export const ID_REVIEW_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED'] as const;
export type IdReviewStatus = (typeof ID_REVIEW_STATUSES)[number];

export type IdNamePart = 'last' | 'first' | 'middle' | 'suffix';

/**
 * Why an ID went to staff: the typed name didn't match the card (which parts), or the server
 * couldn't use the card at all (review scan). No names, no PIN.
 */
export type IdReviewReason =
  | { kind: 'NAME_MISMATCH'; failedParts: IdNamePart[] }
  | { kind: 'SCAN_FAILURE'; code: IdVerificationErrorCode.UNREADABLE | IdVerificationErrorCode.NOT_PHILHEALTH_ID }
  | { kind: 'UNKNOWN' };

/** One row of GET /administration/id-verifications. No image, no PIN, no name read from the card. */
export interface IdReviewItem {
  id: string;
  status: IdReviewStatus;
  /** When the citizen scanned the ID (ISO). */
  submittedAt: string;
  attemptNumber: number;
  /** The account as the citizen created it; `name` is the name they typed. */
  account: { id: string; name: string; phoneNumber: string | null };
  reason: IdReviewReason;
  /** The image can be opened: the check is pending and its image is stored (plan §5.2a). */
  hasImage: boolean;
  reviewedAt: string | null;
  reviewedByName: string | null;
  rejectionReason: IdRejectionReason | null;
}

/** Why staff released a card from the account holding it: fixed codes, never free text. */
export const ID_CARD_RELEASE_REASONS = ['OWNER_DISPUTE', 'ACCOUNT_CLOSED', 'STAFF_CORRECTION'] as const;
export type IdCardReleaseReason = (typeof ID_CARD_RELEASE_REASONS)[number];

/** POST /administration/id-verifications/find-by-pin: the account holding a card. Never the number. */
export interface IdCardHolder {
  id: string;
  status: 'AUTO_VERIFIED' | 'PENDING_REVIEW' | 'APPROVED';
  submittedAt: string;
  account: { id: string; name: string; phoneNumber: string | null; status: string; phoneVerified: boolean };
}

/** POST /administration/id-verifications/:id/release. */
export interface IdCardReleaseResult {
  id: string;
  /** false: the delete failed and the cleanup job will retry it. */
  imageDeleted: boolean;
}

/** POST /administration/id-verifications/:id/approve | reject. */
export interface IdReviewDecisionResult {
  id: string;
  status: 'APPROVED' | 'REJECTED';
  /** false: the delete failed and the cleanup job will retry it. */
  imageDeleted: boolean;
}
