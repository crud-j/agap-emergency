import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { getToken, type SessionUser } from './auth';
import { WEB_CLIENT_HEADERS, refreshSession } from './session';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/** A session as the web login returns it: the refresh token lives in an HttpOnly cookie. */
export interface WebSession {
  accessToken: string;
  user: SessionUser;
}

export class MfaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MfaApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** Send the in-memory access token (and refresh once if it has just expired). */
  auth?: boolean;
}

/**
 * fetch for the sign-in and account-security endpoints. Always `credentials: 'include'`
 * so the HttpOnly refresh and trusted-browser cookies travel with it, and always marked
 * as the web client.
 */
export async function mfaRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const send = (): Promise<Response> => {
    const token = options.auth ? getToken() : undefined;
    return fetch(`${API_BASE}/v1${path}`, {
      method: options.method ?? 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...WEB_CLIENT_HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  };

  let res = await send();
  if (res.status === 401 && options.auth && (await refreshSession()) === 'ok') res = await send();

  const text = await res.text();
  let data: Record<string, unknown> | undefined;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    if (res.status === 401 && data?.['code'] === 'STEP_UP_REQUIRED') {
      window.dispatchEvent(new CustomEvent('agap-step-up-required'));
    }
    const message = data?.['message'];
    throw new MfaApiError(
      Array.isArray(message) ? message.join(' ') : typeof message === 'string' ? message : res.statusText || 'Request failed',
      res.status,
      data,
    );
  }
  return data as T;
}

export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && browserSupportsWebAuthn();
}

/** True when the browser/authenticator prompt was dismissed, timed out, or found nothing usable. */
export function isPasskeyCancelled(error: unknown): boolean {
  return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError');
}

export interface MfaStatus {
  totp: boolean;
  passkeys: number;
  backupCodesRemaining: number;
  backupCodesLow: boolean;
  totpAvailable: boolean;
  enforced: boolean;
  smsEnabled: boolean;
  trustedDevices: Array<{
    id: string;
    label: string | null;
    createdAt: string;
    expiresAt: string;
    lastUsedAt: string | null;
    current: boolean;
  }>;
}

export interface PasskeyCredential {
  id: string;
  device_label: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface TotpEnrollment {
  otpauthUrl: string;
  qrDataUrl: string;
  secret: string;
}
