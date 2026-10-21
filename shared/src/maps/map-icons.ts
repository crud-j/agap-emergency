/**
 * Map marker identity rules shared by every map (ops dashboard, ops map,
 * responder app, citizen app). Platform helpers turn these into image sources:
 * `frontend/lib/map-icons.ts` and `mobile/src/lib/map-icons.ts`.
 */

/** Reporter icon variant. The icon represents the REPORTER, never the patient. */
export type CitizenIconKind = 'male' | 'female';

/**
 * MALE / FEMALE → that icon. PREFER_NOT_TO_SAY, null (never asked, guest,
 * legacy) or anything unexpected → null, meaning "draw the neutral pin".
 */
export function citizenIconKind(sex: string | null | undefined): CitizenIconKind | null {
  if (sex === 'MALE') return 'male';
  if (sex === 'FEMALE') return 'female';
  return null;
}

/**
 * The ambulance artwork is a side view facing RIGHT, so it is never rotated by
 * heading (it would render upside-down travelling west). Instead it is mirrored
 * horizontally while heading west (180° < heading < 360°) so it faces its
 * direction of travel; a separate chevron shows the precise heading.
 * Unknown heading → not mirrored.
 */
export function isWestbound(heading: number | null | undefined): boolean {
  if (heading == null || !Number.isFinite(heading)) return false;
  const h = ((heading % 360) + 360) % 360;
  return h > 180 && h < 360;
}

/** Ring colour around the reporter icon, so priority stays readable at a glance. */
export const PRIORITY_RING_COLORS = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#D97706',
  LOW: '#16A34A',
} as const;

/** Ring colour for an unknown / missing priority. */
export const PRIORITY_RING_FALLBACK = '#6B7280';

export function priorityRingColor(priority: string | null | undefined): string {
  return (priority && PRIORITY_RING_COLORS[priority as keyof typeof PRIORITY_RING_COLORS]) || PRIORITY_RING_FALLBACK;
}

/** No responder update for this long → grey marker + "signal lost" (design rule). */
export const RESPONDER_SIGNAL_LOST_MS = 60_000;

export function isSignalLost(updatedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!updatedAt) return true;
  const t = Date.parse(updatedAt);
  return !Number.isFinite(t) || now - t > RESPONDER_SIGNAL_LOST_MS;
}
