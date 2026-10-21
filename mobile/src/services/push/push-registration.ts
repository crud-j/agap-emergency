import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerFcmToken } from '../api/notifications.api';

/**
 * Registers this device's push token with AGAP. Push is optional — the in-app
 * notification feed stays authoritative — so this resolves false instead of throwing.
 */
export async function registerPushToken(
  accessToken: string,
  { requestPermission = true }: { requestPermission?: boolean } = {},
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    const permissions = current.granted || !requestPermission
      ? current
      : await Notifications.requestPermissionsAsync();
    if (!permissions.granted) return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'AGAP announcements',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const deviceToken = await Notifications.getDevicePushTokenAsync();
    if (typeof deviceToken.data !== 'string') return false;
    await registerFcmToken(accessToken, deviceToken.data);
    return true;
  } catch (error) {
    console.warn('Unable to register push notification token', error);
    return false;
  }
}
