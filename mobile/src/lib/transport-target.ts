import { FACILITY_SERVICE_AREA_BOUNDS, isCoordinateInBocaue } from '@agap/shared';
import type {
  DestinationWarning,
  NearbyHospital,
  TransportFacility,
  TransportHospital,
  TransportRecord,
} from '@/src/services/api/transport.api';

export interface LatLngPoint {
  lat: number;
  lng: number;
}

/**
 * Where this crew's route and navigation point right now (plan §15):
 * - SCENE: no transport of this crew is under way; `point` is the scene (may be null).
 * - FACILITY: an open transport whose hospital has coordinates.
 * - NONE: an open transport with no hospital yet or a hospital without coordinates
 *   (`label` is its name when known, for a search hand-off), or arrival is recorded.
 */
export interface RouteTarget {
  kind: 'SCENE' | 'FACILITY' | 'NONE';
  point: LatLngPoint | null;
  label: string | null;
  /** The hospital's location is VERIFIED. Always true for the scene. */
  verified: boolean;
}

export function selectRouteTarget({
  status,
  myTransport,
  scene,
}: {
  /** The incident status. */
  status: string | null | undefined;
  /** This crew's latest transport (open or arrived), if any. */
  myTransport: TransportRecord | null | undefined;
  scene: LatLngPoint | null;
}): RouteTarget {
  if (status !== 'TRANSPORTING' || !myTransport) {
    return { kind: 'SCENE', point: scene, label: null, verified: true };
  }
  if (myTransport.arrived_at) return { kind: 'NONE', point: null, label: null, verified: false };

  const facility = myTransport.facilities;
  if (!facility) return { kind: 'NONE', point: null, label: null, verified: false };
  const verified = facility.location_status === 'VERIFIED';
  if (facility.latitude == null || facility.longitude == null) {
    return { kind: 'NONE', point: null, label: facility.name, verified: false };
  }
  return {
    kind: 'FACILITY',
    point: { lat: Number(facility.latitude), lng: Number(facility.longitude) },
    label: facility.name,
    verified,
  };
}

/** The last incident.transport_updated warning for this crew's dispatch (null = none), with the device time it arrived. */
export interface DestinationNotice {
  warning: DestinationWarning | null;
  receivedAt: number;
}

/**
 * The "hospital deactivated" banner (plan §12): while this crew's transport is open and
 * its hospital is inactive. Read from GET /incidents/:id/transport (`facilities.is_active`,
 * survives a reload) or, until that list is fetched again, from a FACILITY_DEACTIVATED
 * transport_updated, so a failed refetch still warns. A newer fetch is the truth (a
 * reactivation sends no event). The route and destination stay until the crew changes them.
 */
export function isDestinationDeactivated({
  transporting,
  facility,
  notice,
  transportsFetchedAt,
}: {
  transporting: boolean;
  facility: Pick<TransportFacility, 'is_active'> | null | undefined;
  notice: DestinationNotice | null | undefined;
  /** When the transport list was last fetched (ms, device clock). */
  transportsFetchedAt: number;
}): boolean {
  if (!transporting || !facility) return false;
  if (facility.is_active === false) return true;
  return notice?.warning === 'FACILITY_DEACTIVATED' && notice.receivedAt > transportsFetchedAt;
}

/**
 * C17 switch on the transport card: only while this transport is open and the server
 * has reporter sharing switched on (REPORTER_DESTINATION_SHARING_ENABLED). A guest
 * report cannot be told apart here; the API refuses it with a 400 and its message.
 */
export function shouldShowReporterPatientSwitch(transport: TransportRecord | null | undefined): boolean {
  return !!transport && !transport.arrived_at && transport.reporterSharingEnabled === true;
}

export type DestinationOption = TransportHospital & { distanceMeters: number | null };

/**
 * The picker list: the server's nearest-first VERIFIED hospitals (with straight-line
 * distance), then every other selectable hospital alphabetically, so a hospital whose
 * location is not verified yet can still be chosen. PENDING_REVIEW / REJECTED are
 * already hidden by the API; they are dropped again only as a defensive check.
 */
export function buildDestinationList(
  nearby: NearbyHospital[] | null | undefined,
  all: TransportHospital[] | null | undefined,
): DestinationOption[] {
  const selectable = (h: TransportHospital) =>
    h.location_status !== 'PENDING_REVIEW' && h.location_status !== 'REJECTED';
  const first: DestinationOption[] = (nearby ?? []).filter(selectable);
  const seen = new Set(first.map((h) => h.id));
  const rest: DestinationOption[] = (all ?? [])
    .filter((h) => selectable(h) && !seen.has(h.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((h) => ({ ...h, distanceMeters: null }));
  return [...first, ...rest];
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} hr ${mins % 60} min`;
}

// The 120 s "last known" rule and the service-area bounds are shared with the web console.
export { ROUTE_LAST_KNOWN_AFTER_MS, isRouteLastKnown } from '@agap/shared';

/** [west, south, east, north] of the shared service area (Bulacan). */
export const SERVICE_AREA_BOUNDS = FACILITY_SERVICE_AREA_BOUNDS;

/**
 * Whether the map must leave the Bocaue clamp: a destination or route point outside
 * Bocaue (a hospital in Malolos, say) widens the bounds to the service area.
 */
export function needsServiceAreaBounds(points: LatLngPoint[]): boolean {
  return points.some((p) => !isCoordinateInBocaue(p.lat, p.lng));
}
