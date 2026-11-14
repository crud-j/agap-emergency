import type { AreaBoundary, RiskArea, RiskAreaHint } from './api';

/** Pinned risk areas (MOD-51, 2026-11-15): radius limits, same as the server. */
export const MIN_RADIUS_M = 50;
export const MAX_RADIUS_M = 2000;
export const DEFAULT_RADIUS_M = 300;

const EARTH_RADIUS_M = 6_371_008.8;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A circle of `radiusM` metres around a point, as a GeoJSON polygon with `steps` sides
 * (the first vertex repeated at the end). Great-circle offsets, so it matches the server's
 * ST_Buffer on geography to within a few metres at Bocaue's size. No map library needed.
 */
export function circlePolygon(lat: number, lng: number, radiusM: number, steps = 64): AreaBoundary {
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const δ = radiusM / EARTH_RADIUS_M;
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const θ = (2 * Math.PI * i) / steps;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]);
  }
  ring.push(ring[0]!);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Metres between two points (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dφ = toRad(b.lat - a.lat);
  const dλ = toRad(b.lng - a.lng);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** 300 → "300 m", 1500 → "1.5 km". */
export function formatRadius(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  const km = Math.round(m / 100) / 10;
  return `${km % 1 === 0 ? km.toFixed(0) : km} km`;
}

/** "today", "yesterday", "3 days ago", "5 weeks ago", "4 months ago", "over a year ago". */
export function relativeDays(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return 'over a year ago';
}

const LEVEL_WORD: Record<string, string> = { LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High', CRITICAL: 'Critical' };
export const levelWord = (level: string): string => LEVEL_WORD[level] ?? level;

/** The plain sentence a hint strip shows, and the label of the button that applies it. */
export function hintText(hint: RiskAreaHint): { message: string; action: string } {
  if (hint.kind === 'RAISE') {
    return {
      message: `${hint.incidents} incidents here in the last ${hint.windowDays} days. AGAP suggests ${levelWord(hint.suggestedLevel)}.`,
      action: `Raise to ${levelWord(hint.suggestedLevel)}`,
    };
  }
  const months = Math.floor(hint.quietDays / 30);
  return {
    message: `No incidents here for ${months >= 24 ? `${Math.floor(months / 12)} years` : `${months} months`}. Is this area still a risk?`,
    action: 'Deactivate',
  };
}

/** One line describing where an area is: "Pin · 300 m · Lolomboy", "Whole barangay · Bunlo", … */
export function placeLine(area: Pick<RiskArea, 'shape' | 'pin' | 'barangay'>): string {
  const where = area.barangay ?? 'outside barangay lines';
  switch (area.shape) {
    case 'PIN':
      return `Pin · ${formatRadius(area.pin?.radius_m ?? 0)} · ${where}`;
    case 'OUTLINE':
      return `Hotspot outline · ${where}`;
    case 'BARANGAY':
      return `Whole barangay · ${where}`;
    default:
      return 'No place set · not on the map';
  }
}

/** The bounding box [[west, south], [east, north]] of a polygon, for "show on map". */
export function boundaryBounds(boundary: AreaBoundary): [[number, number], [number, number]] {
  const rings = boundary.type === 'Polygon' ? boundary.coordinates : boundary.coordinates.flat();
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return [
    [west, south],
    [east, north],
  ];
}
