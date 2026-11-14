import { MapProvider } from '@agap/shared';
import { MapLibreOsmTileProvider } from '../../src/locations/maps/providers/maplibre-osm-tile.provider';
import { MapboxTileProvider } from '../../src/locations/maps/providers/mapbox-tile.provider';

// /locations/map-config: the optional satellite style for the web pin maps (MOD-51).

const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;

describe('map client config: satellite style', () => {
  it('MapLibre returns MAP_SATELLITE_STYLE_URL when set', () => {
    const url = 'https://tiles.example.test/maps/hybrid/style.json?key=test';
    const c = new MapLibreOsmTileProvider(config({ MAP_STYLE_URL: 'https://tiles.example.test/streets.json', MAP_SATELLITE_STYLE_URL: ` ${url} ` })).clientConfig();
    expect(c.provider).toBe(MapProvider.MAPLIBRE);
    expect(c.satelliteStyleUrl).toBe(url);
  });

  it('MapLibre returns null when it is empty or unset', () => {
    expect(new MapLibreOsmTileProvider(config({ MAP_SATELLITE_STYLE_URL: '' })).clientConfig().satelliteStyleUrl).toBeNull();
    expect(new MapLibreOsmTileProvider(config({})).clientConfig().satelliteStyleUrl).toBeNull();
  });

  it('Mapbox never offers one (its styles need the Mapbox SDK)', () => {
    expect(new MapboxTileProvider(config({ MAP_SATELLITE_STYLE_URL: 'https://x.test/s.json' })).clientConfig().satelliteStyleUrl).toBeNull();
  });
});
