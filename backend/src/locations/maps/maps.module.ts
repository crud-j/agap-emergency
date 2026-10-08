import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MapProvider } from '@agap/shared';
import { MapsService } from './maps.service';
import { GEOCODING_PROVIDER, ROUTING_PROVIDER, TILE_PROVIDER } from './maps.tokens';
import { NominatimGeocodingProvider } from './providers/nominatim-geocoding.provider';
import { OsrmRoutingProvider } from './providers/osrm-routing.provider';
import { MapboxRoutingProvider } from './providers/mapbox-routing.provider';
import { MapboxTileProvider } from './providers/mapbox-tile.provider';
import { MapLibreOsmTileProvider } from './providers/maplibre-osm-tile.provider';

/**
 * Wires the active map capability strategies from configuration.
 *
 * - Geocoding defaults to the OSS/OSM stack (Nominatim) for privacy and cost.
 * - Routing follows `MAP_ROUTER`: "osrm" (free, free-flow; default) or "mapbox"
 *   (traffic-aware driving-traffic; needs MAP_API_KEY). OSRM is the fallback.
 * - The tile provider follows `MAP_PROVIDER` (mapbox today; maplibre/osm later).
 *
 * Add new vendors by implementing the interfaces in `./interfaces` and extending
 * the factories below — no consumer changes required.
 */
@Module({
  imports: [ConfigModule],
  providers: [
    MapsService,
    NominatimGeocodingProvider,
    OsrmRoutingProvider,
    MapboxRoutingProvider,
    MapboxTileProvider,
    MapLibreOsmTileProvider,
    { provide: GEOCODING_PROVIDER, useExisting: NominatimGeocodingProvider },
    {
      provide: ROUTING_PROVIDER,
      inject: [ConfigService, OsrmRoutingProvider, MapboxRoutingProvider],
      useFactory: (
        config: ConfigService,
        osrm: OsrmRoutingProvider,
        mapbox: MapboxRoutingProvider,
      ) => {
        const router = (config.get<string>('MAP_ROUTER') ?? 'osrm').toLowerCase();
        const hasToken = Boolean(config.get<string>('MAP_API_KEY'));
        // Traffic-aware Mapbox routing only when explicitly selected AND a token
        // exists; otherwise fall back to the free OSRM default.
        return router === 'mapbox' && hasToken ? mapbox : osrm;
      },
    },
    {
      provide: TILE_PROVIDER,
      inject: [ConfigService, MapboxTileProvider, MapLibreOsmTileProvider],
      useFactory: (
        config: ConfigService,
        mapbox: MapboxTileProvider,
        maplibre: MapLibreOsmTileProvider,
      ) => {
        const provider = (config.get<string>('MAP_PROVIDER') ?? MapProvider.MAPBOX).toLowerCase();
        return provider === MapProvider.MAPLIBRE || provider === 'osm' ? maplibre : mapbox;
      },
    },
  ],
  exports: [MapsService],
})
export class MapsModule {}
