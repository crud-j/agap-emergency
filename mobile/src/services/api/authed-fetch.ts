import { refreshAuthToken } from './auth.api';
import { useAuthStore } from '../../stores/auth.store';
import { ApiError, defaultHeaders, NetworkError } from './http';

/**
 * - `refreshed`: new tokens are stored.
 * - `ended`: the server refused the refresh token, so the session was logged out.
 * - `unreachable`: no answer from the server, so the session is kept.
 */
export type RefreshOutcome = 'refreshed' | 'ended' | 'unreachable';

// Deduplicates concurrent 401s so only one token exchange is in flight at a time.
let pendingRefresh: Promise<RefreshOutcome> | null = null;

/** Statuses the refresh route uses to refuse a token (invalid, expired, revoked, deactivated). */
const SESSION_REFUSED = new Set([400, 401, 403]);

async function doRefresh(): Promise<RefreshOutcome> {
  const { refreshToken, login, logout, user } = useAuthStore.getState();
  if (!refreshToken) {
    await logout();
    return 'ended';
  }
  try {
    const tokens = await refreshAuthToken(refreshToken);
    if (user) await login(tokens, user);
    return 'refreshed';
  } catch (err) {
    // Only the server refusing the token ends the session. A dropped connection, a
    // 429 or 5xx, or a non-JSON page (a Wi-Fi sign-in portal) keeps it: weak signal
    // during a typhoon must not sign a citizen out. The next 401 tries again.
    if (err instanceof ApiError && SESSION_REFUSED.has(err.status)) {
      await logout();
      return 'ended';
    }
    return 'unreachable';
  }
}

/**
 * Exchange the refresh token once, shared by every caller waiting at the same time
 * (concurrent 401s and the realtime socket).
 */
export function refreshSession(): Promise<RefreshOutcome> {
  if (!pendingRefresh) {
    pendingRefresh = doRefresh().finally(() => { pendingRefresh = null; });
  }
  return pendingRefresh;
}

/** True when new tokens are stored; false after a logout or when the server can't be reached. */
export function refreshAccessToken(): Promise<boolean> {
  return refreshSession().then((outcome) => outcome === 'refreshed');
}

/**
 * Drop-in fetch wrapper for authenticated endpoints. Reads the access token
 * from the auth store, injects the Authorization header (plus the ngrok bypass
 * header so dev tunnels don't intercept the request), and on 401 attempts one
 * transparent token refresh before retrying. Throws NetworkError on connectivity
 * failure and re-throws on refresh failure so callers get a proper error state.
 */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  // A FormData body must not carry the JSON Content-Type: the runtime sets
  // multipart/form-data with its boundary, and without it the server cannot
  // find the uploaded file (every photo/video upload failed this way).
  const isMultipart = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const buildHeaders = (token: string | null): Record<string, string> => {
    const headers: Record<string, string> = {
      ...defaultHeaders(),
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (isMultipart) delete headers['Content-Type'];
    return headers;
  };

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: buildHeaders(useAuthStore.getState().accessToken) });
  } catch (err) {
    throw new NetworkError(err);
  }

  if (res.status !== 401) return res;

  const outcome = await refreshSession();
  if (outcome === 'unreachable') throw new NetworkError();
  if (outcome === 'ended') throw new Error('Session expired. Please log in again.');

  try {
    return await fetch(url, { ...init, headers: buildHeaders(useAuthStore.getState().accessToken) });
  } catch (err) {
    throw new NetworkError(err);
  }
}
