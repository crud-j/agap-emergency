import type { RiskMap } from './api';

/**
 * Risk-area pin form helpers (MOD-51, 2026-11-15). Pure: no map library, no requests.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const NUM = String.raw`(-?\d{1,3}\.\d+)`;

/** Map-link patterns, most precise first: a place's own point, then the view centre, then a query. */
const LINK_PATTERNS: RegExp[] = [
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
  new RegExp(String.raw`@${NUM},${NUM}`),
  new RegExp(String.raw`[?&](?:q|query|ll|destination|center)=${NUM},\s*${NUM}`),
];

/** "14.7963, 120.9272", "14.7963 120.9272", "14.7963°N, 120.9272°E". */
const PLAIN = new RegExp(String.raw`^${NUM}\s*°?\s*([NS])?\s*[,;\s]\s*${NUM}\s*°?\s*([EW])?$`, 'i');

const round7 = (n: number) => Math.round(n * 1e7) / 1e7;

/**
 * Coordinates typed or pasted into "Find a place": a plain "lat, lng" pair or a map link
 * (Google Maps and similar). Both numbers need decimals, so a place name with numbers in
 * it is never read as coordinates. "lng, lat" is swapped when it can only be that way
 * round. Rounded to 7 decimals (what the server stores). null = not coordinates.
 * Whether the point is inside Bocaue is the caller's check.
 */
export function parseLatLngText(text: string): LatLng | null {
  let raw = text.trim();
  if (!raw) return null;
  try { raw = decodeURIComponent(raw); } catch { /* keep as typed */ }

  let a: number;
  let b: number;
  const plain = PLAIN.exec(raw);
  if (plain) {
    a = Number(plain[1]) * (plain[2]?.toUpperCase() === 'S' ? -1 : 1);
    b = Number(plain[3]) * (plain[4]?.toUpperCase() === 'W' ? -1 : 1);
  } else {
    const link = LINK_PATTERNS.map((p) => p.exec(raw)).find((m) => m !== null);
    if (!link) return null;
    a = Number(link[1]);
    b = Number(link[2]);
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 && Math.abs(b) <= 90 && Math.abs(a) <= 180) [a, b] = [b, a];
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return { lat: round7(a), lng: round7(b) };
}

/** A one-click shortcut above the pin map. */
export type QuickPick =
  /** A spot where incidents of the chosen type keep happening: clicking pins it. */
  | { kind: 'spot'; lat: number; lng: number; count: number; label: string }
  /** A barangay with flood reports: clicking zooms to it (a flood covers an area). */
  | { kind: 'barangay'; name: string; count: number };

/**
 * The busiest places for the chosen type in the Risk Map data (last 90 days): for FLOOD,
 * the barangays with the most flood reports (floods are counted per barangay); for any
 * other type, the spots with the most reports of that type.
 */
export function quickPicks(map: Pick<RiskMap, 'barangays' | 'points'> | undefined, riskType: string, n = 3): QuickPick[] {
  if (!map) return [];
  if (riskType === 'FLOOD') {
    return map.barangays
      .filter((b) => b.flood_incidents > 0)
      .sort((x, y) => y.flood_incidents - x.flood_incidents || x.name.localeCompare(y.name))
      .slice(0, n)
      .map((b) => ({ kind: 'barangay' as const, name: b.name, count: b.flood_incidents }));
  }
  return map.points
    .filter((p) => p.category === riskType)
    .sort((x, y) => y.incident_count - x.incident_count || y.last_reported_at.localeCompare(x.last_reported_at))
    .slice(0, n)
    .map((p) => ({
      kind: 'spot' as const,
      lat: p.lat,
      lng: p.lng,
      count: p.incident_count,
      label: p.barangay ?? 'Outside barangay lines',
    }));
}
