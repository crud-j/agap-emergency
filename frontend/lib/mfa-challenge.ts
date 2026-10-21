/**
 * The half-finished sign-in between a correct password and a verified second step.
 *
 * Held in module memory ONLY — never localStorage, sessionStorage or a cookie. A page
 * refresh drops it and the user starts again at /login, which is the intent: the
 * mfaToken is a single-use, five-minute credential and shouldn't outlive the tab.
 * (Client-side navigation between /login → /login/verify keeps it, because the module
 * is not reloaded.)
 */

export type MfaMethod = 'passkey' | 'totp' | 'backup_code' | 'sms';

export interface MfaChallenge {
  mfaToken: string;
  methods: MfaMethod[];
  /** No second factor yet: the user must enroll before the session is issued. */
  enrollmentRequired: boolean;
  /** Where to go after sign-in (already validated as a same-site path), if any. */
  next: string | null;
  /** The identifier the user typed, to scope a passkey prompt and show who is signing in. */
  identifier: string;
}

let current: MfaChallenge | null = null;

export function setMfaChallenge(challenge: MfaChallenge): void {
  current = challenge;
}

export function getMfaChallenge(): MfaChallenge | null {
  return current;
}

export function clearMfaChallenge(): void {
  current = null;
}
