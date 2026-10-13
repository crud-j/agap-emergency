import type { MapClientConfig, RouteResult } from '@agap/shared';
import { apiFetch } from './http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Driving route + ETA between two points for the in-app route line (MOD-43). */
export function getRoute(from: LatLng, to: LatLng, token: string): Promise<RouteResult> {
  return apiFetch(`${API_BASE}/v1/locations/route`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng }),
  });
}

/**
 * Fetches the active map provider configuration so the client renders maps
 * without hardcoding a vendor. Guest-accessible.
 */
export function getMapConfig(token?: string): Promise<MapClientConfig> {
  return apiFetch(`${API_BASE}/v1/locations/map-config`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export interface TrackLocationInput {
  incidentId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  speedKmh?: number;
  headingDegrees?: number;
}

/**
 * Pushes a responder's live position (MOD-13 / MOD-43). Best-effort —
 * a tracking failure must never interrupt the responder's workflow.
 */
export function trackResponderLocation(input: TrackLocationInput, token: string): Promise<void> {
  return apiFetch(`${API_BASE}/v1/locations/track`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export interface ReverseGeocodeResult {
  formatted_address: string | null;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
}

/**
 * MOD-12 — Reverse geocoding. Guest-accessible — unauthenticated emergency
 * reporting must never be blocked. Best-effort: a failure must never prevent
 * the citizen from submitting with raw GPS coordinates.
 */
export function reverseGeocode(lat: number, lng: number, token?: string): Promise<ReverseGeocodeResult> {
  return apiFetch(`${API_BASE}/v1/locations/geocode`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify({ latitude: lat, longitude: lng }),
  });
}
