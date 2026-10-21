import { useEffect, useSyncExternalStore } from 'react';
import * as Location from 'expo-location';
import { useAuthStore } from '@/src/stores/auth.store';
import { trackResponderLocation, type TrackLocationInput } from '@/src/services/api/locations.api';

export type SharePushStatus = 'idle' | 'ok' | 'error';

export interface ResponderShareState {
  sharing: boolean;
  myPosition: { lat: number; lng: number; heading?: number; updatedAt: string } | null;
  permissionDenied: boolean;
  /** Result of the most recent upload — 'error' means the citizen is NOT seeing us. */
  push: SharePushStatus;
  pushError: string | null;
}

const IDLE: ResponderShareState = {
  sharing: false,
  myPosition: null,
  permissionDenied: false,
  push: 'idle',
  pushError: null,
};

// ─── Shared watcher ───────────────────────────────────────────────────────────
// The map tab stays mounted underneath the assignment screen, so two components
// can ask for sharing at once. One GPS watch + one upload stream serves them all
// (ref-counted); otherwise the backend would receive every fix twice.

type Active = {
  incidentId: string;
  count: number;
  sub: Location.LocationSubscription | null;
};

let snapshot: ResponderShareState = IDLE;
let active: Active | null = null;
let latestToken = '';
const listeners = new Set<() => void>();

function setSnapshot(next: ResponderShareState) {
  snapshot = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot() {
  return snapshot;
}

function teardown(a: Active) {
  a.count = 0;
  a.sub?.remove();
  a.sub = null;
}

async function start(mine: Active) {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (mine.count <= 0) return;
  if (status !== 'granted') {
    setSnapshot({ ...snapshot, permissionDenied: true, sharing: false });
    return;
  }
  setSnapshot({ ...snapshot, permissionDenied: false, sharing: true });

  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 15 },
    (loc) => {
      if (mine.count <= 0) return;
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      const heading = loc.coords.heading;
      const hasHeading = heading != null && heading >= 0;

      setSnapshot({
        ...snapshot,
        myPosition: {
          lat,
          lng,
          ...(hasHeading ? { heading } : {}),
          updatedAt: new Date(loc.timestamp || Date.now()).toISOString(),
        },
      });

      const payload: TrackLocationInput = {
        incidentId: mine.incidentId,
        latitude: lat,
        longitude: lng,
        ...(loc.coords.accuracy != null ? { accuracyMeters: loc.coords.accuracy } : {}),
        ...(loc.coords.speed != null && loc.coords.speed >= 0
          ? { speedKmh: loc.coords.speed * 3.6 }
          : {}),
        ...(hasHeading ? { headingDegrees: heading } : {}),
      };

      // Best-effort: a failed upload never interrupts the responder, but it must
      // not fail silently either — surface it so the crew knows the citizen
      // cannot see them (e.g. GPS fix outside Bocaue, or no connectivity).
      trackResponderLocation(payload, latestToken)
        .then(() => {
          if (mine.count > 0 && snapshot.push !== 'ok') {
            setSnapshot({ ...snapshot, push: 'ok', pushError: null });
          }
        })
        .catch((err: unknown) => {
          if (mine.count <= 0) return;
          const message = err instanceof Error ? err.message : 'Location upload failed';
          if (snapshot.push !== 'error' || snapshot.pushError !== message) {
            setSnapshot({ ...snapshot, push: 'error', pushError: message });
          }
        });
    },
  );

  if (mine.count <= 0) {
    sub.remove();
    return;
  }
  mine.sub = sub;
}

function acquire(incidentId: string, token: string): () => void {
  latestToken = token;

  let mine: Active;
  if (active && active.incidentId === incidentId) {
    mine = active;
    mine.count += 1;
  } else {
    if (active) teardown(active);
    mine = { incidentId, count: 1, sub: null };
    active = mine;
    setSnapshot(IDLE);
    void start(mine);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    mine.count -= 1;
    if (mine.count <= 0) {
      teardown(mine);
      if (active === mine) {
        active = null;
        setSnapshot(IDLE);
      }
    }
  };
}

/**
 * Shares the responder's live location for an incident while `enabled` (i.e. the
 * assignment is accepted / en route). Watches the device GPS and pushes each
 * update to the backend, which broadcasts it to the citizen's incident room so
 * both parties track each other in near real time (MOD-13 / MOD-43).
 *
 * Location sharing is best-effort: a failed push never disrupts the responder's
 * workflow (it is reported via `push` / `pushError`), and the watch is torn down
 * when no component needs it any more.
 */
export function useResponderLocationShare(
  incidentId: string | undefined,
  enabled: boolean,
): ResponderShareState {
  const token = useAuthStore((s) => s.accessToken);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const shouldShare = enabled && !!incidentId && !!token;

  useEffect(() => {
    if (!shouldShare) return;
    return acquire(incidentId as string, token as string);
  }, [shouldShare, incidentId, token]);

  return shouldShare ? state : IDLE;
}
