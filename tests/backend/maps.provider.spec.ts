import 'reflect-metadata';
import type { ConfigService } from '@nestjs/config';
import { MapProvider } from '@agap/shared';
import { MapboxTileProvider } from '@backend/locations/maps/providers/mapbox-tile.provider';
import { MapLibreOsmTileProvider } from '@backend/locations/maps/providers/maplibre-osm-tile.provider';

/** Minimal ConfigService stub backed by a plain record. */
function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('MapboxTileProvider', () => {
  it('builds a static image URL with a teal pin at the center', () => {
    const provider = new MapboxTileProvider(makeConfig({ MAP_API_KEY: 'pk.test' }));
    const url = provider.staticMapUrl({ center: { lat: 14.7969, lng: 120.9268 } });

    expect(url).toContain('api.mapbox.com/styles/v1/mapbox/streets-v12/static');
    expect(url).toContain('pin-l+0d605b(120.9268,14.7969)');
    expect(url).toContain('access_token=pk.test');
  });

  it('returns null static URL when no token is configured (never hard-fails)', () => {
    const provider = new MapboxTileProvider(makeConfig({}));
    expect(provider.staticMapUrl({ center: { lat: 14.8, lng: 120.9 } })).toBeNull();
  });

  it('reports a mapbox client config, static supported only with a token', () => {
    expect(new MapboxTileProvider(makeConfig({ MAP_API_KEY: 'pk.x' })).clientConfig()).toMatchObject({
      provider: MapProvider.MAPBOX,
      staticMapSupported: true,
    });
    expect(new MapboxTileProvider(makeConfig({})).clientConfig()).toMatchObject({
      provider: MapProvider.MAPBOX,
      styleUrl: null,
      staticMapSupported: false,
    });
  });
});

describe('MapLibreOsmTileProvider', () => {
  it('has no static image API and falls back to a default style', () => {
    const provider = new MapLibreOsmTileProvider(makeConfig({}));
    expect(provider.staticMapUrl({ center: { lat: 14.8, lng: 120.9 } })).toBeNull();
    expect(provider.clientConfig()).toMatchObject({
      provider: MapProvider.MAPLIBRE,
      styleUrl: 'https://demotiles.maplibre.org/style.json',
      staticMapSupported: false,
    });
  });

  it('uses a configured self-hosted style URL when provided', () => {
    const provider = new MapLibreOsmTileProvider(
      makeConfig({ MAP_STYLE_URL: 'https://tiles.bocaue.gov.ph/style.json' }),
    );
    expect(provider.clientConfig().styleUrl).toBe('https://tiles.bocaue.gov.ph/style.json');
  });
});
