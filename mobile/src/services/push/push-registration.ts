import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { GUEST_REPORT_PUSH_TYPE } from '@agap/shared';
import { registerFcmToken } from '../api/notifications.api';

/**
 * Registers this device's push token with AGAP. Push is optional — the in-app
 * notification feed stays authoritative — so this resolves false instead of throwing.
 */
export async function registerPushToken(
  accessToken: string,
  { requestPermission = true }: { requestPermission?: boolean } = {},
): Promise<boolean> {
  try {
    const deviceToken = await getDevicePushToken({ requestPermission });
    if (!deviceToken) return false;
    await registerFcmToken(accessToken, deviceToken);
    return true;
  } catch (error) {
    console.warn('Unable to register push notification token', error);
    return false;
  }
}

/**
 * This device's FCM token, after notification permission (asked for when
 * `requestPermission`) and the Android channels. null when not allowed or unsupported.
 * Shared by signed-in accounts and guests following a report.
 */
export async function getDevicePushToken(
  { requestPermission = true }: { requestPermission?: boolean } = {},
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const current = await Notifications.getPermissionsAsync();
    const permissions = current.granted || !requestPermission
      ? current
      : await Notifications.requestPermissionsAsync();
    if (!permissions.granted) return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'AGAP announcements',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      // Must match INCIDENT_UPDATES_CHANNEL in backend incident-status-notifier.ts.
      await Notifications.setNotificationChannelAsync('incident-updates', {
        name: 'Incident updates',
        importance: Notifications.AndroidImportance.HIGH,
      });
      // Must match ASSIGNMENTS_CHANNEL in backend dispatch/assignment-push.ts. MAX so a
      // new assignment wakes a backgrounded responder phone.
      await Notifications.setNotificationChannelAsync('assignments', {
        name: 'Responder assignments',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const deviceToken = await Notifications.getDevicePushTokenAsync();
    return typeof deviceToken.data === 'string' ? deviceToken.data : null;
  } catch (error) {
    console.warn('Unable to read the push notification token', error);
    return null;
  }
}

/** A tapped push about a guest report (no incident id: it opens the guest status screen). */
export function isGuestReportNotification(
  response: Notifications.NotificationResponse | null | undefined,
): boolean {
  return response?.notification.request.content.data?.type === GUEST_REPORT_PUSH_TYPE;
}

/** Dispatch a tapped assignment push points at (data.type 'ASSIGNMENT', data.dispatchId). */
/** Incident Command job notices (MOD-36); they carry dispatchId only for crew on the incident. */
const ICS_TYPES = new Set(['ICS_POSITION_ASSIGNED', 'ICS_POSITION_RELIEVED', 'ICS_COMMAND_ENDED']);

export function assignmentIdFromNotification(
  response: Notifications.NotificationResponse | null | undefined,
): string | null {
  const data = response?.notification.request.content.data;
  if (data?.type !== 'ASSIGNMENT' && !ICS_TYPES.has(String(data?.type))) return null;
  const id = data?.dispatchId;
  return typeof id === 'string' && id ? id : null;
}

/** Incident a tapped notification points at, if any (data.incidentId from the backend). */
export function incidentIdFromNotification(
  response: Notifications.NotificationResponse | null | undefined,
): string | null {
  const data = response?.notification.request.content.data;
  if (ICS_TYPES.has(String(data?.type))) return null;
  const id = data?.incidentId;
  return typeof id === 'string' && id ? id : null;
}
