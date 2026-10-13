/**
 * Central HTTP primitives shared across all API service files.
 *
 * Why this exists:
 * - Ngrok tunnels intercept requests that lack the bypass header and return an
 *   HTML warning page.  When code then calls res.json() on that HTML, a
 *   SyntaxError is thrown and every React Query call shows an error state.
 *   Adding 'ngrok-skip-browser-warning' in dev prevents the interception.
 * - Several API files had duplicate local fetch wrappers with subtly different
 *   error-handling logic.  Centralising guarantees consistent behaviour.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('No connection to server. Check that the backend is running and your device is online.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/** Headers applied to every outbound API request. */
export function defaultHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    // Skip the ngrok browser-warning page so native fetch receives raw JSON.
    // Safe to include in production builds — the header is ignored by real servers.
    'ngrok-skip-browser-warning': '1',
    ...extra,
  };
}

/** Headers for multipart/form-data — Content-Type intentionally omitted so
 *  the browser/runtime sets the correct boundary automatically. */
export function multipartHeaders(token?: string | null): Record<string, string> {
  return {
    'ngrok-skip-browser-warning': '1',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Low-level fetch wrapper — handles network failures and non-2xx responses
 * uniformly.  Does NOT inject auth headers; use authedFetch for that.
 */
export async function apiFetch<T = unknown>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        ...defaultHeaders(),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    throw new NetworkError(err);
  }

  if (!res.ok) {
    let body: unknown = {};
    try { body = await res.json(); } catch { /* non-JSON error body */ }
    const raw = (body as any)?.message;
    const message = Array.isArray(raw) ? raw.join(', ') : (raw ?? `HTTP ${res.status}`);
    throw new ApiError(message, res.status, body);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
