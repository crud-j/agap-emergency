import { FACILITY_SERVICE_AREA } from './service-area.data';
import { isPointInRing, type LngLatRing } from './polygon';

export { FACILITY_SERVICE_AREA, FACILITY_SERVICE_AREA_SOURCE } from './service-area.data';

/**
 * Where receiving facilities and in-transport responder fixes may be. Wider than the
 * strict Bocaue incident geofence (`isCoordinateInBocaue`), which stays unchanged.
 * `extraPolygons` lets the backend add referral corridors from config.
 */
export function isCoordinateInServiceArea(
  latitude: number,
  longitude: number,
  extraPolygons: readonly LngLatRing[] = [],
): boolean {
  return (
    isPointInRing(latitude, longitude, FACILITY_SERVICE_AREA) ||
    extraPolygons.some((polygon) => isPointInRing(latitude, longitude, polygon))
  );
}

/** True when the pair is outside the service area but would be inside with lat/lng swapped. */
export function looksSwapped(latitude: number, longitude: number): boolean {
  return (
    !isCoordinateInServiceArea(latitude, longitude) &&
    isCoordinateInServiceArea(longitude, latitude)
  );
}
