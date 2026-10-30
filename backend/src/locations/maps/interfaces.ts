import type {
  LatLng,
  ReverseGeocodeResult,
  RouteResult,
  StaticMapOptions,
  MapClientConfig,
} from '@agap/shared';

/**
 * The three map capabilities AGAP depends on, each independently swappable.
 * Concrete adapters live in `./providers`; the active implementation is chosen
 * in `maps.module.ts` from configuration.
 */

/** Forward search for a named place (MOD-39 "Find location"). */
export interface GeocodeSearchQuery {
  text: string;
  /** ISO 3166-1 alpha-2 codes, comma-separated (e.g. 'ph'). */
  countryCodes?: string;
  /** [west, south, east, north]: prefer (or with `bounded`, restrict to) this box. */
  viewbox?: [number, number, number, number];
  bounded?: boolean;
  limit?: number;
}

/** One provider result. Its coordinates are the provider's, never computed or AI-made. */
export interface GeocodeCandidate {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  /** 'key=value' of the main tag, e.g. 'amenity=hospital'. */
  category: string;
  /** Stable provider reference, e.g. 'osm:way:123' (facilities.location_source_ref). */
  sourceRef: string;
  /** Provider's own 0–1 prominence. */
  importance: number;
  address: { municipality?: string; province?: string };
}

export interface GeocodingProvider {
  /** MOD-12 — resolve a human-readable address + barangay for a point. */
  reverseGeocode(point: LatLng): Promise<ReverseGeocodeResult>;
  /** MOD-39 — candidates for a typed name/address. Throws when the provider fails, so callers can tell "none" from "down". */
  search(query: GeocodeSearchQuery): Promise<GeocodeCandidate[]>;
}

export interface RoutingProvider {
  /** MOD-43 — driving route used for ETA. Result is always an estimate. */
  route(from: LatLng, to: LatLng): Promise<RouteResult>;
}

export interface TileProvider {
  /** Static map image URL for non-interactive previews, or null if unsupported. */
  staticMapUrl(opts: StaticMapOptions): string | null;
  /** Safe, non-secret config a client needs to render an interactive map. */
  clientConfig(): MapClientConfig;
}
