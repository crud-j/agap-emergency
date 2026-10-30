const redisMock = {
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
};
jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn(() => redisMock) }));

import { readFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { FACILITY_SERVICE_AREA_BOUNDS } from '@agap/shared';
import {
  NominatimGeocodingProvider,
  RequestSpacer,
  toGeocodeCandidate,
} from '../../src/locations/maps/providers/nominatim-geocoding.provider';
import {
  GEOCODE_CACHE_TTL_SECONDS,
  GeocodeCacheService,
  geocodeCacheKey,
} from '../../src/locations/maps/geocode-cache.service';
import { MapsService } from '../../src/locations/maps/maps.service';
import type { GeocodeCandidate, GeocodeSearchQuery } from '../../src/locations/maps/interfaces';

/** Recorded 2026-10-29: one real Nominatim /search for "Joni Villanueva General Hospital". */
const JONI_SEARCH = JSON.parse(
  readFileSync(join(__dirname, '..', 'hospitals', 'fixtures', 'nominatim-search-joni-villanueva.json'), 'utf8'),
);

const config = { get: jest.fn((_key: string, fallback?: string) => fallback) };

const QUERY: GeocodeSearchQuery = {
  text: 'Joni Villanueva General Hospital',
  countryCodes: 'ph',
  viewbox: FACILITY_SERVICE_AREA_BOUNDS,
  bounded: true,
  limit: 5,
};

describe('Nominatim forward search (MOD-39)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('sends the policy-compliant /search query (plan §9.2 step 3)', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: JONI_SEARCH });
    await new NominatimGeocodingProvider(config as any).search(QUERY);

    expect(get).toHaveBeenCalledWith('https://nominatim.openstreetmap.org/search', {
      params: {
        q: 'Joni Villanueva General Hospital',
        format: 'jsonv2',
        addressdetails: 1,
        namedetails: 1,
        'accept-language': 'en',
        limit: 5,
        countrycodes: 'ph',
        viewbox: FACILITY_SERVICE_AREA_BOUNDS.join(','),
        bounded: 1,
      },
      headers: { 'User-Agent': 'AGAP Emergency System (agap@bocaue.gov.ph)' },
      timeout: 5000,
    });
  });

  it('maps the recorded result to a GeocodeCandidate with numeric provider coordinates', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: JONI_SEARCH });
    const [candidate, ...rest] = await new NominatimGeocodingProvider(config as any).search(QUERY);

    expect(rest).toHaveLength(0);
    expect(candidate).toEqual({
      name: 'Joni Villanueva General Hospital',
      displayName: JONI_SEARCH[0].display_name,
      latitude: 14.7968505,
      longitude: 120.9435893,
      category: 'amenity=hospital',
      sourceRef: 'osm:way:1290448946',
      importance: JONI_SEARCH[0].importance,
      address: { municipality: 'Bocaue', province: 'Bulacan' },
    });
  });

  it('skips rows without a point or OSM id, and falls back to the display name', () => {
    expect(toGeocodeCandidate({ ...JONI_SEARCH[0], lat: 'x' })).toBeNull();
    expect(toGeocodeCandidate({ ...JONI_SEARCH[0], osm_id: undefined })).toBeNull();
    expect(toGeocodeCandidate({ ...JONI_SEARCH[0], name: '', namedetails: {} })!.name).toBe(
      JONI_SEARCH[0].display_name.split(',')[0],
    );
  });

  it('throws when the provider fails or answers oddly, so the caller can say PROVIDER_UNAVAILABLE', async () => {
    const provider = new NominatimGeocodingProvider(config as any);
    jest.spyOn(axios, 'get').mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(provider.search(QUERY)).rejects.toThrow('ECONNRESET');
    jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: { error: 'rate limited' } });
    await expect(provider.search(QUERY)).rejects.toThrow('Unexpected Nominatim search response');
  });

  it('spaces searches 1 s apart, while reverse geocoding never waits (incident path)', async () => {
    jest.useFakeTimers();
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: [] });
    const provider = new NominatimGeocodingProvider(config as any);

    await provider.search(QUERY);
    const second = provider.search(QUERY);
    await Promise.resolve();
    expect(get).toHaveBeenCalledTimes(1);

    await provider.reverseGeocode({ lat: 14.79, lng: 120.93 });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1]![0]).toContain('/reverse');

    await jest.advanceTimersByTimeAsync(1000);
    await second;
    expect(get).toHaveBeenCalledTimes(3);
  });
});

describe('RequestSpacer', () => {
  afterEach(() => jest.useRealTimers());

  it('serves callers in order, one interval apart, and counts noted requests', async () => {
    jest.useFakeTimers();
    let now = 0;
    const spacer = new RequestSpacer(1000, () => now);
    const done: number[] = [];

    await spacer.wait();
    const second = spacer.wait().then(() => done.push(2));
    await jest.advanceTimersByTimeAsync(999);
    expect(done).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    await second;
    expect(done).toEqual([2]);

    now = 5000;
    spacer.note();
    const third = spacer.wait().then(() => done.push(3));
    await jest.advanceTimersByTimeAsync(999);
    expect(done).toEqual([2]);
    await jest.advanceTimersByTimeAsync(1);
    await third;
    expect(done).toEqual([2, 3]);
  });
});

describe('Geocode cache (24 h, fails open)', () => {
  const candidate = toGeocodeCandidate(JONI_SEARCH[0]) as GeocodeCandidate;

  beforeEach(() => jest.clearAllMocks());

  it('keys on the normalized text and the search options', () => {
    expect(geocodeCacheKey({ ...QUERY, text: '  joni   VILLANUEVA General hospital ' })).toBe(geocodeCacheKey(QUERY));
    expect(geocodeCacheKey({ ...QUERY, bounded: false })).not.toBe(geocodeCacheKey(QUERY));
  });

  it('stores for 24 h and reads back; a Redis error reads as a miss', async () => {
    const cache = new GeocodeCacheService(config as any);
    redisMock.set.mockResolvedValue('OK');
    await cache.set(QUERY, [candidate]);
    expect(redisMock.set).toHaveBeenCalledWith(geocodeCacheKey(QUERY), JSON.stringify([candidate]), 'EX', GEOCODE_CACHE_TTL_SECONDS);
    expect(GEOCODE_CACHE_TTL_SECONDS).toBe(86_400);

    redisMock.get.mockResolvedValueOnce(JSON.stringify([candidate]));
    await expect(cache.get(QUERY)).resolves.toEqual([candidate]);
    redisMock.get.mockRejectedValueOnce(new Error('Connection is closed.'));
    await expect(cache.get(QUERY)).resolves.toBeNull();
  });

  it('MapsService.search: a hit skips the provider; a miss asks it and caches; a failure caches nothing', async () => {
    const geocoder = { reverseGeocode: jest.fn(), search: jest.fn() };
    const cache = { get: jest.fn(), set: jest.fn() };
    const maps = new MapsService(geocoder as any, {} as any, {} as any, cache as any);

    cache.get.mockResolvedValueOnce([candidate]);
    await expect(maps.search(QUERY)).resolves.toEqual([candidate]);
    expect(geocoder.search).not.toHaveBeenCalled();

    cache.get.mockResolvedValueOnce(null);
    geocoder.search.mockResolvedValueOnce([candidate]);
    await expect(maps.search(QUERY)).resolves.toEqual([candidate]);
    expect(cache.set).toHaveBeenCalledWith(QUERY, [candidate]);

    cache.set.mockClear();
    cache.get.mockResolvedValueOnce(null);
    geocoder.search.mockRejectedValueOnce(new Error('down'));
    await expect(maps.search(QUERY)).rejects.toThrow('down');
    expect(cache.set).not.toHaveBeenCalled();
  });
});
