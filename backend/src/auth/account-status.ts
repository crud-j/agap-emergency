/**
 * Account statuses that may never authenticate (password, passkey, OTP or refresh).
 *
 * PENDING_VERIFICATION is deliberately NOT blocked: citizens can sign in before
 * verifying their phone, and seeded/admin-created staff accounts are created
 * without an explicit status (schema default PENDING_VERIFICATION).
 */
export const BLOCKED_ACCOUNT_STATUSES: ReadonlySet<string> = new Set(['SUSPENDED', 'DEACTIVATED']);

export function isAccountBlocked(status: string | null | undefined): boolean {
  return !!status && BLOCKED_ACCOUNT_STATUSES.has(status);
}
