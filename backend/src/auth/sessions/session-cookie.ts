import type { CookieOptions } from 'express';
import type { ConfigService } from '@nestjs/config';

/** Sliding lifetime of a login session (refresh token / session row). */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** HttpOnly cookie that carries the web refresh token. Never readable by page scripts. */
export const REFRESH_COOKIE = 'agap_refresh';

/**
 * Header that marks a request as coming from the web console. Web clients get the
 * refresh token as a cookie instead of in the JSON body, and cookie-based refresh
 * requires this header: a custom header forces a CORS preflight, which CORS_ORIGIN
 * rejects for foreign sites — together with SameSite=Strict this blocks CSRF.
 * Mobile never sends it and keeps the body-token contract unchanged.
 */
export const WEB_CLIENT_HEADER = 'x-agap-client';

export function isWebClient(req: { headers?: Record<string, unknown> }): boolean {
  return req.headers?.[WEB_CLIENT_HEADER] === 'web';
}

/** Options shared by set/clear so the browser matches the same cookie. */
export function refreshCookieOptions(config: ConfigService): CookieOptions {
  const secureSetting = config.get<string>('COOKIE_SECURE');
  const secure =
    secureSetting !== undefined && secureSetting !== ''
      ? secureSetting === 'true'
      : config.get<string>('NODE_ENV') === 'production';
  const domain = config.get<string>('COOKIE_DOMAIN');
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    ...(domain ? { domain } : {}),
  };
}
