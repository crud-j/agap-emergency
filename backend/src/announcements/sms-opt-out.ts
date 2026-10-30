/**
 * MOD-53: SMS opt-out keywords. The whole message must be the keyword, so "stop please" or
 * "STOP 3526" is not an opt-out. Filipino: ITIGIL, HUWAG NA.
 */
const OPT_OUT = /^\s*(stop|unsubscribe|cancel|end|quit|itigil|huwag\s+na)\s*[.!]?\s*$/i;

export function isOptOut(body: string | null | undefined): boolean {
  return OPT_OUT.test(body ?? '');
}

/**
 * The forms a subscriber's number may be stored in. `sms_subscribers.phone_number` is kept
 * as typed, so `+639171234567` must also match `639171234567` and `09171234567`.
 */
export function phoneVariants(e164: string): string[] {
  const national = e164.replace(/^\+63/, '');
  return [`+63${national}`, `63${national}`, `0${national}`];
}
