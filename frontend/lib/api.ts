const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let refreshPromise: Promise<string> | null = null;

function setAccessTokenCookie(token: string): void {
  if (typeof document === 'undefined') return;

  document.cookie = `agap_token=${encodeURIComponent(token)}; path=/; samesite=strict`;
}

function clearAccessTokenCookie(): void {
  if (typeof document === 'undefined') return;

  document.cookie = 'agap_token=; path=/; max-age=0; samesite=strict';
}

async function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        clearAccessTokenCookie();
        throw new ApiError('Session expired. Please log in again.', res.status);
      }

      const data = (await res.json()) as { accessToken?: string };

      if (!data.accessToken) {
        clearAccessTokenCookie();
        throw new ApiError('Refresh response did not contain an access token.', 401);
      }

      setAccessTokenCookie(data.accessToken);
      return data.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function request<T>(
  path: string,
  options?: RequestInit,
  hasRetried = false,
): Promise<T> {
  const headers = new Headers(options?.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const requestOptions: RequestInit = {
    ...options,
    headers,
    credentials: options?.credentials ?? 'include',
  };

  const res = await fetch(`${API_BASE}/v1${path}`, requestOptions);

  if (res.status === 401 && !hasRetried && path !== '/auth/refresh') {
    const authorization = headers.get('Authorization');

    if (authorization?.startsWith('Bearer ')) {
      try {
        const newToken = await refreshAccessToken();
        const retryHeaders = new Headers(headers);
        retryHeaders.set('Authorization', `Bearer ${newToken}`);

        return request<T>(
          path,
          {
            ...options,
            headers: retryHeaders,
            credentials: options?.credentials ?? 'include',
          },
          true,
        );
      } catch {
        clearAccessTokenCookie();
        throw new ApiError('Session expired. Please log in again.', 401);
      }
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message;

    throw new ApiError(message ?? 'Request failed', res.status);
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
    request<T>(path, {
      method: 'DELETE',
      headers: authHeaders(token),
    }),
};