import type { TextSize } from '../../stores/accessibility.store';
import type { SafeUser, UserSexValue } from './auth.api';
import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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

/** Set or clear (null) the optional reporter map-icon choice. Returns the saved profile. */
export async function updateUserSex(
  sex: UserSexValue | null,
  token: string,
): Promise<SafeUser> {
  return apiFetch<SafeUser>(`${API_BASE}/v1/users/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sex }),
  });
}
