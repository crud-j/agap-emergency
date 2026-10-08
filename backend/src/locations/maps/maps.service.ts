import { Inject, Injectable } from '@nestjs/common';
import type {
  LatLng,
  ReverseGeocodeResult,
  RouteResult,
  StaticMapOptions,
  MapClientConfig,
} from '@agap/shared';
import { GEOCODING_PROVIDER, ROUTING_PROVIDER, TILE_PROVIDER } from './maps.tokens';
import type { GeocodingProvider, RoutingProvider, TileProvider } from './interfaces';

/**
 * The single façade feature code uses for all mapping needs (MOD-11/12/13/43).
 * It delegates to the configured capability strategies, so swapping map vendors
 * is a config/module change — callers never touch a vendor SDK.
 */
@Injectable()
export class MapsService {
  constructor(
    @Inject(GEOCODING_PROVIDER) private readonly geocoder: GeocodingProvider,
    @Inject(ROUTING_PROVIDER) private readonly router: RoutingProvider,
    @Inject(TILE_PROVIDER) private readonly tiles: TileProvider,
  ) {}

  reverseGeocode(point: LatLng): Promise<ReverseGeocodeResult> {
    return this.geocoder.reverseGeocode(point);
  }

  route(from: LatLng, to: LatLng): Promise<RouteResult> {
    return this.router.route(from, to);
  }

  staticMapUrl(opts: StaticMapOptions): string | null {
    return this.tiles.staticMapUrl(opts);
  }

  clientConfig(): MapClientConfig {
    return this.tiles.clientConfig();
  }
}
