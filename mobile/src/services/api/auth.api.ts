import { File, UploadTask, UploadType } from 'expo-file-system';
import type { IdScanResponse } from '@agap/shared';
import { apiFetch, ApiError, NetworkError } from './http';
import { IdVerificationError, toIdVerificationError } from '../../lib/id-verification';

export { ApiError, IdVerificationError };

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return apiFetch<T>(`${API_BASE}${path}`, options);
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Optional, self-declared — only picks the reporter's map icon. Mirrors shared `UserSex`. */
export type UserSexValue = 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';

export interface SafeUser {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  role: string;
  status: string;
  is_guest: boolean;
  is_email_verified: boolean;
  is_phone_verified: boolean;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
  full_address: string | null;
  preferred_language: string;
  text_size: string;
  high_contrast: boolean;
  reduced_motion: boolean;
  /** null = never asked. Absent on sessions stored before this field existed. */
  sex?: UserSexValue | null;
  profile_completeness: number;
  last_login_at: string | null;
  created_at: string;
}

export interface AuthResponse extends AuthTokens {
  user: SafeUser;
  message?: string;
}

export interface RegisterDto {
  /** Older builds only. With a PhilHealth ID scan the server builds the full name from the parts below. */
  fullName?: string;
  /** MOD-01: the name as typed, checked against the PhilHealth ID by the server. */
  lastName?: string;
  firstName?: string;
  middleName?: string;
  suffix?: string;
  /** Token from submitIdScan(). */
  idVerificationToken?: string;
  /** Create the account even though the name doesn't match; MDRRMO staff review the ID. */
  requestReview?: boolean;
  phoneNumber: string;
  email?: string;
  password: string;
  confirmPassword: string;
  /** Omit when nothing was chosen — never required. */
  sex?: UserSexValue;
  latitude?: number;
  longitude?: number;
}

export interface RegisterResponse {
  user: SafeUser;
  /** AUTO_VERIFIED: name matched the ID. PENDING_REVIEW: MDRRMO staff will check it. */
  identityVerification?: 'AUTO_VERIFIED' | 'PENDING_REVIEW' | null;
}

/** Rejects with an IdVerificationError (typed `code`) for PhilHealth ID refusals. */
export async function register(dto: RegisterDto): Promise<RegisterResponse> {
  try {
    return await api('/v1/auth/register', { method: 'POST', body: JSON.stringify(dto) });
  } catch (err) {
    throw toIdVerificationError(err);
  }
}

export interface SubmitIdScanOptions {
  /** The phone's own reading. The server only compares it; it never verifies from it. */
  clientText?: string;
  attemptNumber: number;
  latitude: number;
  longitude: number;
  consentGiven: boolean;
  /** After the third failed attempt: store an unreadable card for MDRRMO staff review. */
  requestReview?: boolean;
}

/** The server's limit on clientText. */
const CLIENT_TEXT_MAX = 5000;

/**
 * POST /auth/id-verification (MOD-01): uploads the front of the PhilHealth ID (JPEG) for the
 * server to read. Rejects with an IdVerificationError (typed `code`) when the server refuses
 * the scan, or a NetworkError when it can't be reached. Never logs the image or the text.
 */
export async function submitIdScan(imageUri: string, options: SubmitIdScanOptions): Promise<IdScanResponse> {
  const parameters: Record<string, string> = {
    consentGiven: String(options.consentGiven),
    attemptNumber: String(options.attemptNumber),
    latitude: String(options.latitude),
    longitude: String(options.longitude),
  };
  if (options.clientText) parameters.clientText = options.clientText.slice(0, CLIENT_TEXT_MAX);
  if (options.requestReview) parameters.requestReview = 'true';

  // Native multipart upload, like incident photos: RN's FormData file parts fail on the New
  // Architecture (see uploadIncidentPhoto in incidents.api.ts).
  let result: { status: number; body: string } | null | undefined;
  try {
    result = await new UploadTask(new File(imageUri), `${API_BASE}/v1/auth/id-verification`, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'image',
      mimeType: 'image/jpeg',
      parameters,
      headers: { 'ngrok-skip-browser-warning': '1' },
    }).uploadAsync();
  } catch (err) {
    throw new NetworkError(err);
  }
  if (!result) throw new NetworkError();

  let body: unknown = {};
  try {
    body = result.body ? JSON.parse(result.body) : {};
  } catch {
    /* non-JSON body (proxy error page) */
  }
  if (result.status < 200 || result.status >= 300) {
    const raw = (body as { message?: unknown }).message;
    const message = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : `HTTP ${result.status}`;
    throw toIdVerificationError(new ApiError(message, result.status, body));
  }
  return body as IdScanResponse;
}

export interface GeoCheckResult {
  inside: boolean;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
}

export async function geoCheck(latitude: number, longitude: number): Promise<GeoCheckResult> {
  return api('/v1/auth/geo-check', {
    method: 'POST',
    body: JSON.stringify({ latitude, longitude }),
  });
}

export async function loginWithPassword(dto: {
  // Email or phone number — the backend resolves either.
  identifier: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await api<AuthResponse | { mfaRequired: true }>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  // Web-console staff roles owe a second step the mobile app does not implement yet.
  // Citizens and responders never receive this.
  if ('mfaRequired' in res) {
    throw new ApiError('This account signs in on the Operations Center web console.', 403, res);
  }
  return res;
}

export async function loginWithPhone(phoneNumber: string): Promise<{ message: string }> {
  return api('/v1/auth/login/phone', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function verifyPhoneOtp(
  phoneNumber: string,
  otp: string,
): Promise<AuthResponse> {
  return api('/v1/auth/verify/phone', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, otp }),
  });
}

export async function verifyEmailOtp(dto: {
  email: string;
  otp: string;
}): Promise<AuthResponse> {
  return api('/v1/auth/verify/email', { method: 'POST', body: JSON.stringify(dto) });
}

export async function forgotPassword(phoneNumber: string): Promise<{ message: string }> {
  return api('/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber }),
  });
}

export async function resetPassword(dto: {
  phoneNumber: string;
  token: string;
  newPassword: string;
}): Promise<{ message: string }> {
  return api('/v1/auth/reset-password', { method: 'POST', body: JSON.stringify(dto) });
}

export async function refreshAuthToken(
  refreshToken: string,
): Promise<AuthTokens> {
  return api('/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export async function logout(accessToken: string): Promise<void> {
  await fetch(`${API_BASE}/v1/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// ── Passkeys (WebAuthn) ──────────────────────────────────────────────────────

export interface PasskeyCeremony {
  challengeId: string;
  /** WebAuthn options JSON generated by the backend, passed straight to the OS. */
  options: unknown;
}

export interface PasskeyCredential {
  id: string;
  device_label: string | null;
  transports: string[];
  last_used_at: string | null;
  created_at: string;
  is_backup_eligible: boolean;
  is_backed_up: boolean;
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function passkeyBeginRegistration(
  token: string,
  deviceLabel?: string,
): Promise<PasskeyCeremony> {
  return api('/v1/auth/passkey/register/begin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(token) },
    body: JSON.stringify(deviceLabel ? { deviceLabel } : {}),
  });
}

export async function passkeyCompleteRegistration(
  token: string,
  dto: { challengeId: string; response: unknown; deviceLabel?: string },
): Promise<{ id: string; device_label: string | null; created_at: string }> {
  return api('/v1/auth/passkey/register/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(token) },
    body: JSON.stringify(dto),
  });
}

export async function listPasskeys(token: string): Promise<PasskeyCredential[]> {
  return api('/v1/auth/passkey/credentials', {
    headers: { 'Content-Type': 'application/json', ...bearer(token) },
  });
}

export async function revokePasskey(token: string, id: string): Promise<{ message: string }> {
  return api(`/v1/auth/passkey/credentials/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...bearer(token) },
  });
}

export async function passkeyBeginAuth(identifier?: string): Promise<PasskeyCeremony> {
  return api('/v1/auth/passkey/authenticate/begin', {
    method: 'POST',
    body: JSON.stringify(identifier ? { identifier } : {}),
  });
}

export async function passkeyCompleteAuth(dto: {
  challengeId: string;
  response: unknown;
}): Promise<AuthResponse> {
  return api('/v1/auth/passkey/authenticate/complete', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}
