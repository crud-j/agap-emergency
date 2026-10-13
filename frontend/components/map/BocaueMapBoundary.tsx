'use client';

import L from 'leaflet';
import type { JSX } from 'react';
import { Polygon } from 'react-leaflet';
import { BOCAUE_BOUNDARY, BOCAUE_BOUNDARY_BOUNDS } from '@agap/shared';

export const BOCAUE_CENTER: [number, number] = [14.7969, 120.9268];
export const BOCAUE_MAP_BOUNDS = L.latLngBounds(
  [BOCAUE_BOUNDARY_BOUNDS.south, BOCAUE_BOUNDARY_BOUNDS.west],
  [BOCAUE_BOUNDARY_BOUNDS.north, BOCAUE_BOUNDARY_BOUNDS.east],
);

const BOCAUE_RING: [number, number][] = BOCAUE_BOUNDARY.map(([longitude, latitude]) => [
  latitude,
  longitude,
]);

const MASK_PADDING = 0.2;
const MAP_MASK_BOUNDS: [number, number][] = [
  [BOCAUE_BOUNDARY_BOUNDS.south - MASK_PADDING, BOCAUE_BOUNDARY_BOUNDS.west - MASK_PADDING],
  [BOCAUE_BOUNDARY_BOUNDS.south - MASK_PADDING, BOCAUE_BOUNDARY_BOUNDS.east + MASK_PADDING],
  [BOCAUE_BOUNDARY_BOUNDS.north + MASK_PADDING, BOCAUE_BOUNDARY_BOUNDS.east + MASK_PADDING],
  [BOCAUE_BOUNDARY_BOUNDS.north + MASK_PADDING, BOCAUE_BOUNDARY_BOUNDS.west - MASK_PADDING],
];

export function BocaueMapBoundary(): JSX.Element {
  return (
    <>
      <Polygon
        positions={[MAP_MASK_BOUNDS, BOCAUE_RING]}
        interactive={false}
        pathOptions={{ stroke: false, fillColor: '#F2F5F8', fillOpacity: 1, fillRule: 'evenodd' }}
      />
      <Polygon
        positions={[BOCAUE_RING]}
        interactive={false}
        pathOptions={{ color: '#0D6053', weight: 3, fillOpacity: 0 }}
      />
    </>
  );
}

export const BOCAUE_MAP_OPTIONS = {
  minZoom: 13,
  maxZoom: 18,
  maxBounds: BOCAUE_MAP_BOUNDS,
  maxBoundsViscosity: 1,
} as const;
