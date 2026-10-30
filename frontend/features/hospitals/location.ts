import { RECEIVING_STATUS_STALE_HOURS, haversineMeters } from '@agap/shared';
import { ApiError } from '@/lib/api';
import type { BadgeVariant } from '@/components/ui/badge';
import type {
  Hospital, HospitalLocationInput, HospitalLocationStatus, ResolvedCandidate, ResolveLocationResponse,
} from './api';

// Pure helpers for hospital coordinates (MOD-39): status badges, input parsing and
// readable messages for the location error codes the backend returns.

export const LOCATION_STATUS_BADGE: Record<HospitalLocationStatus, { label: string; variant: BadgeVariant }> = {
  UNVERIFIED: { label: 'Unverified', variant: 'muted' },
  PENDING_REVIEW: { label: 'Pending review', variant: 'amber' },
  VERIFIED: { label: 'Verified', variant: 'green' },
  REJECTED: { label: 'Rejected', variant: 'red' },
};

/** Unknown statuses (a newer backend) fall back to the Unverified look. */
export function locationStatusBadge(status: string | null | undefined): { label: string; variant: BadgeVariant } {
  return LOCATION_STATUS_BADGE[status as HospitalLocationStatus] ?? LOCATION_STATUS_BADGE.UNVERIFIED;
}

/** facilities.receiving_status (facility_receiving_status enum). */
export const RECEIVING_STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  OPEN: { label: 'Open', variant: 'green' },
  EMERGENCY_ONLY: { label: 'ER only', variant: 'amber' },
  AT_CAPACITY: { label: 'At capacity', variant: 'red' },
  CLOSED: { label: 'Closed', variant: 'red' },
  UNKNOWN: { label: 'Unknown', variant: 'muted' },
};

export function receivingStatusBadge(status: string | null | undefined): { label: string; variant: BadgeVariant } {
  return RECEIVING_STATUS_BADGE[status ?? 'UNKNOWN'] ?? RECEIVING_STATUS_BADGE.UNKNOWN!;
}

/**
 * How fresh a facility's receiving status is (C8). Over RECEIVING_STATUS_STALE_HOURS the
 * referral ranking scores it as Unknown; the stored value is still what was reported.
 */
export function receivingStatusAge(
  updatedAt: string | null | undefined,
  now = Date.now(),
): { label: string; stale: boolean } {
  if (!updatedAt) return { label: 'Never reported', stale: true };
  const ageMs = now - new Date(updatedAt).getTime();
  const hours = Math.max(0, Math.floor(ageMs / 3_600_000));
  const label = hours < 1 ? 'Updated within the hour' : hours < 48 ? `Updated ${hours} h ago` : `Updated ${Math.floor(hours / 24)} days ago`;
  // Same rule as the backend's scoreFacility: stale only past the limit.
  return { label, stale: ageMs > RECEIVING_STATUS_STALE_HOURS * 3_600_000 };
}

/** The backend's FACILITY_AT_CAPACITY rule: a full or closed hospital warns, never blocks. */
export function isAtCapacity(status: string | null | undefined): boolean {
  return status === 'AT_CAPACITY' || status === 'CLOSED';
}

/** Coordinates as stored (7 decimal places), always "latitude, longitude". */
export function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(7)}, ${longitude.toFixed(7)}`;
}

export function hasCoordinates(h: Pick<Hospital, 'latitude' | 'longitude'>): h is { latitude: number; longitude: number } {
  return h.latitude != null && h.longitude != null;
}

/**
 * Supervisor / System Admin may decide on a location that is waiting for review,
 * or on an unverified one that already has coordinates (VERIFIED needs a point).
 */
export function canReviewLocation(h: Pick<Hospital, 'location_status' | 'latitude' | 'longitude'>): boolean {
  return h.location_status === 'PENDING_REVIEW' || (h.location_status === 'UNVERIFIED' && hasCoordinates(h));
}

const MAX_DECIMALS = 7;

/**
 * Parses one typed coordinate. Empty → null with no error (the location is
 * optional on create); otherwise a finite number in range with at most 7 decimals.
 */
export function parseCoordinate(
  raw: string,
  axis: 'latitude' | 'longitude',
): { value: number | null; error: string | null } {
  const text = raw.trim();
  if (text === '') return { value: null, error: null };
  const value = Number(text);
  const limit = axis === 'latitude' ? 90 : 180;
  if (!Number.isFinite(value)) return { value: null, error: `Enter the ${axis} as a number.` };
  if (Math.abs(value) > limit) return { value: null, error: `The ${axis} must be between -${limit} and ${limit}.` };
  const decimals = text.split('.')[1]?.length ?? 0;
  if (decimals > MAX_DECIMALS) return { value: null, error: `Use at most ${MAX_DECIMALS} decimal places.` };
  return { value, error: null };
}

/** Map clicks and drags give long floats; store what the database keeps. */
export function roundCoordinate(value: number): number {
  return Number(value.toFixed(MAX_DECIMALS));
}

/** The picker's typed text, so a half-typed "14." is not lost. Parsed on submit. */
export interface CoordinateText {
  latitude: string;
  longitude: string;
}

export const EMPTY_COORDINATES: CoordinateText = { latitude: '', longitude: '' };

export function coordinateText(latitude: number | null, longitude: number | null): CoordinateText {
  return latitude != null && longitude != null
    ? { latitude: String(latitude), longitude: String(longitude) }
    : EMPTY_COORDINATES;
}

/**
 * Reads the picker for a request: both empty → no location; one missing or
 * invalid → an error to show instead of sending half a location.
 */
export function readCoordinates(value: CoordinateText):
  | { ok: true; point: { latitude: number; longitude: number } | null }
  | { ok: false; error: string } {
  const lat = parseCoordinate(value.latitude, 'latitude');
  const lng = parseCoordinate(value.longitude, 'longitude');
  if (lat.error || lng.error) return { ok: false, error: lat.error ?? lng.error ?? 'Check the coordinates.' };
  if (lat.value == null && lng.value == null) return { ok: true, point: null };
  if (lat.value == null || lng.value == null) return { ok: false, error: 'Enter both latitude and longitude.' };
  return { ok: true, point: { latitude: lat.value, longitude: lng.value } };
}

// ─── "Find location" (plan §9.2 step 6) ───────────────────────────────────────

/** A picked candidate's pin moved farther than this becomes a hand-placed ('manual') location. */
export const CANDIDATE_PIN_TOLERANCE_M = 25;

/** True while the pin is still on the picked candidate (within 25 m). */
export function isPinOnCandidate(
  point: { latitude: number; longitude: number },
  candidate: Pick<ResolvedCandidate, 'latitude' | 'longitude'>,
): boolean {
  return haversineMeters(point.latitude, point.longitude, candidate.latitude, candidate.longitude)
    <= CANDIDATE_PIN_TOLERANCE_M;
}

/**
 * The location a dialog saves: the picked candidate's source, OSM ref and score while
 * the pin is on it; otherwise (no pick, or the pin was moved or typed away) 'manual'.
 */
export function locationForSave(
  point: { latitude: number; longitude: number },
  picked: ResolvedCandidate | null,
): HospitalLocationInput {
  if (picked && isPinOnCandidate(point, picked)) {
    return { ...point, source: 'nominatim', sourceRef: picked.sourceRef, confidence: picked.score };
  }
  return { ...point, source: 'manual' };
}

/**
 * What the finder shows for a resolve result:
 * - BEST_MATCH (AUTO_SELECTABLE): the top candidate is put on the map; the user still confirms.
 * - CHOOSE (NEEDS_CONFIRMATION): a list; nothing is put on the map until the user picks.
 * - MANUAL (NO_RESULTS / PROVIDER_UNAVAILABLE): a message; the pin is placed by hand.
 * A best match already registered as another hospital is never preselected (it would be refused).
 */
export type FinderView =
  | { kind: 'BEST_MATCH'; best: ResolvedCandidate; candidates: ResolvedCandidate[] }
  | { kind: 'CHOOSE'; candidates: ResolvedCandidate[]; note: string }
  | { kind: 'MANUAL'; message: string };

const PLACE_BY_HAND = 'Click the map or type the coordinates.';

export function finderView(response: ResolveLocationResponse, currentHospitalId?: string | null): FinderView {
  const { result, candidates, selectedCandidateId } = response;
  if (result === 'PROVIDER_UNAVAILABLE' || candidates.length === 0) {
    return {
      kind: 'MANUAL',
      message: result === 'PROVIDER_UNAVAILABLE'
        ? `The map search is unavailable right now. ${PLACE_BY_HAND}`
        : `No matching hospital was found in the service area. ${PLACE_BY_HAND}`,
    };
  }
  const best = result === 'AUTO_SELECTABLE' ? candidates.find((c) => c.candidateId === selectedCandidateId) : undefined;
  if (best && !isRegisteredElsewhere(best, currentHospitalId)) return { kind: 'BEST_MATCH', best, candidates };
  return {
    kind: 'CHOOSE',
    candidates,
    note: best
      ? 'The best match is already registered as another hospital. Pick another result or place the pin yourself.'
      : 'Several places could match. Pick the right one or place the pin yourself; nothing is selected yet.',
  };
}

function isRegisteredElsewhere(candidate: ResolvedCandidate, currentHospitalId?: string | null): boolean {
  return candidate.alreadyRegistered !== null && candidate.alreadyRegistered !== currentHospitalId;
}

/**
 * Whether a candidate's OSM place is already in the registry, from this user's view:
 * NEW, THIS (the hospital being edited), OTHER (a hospital they can open) or HIDDEN
 * (registered, but not visible to them, e.g. another organization's pending one).
 * Only NEW and THIS can be picked: the server refuses the rest (409 DUPLICATE_FACILITY).
 */
export type CandidateRegistration =
  | { kind: 'NEW' }
  | { kind: 'THIS' }
  | { kind: 'OTHER'; id: string; name: string }
  | { kind: 'HIDDEN' };

export function candidateRegistration(
  candidate: Pick<ResolvedCandidate, 'alreadyRegistered'>,
  currentHospitalId: string | null | undefined,
  visible: ReadonlyArray<Pick<Hospital, 'id' | 'name'>>,
): CandidateRegistration {
  const id = candidate.alreadyRegistered;
  if (!id) return { kind: 'NEW' };
  if (id === currentHospitalId) return { kind: 'THIS' };
  const hospital = visible.find((h) => h.id === id);
  return hospital ? { kind: 'OTHER', id, name: hospital.name } : { kind: 'HIDDEN' };
}

/** "93% match" */
export function scorePercent(score: number): string {
  return `${Math.round(score * 100)}% match`;
}

export interface HospitalErrorView {
  message: string;
  /** Present for COORDINATES_LIKELY_SWAPPED: offer "Use suggested coordinates". */
  suggested?: { latitude: number; longitude: number };
}

/** Turns a hospitals API failure into a sentence a dispatcher or admin can act on. */
export function describeHospitalError(err: unknown): HospitalErrorView {
  if (!(err instanceof ApiError)) {
    return { message: err instanceof Error ? err.message : 'Something went wrong.' };
  }
  const body = err.body ?? {};
  switch (body.code) {
    case 'COORDINATES_LIKELY_SWAPPED': {
      const s = body.suggested as { latitude?: unknown; longitude?: unknown } | undefined;
      const suggested = typeof s?.latitude === 'number' && typeof s.longitude === 'number'
        ? { latitude: s.latitude, longitude: s.longitude }
        : undefined;
      return {
        message: suggested
          ? `The latitude and longitude look reversed. Did you mean ${formatCoordinates(suggested.latitude, suggested.longitude)}?`
          : 'The latitude and longitude look reversed.',
        ...(suggested && { suggested }),
      };
    }
    case 'COORDINATES_OUT_OF_SERVICE_AREA':
      return { message: 'This location is outside the AGAP service area (Bulacan). Check the coordinates.' };
    case 'DUPLICATE_FACILITY':
      return {
        message: typeof body.existingName === 'string'
          ? `This hospital is already registered as "${body.existingName}".`
          : 'A matching hospital is already registered.',
      };
    case 'LOCATION_MISSING':
      return { message: 'Set the hospital location before verifying it.' };
  }
  const raw = body.message;
  return { message: Array.isArray(raw) ? raw.join(' ') : err.message || 'Something went wrong.' };
}
