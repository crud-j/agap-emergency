/** A closed polygon ring in GeoJSON `[lng, lat]` order. */
export type LngLatRing = readonly (readonly [number, number])[];

function isPointOnSegment(
  longitude: number,
  latitude: number,
  [x1, y1]: readonly [number, number],
  [x2, y2]: readonly [number, number],
): boolean {
  const cross = (longitude - x1) * (y2 - y1) - (latitude - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-10) return false;
  return (
    longitude >= Math.min(x1, x2) - 1e-10 &&
    longitude <= Math.max(x1, x2) + 1e-10 &&
    latitude >= Math.min(y1, y2) - 1e-10 &&
    latitude <= Math.max(y1, y2) + 1e-10
  );
}

/** Ray-casting point-in-polygon. A point on the boundary counts as inside. */
export function isPointInRing(latitude: number, longitude: number, ring: LngLatRing): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;

    if (isPointOnSegment(longitude, latitude, previousPoint, currentPoint)) {
      return true;
    }

    const crossesLatitude = currentPoint[1] > latitude !== previousPoint[1] > latitude;
    if (
      crossesLatitude &&
      longitude <
        ((previousPoint[0] - currentPoint[0]) * (latitude - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}
