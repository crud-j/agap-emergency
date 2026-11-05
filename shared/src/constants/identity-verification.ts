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
