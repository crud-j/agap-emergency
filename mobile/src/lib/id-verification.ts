/**
 * PhilHealth ID verification at registration (MOD-01, docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md
 * §3–§4): the rules the registration screen follows, kept free of native modules so they can be
 * unit-tested. Name matching, PIN parsing and PhilHealth detection come from @agap/shared, the
 * same code the server decides with.
 *
 * Nothing here logs. Text read from a card, the PIN and the name on the card are personal data.
 */
import {
  ID_SCAN_MAX_ATTEMPTS,
  IdVerificationErrorCode,
  looksLikePhilHealthId,
  matchIdName,
  type IdName,
  type IdNameMatch,
  type IdProfileStatus,
} from '@agap/shared';
import type { Translations } from '../i18n/translations';
import { ApiError, NetworkError } from '../services/api/http';

/** An API error the server tagged with a stable PhilHealth ID `code`. */
export class IdVerificationError extends ApiError {
  constructor(
    readonly code: IdVerificationErrorCode,
    message: string,
    status: number,
    body?: unknown,
  ) {
    super(message, status, body);
    this.name = 'IdVerificationError';
  }
}

const KNOWN_CODES = new Set<string>(Object.values(IdVerificationErrorCode));

/** The `code` field of a server error body, when it's one the app knows. */
export function readIdVerificationCode(body: unknown): IdVerificationErrorCode | null {
  const code = (body as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && KNOWN_CODES.has(code) ? (code as IdVerificationErrorCode) : null;
}

/** An ApiError carrying a known `code` becomes an IdVerificationError; anything else is returned as is. */
export function toIdVerificationError(err: unknown): unknown {
  if (!(err instanceof ApiError) || err instanceof IdVerificationError) return err;
  const code = readIdVerificationCode(err.body);
  return code ? new IdVerificationError(code, err.message, err.status, err.body) : err;
}

/** Why a scan attempt didn't give a usable result: the server's codes plus what the app itself detects. */
export type IdScanFailureReason =
  /** The phone's own reading found no PhilHealth heading and PIN. */
  | 'NOT_RECOGNISED'
  | 'NOT_PHILHEALTH_ID'
  | 'UNREADABLE'
  /** The picture couldn't be prepared, or the server refused its size or type. */
  | 'IMAGE_PROBLEM'
  | 'ID_ALREADY_REGISTERED'
  | 'OUTSIDE_SERVICE_AREA'
  | 'CONSENT_REQUIRED'
  | 'OFFLINE'
  | 'SERVER_ERROR';

/** Server code (from an upload error) → what the scan step shows. */
export function scanFailureFromError(err: unknown): IdScanFailureReason {
  if (err instanceof NetworkError) return 'OFFLINE';
  if (!(err instanceof ApiError)) return 'SERVER_ERROR';
  switch (readIdVerificationCode(err.body)) {
    case IdVerificationErrorCode.NOT_PHILHEALTH_ID:
      return 'NOT_PHILHEALTH_ID';
    case IdVerificationErrorCode.UNREADABLE:
      return 'UNREADABLE';
    case IdVerificationErrorCode.IMAGE_TOO_LARGE:
    case IdVerificationErrorCode.UNSUPPORTED_IMAGE_TYPE:
      return 'IMAGE_PROBLEM';
    case IdVerificationErrorCode.ID_ALREADY_REGISTERED:
      return 'ID_ALREADY_REGISTERED';
    case IdVerificationErrorCode.OUTSIDE_SERVICE_AREA:
      return 'OUTSIDE_SERVICE_AREA';
    case IdVerificationErrorCode.CONSENT_REQUIRED:
      return 'CONSENT_REQUIRED';
    default:
      return 'SERVER_ERROR';
  }
}

/**
 * Does this failure use up one of the citizen's attempts? Only a card that couldn't be read or
 * isn't a PhilHealth ID. A dropped connection or a server fault is not the citizen's scan.
 */
export function countsAsAttempt(reason: IdScanFailureReason): boolean {
  return reason === 'NOT_RECOGNISED' || reason === 'NOT_PHILHEALTH_ID' || reason === 'UNREADABLE' || reason === 'IMAGE_PROBLEM';
}

/** "Send to MDRRMO for review" is offered once ID_SCAN_MAX_ATTEMPTS attempts failed. */
export function canOfferReview(failedAttempts: number): boolean {
  return failedAttempts >= ID_SCAN_MAX_ATTEMPTS;
}

/** The attempt number sent with the next upload (1 = first). */
export function nextAttemptNumber(failedAttempts: number): number {
  return failedAttempts + 1;
}

/** The registration string that explains a failure on the retry screen. */
export function retryMessageKey(reason: IdScanFailureReason): keyof Translations['registration'] {
  switch (reason) {
    case 'NOT_RECOGNISED':
      return 'idErrorNotRecognised';
    case 'NOT_PHILHEALTH_ID':
      return 'idErrorNotPhilHealth';
    case 'UNREADABLE':
      return 'idErrorUnreadable';
    case 'IMAGE_PROBLEM':
      return 'idErrorImage';
    case 'ID_ALREADY_REGISTERED':
      return 'idErrorAlreadyRegistered';
    case 'OUTSIDE_SERVICE_AREA':
      return 'idErrorOutside';
    case 'CONSENT_REQUIRED':
      return 'idConsentRequired';
    case 'OFFLINE':
      return 'idOfflineBody';
    case 'SERVER_ERROR':
      return 'idErrorServer';
  }
}

/**
 * The phone's instant check on its own reading (plan §3 step C). `null` means the phone couldn't
 * read text at all (no text-recognition module): upload anyway and let the server decide.
 * The server reads the image again and is the only one that can verify.
 */
export function localReadVerdict(text: string | null): 'ok' | 'not_recognised' | 'unknown' {
  if (text === null) return 'unknown';
  return looksLikePhilHealthId(text) ? 'ok' : 'not_recognised';
}

/** The name parts the citizen typed, as an IdName, or null while last or first name is empty. */
export function typedIdName(fields: { last: string; first: string; middle: string; suffix: string }): IdName | null {
  const last = fields.last.trim();
  const first = fields.first.trim();
  if (!last || !first) return null;
  const name: IdName = { last, first };
  const middle = fields.middle.trim();
  const suffix = fields.suffix.trim();
  if (middle) name.middle = middle;
  if (suffix) name.suffix = suffix;
  return name;
}

/** The typed name checked against the card: the same matcher the server uses. null while incomplete or on a review scan. */
export function checkTypedName(typed: IdName | null, nameOnId: IdName | null): IdNameMatch | null {
  if (!typed || !nameOnId) return null;
  return matchIdName(typed, nameOnId);
}

/**
 * "Create account" is enabled when the typed name matches the card, when the citizen chose
 * "Send to MDRRMO for review", or when the scan itself went to review (nothing to match).
 */
export function canCreateAccount(state: { nameMatches: boolean; reviewChosen: boolean; reviewScan: boolean }): boolean {
  return state.nameMatches || state.reviewChosen || state.reviewScan;
}

/** How the profile shows a citizen's status: its label, tone, and whether they can scan again. */
export function idStatusView(status: IdProfileStatus): {
  labelKey: 'idStatusVerified' | 'idStatusUnderReview' | 'idStatusNotApproved' | 'idStatusNotVerified';
  tone: 'ok' | 'info' | 'warn';
  canScanAgain: boolean;
} {
  switch (status) {
    case 'VERIFIED':
      return { labelKey: 'idStatusVerified', tone: 'ok', canScanAgain: false };
    case 'UNDER_REVIEW':
      return { labelKey: 'idStatusUnderReview', tone: 'info', canScanAgain: false };
    case 'NOT_APPROVED':
      return { labelKey: 'idStatusNotApproved', tone: 'warn', canScanAgain: true };
    case 'NOT_VERIFIED':
      return { labelKey: 'idStatusNotVerified', tone: 'warn', canScanAgain: true };
  }
}

/** A rectangle in a photo's pixels. */
export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/** Extra margin kept around the fallback camera's frame, so a card held slightly off isn't clipped. */
const CROP_MARGIN = 0.06;

/**
 * The fallback camera's on-screen card frame in the photo's pixels (plan §4.3). The preview fills
 * the view like `cover`: the photo is scaled by the larger ratio and centred, so the overflow on
 * one axis is cut off equally on both sides.
 */
export function frameToPhotoCrop(
  view: { width: number; height: number },
  frame: { x: number; y: number; width: number; height: number },
  photo: { width: number; height: number },
): CropRect {
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const offsetX = (photo.width * scale - view.width) / 2;
  const offsetY = (photo.height * scale - view.height) / 2;
  const marginX = frame.width * CROP_MARGIN;
  const marginY = frame.height * CROP_MARGIN;

  const left = Math.max(0, (frame.x - marginX + offsetX) / scale);
  const top = Math.max(0, (frame.y - marginY + offsetY) / scale);
  const right = Math.min(photo.width, (frame.x + frame.width + marginX + offsetX) / scale);
  const bottom = Math.min(photo.height, (frame.y + frame.height + marginY + offsetY) / scale);
  return {
    originX: Math.round(left),
    originY: Math.round(top),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  };
}

/** The card's name the way the card prints it: `LAST, FIRST MIDDLE SUFFIX`. Shown only to the card's owner. */
export function formatNameOnId(name: IdName): string {
  const given = [name.first, name.middle, name.suffix].filter((part) => part && part.trim()).join(' ');
  return `${name.last}, ${given}`.toUpperCase();
}
