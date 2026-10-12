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
