/**
 * Account SMS texts. The code comes first (easy to spot and copy), then what it is for,
 * when it expires, and a warning against sharing it: scammers ask for these codes by
 * pretending to be staff. One GSM-7 segment each.
 */
const NEVER_SHARE = 'Never share it; MDRRMO staff will never ask for it.';

export const AUTH_SMS = {
  /** Registration: confirms the phone number. */
  verifyPhone: (code: string) =>
    `AGAP code: ${code}. Use it to verify your phone number. It expires in 15 minutes. ${NEVER_SHARE}`,
  /** Forgot password. */
  resetPassword: (code: string) =>
    `AGAP code: ${code}. Use it to reset your password. It expires in 15 minutes. Did not ask for this? Ignore this text. Never share it.`,
  /** Phone sign-in (one-time code instead of a password). */
  signIn: (code: string) =>
    `AGAP code: ${code}. Use it to sign in. It expires in 10 minutes. ${NEVER_SHARE}`,
  /** Second sign-in step (MFA by SMS). */
  secondStep: (code: string) =>
    `AGAP code: ${code}. Use it to finish signing in. It expires in 5 minutes. ${NEVER_SHARE}`,
  /** The account was locked after failed sign-ins. */
  locked:
    'AGAP: Your account was locked after too many wrong sign-in attempts. If this was not you, tell your Supervisor right away.',
} as const;
