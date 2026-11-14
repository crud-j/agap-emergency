import { isCoordinateInBocaue } from '@agap/shared';
import type { GeocodeCandidate } from '../locations/maps/interfaces';

/** One "Find a place" result for the risk-area pin form (MOD-51). */
export interface PlaceResult {
  name: string;
  /** Up to two address parts after the name (street, barangay); '' when there are none. */
  area: string;
  lat: number;
  lng: number;
}

export interface PlaceSearchResponse {
  results: PlaceResult[];
  /** true = the map search could not be reached; the form says to use another way. */
  unavailable: boolean;
}

/** Results shown to the Supervisor. */
export const PLACE_RESULTS_MAX = 6;

/** Address parts every Bocaue result shares; they say nothing about where in Bocaue. */
const COMMON_PARTS = new Set(['bocaue', 'bulacan', 'central luzon', 'philippines', 'pilipinas']);
const POSTCODE = /^\d{4}$/;

/** "Gov. F. Halili Avenue, Igulot" from "Bocaue Public Market, Gov. F. Halili Avenue, Igulot, Bocaue, Bulacan, …". */
export function placeArea(name: string, displayName: string): string {
  const own = name.trim().toLowerCase();
  return displayName
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '' && p.toLowerCase() !== own && !COMMON_PARTS.has(p.toLowerCase()) && !POSTCODE.test(p))
    .slice(0, 2)
    .join(', ');
}

/**
 * Geocoder candidates → what the pin form lists: only points inside the Bocaue polygon
 * (the search box is a rectangle, so neighbours such as Santa Maria come back too), a
 * name for every row, and one row per place (OSM often has the same bridge twice).
 */
export function tidyPlaceResults(candidates: GeocodeCandidate[], max = PLACE_RESULTS_MAX): PlaceResult[] {
  const seen = new Set<string>();
  const out: PlaceResult[] = [];
  for (const c of candidates) {
    if (!isCoordinateInBocaue(c.latitude, c.longitude)) continue;
    const name = c.name.trim() || c.displayName.split(',')[0]?.trim() || 'Unnamed place';
    const key = `${name.toLowerCase()}|${c.latitude.toFixed(4)}|${c.longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, area: placeArea(name, c.displayName), lat: c.latitude, lng: c.longitude });
    if (out.length >= max) break;
  }
  return out;
}
