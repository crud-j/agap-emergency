import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import {
  NominatimGeocodingProvider,
  describeNominatimAddress,
} from '../../src/locations/maps/providers/nominatim-geocoding.provider';

// Address blocks below are real Nominatim /reverse responses for Bocaue points.
const MACARTHUR = {
  road: 'MacArthur Highway',
  quarter: 'Antipona',
  town: 'Bocaue',
  state: 'Bulacan',
  postcode: '3018',
  country: 'Philippines',
};
const SUBDIVISION = {
  residential: 'Villa Zaragosa',
  quarter: 'Biñang 1st',
  town: 'Bocaue',
  state: 'Bulacan',
  country: 'Philippines',
};

describe('describeNominatimAddress (MOD-12)', () => {
  it('keeps the street, not only the barangay', () => {
    expect(describeNominatimAddress(MACARTHUR)).toEqual({
      formattedAddress: 'MacArthur Highway, Antipona, Bocaue, Bulacan',
      barangay: 'Antipona',
      municipality: 'Bocaue',
      province: 'Bulacan',
    });
  });

  it('reads the barangay Nominatim returns as "quarter" in Bocaue', () => {
    expect(describeNominatimAddress(SUBDIVISION).barangay).toBe('Biñang 1st');
  });

  it('keeps the subdivision name', () => {
    expect(describeNominatimAddress(SUBDIVISION).formattedAddress).toBe(
      'Villa Zaragosa, Biñang 1st, Bocaue, Bulacan',
    );
  });

  it('puts a named place and house number first', () => {
    const result = describeNominatimAddress({
      amenity: 'Bocaue Municipal Hall',
      house_number: '12',
      road: 'Governor F. Halili Avenue',
      village: 'Poblacion',
      town: 'Bocaue',
      state: 'Bulacan',
    });
    expect(result.formattedAddress).toBe(
      'Bocaue Municipal Hall, 12 Governor F. Halili Avenue, Poblacion, Bocaue, Bulacan',
    );
    expect(result.barangay).toBe('Poblacion');
  });

  it('does not repeat a name that is both subdivision and barangay', () => {
    const result = describeNominatimAddress({ neighbourhood: 'Lolomboy', town: 'Bocaue', state: 'Bulacan' });
    expect(result.formattedAddress).toBe('Lolomboy, Bocaue, Bulacan');
    expect(result.barangay).toBe('Lolomboy');
  });

  it('falls back to Bocaue, Bulacan when the address is empty', () => {
    expect(describeNominatimAddress({})).toEqual({
      formattedAddress: 'Bocaue, Bulacan',
      barangay: null,
      municipality: 'Bocaue',
      province: 'Bulacan',
    });
  });
});

describe('NominatimGeocodingProvider.reverseGeocode', () => {
  const config = { get: () => 'https://nominatim.test' } as unknown as ConfigService;
  afterEach(() => jest.restoreAllMocks());

  it('returns the street-level address', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { address: MACARTHUR } });
    const result = await new NominatimGeocodingProvider(config).reverseGeocode({ lat: 14.7986, lng: 120.9265 });
    expect(result.formattedAddress).toBe('MacArthur Highway, Antipona, Bocaue, Bulacan');
  });

  it('never throws when the geocoder is down', async () => {
    jest.spyOn(axios, 'get').mockRejectedValue(new Error('timeout'));
    const result = await new NominatimGeocodingProvider(config).reverseGeocode({ lat: 14.7986, lng: 120.9265 });
    expect(result).toEqual({ formattedAddress: null, barangay: null, municipality: 'Bocaue', province: 'Bulacan' });
  });
});
