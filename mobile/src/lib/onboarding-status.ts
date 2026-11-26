import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether this install has been through onboarding. Not a secret, so AsyncStorage
 * (SecureStore is for tokens). Cleared only by uninstalling or clearing app data.
 */
const KEY = 'agap.onboarding_complete.v1';

/** True once onboarding was finished or skipped. Unreadable storage counts as done, so a broken store never traps someone in onboarding. */
export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return true;
  }
}

/** Remember that onboarding is done. Never throws: the worst case is seeing it again. */
export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // Storage unavailable: onboarding shows again next launch, nothing else breaks.
  }
}
