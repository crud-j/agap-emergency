import {
  isCoordinateInBocaue,
  isCoordinateInServiceArea,
  looksSwapped,
  toLngLat,
} from '@agap/shared';

describe('facility service area helpers', () => {
  it('converts API coordinates to GeoJSON order', () => {
    expect(toLngLat({ latitude: 14.79679, longitude: 120.94358 })).toEqual([
      120.94358,
      14.79679,
    ]);
  });

  it('accepts the reference hospital and Bocaue scene, but rejects Cebu', () => {
    expect(isCoordinateInServiceArea(14.79679, 120.94358)).toBe(true);
    expect(isCoordinateInServiceArea(14.7969, 120.9268)).toBe(true);
    expect(isCoordinateInServiceArea(10.3157, 123.8854)).toBe(false);
  });

  it('detects likely latitude/longitude swaps', () => {
    expect(looksSwapped(120.94358, 14.79679)).toBe(true);
    expect(looksSwapped(14.79679, 120.94358)).toBe(false);
  });

  it('leaves the strict Bocaue geofence unchanged', () => {
    expect(isCoordinateInBocaue(14.7969, 120.9268)).toBe(true);
  });
});
