import { GUEST_REPORT_TOKEN_HEADER, type GuestReportStatus } from '@agap/shared';
import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export type { GuestReportStatus };

/**
 * A guest's own report (no account, MOD-42). The token goes in a header, never the URL.
 * Throws ApiError 401 once the token is unknown or expired, NetworkError when offline.
 */
export function fetchGuestReportStatus(token: string): Promise<GuestReportStatus> {
  return apiFetch<GuestReportStatus>(`${API_BASE}/v1/guest-reports/status`, {
    headers: { [GUEST_REPORT_TOKEN_HEADER]: token },
  });
}

/** Turn push updates for the report on (this phone's FCM token) or off (null). */
export function setGuestReportPushToken(token: string, pushToken: string | null): Promise<{ pushEnabled: boolean }> {
  return apiFetch<{ pushEnabled: boolean }>(`${API_BASE}/v1/guest-reports/push-token`, {
    method: 'PUT',
    headers: { [GUEST_REPORT_TOKEN_HEADER]: token },
    body: JSON.stringify({ pushToken }),
  });
}
