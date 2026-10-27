import { ApiError } from '@/lib/api';
import type { BadgeVariant } from '@/components/ui/badge';
import type { Hospital, HospitalLocationStatus } from './api';

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
