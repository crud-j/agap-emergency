import { File, UploadTask, UploadType } from 'expo-file-system';
import type { TextSize } from '../../stores/accessibility.store';
import type { SafeUser } from './auth.api';
import { ApiError, NetworkError, apiFetch } from './http';
import { authedFetch } from './authed-fetch';
import { responseToJpegDataUri } from './jpeg-data-uri';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * GET /users/me — the signed-in user's profile, including profile-photo fields.
 * Through authedFetch, so an expired access token is refreshed instead of failing.
 */
export async function getMe(): Promise<SafeUser> {
  const res = await authedFetch(`${API_BASE}/v1/users/me`);
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  return (await res.json()) as SafeUser;
}

/**
 * Downloads the signed-in user's profile picture as a `data:` URI, or null when there is
 * none (404). Throws NetworkError when offline.
 */
export async function fetchProfilePhotoDataUri(version: string): Promise<string | null> {
  const res = await authedFetch(`${API_BASE}/v1/users/me/photo?v=${encodeURIComponent(version)}`, {
    headers: { Accept: 'image/jpeg' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  return responseToJpegDataUri(res);
}

/**
 * PUT /users/me/photo/responder-sharing (MOD-01 / MOD-48): turns on or off showing the
 * profile photo to the dispatchers and crew of the user's active reports.
 */
export async function setResponderPhotoSharing(enabled: boolean): Promise<boolean> {
  const res = await authedFetch(`${API_BASE}/v1/users/me/photo/responder-sharing`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status);
  const body = (await res.json()) as { profile_photo_shared_with_responders?: boolean };
  return !!body.profile_photo_shared_with_responders;
}

export type ProfilePhotoInfo = Required<
  Pick<SafeUser, 'has_profile_photo' | 'profile_photo_updated_at' | 'profile_photo_next_change_at'>
>;

/**
 * POST /users/me/photo (MOD-01): uploads a live selfie as the profile picture.
 * Rejects with ApiError 409 (body.code PROFILE_PHOTO_COOLDOWN) inside the 5-month
 * window, or NetworkError when the server can't be reached.
 */
export async function uploadProfilePhoto(uri: string, token: string): Promise<ProfilePhotoInfo> {
  // Native multipart upload, like incident photos: RN's FormData file parts fail on the
  // New Architecture (see uploadIncidentPhoto in incidents.api.ts).
  let result: { status: number; body: string } | null | undefined;
  try {
    result = await new UploadTask(new File(uri), `${API_BASE}/v1/users/me/photo`, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'photo',
      mimeType: 'image/jpeg',
      parameters: { captureSource: 'live-camera' },
      headers: { Authorization: `Bearer ${token}`, 'ngrok-skip-browser-warning': '1' },
    }).uploadAsync();
  } catch (err) {
    throw new NetworkError(err);
  }
  if (!result) throw new NetworkError();

  let body: unknown = {};
  let fromApi = true;
  try {
    body = result.body ? JSON.parse(result.body) : {};
  } catch {
    fromApi = false; // an HTML page from a proxy or tunnel, not the AGAP API
  }
  if (result.status < 200 || result.status >= 300) {
    // e.g. ngrok's "endpoint offline" page (404, ERR_NGROK_3200): the server was never reached.
    if (!fromApi) throw new NetworkError(new Error(`HTTP ${result.status} from a proxy`));
    const raw = (body as { message?: unknown }).message;
    const message = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : `HTTP ${result.status}`;
    throw new ApiError(message, result.status, body);
  }
  return body as ProfilePhotoInfo;
}

export interface UpdatePreferencesDto {
  preferredLanguage?: string;
  textSize?: TextSize;
  highContrast?: boolean;
  reducedMotion?: boolean;
}

export async function updateUserPreferences(
  dto: UpdatePreferencesDto,
  token: string,
): Promise<void> {
  await apiFetch(`${API_BASE}/v1/users/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(dto),
  });
}
