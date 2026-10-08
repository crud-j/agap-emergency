import { Alert, Linking, Platform } from 'react-native';

/**
 * Hands turn-by-turn navigation off to the responder's installed nav app.
 *
 * AGAP deliberately does NOT build in-app navigation: Waze and Google Maps have
 * the best live traffic and voice guidance in the Philippines, at zero cost. We
 * route the ambulance to the incident coordinates through whichever app the crew
 * prefers (MOD-32 / MOD-43).
 */

export interface NavTarget {
  lat: number;
  lng: number;
  /** Human-readable destination shown in the chooser (e.g. the address). */
  label?: string;
}

const wazeApp = (t: NavTarget) => `waze://?ll=${t.lat},${t.lng}&navigate=yes`;
const wazeWeb = (t: NavTarget) => `https://waze.com/ul?ll=${t.lat},${t.lng}&navigate=yes`;
const googleApp = (t: NavTarget) =>
  Platform.OS === 'ios'
    ? `comgooglemaps://?daddr=${t.lat},${t.lng}&directionsmode=driving`
    : `google.navigation:q=${t.lat},${t.lng}`;
const googleWeb = (t: NavTarget) =>
  `https://www.google.com/maps/dir/?api=1&destination=${t.lat},${t.lng}&travelmode=driving`;
const appleMaps = (t: NavTarget) => `http://maps.apple.com/?daddr=${t.lat},${t.lng}&dirflg=d`;

/**
 * Opens the first handleable URL. Native app schemes are tried first (direct
 * hand-off), then a universal https URL that always resolves — to the app if
 * installed, otherwise the browser. The last candidate is force-opened even when
 * `canOpenURL` returned false (e.g. missing Android <queries> before a native
 * rebuild) so navigation is never silently blocked.
 */
async function openFirstAvailable(candidates: string[]): Promise<boolean> {
  for (const url of candidates) {
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return true;
      }
    } catch {
      // Try the next candidate.
    }
  }
  const fallback = candidates[candidates.length - 1];
  if (!fallback) return false;
  try {
    await Linking.openURL(fallback);
    return true;
  } catch {
    return false;
  }
}

export const openInWaze = (t: NavTarget) => openFirstAvailable([wazeApp(t), wazeWeb(t)]);
export const openInGoogleMaps = (t: NavTarget) => openFirstAvailable([googleApp(t), googleWeb(t)]);
export const openInAppleMaps = (t: NavTarget) => openFirstAvailable([appleMaps(t)]);

/**
 * Lets the responder pick their preferred navigation app, then hands off with
 * driving directions to the incident.
 */
export function promptNavigation(t: NavTarget): void {
  const buttons: { text: string; onPress?: () => void; style?: 'cancel' }[] = [
    { text: 'Waze', onPress: () => void openInWaze(t) },
    { text: 'Google Maps', onPress: () => void openInGoogleMaps(t) },
  ];
  if (Platform.OS === 'ios') {
    buttons.push({ text: 'Apple Maps', onPress: () => void openInAppleMaps(t) });
  }
  buttons.push({ text: 'Cancel', style: 'cancel' });

  Alert.alert(
    'Navigate to scene',
    t.label ?? `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`,
    buttons,
    { cancelable: true },
  );
}
