import type { MapClientConfig, RouteResult } from '@agap/shared';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Driving route + ETA between two points for the in-app route line (MOD-43).
 * Returns distance, duration, and the polyline ([lng,lat] pairs). Authenticated.
 */
export async function getRoute(from: LatLng, to: LatLng, token: string): Promise<RouteResult> {
  const res = await fetch(`${API_BASE}/v1/locations/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fromLat: from.lat, fromLng: from.lng, toLat: to.lat, toLng: to.lng }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Fetches the active map provider configuration (provider, style URL,
 * attribution, static-map capability) so the client renders maps without
 * hardcoding a vendor. Guest-accessible. Driven server-side by MAP_PROVIDER.
 */
export async function getMapConfig(token?: string): Promise<MapClientConfig> {
  const res = await fetch(`${API_BASE}/v1/locations/map-config`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
 * Pushes a responder's live position for an incident (MOD-13 / MOD-43). The
 * backend persists it, broadcasts `responder.location_updated` to the citizen's
 * incident room, and refreshes the ETA. Responder role + JWT required.
 */
export async function trackResponderLocation(
  input: TrackLocationInput,
  token: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/locations/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export interface ReverseGeocodeResult {
  formatted_address: string | null;
  barangay: string | null;
  municipality: string | null;
  province: string | null;
}

/**
 * MOD-12 — Location Context and Reverse Geocoding.
 * Resolves a human-readable address for the "Confirm Location" screen.
 * Guest-accessible (no token required) so unauthenticated emergency reporting
 * is never blocked. Best-effort by design — a failure here must never prevent
 * the citizen from continuing with raw GPS coordinates.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  token?: string,
): Promise<ReverseGeocodeResult> {
  const res = await fetch(`${API_BASE}/v1/locations/geocode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ latitude: lat, longitude: lng }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
