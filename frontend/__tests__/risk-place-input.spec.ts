import { parseLatLngText, quickPicks } from '@/features/risk/place-input';
import type { RiskMapBarangay, RiskMapPoint } from '@/features/risk/api';

// MOD-51 risk-area pin form: pasted coordinates and quick picks (2026-11-15).

describe('parseLatLngText', () => {
  it('reads a plain "lat, lng" pair in the usual forms', () => {
    expect(parseLatLngText('14.7963, 120.9272')).toEqual({ lat: 14.7963, lng: 120.9272 });
    expect(parseLatLngText('  14.7963 120.9272 ')).toEqual({ lat: 14.7963, lng: 120.9272 });
    expect(parseLatLngText('14.7963,120.9272')).toEqual({ lat: 14.7963, lng: 120.9272 });
    expect(parseLatLngText('14.7963°N, 120.9272°E')).toEqual({ lat: 14.7963, lng: 120.9272 });
  });

  it('swaps "lng, lat" when it can only be that way round', () => {
    expect(parseLatLngText('120.9272, 14.7963')).toEqual({ lat: 14.7963, lng: 120.9272 });
  });

  it('reads map links, preferring the place point over the view centre', () => {
    const place =
      'https://www.google.com/maps/place/Bocaue+Public+Market/@14.7970,120.9260,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d14.79771!4d120.92641';
    expect(parseLatLngText(place)).toEqual({ lat: 14.79771, lng: 120.92641 });
    expect(parseLatLngText('https://www.google.com/maps/@14.7963,120.9272,15z')).toEqual({ lat: 14.7963, lng: 120.9272 });
    expect(parseLatLngText('https://www.google.com/maps/search/?api=1&query=14.7963%2C120.9272')).toEqual({ lat: 14.7963, lng: 120.9272 });
    expect(parseLatLngText('https://maps.google.com/?q=14.7963,120.9272')).toEqual({ lat: 14.7963, lng: 120.9272 });
  });

  it('rounds to 7 decimals, as the server stores', () => {
    expect(parseLatLngText('14.796312345, 120.927298765')).toEqual({ lat: 14.7963123, lng: 120.9272988 });
  });

  it('does not read place names, whole numbers or impossible values as coordinates', () => {
    expect(parseLatLngText('Bocaue public market')).toBeNull();
    expect(parseLatLngText('Biñang 1st')).toBeNull();
    expect(parseLatLngText('Purok 5 2')).toBeNull();
    expect(parseLatLngText('14 120')).toBeNull();
    expect(parseLatLngText('95.5, 190.2')).toBeNull();
    expect(parseLatLngText('')).toBeNull();
    expect(parseLatLngText('%E0%A4%A')).toBeNull(); // bad escape: kept as typed, still not coordinates
  });
});

const barangay = (name: string, flood: number): RiskMapBarangay => ({
  name, flood_incidents: flood, boundary: { type: 'Polygon', coordinates: [] },
});
const point = (category: string, count: number, over: Partial<RiskMapPoint> = {}): RiskMapPoint => ({
  category, lat: 14.79, lng: 120.92, incident_count: count, last_reported_at: '2026-11-01T00:00:00Z', barangay: 'Lolomboy', ...over,
});

describe('quickPicks', () => {
  const map = {
    barangays: [barangay('Bunlo', 2), barangay('Lolomboy', 5), barangay('Wakas', 0), barangay('Bambang', 2), barangay('Igulot', 1)],
    points: [
      point('FIRE', 1, { lat: 14.81, barangay: 'Bundukan' }),
      point('FIRE', 4, { lat: 14.82, barangay: null }),
      point('ROAD_ACCIDENT', 9),
      point('FIRE', 2, { lat: 14.83, barangay: 'Biñang 1st' }),
      point('FIRE', 2, { lat: 14.84, barangay: 'Turo', last_reported_at: '2026-11-10T00:00:00Z' }),
    ],
  };

  it('for floods: the barangays with the most flood reports (ties by name), none without reports', () => {
    expect(quickPicks(map, 'FLOOD')).toEqual([
      { kind: 'barangay', name: 'Lolomboy', count: 5 },
      { kind: 'barangay', name: 'Bambang', count: 2 },
      { kind: 'barangay', name: 'Bunlo', count: 2 },
    ]);
  });

  it('for other types: the busiest spots of that type only (ties by latest report)', () => {
    expect(quickPicks(map, 'FIRE')).toEqual([
      { kind: 'spot', lat: 14.82, lng: 120.92, count: 4, label: 'Outside barangay lines' },
      { kind: 'spot', lat: 14.84, lng: 120.92, count: 2, label: 'Turo' },
      { kind: 'spot', lat: 14.83, lng: 120.92, count: 2, label: 'Biñang 1st' },
    ]);
  });

  it('honours n, and is empty without data or reports', () => {
    expect(quickPicks(map, 'FIRE', 1)).toHaveLength(1);
    expect(quickPicks(undefined, 'FIRE')).toEqual([]);
    expect(quickPicks(map, 'MEDICAL')).toEqual([]);
  });

  it('does not reorder the cached Risk Map data', () => {
    const before = map.points.map((p) => p.incident_count);
    quickPicks(map, 'FIRE');
    expect(map.points.map((p) => p.incident_count)).toEqual(before);
  });
});
