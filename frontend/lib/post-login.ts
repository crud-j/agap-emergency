import type { SessionUser } from './auth';
import { landingForRole } from './role-access';

/** `?next=` from the session gate — same-site paths only (no open redirect). */
export function safeNextPath(): string | null {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return null;

  try {
    const target = new URL(next, window.location.origin);
    if (
      target.origin !== window.location.origin ||
      target.pathname === '/login' ||
      target.pathname.startsWith('/login/')
    ) {
      return null;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export { landingForRole };

/** Where a freshly signed-in user goes: the forced password change first, otherwise on to the console. */
export function destinationAfterSignIn(user: Pick<SessionUser, 'role' | 'mustChangePassword'>, next: string | null): string {
  if (user.mustChangePassword) {
    return next ? `/login/change-password?next=${encodeURIComponent(next)}` : '/login/change-password';
  }
  return next ?? landingForRole(user.role);
}
