import type { TextSize } from '../../stores/accessibility.store';
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
