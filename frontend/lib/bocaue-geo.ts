// Tight municipal scope for Bocaue, Bulacan. This is an operational viewport,
// not an official cadastral boundary.
// [west, south, east, north] — MapLibre / GeoJSON order.
export const BOCAUE_BOUNDS: [number, number, number, number] = [120.89, 14.76, 120.97, 14.835];

// [lng, lat] — MapLibre / GeoJSON order (NOT Leaflet's [lat, lng])
export const BOCAUE_CENTER: [number, number] = [120.9272, 14.7963];

export const BOCAUE_DEFAULT_ZOOM = 13;
export const BOCAUE_INCIDENT_ZOOM = 15;
export const BOCAUE_MIN_ZOOM = 12;
export const BOCAUE_MAX_ZOOM = 18;

// Administrative boundary GeoJSON served from frontend/public/assets/geojson.
export const BOCAUE_BOUNDARY_SOURCE = '/assets/geojson/bocaue.geojson';

// Four rectangles dim the map outside the locked Bocaue viewport while leaving
// the operational area clear. The viewport itself remains constrained by
// BOCAUE_BOUNDS.
export const BOCAUE_OUTSIDE_MASK = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[
          [-180, -90], [180, -90], [180, BOCAUE_BOUNDS[1]],
          [-180, BOCAUE_BOUNDS[1]], [-180, -90],
        ]],
      },
    },
    {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[
          [-180, BOCAUE_BOUNDS[3]], [180, BOCAUE_BOUNDS[3]],
          [180, 90], [-180, 90], [-180, BOCAUE_BOUNDS[3]],
        ]],
      },
    },
    {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[
          [-180, BOCAUE_BOUNDS[1]], [BOCAUE_BOUNDS[0], BOCAUE_BOUNDS[1]],
          [BOCAUE_BOUNDS[0], BOCAUE_BOUNDS[3]], [-180, BOCAUE_BOUNDS[3]],
          [-180, BOCAUE_BOUNDS[1]],
        ]],
      },
    },
    {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [[
          [BOCAUE_BOUNDS[2], BOCAUE_BOUNDS[1]], [180, BOCAUE_BOUNDS[1]],
          [180, BOCAUE_BOUNDS[3]], [BOCAUE_BOUNDS[2], BOCAUE_BOUNDS[3]],
          [BOCAUE_BOUNDS[2], BOCAUE_BOUNDS[1]],
        ]],
      },
    },
  ],
};

export function isWithinBocaue(lng: number, lat: number): boolean {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= BOCAUE_BOUNDS[0] &&
    lng <= BOCAUE_BOUNDS[2] &&
    lat >= BOCAUE_BOUNDS[1] &&
    lat <= BOCAUE_BOUNDS[3]
  );
}
