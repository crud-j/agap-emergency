import { isIP } from 'net';
import { TRUSTED_DEVICE_COOKIE } from './mfa/mfa.constants';

/** Where an auth request came from — recorded on sessions and audit entries. */
export interface AuthRequestContext {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  /** Value of the agap_trusted cookie, if the browser sent one (not yet validated). */
  trustedDeviceToken?: string | undefined;
}

/**
 * Extract the client IP and user-agent from an Express request. Invalid IPs are
 * dropped (the DB columns are INET) so bookkeeping can never fail a sign-in.
 */
export function authContextFromRequest(req: {
  ip?: string | undefined;
  headers?: Record<string, string | string[] | undefined> | undefined;
  cookies?: Record<string, unknown> | undefined;
}): AuthRequestContext {
  const ua = req.headers?.['user-agent'];
  const trusted = req.cookies?.[TRUSTED_DEVICE_COOKIE];
  return {
    ipAddress: req.ip && isIP(req.ip) ? req.ip : undefined,
    userAgent: typeof ua === 'string' ? ua.slice(0, 512) : undefined,
    trustedDeviceToken: typeof trusted === 'string' && trusted ? trusted : undefined,
  };
}
