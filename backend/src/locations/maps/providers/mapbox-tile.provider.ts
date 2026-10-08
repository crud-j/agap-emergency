import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MapProvider, type StaticMapOptions, type MapClientConfig } from '@agap/shared';
import type { TileProvider } from '../interfaces';

/**
 * Mapbox tiles + Static Images API. Uses the public (`pk.*`) token from
 * `MAP_API_KEY`. When no token is configured, static URLs return null and the
 * client is told static maps are unsupported so callers can fall back to a
 * placeholder — the map layer never hard-fails the emergency flow.
 */
@Injectable()
export class MapboxTileProvider implements TileProvider {
  constructor(private readonly config: ConfigService) {}

  private token(): string {
    return this.config.get<string>('MAP_API_KEY') ?? '';
  }

  staticMapUrl(opts: StaticMapOptions): string | null {
    const token = this.token();
    if (!token) return null;
    const { center, zoom = 15, width = 640, height = 360, markers } = opts;
    const pins = (markers?.length ? markers : [center])
      .map((m) => `pin-l+0d605b(${m.lng},${m.lat})`)
      .join(',');
    return (
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pins}/` +
      `${center.lng},${center.lat},${zoom},0/${width}x${height}@2x?access_token=${token}`
    );
  }

  clientConfig(): MapClientConfig {
    const token = this.token();
    return {
      provider: MapProvider.MAPBOX,
      styleUrl: token
        ? `https://api.mapbox.com/styles/v1/mapbox/streets-v12?access_token=${token}`
        : null,
      attribution: '© Mapbox © OpenStreetMap',
      staticMapSupported: Boolean(token),
    };
  }
}
