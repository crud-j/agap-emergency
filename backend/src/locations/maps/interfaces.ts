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

export interface GeocodingProvider {
  /** MOD-12 — resolve a human-readable address + barangay for a point. */
  reverseGeocode(point: LatLng): Promise<ReverseGeocodeResult>;
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
