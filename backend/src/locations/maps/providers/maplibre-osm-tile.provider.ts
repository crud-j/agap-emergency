import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MapProvider, type StaticMapOptions, type MapClientConfig } from '@agap/shared';
import type { TileProvider } from '../interfaces';

/**
 * MapLibre GL against OpenStreetMap / self-hosted vector tiles. The migration
 * target for full data sovereignty and offline bundling. OSM has no first-party
 * static image API, so `staticMapUrl` returns null (clients render a live map
 * instead). Point `MAP_STYLE_URL` at a self-hosted style/TileJSON when ready.
 */
@Injectable()
export class MapLibreOsmTileProvider implements TileProvider {
  constructor(private readonly config: ConfigService) {}

  staticMapUrl(_opts: StaticMapOptions): string | null {
    return null;
  }

  clientConfig(): MapClientConfig {
    const styleUrl =
      this.config.get<string>('MAP_STYLE_URL') || 'https://demotiles.maplibre.org/style.json';
    return {
      provider: MapProvider.MAPLIBRE,
      styleUrl,
      attribution: '© OpenStreetMap contributors',
      staticMapSupported: false,
    };
  }
}
