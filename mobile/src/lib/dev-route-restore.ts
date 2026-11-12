import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Development only: remembers the screen you were on so a Metro reload (which
 * restarts the app at "/") puts you back there instead of the first onboarding
 * screen. Release builds never read or write this key.
 *
 * The AuthGuard in app/_layout.tsx still runs after the restore, so a remembered
 * screen the current session may not see is redirected as usual.
 */

const KEY = 'agap_dev_last_route';

// The emergency flow keeps its draft in memory, which a reload wipes, and the
// transmission screen sends the alert when it opens. Never reopen those screens.
const NEVER_RESTORE = ['emergency'];

export interface DevRoute {
  pathname: string;
  params: Record<string, string | string[]>;
}

export async function loadDevRoute(): Promise<DevRoute | null> {
  if (!__DEV__) return null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DevRoute) : null;
  } catch {
    return null;
  }
}

export function saveDevRoute(segments: string[], params: Record<string, string | string[]>): void {
  if (!__DEV__) return;
  // The root screen is only a placeholder while the guard decides where to go.
  if (segments.length === 0 || NEVER_RESTORE.includes(segments[0])) return;
  const route: DevRoute = { pathname: '/' + segments.join('/'), params };
  AsyncStorage.setItem(KEY, JSON.stringify(route)).catch(() => {});
}
