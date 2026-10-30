/**
 * Provider-agnostic map contract shared across backend, frontend, and mobile.
 *
 * Only DATA shapes live here — provider *behaviour* (the service interfaces and
 * concrete vendor adapters) lives in the backend `locations/maps` module. This
 * split lets any surface swap map vendors behind the `MAP_PROVIDER` env var
 * without feature code importing a vendor SDK directly.
 *
 * AGAP's default stack is an OSS-first hybrid: Mapbox hosted tiles (today),
 * OpenStreetMap/Nominatim reverse geocoding (MOD-12), and OSRM routing for ETA
 * (MOD-43). Each capability is selectable independently.
 */

export enum MapProvider {
  /** Mapbox hosted tiles / Static Images API (default today). */
  MAPBOX = 'mapbox',
  /** MapLibre GL against OpenStreetMap / self-hosted vector tiles. */
  MAPLIBRE = 'maplibre',
  /** Google Maps platform — reserved; not AGAP's default (cost + privacy). */
  GOOGLE = 'google',
}

export interface LatLng {
  lat: number;
  lng: number;
}

/** The only place API coordinates become GeoJSON order. */
export function toLngLat(p: { latitude: number; longitude: number }): [number, number] {
  return [p.longitude, p.latitude];
}

/** Normalised reverse-geocoding result (MOD-12). */
export interface ReverseGeocodeResult {
  formattedAddress: string | null;
  barangay: string | null;
  municipality: string;
  province: string;
  /** Raw provider payload for debugging/audit — never surfaced to citizens. */
  raw?: unknown;
}

/** Normalised routing result (MOD-43). ETA is ALWAYS an estimate (Rule 13). */
export interface RouteResult {
  distanceMeters: number | null;
  durationSeconds: number | null;
  isEstimate: true;
  /** Decoded route polyline as [lng, lat] pairs, for drawing an in-app route line. */
  geometry?: Array<[number, number]>;
}

/** Which stretch of a dispatch the unit is on (MOD-40/43): scene, hospital, or arrived. */
export type TransportLeg = 'TO_SCENE' | 'TO_FACILITY' | 'AT_FACILITY';

/** A transport destination as clients draw it. Coordinates are null until the hospital has a location. */
export interface TransportDestinationView {
  kind: 'FACILITY';
  name: string;
  latitude: number | null;
  longitude: number | null;
  locationVerified: boolean;
}

/** A server-computed route for one leg. ETA is always an estimate (Rule 13). */
export interface RouteSnapshot {
  /** [lng, lat] pairs (GeoJSON order). */
  geometry: [number, number][];
  distanceMeters: number | null;
  durationSeconds: number | null;
  isEstimate: true;
  calculatedAt: string;
  /** True when the route could not be refreshed and this is the last known one. */
  stale: boolean;
}

/** A route older than this is "last known": drawn dimmed and labelled (plan §13.2/§19). */
export const ROUTE_LAST_KNOWN_AFTER_MS = 120_000;

/** True when the server marked the route stale or it was calculated over 120 s ago. */
export function isRouteLastKnown(route: RouteSnapshot | null | undefined, now: number = Date.now()): boolean {
  if (!route) return false;
  if (route.stale) return true;
  const at = Date.parse(route.calculatedAt);
  return Number.isFinite(at) && now - at > ROUTE_LAST_KNOWN_AFTER_MS;
}

/** Options for building a non-interactive static map image (e.g. SOS confirm). */
export interface StaticMapOptions {
  center: LatLng;
  zoom?: number;
  width?: number;
  height?: number;
  /** Pin locations; when omitted the center point is pinned. */
  markers?: LatLng[];
}

/**
 * Safe, non-secret map configuration a client needs to render an interactive
 * map. NEVER include server-only secrets here — `styleUrl` may embed a public
 * (`pk.*`) token only, which is already shipped to clients by design.
 */
export interface MapClientConfig {
  provider: MapProvider;
  /** Style / TileJSON URL for MapLibre or Mapbox GL; null if client supplies its own. */
  styleUrl: string | null;
  attribution: string;
  /** Whether the backend can produce static map image URLs for this provider. */
  staticMapSupported: boolean;
  /** True when the active tile style has OpenMapTiles-format building height data,
   *  enabling the fill-extrusion 3D buildings layer in the mobile map. */
  supports3dBuildings: boolean;
}
