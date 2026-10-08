import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useAuthStore } from '@/src/stores/auth.store';
import { trackResponderLocation, type TrackLocationInput } from '@/src/services/api/locations.api';

export interface ResponderShareState {
  sharing: boolean;
  myPosition: { lat: number; lng: number; heading?: number } | null;
  permissionDenied: boolean;
}

/**
 * Shares the responder's live location for an incident while `enabled` (i.e. the
 * assignment is accepted / en route). Watches the device GPS and pushes each
 * update to the backend, which broadcasts it to the citizen's incident room so
 * both parties track each other in near real time (MOD-13 / MOD-43).
 *
 * Location sharing is best-effort: a failed push is swallowed so it never
 * disrupts the responder's workflow, and the watch is torn down when disabled.
 */
export function useResponderLocationShare(
  incidentId: string | undefined,
  enabled: boolean,
): ResponderShareState {
  const token = useAuthStore((s) => s.accessToken);
  const [state, setState] = useState<ResponderShareState>({
    sharing: false,
    myPosition: null,
    permissionDenied: false,
  });
  const subRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!enabled || !incidentId || !token) return;

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!cancelled) setState((s) => ({ ...s, permissionDenied: true, sharing: false }));
        return;
      }
      if (cancelled) return;
      setState((s) => ({ ...s, permissionDenied: false, sharing: true }));

      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 15 },
        (loc) => {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          const heading = loc.coords.heading;

          setState((s) => ({
            ...s,
            myPosition: { lat, lng, ...(heading != null && heading >= 0 ? { heading } : {}) },
          }));

          const payload: TrackLocationInput = {
            incidentId,
            latitude: lat,
            longitude: lng,
            ...(loc.coords.accuracy != null ? { accuracyMeters: loc.coords.accuracy } : {}),
            ...(loc.coords.speed != null && loc.coords.speed >= 0
              ? { speedKmh: loc.coords.speed * 3.6 }
              : {}),
            ...(heading != null && heading >= 0 ? { headingDegrees: heading } : {}),
          };
          trackResponderLocation(payload, token).catch(() => undefined);
        },
      );
    }

    start();

    return () => {
      cancelled = true;
      subRef.current?.remove();
      subRef.current = null;
      setState((s) => ({ ...s, sharing: false }));
    };
  }, [enabled, incidentId, token]);

  return state;
}
