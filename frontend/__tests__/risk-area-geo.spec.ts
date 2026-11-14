import {
  boundaryBounds, circlePolygon, distanceM, formatRadius, hintText, placeLine, relativeDays,
} from '@/features/risk/area-geo';

/** MOD-51 pinned risk areas (2026-11-15): the circle, its labels and the hint wording. */

const PIN = { lat: 14.7963, lng: 120.9272 };

describe('circlePolygon', () => {
  it('is a closed ring whose every vertex is the radius away from the pin', () => {
    const poly = circlePolygon(PIN.lat, PIN.lng, 300, 32);
    expect(poly.type).toBe('Polygon');
    const ring = (poly as { coordinates: [number, number][][] }).coordinates[0]!;
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[32]);
    for (const [lng, lat] of ring) {
      expect(Math.abs(distanceM(PIN, { lat, lng }) - 300)).toBeLessThan(0.5);
    }
  });

  it('boundaryBounds wraps the circle', () => {
    const [[west, south], [east, north]] = boundaryBounds(circlePolygon(PIN.lat, PIN.lng, 1000));
    expect(west).toBeLessThan(PIN.lng);
    expect(east).toBeGreaterThan(PIN.lng);
    expect(south).toBeLessThan(PIN.lat);
    expect(north).toBeGreaterThan(PIN.lat);
    // About 1 km each way: 0.009 degrees of latitude.
    expect(north - PIN.lat).toBeCloseTo(0.009, 3);
  });
});

describe('labels', () => {
  it.each([
    [50, '50 m'],
    [300, '300 m'],
    [1000, '1 km'],
    [1500, '1.5 km'],
    [2000, '2 km'],
  ])('formatRadius(%i) = %s', (m, text) => {
    expect(formatRadius(m)).toBe(text);
  });

  it('relativeDays reads naturally', () => {
    const now = new Date('2026-11-15T04:00:00.000Z');
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
    expect(relativeDays(ago(0), now)).toBe('today');
    expect(relativeDays(ago(1), now)).toBe('yesterday');
    expect(relativeDays(ago(3), now)).toBe('3 days ago');
    expect(relativeDays(ago(20), now)).toBe('2 weeks ago');
    expect(relativeDays(ago(100), now)).toBe('3 months ago');
    expect(relativeDays(ago(400), now)).toBe('over a year ago');
  });

  it('placeLine names how and where an area is drawn', () => {
    expect(placeLine({ shape: 'PIN', pin: { lat: 1, lng: 1, radius_m: 300 }, barangay: 'Lolomboy' })).toBe('Pin · 300 m · Lolomboy');
    expect(placeLine({ shape: 'BARANGAY', pin: null, barangay: 'Bunlo' })).toBe('Whole barangay · Bunlo');
    expect(placeLine({ shape: 'OUTLINE', pin: null, barangay: null })).toBe('Hotspot outline · outside barangay lines');
    expect(placeLine({ shape: 'NONE', pin: null, barangay: null })).toBe('No place set · not on the map');
  });
});

describe('hintText', () => {
  it('suggests a raise with the count and the level', () => {
    expect(hintText({ kind: 'RAISE', suggestedLevel: 'HIGH', incidents: 7, windowDays: 90 })).toEqual({
      message: '7 incidents here in the last 90 days. AGAP suggests High.',
      action: 'Raise to High',
    });
  });

  it('asks about a quiet area in months, or years past two', () => {
    expect(hintText({ kind: 'QUIET', quietDays: 400 })).toEqual({
      message: 'No incidents here for 13 months. Is this area still a risk?',
      action: 'Deactivate',
    });
    expect(hintText({ kind: 'QUIET', quietDays: 800 }).message).toBe('No incidents here for 2 years. Is this area still a risk?');
  });
});
