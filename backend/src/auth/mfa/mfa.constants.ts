import { UserRole } from '@agap/shared';

/**
 * Web-console roles that must use a second factor (plan §3). CITIZEN, BYSTANDER and
 * RESPONDER are deliberately absent: guest/citizen SOS and the mobile responder login
 * must never gain a new step. The same set is subject to account lockout.
 */
export const MFA_ROLES: ReadonlySet<string> = new Set<string>([
  UserRole.SYSTEM_ADMINISTRATOR,
  UserRole.ORG_ADMINISTRATOR,
  UserRole.SUPERVISOR,
  UserRole.DISPATCHER,
  UserRole.HOSPITAL_USER,
  UserRole.ANNOUNCEMENTS_PUBLISHER,
]);

export const TRUSTED_DEVICE_COOKIE = 'agap_trusted';
/** "Trust this browser for this shift". */
export const TRUSTED_DEVICE_TTL_MS = 12 * 60 * 60 * 1000;

/** The mfaToken that carries a user from the password step to the second step. */
export const MFA_TOKEN_TTL_SECONDS = 5 * 60;
/** Wrong codes allowed against a single mfaToken before it is destroyed. */
export const MFA_TOKEN_MAX_FAILURES = 5;

export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_WARN_AT = 3;

export const SMS_CODE_TTL_MS = 5 * 60 * 1000;
export const SMS_CODE_MAX_ATTEMPTS = 5;
/** SMS codes per account per hour — the single Textbee SIM also carries emergency traffic. */
export const SMS_CODES_PER_HOUR = 3;

export type MfaMethod = 'passkey' | 'totp' | 'backup_code' | 'sms';
