import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login'];

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const HOSPITAL_ALLOWED = ['/hospitals', '/api'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const token = request.cookies.get('agap_token')?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Scope hospital users to their portal only
  const payload = decodeJwtPayload(token);
  if (payload?.['role'] === 'HOSPITAL_USER') {
    if (!HOSPITAL_ALLOWED.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/hospitals', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
};
