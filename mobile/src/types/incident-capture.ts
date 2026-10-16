/**
 * Trusted photo-capture provenance — Tier 1 photo validation (MOD-10 / MOD-25).
 *
 * Captured on-device at the exact moment the shutter fires — NOT read from EXIF,
 * which is mutable and easily forged. The backend cross-checks these signals during
 * triage to score photo authenticity: Is it fresh (captured near report time)? Was
 * it taken at the incident location? Live camera vs a gallery upload?
 *
 * ADVISORY ONLY. Per Architectural Rules #5 / #8 / #14 this must never block, delay,
 * or cancel an incident — a genuine emergency with odd or missing metadata still
 * dispatches. It only helps a human dispatcher weigh authenticity.
 */
export interface PhotoCaptureMeta {
  /** Device clock (ms since epoch) when the capture resolved. Freshness signal. */
  capturedAt: number;
  /** GPS latitude at capture, if available (best-effort — never blocks capture). */
  lat?: number;
  /** GPS longitude at capture, if available. */
  lng?: number;
  /** GPS accuracy in metres at capture, if available. */
  accuracy?: number;
  /** Provenance. This app only captures from the live camera, never the gallery. */
  source: 'live-camera';
}
