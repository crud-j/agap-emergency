/**
 * Reads the device push token out of a `fcm_token:{userId}` system_configurations
 * value. NotificationsService.registerToken() stores `{ fcmToken }`; older rows
 * hold the raw string. Anything else (or an empty token) → null.
 */
export function tokenFromConfig(value: unknown): string | null {
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object' && !Array.isArray(value) && 'fcmToken' in value) {
    const token = (value as { fcmToken: unknown }).fcmToken;
    return typeof token === 'string' && token ? token : null;
  }
  return null;
}
