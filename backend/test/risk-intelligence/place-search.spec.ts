import { ValidationPipe } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { RiskIntelligenceController } from '../../src/risk-intelligence/risk-intelligence.controller';
import { RiskPlaceSearchService } from '../../src/risk-intelligence/place-search.service';
import { PLACE_RESULTS_MAX, placeArea, tidyPlaceResults } from '../../src/risk-intelligence/place-search';
import { PlaceSearchQuery } from '../../src/risk-intelligence/dto/risk-area.dto';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import type { GeocodeCandidate } from '../../src/locations/maps/interfaces';

// MOD-51 risk-area pin form: "Find a place" (2026-11-15).

/** Inside Bocaue: the public market (from a real Nominatim search). */
const MARKET = { latitude: 14.7977, longitude: 120.9264 };
/** Inside the Bocaue box but outside the municipality: Santa Maria public market. */
const SANTA_MARIA = { latitude: 14.822, longitude: 120.9603 };

function candidate(over: Partial<GeocodeCandidate> = {}): GeocodeCandidate {
  return {
    name: 'Bocaue Public Market',
    displayName: 'Bocaue Public Market, Gov. F. Halili Avenue, Igulot, Bocaue, Bulacan, Central Luzon, 3018, Philippines',
    ...MARKET,
    category: 'amenity=marketplace',
    sourceRef: 'osm:way:1',
    importance: 0.3,
    address: { municipality: 'Bocaue', province: 'Bulacan' },
    ...over,
  };
}

describe('placeArea', () => {
  it('keeps the street and barangay, not the name, town, province, region, postcode or country', () => {
    expect(placeArea('Bocaue Public Market', candidate().displayName)).toBe('Gov. F. Halili Avenue, Igulot');
  });

  it('is empty when only common parts follow the name', () => {
    expect(placeArea('Lolomboy', 'Lolomboy, Bocaue, Bulacan, Central Luzon, Philippines')).toBe('');
  });
});

describe('tidyPlaceResults', () => {
  it('drops places outside the Bocaue polygon (the search box is a rectangle)', () => {
    const out = tidyPlaceResults([candidate(), candidate({ name: 'Santa Maria Public Market', ...SANTA_MARIA })]);
    expect(out).toEqual([{ name: 'Bocaue Public Market', area: 'Gov. F. Halili Avenue, Igulot', lat: MARKET.latitude, lng: MARKET.longitude }]);
  });

  it('keeps one row for the same place listed twice (same name within ~11 m)', () => {
    const bridge = candidate({ name: 'Bocaue River Bridge', displayName: 'Bocaue River Bridge, Bocaue, Bulacan', latitude: 14.7985, longitude: 120.9274 });
    const twin = { ...bridge, sourceRef: 'osm:way:2', latitude: 14.79851, longitude: 120.92742 };
    expect(tidyPlaceResults([bridge, twin])).toHaveLength(1);
  });

  it('keeps different places with the same name', () => {
    const a = candidate({ name: 'Chapel', latitude: 14.8100, longitude: 120.9297 });
    const b = candidate({ name: 'Chapel', latitude: 14.8122, longitude: 120.9412 });
    expect(tidyPlaceResults([a, b])).toHaveLength(2);
  });

  it('names a blank result from its address, or "Unnamed place"', () => {
    const fromAddress = candidate({ name: '  ', displayName: 'Tambubong Church, Tambubong, Bocaue' });
    const nothing = candidate({ name: '', displayName: '', latitude: 14.8103, longitude: 120.9389 });
    expect(tidyPlaceResults([fromAddress, nothing]).map((r) => r.name)).toEqual(['Tambubong Church', 'Unnamed place']);
  });

  it(`shows at most ${PLACE_RESULTS_MAX}`, () => {
    const many = Array.from({ length: 10 }, (_, i) => candidate({ name: `Place ${i}` }));
    expect(tidyPlaceResults(many)).toHaveLength(PLACE_RESULTS_MAX);
  });
});

describe('RiskPlaceSearchService', () => {
  it('searches only the Bocaue box in the Philippines and tidies the results', async () => {
    const maps = { search: jest.fn().mockResolvedValue([candidate(), candidate({ name: 'Santa Maria', ...SANTA_MARIA })]) };
    const service = new RiskPlaceSearchService(maps as any);

    const res = await service.search('public market');

    expect(res).toEqual({ results: [expect.objectContaining({ name: 'Bocaue Public Market' })], unavailable: false });
    const q = maps.search.mock.calls[0][0];
    expect(q).toMatchObject({ text: 'public market', countryCodes: 'ph', bounded: true, limit: 10 });
    const [west, south, east, north] = q.viewbox;
    expect(west).toBeLessThan(MARKET.longitude);
    expect(east).toBeGreaterThan(MARKET.longitude);
    expect(south).toBeLessThan(MARKET.latitude);
    expect(north).toBeGreaterThan(14.844); // the northern tip of Bocaue is searchable
  });

  it('reports a provider failure instead of throwing', async () => {
    const maps = { search: jest.fn().mockRejectedValue(new Error('timeout of 5000ms exceeded')) };
    const service = new RiskPlaceSearchService(maps as any);
    await expect(service.search('market')).resolves.toEqual({ results: [], unavailable: true });
  });
});

describe('PlaceSearchQuery', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validate = (q: object) => pipe.transform(q, { type: 'query', metatype: PlaceSearchQuery });

  it('trims and collapses spaces', async () => {
    await expect(validate({ q: '  public   market ' })).resolves.toMatchObject({ q: 'public market' });
  });

  it('refuses text that is too short (after trimming) or too long', async () => {
    await expect(validate({ q: ' a ' })).rejects.toBeDefined();
    await expect(validate({ q: 'x'.repeat(101) })).rejects.toBeDefined();
    await expect(validate({})).rejects.toBeDefined();
  });
});

describe('GET /risk-intelligence/places', () => {
  const handler = RiskIntelligenceController.prototype.searchPlaces;

  it('is Supervisor only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.SUPERVISOR]);
  });

  it('is limited to 10 a minute, like the hospital "Find location"', () => {
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}sustained`, handler)).toBe(10);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}sustained`, handler)).toBe(60_000);
  });

  it('passes the cleaned text to the search', async () => {
    const places = { search: jest.fn().mockResolvedValue({ results: [], unavailable: false }) };
    const controller = new RiskIntelligenceController({} as any, {} as any, places as any);
    await controller.searchPlaces({ q: 'church' });
    expect(places.search).toHaveBeenCalledWith('church');
  });
});
