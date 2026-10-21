import type { CookieOptions, Response } from 'express';
import type { AuthService } from '../auth.service';
import { REFRESH_COOKIE, SESSION_TTL_MS, isWebClient } from './session-cookie';

/**
 * Shape a new session for the caller. Web: the refresh token goes into the HttpOnly
 * cookie and the body carries only the access token + a user summary. Mobile:
 * unchanged `{ accessToken, refreshToken, user }`.
 */
export async function shapeSessionResponse<
  T extends { accessToken: string; refreshToken: string; user: { id: string } },
>(
  authService: Pick<AuthService, 'getSessionUser'>,
  cookieOptions: CookieOptions,
  req: unknown,
  res: Response,
  session: T,
) {
  if (!isWebClient(req as { headers?: Record<string, unknown> })) return session;
  res.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });
  return {
    accessToken: session.accessToken,
    user: await authService.getSessionUser(session.user.id),
  };
}
