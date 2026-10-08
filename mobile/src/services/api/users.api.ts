import type { TextSize } from '../../stores/accessibility.store';

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
  const res = await fetch(`${API_BASE}/v1/users/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? `HTTP ${res.status}`);
  }
}
