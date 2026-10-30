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

/**
 * The watch only reports after 15 m of movement, so a unit that is stopped (at the
 * scene, at a light, unloading at the ER) would go quiet: the console calls a unit
 * "signal lost" after 60 s without a fix, and the server route (cached 120 s, renewed
 * per fix) would expire. While no fix has been sent for this long, the GPS is read
 * once and that fresh fix is sent. A phone with no GPS sends nothing, so a real
 * signal loss still shows as one.
 */
export const LOCATION_HEARTBEAT_MS = 20_000;
/** How often the heartbeat checks; the worst gap between fixes is HEARTBEAT + CHECK (30 s). */
const HEARTBEAT_CHECK_MS = 10_000;

export function isHeartbeatDue(lastSentAt: number, now: number): boolean {
  return now - lastSentAt >= LOCATION_HEARTBEAT_MS;
}

type Active = {
  incidentId: string;
  count: number;
  sub: Location.LocationSubscription | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  /** Device time of the last fix sent (watch or heartbeat). */
  lastSentAt: number;
  /** A heartbeat GPS read is in progress. */
  reading: boolean;
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
  if (a.heartbeat) clearInterval(a.heartbeat);
  a.heartbeat = null;
}

/** One fix (from the watch or the heartbeat): show it on this phone and upload it. */
function sendFix(mine: Active, loc: Location.LocationObject) {
  if (mine.count <= 0) return;
  mine.lastSentAt = Date.now();
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
}

/** Stopped unit: read the GPS once and send that fix (see LOCATION_HEARTBEAT_MS). */
async function heartbeat(mine: Active) {
  if (mine.count <= 0 || mine.reading || !isHeartbeatDue(mine.lastSentAt, Date.now())) return;
  mine.reading = true;
  try {
    sendFix(mine, await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
  } catch {
    // No fix (GPS off or no signal): nothing is sent, so the console shows "signal lost", which is true.
  } finally {
    mine.reading = false;
  }
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
    (loc) => sendFix(mine, loc),
  );

  if (mine.count <= 0) {
    sub.remove();
    return;
  }
  mine.sub = sub;
  mine.heartbeat = setInterval(() => void heartbeat(mine), HEARTBEAT_CHECK_MS);
}

function acquire(incidentId: string, token: string): () => void {
  latestToken = token;

  let mine: Active;
  if (active && active.incidentId === incidentId) {
    mine = active;
    mine.count += 1;
  } else {
    if (active) teardown(active);
    mine = { incidentId, count: 1, sub: null, heartbeat: null, lastSentAt: 0, reading: false };
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
