import * as SecureStore from 'expo-secure-store';
import { setGuestReportPushToken } from '../api/guest-report.api';
import { getDevicePushToken } from '../push/push-registration';

/**
 * The guest report this phone follows (no account, MOD-42). One at a time: a new guest
 * report replaces the old one. The token is a secret, so it lives in Secure Store.
 */
export interface SavedGuestReport {
  token: string;
  publicReference: string;
  savedAt: string;
}

const KEY = 'agap.guest_report.v1';
/** Same as the server's limit; after this the token no longer works anyway. */
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export async function saveGuestReport(report: Omit<SavedGuestReport, 'savedAt'>, now = new Date()): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify({ ...report, savedAt: now.toISOString() }));
  } catch {
    // Following is optional; the report itself was already delivered.
  }
}

export async function loadSavedGuestReport(now = new Date()): Promise<SavedGuestReport | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedGuestReport>;
    const age = now.getTime() - Date.parse(saved.savedAt ?? '');
    if (!saved.token || !saved.publicReference || !(age >= 0 && age < MAX_AGE_MS)) {
      await clearSavedGuestReport();
      return null;
    }
    return saved as SavedGuestReport;
  } catch {
    return null;
  }
}

export async function clearSavedGuestReport(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Nothing saved, or storage unavailable: nothing to clear.
  }
}

/**
 * Ask for notification permission (once) and register this phone for the report's
 * updates. Resolves false instead of throwing: push is optional, the screen still works.
 */
export async function enableGuestReportPush(token: string, { requestPermission = true } = {}): Promise<boolean> {
  try {
    const deviceToken = await getDevicePushToken({ requestPermission });
    if (!deviceToken) return false;
    await setGuestReportPushToken(token, deviceToken);
    return true;
  } catch (error) {
    console.warn('Unable to turn on updates for the guest report', error);
    return false;
  }
}
