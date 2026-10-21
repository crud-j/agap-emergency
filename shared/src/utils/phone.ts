/**
 * Philippine phone number normalization (MOD-17 barangay SMS directory).
 *
 * Output is E.164 (`+63…`). Landlines are kept because staff still call them,
 * but they are flagged `canSms: false`: the Textbee gateway sends from a SIM and
 * a landline cannot receive a text.
 */

export type PhPhoneKind = 'MOBILE' | 'LANDLINE' | 'INVALID';

export type PhPhoneIssue =
  | 'EMPTY'
  | 'MISSING_AREA_CODE'
  | 'MALFORMED';

export interface NormalizedPhPhone {
  /** `+639171234567` / `+63449136980`, or null when the number cannot be trusted. */
  e164: string | null;
  kind: PhPhoneKind;
  /** True only for mobile numbers; the SMS gateway cannot reach landlines. */
  canSms: boolean;
  /** Why a number is INVALID. Never guess a correction from this. */
  issue?: PhPhoneIssue;
}

const INVALID = (issue: PhPhoneIssue): NormalizedPhPhone => ({
  e164: null,
  kind: 'INVALID',
  canSms: false,
  issue,
});

/**
 * Mobile: `09XXXXXXXXX`, `9XXXXXXXXX`, `639XXXXXXXXX`, `+639XXXXXXXXX`.
 * Landline: `0` + area code + subscriber, nine digits after the leading 0
 * (`02` + 8 digits for Metro Manila, or a two-digit area code such as `44`
 * for Bulacan + 7 digits), also written with `+63`/`63` and no leading 0.
 * A bare 7-digit local number is rejected: it has no area code and guessing
 * `044` could text or call the wrong place.
 */
export function normalizePhPhone(raw: string | null | undefined): NormalizedPhPhone {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return INVALID('EMPTY');

  // Keep digits only; a leading '+' just means the country code is explicit.
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return INVALID('MALFORMED');

  // Reduce to the national significant number (no country code, no trunk 0).
  let national: string;
  if (digits.startsWith('63') && (trimmed.startsWith('+') || digits.length >= 11)) {
    national = digits.slice(2);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  if (/^9\d{9}$/.test(national)) {
    return { e164: `+63${national}`, kind: 'MOBILE', canSms: true };
  }
  if (/^[2-8]\d{8}$/.test(national)) {
    return { e164: `+63${national}`, kind: 'LANDLINE', canSms: false };
  }
  // Exactly a local subscriber number with no area code (e.g. "769-2412").
  if (/^\d{7}$/.test(national)) return INVALID('MISSING_AREA_CODE');
  return INVALID('MALFORMED');
}
