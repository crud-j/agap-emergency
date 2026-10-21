import { clearSession, getToken, setSession, type SessionUser } from './auth';
import { rememberAccount } from './remembered-accounts';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Marks requests from the web console. The backend then keeps the refresh token in
 * the HttpOnly cookie, and only honours that cookie when this header is present.
 */
export const WEB_CLIENT_HEADERS = { 'X-AGAP-Client': 'web' } as const;

/** Refresh this long before the access token expires. */
const REFRESH_LEAD_MS = 60_000;
/** Retry delay when the backend is unreachable (keep the session; try again). */
const RETRY_UNAVAILABLE_MS = 15_000;

export type RefreshResult = 'ok' | 'unauthenticated' | 'unavailable';

let inflight: Promise<RefreshResult> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

// Other tabs signing out end this tab's session too.
const channel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('agap-session')
    : null;
channel?.addEventListener('message', (event: MessageEvent) => {
  if (event.data === 'logout') endSession();
});

function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function scheduleRefresh(delayMs: number): void {
  if (typeof window === 'undefined') return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshSession(), Math.max(5_000, delayMs));
}

function endSession(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  clearSession();
}

/** Store a session returned by login/refresh and schedule its silent refresh. */
export function startSession(session: { accessToken: string; user: SessionUser }): void {
  setSession(session);
  rememberAccount(session.user);
  const exp = tokenExpiryMs(session.accessToken);
  if (exp) scheduleRefresh(exp - Date.now() - REFRESH_LEAD_MS);
}

async function doRefresh(): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...WEB_CLIENT_HEADERS },
      body: '{}',
    });
  } catch {
    // Backend unreachable (e.g. connectivity loss during a typhoon). Keep the
    // current session — signing the dispatcher out would not help — and retry.
    scheduleRefresh(RETRY_UNAVAILABLE_MS);
    return 'unavailable';
  }

  if (res.status === 401 || res.status === 403) {
    endSession();
    return 'unauthenticated';
  }
  if (!res.ok) {
    scheduleRefresh(RETRY_UNAVAILABLE_MS);
    return 'unavailable';
  }

  startSession((await res.json()) as { accessToken: string; user: SessionUser });
  return 'ok';
}

/**
 * Exchange the HttpOnly refresh cookie for a new access token.
 *
 * Single-flight within a tab, and serialized across tabs with the Web Locks API:
 * the refresh token rotates on every use, so two tabs refreshing at once would
 * make the second one fail. Serialized, each tab sends the latest cookie.
 */
export function refreshSession(): Promise<RefreshResult> {
  if (inflight) return inflight;
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  const run = locks ? locks.request('agap-session-refresh', doRefresh) : doRefresh();
  inflight = (run as Promise<RefreshResult>).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Sign out: revoke the session server-side, clear the cookie, and end every open tab. */
export async function logout(): Promise<void> {
  const token = getToken();
  try {
    await fetch(`${API_BASE}/v1/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...WEB_CLIENT_HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: '{}',
    });
  } catch {
    // Offline: the local session still ends; the server session expires on its own.
  } finally {
    endSession();
    channel?.postMessage('logout');
  }
}

/** Send the browser to the login page, returning here after sign-in. */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const here = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(here)}`);
}
