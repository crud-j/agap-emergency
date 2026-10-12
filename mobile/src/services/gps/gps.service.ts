import * as Location from 'expo-location';

/**
 * MOD-11 — Precision GPS Capture.
 *
 * A thin, reusable wrapper around Expo Location that every surface (emergency
 * flow, responder tracking) can share instead of calling expo-location inline.
 *
 * Design rules it enforces (CLAUDE.md 5 / 14):
 *  - Capturing GPS must NEVER block getting help. Every function resolves to a
 *    typed result — it never throws for the "no fix / denied" case.
 *  - Best-of-N sampling: the first fix is often coarse. We briefly sample a few
 *    readings and keep the most accurate, bounded by an overall timeout so the
 *    UI never hangs waiting for a better fix.
 */

export interface GpsFix {
  lat: number;
  lng: number;
  /** Horizontal accuracy in metres, when the device reports it. */
  accuracy?: number;
  /** Heading in degrees, when moving/available. */
  heading?: number;
  capturedAt: number;
}

export type GpsOutcome =
  | { status: 'ready'; fix: GpsFix }
  | { status: 'denied' }
  | { status: 'error' };

export interface CaptureOptions {
  /** Overall budget before we return the best fix so far (ms). Default 6000. */
  timeoutMs?: number;
  /** Number of readings to compare and keep the most accurate. Default 3. */
  samples?: number;
  /** Stop early once a fix at or below this accuracy (m) arrives. Default 20. */
  desiredAccuracyM?: number;
}

/** Request foreground location permission. Resolves false instead of throwing. */
export async function ensureLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

function toFix(loc: Location.LocationObject): GpsFix {
  return {
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? undefined,
    heading: loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : undefined,
    capturedAt: loc.timestamp ?? Date.now(),
  };
}

/** Lower accuracy number = better. Readings with no accuracy rank worst. */
function better(a: GpsFix, b: GpsFix): GpsFix {
  const aAcc = a.accuracy ?? Number.POSITIVE_INFINITY;
  const bAcc = b.accuracy ?? Number.POSITIVE_INFINITY;
  return bAcc < aAcc ? b : a;
}

/**
 * Capture the best available position within a bounded time budget. Returns a
 * typed outcome; callers render the matching UI state. Never throws.
 */
export async function captureBestFix(opts: CaptureOptions = {}): Promise<GpsOutcome> {
  const { timeoutMs = 6000, samples = 3, desiredAccuracyM = 20 } = opts;

  const granted = await ensureLocationPermission();
  if (!granted) return { status: 'denied' };

  const deadline = Date.now() + timeoutMs;
  let best: GpsFix | null = null;

  try {
    for (let i = 0; i < samples; i++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      const loc = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        remaining,
      );
      if (!loc) break; // timed out — use best so far

      const fix = toFix(loc);
      best = best ? better(best, fix) : fix;

      if (best.accuracy != null && best.accuracy <= desiredAccuracyM) break;
    }
  } catch {
    // Fall through to whatever we captured; a partial fix still helps dispatch.
  }

  if (best) return { status: 'ready', fix: best };
  return { status: 'error' };
}

/** Resolves to null if the promise doesn't settle within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, ms);
    p.then(
      (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } },
      () => { if (!settled) { settled = true; clearTimeout(timer); resolve(null); } },
    );
  });
}
