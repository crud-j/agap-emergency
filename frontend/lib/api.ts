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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/v1${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(body.message ?? 'Request failed', res.status);
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
    request<T>(path, { method: 'DELETE', headers: authHeaders(token) }),
};
