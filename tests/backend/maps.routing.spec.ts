import 'reflect-metadata';
import type { ConfigService } from '@nestjs/config';
import { MapboxRoutingProvider } from '@backend/locations/maps/providers/mapbox-routing.provider';

// axios isn't a direct dependency of the tests package, so mock it via a factory
// (avoids importing its types) — the provider imports the default export.
jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
const mockedAxios = (jest.requireMock('axios') as { default: { get: jest.Mock } }).default;

/** Minimal ConfigService stub backed by a plain record. */
function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('MapboxRoutingProvider', () => {
  const from = { lat: 14.8, lng: 120.92 };
  const to = { lat: 14.79, lng: 120.93 };

  afterEach(() => jest.clearAllMocks());

  it('requests the driving-traffic profile with geometry and rounds duration/distance', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { code: 'Ok', routes: [{ duration: 612.4, distance: 3450.8 }] },
    });
    const provider = new MapboxRoutingProvider(makeConfig({ MAP_API_KEY: 'pk.test' }));

    const result = await provider.route(from, to);

    expect(result).toEqual({ distanceMeters: 3451, durationSeconds: 612, isEstimate: true });

    const call = mockedAxios.get.mock.calls[0]!;
    const [url, opts] = call as [string, { params?: Record<string, unknown> }];
    expect(url).toContain('/directions/v5/mapbox/driving-traffic/120.92,14.8;120.93,14.79');
    expect(opts?.params).toMatchObject({
      access_token: 'pk.test',
      overview: 'full',
      geometries: 'geojson',
    });
  });

  it('includes the route polyline when the provider returns geometry', async () => {
    const coordinates = [
      [120.92, 14.8],
      [120.925, 14.795],
      [120.93, 14.79],
    ];
    mockedAxios.get.mockResolvedValue({
      data: { code: 'Ok', routes: [{ duration: 600, distance: 3000, geometry: { type: 'LineString', coordinates } }] },
    });
    const provider = new MapboxRoutingProvider(makeConfig({ MAP_API_KEY: 'pk.test' }));

    const result = await provider.route(from, to);

    expect(result.geometry).toEqual(coordinates);
  });

  it('returns nulls (never throws) when the request fails — a failed ETA must not stop dispatch', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network down'));
    const provider = new MapboxRoutingProvider(makeConfig({ MAP_API_KEY: 'pk.test' }));

    await expect(provider.route(from, to)).resolves.toEqual({
      distanceMeters: null,
      durationSeconds: null,
      isEstimate: true,
    });
  });

  it('skips the call and returns nulls when no token is configured', async () => {
    const provider = new MapboxRoutingProvider(makeConfig({}));

    const result = await provider.route(from, to);

    expect(result).toEqual({ distanceMeters: null, durationSeconds: null, isEstimate: true });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});
