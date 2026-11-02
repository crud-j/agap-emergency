import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// '/b' is where a barangay types the access code from the alert SMS, '/b/<code>' the status page
// it opens: no login, the code is the credential.
// '/v1/public/barangay/' is the two public endpoints that page uses (forwarded by next.config.mjs).
const PUBLIC_PATHS = ['/login', '/b/', '/v1/public/barangay/'];
const PUBLIC_EXACT = ['/b'];

/**
 * HttpOnly refresh cookie set by the backend. Its presence only means "may have a
 * session" — it is not verified here. AuthGate restores (and validates) the session
 * client-side, and the backend enforces every permission. Role-based scoping
 * (e.g. hospital users) lives in AuthGate because the role is no longer readable
 * from a cookie.
 */
const SESSION_COOKIE = 'agap_refresh';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_EXACT.includes(pathname) || PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!request.cookies.has(SESSION_COOKIE)) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

// v1/ and socket.io/ are the API and Socket.io endpoints next.config.mjs forwards to the backend,
// which checks each request's own token. They must not reach middleware at all: Next also runs
// middleware on WebSocket upgrades, and that drops the Socket.io connection.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|v1/|socket\\.io/).*)'],
};
