import type { LngLatBounds } from '@maplibre/maplibre-react-native';

// Tight municipal scope for Bocaue, Bulacan. GADM-verified extent is
// [120.9159, 14.7642, 120.9746, 14.8290]; these bounds pad it just enough to keep
// the outer barangays framed (Batia NW, Bolacan/Bundukan SE) while locking panning
// to the municipality. v11 LngLatBounds is [west, south, east, north] — equivalent
// to SW=[120.885, 14.755] and NE=[120.965, 14.835].
export const BOCAUE_BOUNDS: LngLatBounds = [
  120.885, // west  (SW lng)
  14.755,  // south (SW lat)
  120.965, // east  (NE lng)
  14.835,  // north (NE lat)
];

// Default focal point — core center of Bocaue.
export const BOCAUE_CENTER: [number, number] = [120.931, 14.798];

export const BOCAUE_DEFAULT_ZOOM = 13;
export const BOCAUE_INCIDENT_ZOOM = 15;

// Camera zoom clamps shared by every <Map> (passed to <Camera>). 12.5 keeps the
// whole municipality in frame so it never shrinks to a speck; 18.5 allows barangay
// street-level detail.
export const BOCAUE_MIN_ZOOM = 12.5;
export const BOCAUE_MAX_ZOOM = 18.5;

// On-device fallback style used when the backend map-config is unreachable or
// returns no styleUrl. OpenFreeMap Liberty is a keyless, unrestricted, MapLibre-
// native vector style (OpenMapTiles schema → real streets at municipal zoom and
// 3D building heights). The maplibre.org demo tiles were near-empty at Bocaue
// zoom levels, which made a working map look blank.
export const FALLBACK_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export const BOCAUE_BARANGAYS = [
  'Antipona', 'Bagumbayan', 'Bambang', 'Batia',
  'Biñang 1st', 'Biñang 2nd', 'Bolacan', 'Bundukan',
  'Bunlo', 'Caingin', 'Duhat', 'Igulot',
  'Lolomboy', 'Poblacion', 'Sulucan', 'Taal',
  'Tambobong', 'Turo', 'Wakas',
] as const;

export type BocaueBarangay = typeof BOCAUE_BARANGAYS[number];
