import { refreshAuthToken } from './auth.api';
import { useAuthStore } from '../../stores/auth.store';
import { defaultHeaders, NetworkError } from './http';

// Deduplicates concurrent 401s so only one token exchange is in flight at a time.
let pendingRefresh: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const { refreshToken, login, logout, user } = useAuthStore.getState();
  if (!refreshToken) {
    await logout();
    return false;
  }
  try {
    const tokens = await refreshAuthToken(refreshToken);
    if (user) await login(tokens, user);
    return true;
  } catch {
    await logout();
    return false;
  }
}

/**
 * Drop-in fetch wrapper for authenticated endpoints. Reads the access token
 * from the auth store, injects the Authorization header (plus the ngrok bypass
 * header so dev tunnels don't intercept the request), and on 401 attempts one
 * transparent token refresh before retrying. Throws NetworkError on connectivity
 * failure and re-throws on refresh failure so callers get a proper error state.
 */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const buildHeaders = (token: string | null): Record<string, string> => ({
    ...defaultHeaders(),
    ...(init.headers as Record<string, string> | undefined),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: buildHeaders(useAuthStore.getState().accessToken) });
  } catch (err) {
    throw new NetworkError(err);
  }

  if (res.status !== 401) return res;

  if (!pendingRefresh) {
    pendingRefresh = doRefresh().finally(() => { pendingRefresh = null; });
  }

  const refreshed = await pendingRefresh;
  if (!refreshed) throw new Error('Session expired. Please log in again.');

  try {
    return await fetch(url, { ...init, headers: buildHeaders(useAuthStore.getState().accessToken) });
  } catch (err) {
    throw new NetworkError(err);
  }
}
