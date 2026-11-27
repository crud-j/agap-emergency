import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/** Native side: modules/agap-alarm/android/.../AgapAlarmModule.kt (Android only). */
interface AgapAlarmNative {
  ring(tag: string, title: string, body: string, url: string): boolean;
  stop(tag: string): boolean;
}

// Null in Expo Go, on iOS, in tests and on an APK built before this module existed.
const native = Platform.OS === 'android' ? requireOptionalNativeModule<AgapAlarmNative>('AgapAlarm') : null;

/**
 * Ring and vibrate until the responder opens the notification (MOD-32). Replaces the
 * notification with the same tag. false when it could not: the plain push still shows.
 */
export function ringUntilOpened(tag: string, title: string, body: string, url: string): boolean {
  if (!native) return false;
  try {
    return native.ring(tag, title, body, url);
  } catch {
    return false;
  }
}

/** Stop a ringing notification (the responder is already looking at AGAP). */
export function stopRinging(tag: string): void {
  if (!native) return;
  try {
    native.stop(tag);
  } catch {
    // Nothing ringing, or no module: nothing to stop.
  }
}
