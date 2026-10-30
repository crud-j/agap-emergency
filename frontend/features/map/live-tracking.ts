import {
  isCoordinateInServiceArea,
  type IncidentTransportUpdatedPayload,
  type ResponderEtaUpdatedPayload,
  type ResponderLocationUpdatedPayload,
  type ResponderRouteUpdatedPayload,
  type RouteSnapshot,
  type TransportDestinationView,
  type TransportLeg,
} from '@agap/shared';
import { isWithinBocaue } from '@/lib/bocaue-geo';
import type { LatestUnitPosition, LiveResponderPosition } from './api';

/**
 * Pure live-tracking rules for the dispatch dashboard (WP5). Kept free of React
 * so the socket merge, staleness and ETA wording can be unit-tested.
 */

/** Dispatch statuses that still need the dashboard's attention. */
export const OPEN_DISPATCH_STATUSES = ['PENDING', 'SENT', 'ACCEPTED'] as const;

function sameUnit(row: LiveResponderPosition, p: ResponderLocationUpdatedPayload): boolean {
  // One marker per dispatch (crew phones collapse onto their unit); fall back to
  // the responder id for payloads from older backends without dispatchId.
  if (p.dispatchId && row.dispatchId) return row.dispatchId === p.dispatchId;
  return row.responderId === p.responderId;
}

/**
 * Applies buffered `responder.location_updated` payloads to the
 * ['live-responders'] cache. `sawUnknown` tells the caller to refetch the REST
 * seed so a unit first seen over the socket gets its name and unit details.
 */
export function mergeResponderLocations(
  old: LiveResponderPosition[] | undefined,
  payloads: Iterable<ResponderLocationUpdatedPayload>,
): { next: LiveResponderPosition[]; sawUnknown: boolean } {
  let next = old ? [...old] : [];
  let sawUnknown = false;

  for (const p of payloads) {
    const patch: Partial<LiveResponderPosition> & Pick<LiveResponderPosition, 'responderId'> = {
      responderId: p.responderId,
      lat: p.lat,
      lng: p.lng,
      heading: p.heading ?? null,
      speed: p.speed ?? null,
      updated_at: p.updatedAt,
      ...(p.incidentId ? { incident_id: p.incidentId } : {}),
      ...(p.dispatchId ? { dispatchId: p.dispatchId } : {}),
      ...(p.callSign !== undefined ? { call_sign: p.callSign } : {}),
    };
    const idx = next.findIndex((r) => sameUnit(r, p));
    if (idx === -1) {
      sawUnknown = true;
      next = [
        ...next,
        { responder_name: null, resource_name: null, incident_id: p.incidentId ?? null, ...patch } as LiveResponderPosition,
      ];
    } else {
      next = next.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    }
  }
  return { next, sawUnknown };
}

/** Patches one unit's ETA in the ['incident-units', incidentId] cache. */
export function applyEtaUpdate(
  units: LatestUnitPosition[] | undefined,
  payload: ResponderEtaUpdatedPayload,
): LatestUnitPosition[] | undefined {
  if (!units) return units;
  return units.map((u) =>
    u.dispatchId === payload.dispatchId
      ? { ...u, eta: { seconds: payload.etaSeconds, isEstimate: true, calculatedAt: payload.calculatedAt } }
      : u,
  );
}

/**
 * `responder.route_updated`: the unit's leg, destination and server route replace the
 * cached ones in ['incident-units', incidentId]. A unit not seeded yet is added
 * without a position; the next REST seed fills in its name.
 */
export function applyRouteUpdate(
  units: LatestUnitPosition[] | undefined,
  payload: ResponderRouteUpdatedPayload,
): LatestUnitPosition[] | undefined {
  if (!units) return units;
  const patch = { leg: payload.leg, destination: payload.destination, route: payload.route };
  if (!units.some((u) => u.dispatchId === payload.dispatchId)) {
    return [
      ...units,
      {
        dispatchId: payload.dispatchId,
        callSign: null,
        unitName: null,
        resourceType: null,
        position: null,
        eta: { seconds: null, isEstimate: true, calculatedAt: null },
        ...patch,
      },
    ];
  }
  return units.map((u) => (u.dispatchId === payload.dispatchId ? { ...u, ...patch } : u));
}

function sameHospital(a: TransportDestinationView | null | undefined, b: TransportDestinationView | null | undefined): boolean {
  return !!a && !!b && a.name === b.name && a.latitude === b.latitude && a.longitude === b.longitude;
}

/** The ops copy carries the facility id; the cache keeps the same shape as GET …/latest. */
function destinationView(destination: IncidentTransportUpdatedPayload['destination']): TransportDestinationView | null {
  if (!destination) return null;
  const { id: _id, ...view } = destination;
  return view;
}

/**
 * `incident.transport_updated`: the hospital of that dispatch's transport changed. The
 * destination is patched and the unit is on the hospital leg; a route to a different
 * hospital is dropped (the next route_updated brings the new one).
 */
export function applyTransportUpdate(
  units: LatestUnitPosition[] | undefined,
  payload: IncidentTransportUpdatedPayload,
): LatestUnitPosition[] | undefined {
  if (!units) return units;
  const destination = destinationView(payload.destination);
  return units.map((u) => {
    if (u.dispatchId !== payload.dispatchId) return u;
    const keepRoute = sameHospital(u.destination, destination);
    return { ...u, leg: 'TO_FACILITY', destination, ...(keepRoute ? {} : { route: null }) };
  });
}

export interface TransportNotice {
  title: string;
  description?: string;
  variant: 'default' | 'warning';
}

/**
 * Toasts for one `incident.transport_updated`, read from the caches *before* the patch:
 * "Destination changed: A → B" (old name from the unit cache, else the transport list),
 * "Destination set: B" when there was none, nothing for a hospital that only moved, and
 * a warning for FACILITY_DEACTIVATED / FACILITY_AT_CAPACITY. Transport always continues.
 */
export function transportUpdateNotices(
  payload: IncidentTransportUpdatedPayload,
  previous: {
    units: LatestUnitPosition[] | undefined;
    transports: ReadonlyArray<{ id: string; facilities: { name: string } | null }> | undefined;
  },
): TransportNotice[] {
  const next = payload.destination?.name ?? null;
  const oldName =
    previous.units?.find((u) => u.dispatchId === payload.dispatchId)?.destination?.name ??
    previous.transports?.find((t) => t.id === payload.transportId)?.facilities?.name ??
    null;
  const callSign = previous.units?.find((u) => u.dispatchId === payload.dispatchId)?.callSign ?? null;
  const unit = callSign ? { description: `Unit ${callSign}` } : {};

  const notices: TransportNotice[] = [];
  if (next && oldName !== next) {
    notices.push({
      title: oldName ? `Destination changed: ${oldName} → ${next}` : `Destination set: ${next}`,
      ...unit,
      variant: 'default',
    });
  }
  const name = next ?? oldName ?? 'The destination hospital';
  if (payload.destinationWarning === 'FACILITY_DEACTIVATED') {
    notices.push({
      title: `${name} was deactivated`,
      description: 'The transport continues. Change the destination if the crew needs another hospital.',
      variant: 'warning',
    });
  } else if (payload.destinationWarning === 'FACILITY_AT_CAPACITY') {
    notices.push({
      title: `${name} is at capacity or closed`,
      description: 'The transport continues. Confirm with the hospital or change the destination.',
      variant: 'warning',
    });
  }
  return notices;
}

export interface LegChip {
  leg: TransportLeg;
  /** "To scene", "To hospital · {name}", "To hospital", "At hospital · {name}". */
  label: string;
}

/** The leg chip on the ETA pill, unit popup and ops-map list rows. A unit without a leg yet is on the scene leg. */
export function legChip(unit: Pick<LatestUnitPosition, 'leg' | 'destination'> | null | undefined): LegChip {
  const leg = unit?.leg ?? 'TO_SCENE';
  const name = unit?.destination?.name;
  if (leg === 'TO_FACILITY') return { leg, label: name ? `To hospital · ${name}` : 'To hospital' };
  if (leg === 'AT_FACILITY') return { leg, label: name ? `At hospital · ${name}` : 'At hospital' };
  return { leg, label: 'To scene' };
}

export interface UnitRoutePlan {
  leg: TransportLeg;
  /** The server route for the current leg, when it has a line. */
  server: RouteSnapshot | null;
  /** Where the client route (fallback) goes while `server` is null: scene or hospital; null = draw none. */
  fallbackTo: { lat: number; lng: number } | null;
}

/**
 * Which route the dispatcher sees for one unit (plan §16.1): the server route for its
 * current leg, else the client route to the leg's target (the scene, or the hospital
 * when it has coordinates). Nothing after arrival (AT_FACILITY).
 */
export function unitRoutePlan(
  unit: Pick<LatestUnitPosition, 'leg' | 'destination' | 'route'> | null | undefined,
  scene: { lat: number; lng: number } | null,
): UnitRoutePlan {
  const leg = unit?.leg ?? 'TO_SCENE';
  const server = unit?.route && unit.route.geometry.length > 1 ? unit.route : null;
  if (server || leg === 'AT_FACILITY') return { leg, server, fallbackTo: null };
  if (leg === 'TO_FACILITY') {
    const d = unit?.destination;
    return { leg, server, fallbackTo: d && d.latitude != null && d.longitude != null ? { lat: d.latitude, lng: d.longitude } : null };
  }
  return { leg, server, fallbackTo: scene };
}

/**
 * Hospitals the units are heading to or are at, for the map (one marker per hospital).
 * The tracking payload has no facility id, so a hospital is keyed by name and point.
 */
export function destinationFacilities(
  units: ReadonlyArray<Pick<LatestUnitPosition, 'leg' | 'destination'>> | undefined,
): Array<{ id: string; name: string; latitude: number; longitude: number; verified: boolean; destination: true }> {
  const out = new Map<string, { id: string; name: string; latitude: number; longitude: number; verified: boolean; destination: true }>();
  for (const u of units ?? []) {
    const d = u.destination;
    if ((u.leg !== 'TO_FACILITY' && u.leg !== 'AT_FACILITY') || !d || d.latitude == null || d.longitude == null) continue;
    const id = `destination:${d.name}|${d.latitude}|${d.longitude}`;
    out.set(id, { id, name: d.name, latitude: d.latitude, longitude: d.longitude, verified: d.locationVerified, destination: true });
  }
  return [...out.values()];
}

/**
 * Whether a unit's fix is drawn. Inside Bocaue always; outside it only within the
 * service area, where the backend accepts fixes only from a crew carrying (or at) a
 * hospital (G4). The incident markers keep the strict Bocaue rule.
 */
export function isUnitOnMap(lng: number, lat: number): boolean {
  return isWithinBocaue(lng, lat) || isCoordinateInServiceArea(lat, lng);
}

export type TrackingPhase = 'none' | 'awaiting' | 'accepted' | 'closed';

/**
 * Where the incident's dispatches stand: no dispatch yet, waiting for the crew
 * to accept, at least one unit accepted (track it), or every dispatch ended.
 */
export function trackingPhase(dispatches: ReadonlyArray<{ status: string }> | null | undefined): TrackingPhase {
  if (!dispatches || dispatches.length === 0) return 'none';
  if (dispatches.some((d) => d.status === 'ACCEPTED')) return 'accepted';
  if (dispatches.some((d) => d.status === 'PENDING' || d.status === 'SENT')) return 'awaiting';
  return 'closed';
}

/** "12 s ago" / "3 min ago" / "1 h ago"; "no update yet" when missing. */
export function formatAge(updatedAt: string | null | undefined, now: number): string {
  if (!updatedAt) return 'no update yet';
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return 'no update yet';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}

/**
 * ETA wording. Always an estimate (Rule 13); a missing value reads
 * "Calculating…" rather than a made-up number.
 */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'Calculating…';
  if (seconds < 60) return '<1 min';
  return `~${Math.round(seconds / 60)} min`;
}
