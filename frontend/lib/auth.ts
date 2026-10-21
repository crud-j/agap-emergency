/**
 * In-memory web session (docs/plans/WEB_AUTH_SECURITY_PLAN.md §6.2).
 *
 * The access token lives only in this module — never in a cookie or storage — so
 * page scripts can't exfiltrate it from persistent storage. The refresh token is
 * an HttpOnly `agap_refresh` cookie owned by the backend; lib/session.ts uses it
 * to restore the session after a reload and to refresh before expiry.
 */

export interface SessionUser {
  id: string;
  email: string | null;
  role: string;
  name: string;
  orgId: string | null;
  orgName: string | null;
  mustChangePassword: boolean;
}

let accessToken: string | undefined;
let sessionUser: SessionUser | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Current access token for REST calls and the WebSocket handshake. */
export function getToken(): string | undefined {
  return accessToken;
}

export function getSessionUser(): SessionUser | null {
  return sessionUser;
}

export function setSession(session: { accessToken: string; user: SessionUser }): void {
  accessToken = session.accessToken;
  sessionUser = session.user;
  notify();
}

export function clearSession(): void {
  if (accessToken === undefined && sessionUser === null) return;
  accessToken = undefined;
  sessionUser = null;
  notify();
}

/** Subscribe to session changes (sign-in, refresh, sign-out). Returns an unsubscribe function. */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
