import { UserRole } from '@agap/shared';

/**
 * Landing route after authentication, by role. Responders go straight to their
 * assignments queue (MOD-32); everyone else uses the citizen home. Reuses the
 * existing auth system — no separate login for rescuers.
 */
export function homeRouteForRole(role?: string | null): string {
  if (role === UserRole.RESPONDER) return '/responder/assignments';
  return '/home';
}
