import { getToken } from './auth';
import { redirectToLogin, refreshSession } from './session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** The parsed error body, for callers that read structured fields (e.g. `code`). */
    public readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * fetch() that survives access-token expiry: on a 401 for an authenticated call it
 * refreshes the session once (HttpOnly cookie) and retries with the new token. If
 * the session is really gone, the browser is sent to the login page.
 */
async function authedFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  const headers = (init.headers ?? {}) as Record<string, string>;
  if (res.status === 401) {
    const body = await res.clone().json().catch(() => null) as { code?: unknown } | null;
    if (body?.code === 'STEP_UP_REQUIRED') {
      window.dispatchEvent(new CustomEvent('agap-step-up-required'));
      return res;
    }
  }
  if (res.status !== 401 || !headers['Authorization']) return res;

  const result = await refreshSession();
  if (result === 'unauthenticated') {
    redirectToLogin();
    return res;
  }
  const token = getToken();
  if (result !== 'ok' || !token) return res;
  return fetch(url, { ...init, headers: { ...headers, Authorization: `Bearer ${token}` } });
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Destructure headers out first so the spread below doesn't overwrite them.
  // Without this, `...options` re-inserts options.headers AFTER the merged object,
  // stripping Content-Type from every POST/PATCH/PUT and breaking DTO validation.
  const { headers: extraHeaders, ...restOptions } = options ?? {};
  const res = await authedFetch(`${API_BASE}/v1${path}`, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(extraHeaders as Record<string, string>),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(body.message ?? 'Request failed', res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const api = {
  get: <T>(path: string, token?: string) =>
    request<T>(path, { headers: authHeaders(token) }),

  /** Binary download (e.g. incident media) — authenticated, returns a Blob. */
  blob: async (path: string, token?: string): Promise<Blob> => {
    const res = await authedFetch(`${API_BASE}/v1${path}`, { headers: authHeaders(token) });
    if (!res.ok) throw new ApiError(res.statusText || 'Download failed', res.status);
    return res.blob();
  },

  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    }),

  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    }),

  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: authHeaders(token),
    }),

  delete: <T = void>(path: string, token?: string) =>
    request<T>(path, { method: 'DELETE', headers: authHeaders(token) }),

};
