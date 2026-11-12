import {
  isRouteLastKnown,
  type IncidentTransportUpdatedPayload,
  type ResponderLocationUpdatedPayload,
  type ResponderRouteUpdatedPayload,
  type RouteSnapshot,
  type TransportDestinationView,
} from '@agap/shared';
import {
  applyEtaUpdate,
  applyRouteUpdate,
  applyTransportUpdate,
  destinationFacilities,
  formatAge,
  formatEta,
  isUnitOnMap,
  legChip,
  mergeResponderLocations,
  trackingPhase,
  transportUpdateNotices,
  unitRoutePlan,
} from '@/features/map/live-tracking';
import { destinationHistory } from '@/features/incidents/transport-history';
import type { AuditLogEntry } from '@/features/audit/api';
import { REPORTER_PHOTO_NOTE, reporterLabel } from '@/components/map/CitizenMarker';
import type { LatestUnitPosition, LiveResponderPosition } from '@/features/map/api';

const seeded: LiveResponderPosition = {
  responderId: 'crew-1',
  responder_name: 'Ana Cruz',
  dispatchId: 'dispatch-A',
  incident_id: 'inc-1',
  incident_status: 'EN_ROUTE',
  resource_name: 'MDRRMO Ambulance 1',
  call_sign: 'ALPHA-1',
  resource_type: 'AMBULANCE',
  lat: 14.79,
  lng: 120.92,
  heading: 0,
  speed: 20,
  updated_at: '2026-10-18T00:00:00.000Z',
};

function loc(p: Partial<ResponderLocationUpdatedPayload>): ResponderLocationUpdatedPayload {
  return { responderId: 'crew-1', lat: 14.8, lng: 120.93, updatedAt: '2026-10-18T00:00:05.000Z', ...p };
}

describe('WP5 dispatch-dashboard live tracking', () => {
  describe('mergeResponderLocations (socket patch, G2)', () => {
    it('sets incident_id, dispatchId and call sign for a unit first seen over the socket, and asks for a re-seed', () => {
      const { next, sawUnknown } = mergeResponderLocations([], [
        loc({ incidentId: 'inc-9', dispatchId: 'dispatch-Z', callSign: 'BRAVO-1' }),
      ]);
      expect(sawUnknown).toBe(true);
      expect(next).toHaveLength(1);
      expect(next[0]).toMatchObject({
        incident_id: 'inc-9',
        dispatchId: 'dispatch-Z',
        call_sign: 'BRAVO-1',
        responder_name: null,
        lat: 14.8,
      });
    });

    it('updates the known unit in place and keeps the seeded name and unit details', () => {
      const { next, sawUnknown } = mergeResponderLocations([seeded], [
        loc({ incidentId: 'inc-1', dispatchId: 'dispatch-A', heading: 270 }),
      ]);
      expect(sawUnknown).toBe(false);
      expect(next).toHaveLength(1);
      expect(next[0]).toMatchObject({
        responder_name: 'Ana Cruz',
        resource_name: 'MDRRMO Ambulance 1',
        call_sign: 'ALPHA-1',
        heading: 270,
        lat: 14.8,
        updated_at: '2026-10-18T00:00:05.000Z',
      });
    });

    it('collapses a second crew phone onto the same unit marker', () => {
      const { next } = mergeResponderLocations([seeded], [
        loc({ responderId: 'crew-2', incidentId: 'inc-1', dispatchId: 'dispatch-A' }),
      ]);
      expect(next).toHaveLength(1);
      expect(next[0]!.responderId).toBe('crew-2');
    });

    it('stores a null heading/speed as null', () => {
      const { next } = mergeResponderLocations([seeded], [loc({ dispatchId: 'dispatch-A', heading: null, speed: null })]);
      expect(next[0]!.heading).toBeNull();
      expect(next[0]!.speed).toBeNull();
    });

    it('falls back to the responder id when an older backend omits dispatchId', () => {
      const { next, sawUnknown } = mergeResponderLocations([seeded], [loc({ responderId: 'crew-1' })]);
      expect(sawUnknown).toBe(false);
      expect(next).toHaveLength(1);
    });
  });

  describe('applyEtaUpdate', () => {
    const units: LatestUnitPosition[] = [
      {
        dispatchId: 'dispatch-A', callSign: 'ALPHA-1', unitName: null, resourceType: 'AMBULANCE',
        position: null, eta: { seconds: null, isEstimate: true, calculatedAt: null },
      },
      {
        dispatchId: 'dispatch-B', callSign: 'ALPHA-2', unitName: null, resourceType: 'AMBULANCE',
        position: null, eta: { seconds: 900, isEstimate: true, calculatedAt: 'x' },
      },
    ];

    it('updates only the matching unit (no cross-labelling between units)', () => {
      const next = applyEtaUpdate(units, {
        incidentId: 'inc-1', dispatchId: 'dispatch-A', etaSeconds: 240, isEstimate: true, calculatedAt: 'now',
      });
      expect(next![0]!.eta).toEqual({ seconds: 240, isEstimate: true, calculatedAt: 'now' });
      expect(next![1]!.eta.seconds).toBe(900);
    });

    it('leaves an unseeded cache alone', () => {
      expect(
        applyEtaUpdate(undefined, { incidentId: 'i', dispatchId: 'd', etaSeconds: 1, isEstimate: true, calculatedAt: 'n' }),
      ).toBeUndefined();
    });
  });

  describe('trackingPhase', () => {
    it.each([
      [[], 'none'],
      [[{ status: 'SENT' }], 'awaiting'],
      [[{ status: 'PENDING' }], 'awaiting'],
      [[{ status: 'SENT' }, { status: 'ACCEPTED' }], 'accepted'],
      [[{ status: 'REJECTED' }], 'closed'],
      [[{ status: 'COMPLETED' }, { status: 'CANCELLED' }], 'closed'],
    ] as const)('%j → %s', (dispatches, phase) => {
      expect(trackingPhase(dispatches)).toBe(phase);
    });

    it('treats missing dispatches as none', () => {
      expect(trackingPhase(undefined)).toBe('none');
    });
  });

  describe('wording', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');

    it('formats the last-update age', () => {
      expect(formatAge('2026-10-18T11:59:48Z', now)).toBe('12 s ago');
      expect(formatAge('2026-10-18T11:57:00Z', now)).toBe('3 min ago');
      expect(formatAge('2026-10-18T10:00:00Z', now)).toBe('2 h ago');
      expect(formatAge(null, now)).toBe('no update yet');
    });

    it('labels ETA as calculating when missing, never inventing a number', () => {
      expect(formatEta(null)).toBe('Calculating…');
      expect(formatEta(undefined)).toBe('Calculating…');
      expect(formatEta(30)).toBe('<1 min');
      expect(formatEta(300)).toBe('~5 min');
    });

    it('always says Reporter (never Patient) in the scene popup', () => {
      expect(reporterLabel(true, false)).toBe('Reporter photo (shared with consent)');
      expect(reporterLabel(false, false)).toBe('Reporter (registered)');
      expect(reporterLabel(false, true)).toBe('Guest report');
      expect(reporterLabel(null, null)).toBe('Reporter');
      for (const label of [reporterLabel(true, false), reporterLabel(false, true)]) {
        expect(label).not.toMatch(/patient/i);
      }
      // The note under the photo says the opposite way round: it may NOT be the patient.
      expect(REPORTER_PHOTO_NOTE).toMatch(/may not be the patient/i);
    });
  });

  // ─── Prompt 12: leg-aware dispatcher view ──────────────────────────────────

  const JONI: TransportDestinationView = {
    kind: 'FACILITY', name: 'DOH — Joni Villanueva General Hospital', latitude: 14.79679, longitude: 120.94358, locationVerified: true,
  };
  const MALOLOS: TransportDestinationView = {
    kind: 'FACILITY', name: 'Bulacan Medical Center', latitude: 14.8433, longitude: 120.8114, locationVerified: true,
  };
  const route = (over: Partial<RouteSnapshot> = {}): RouteSnapshot => ({
    geometry: [[120.93, 14.79], [120.9436, 14.7968]],
    distanceMeters: 2400,
    durationSeconds: 420,
    isEstimate: true,
    calculatedAt: '2026-10-29T01:00:00.000Z',
    stale: false,
    ...over,
  });
  const unit = (over: Partial<LatestUnitPosition> = {}): LatestUnitPosition => ({
    dispatchId: 'dispatch-A', callSign: 'ALPHA-1', unitName: null, resourceType: 'AMBULANCE',
    position: { lat: 14.79, lng: 120.93, heading: null, speedKmh: null, updatedAt: '2026-10-29T01:00:00.000Z' },
    eta: { seconds: 600, isEstimate: true, calculatedAt: null },
    leg: 'TO_SCENE', destination: null, route: route(),
    ...over,
  });
  const routeUpdate = (over: Partial<ResponderRouteUpdatedPayload> = {}): ResponderRouteUpdatedPayload => ({
    incidentId: 'inc-1', dispatchId: 'dispatch-A', leg: 'TO_FACILITY', destination: JONI, route: route({ distanceMeters: 1800 }), ...over,
  });
  const transportUpdate = (over: Partial<IncidentTransportUpdatedPayload> = {}): IncidentTransportUpdatedPayload => ({
    incidentId: 'inc-1', dispatchId: 'dispatch-A', transportId: 'tr-1',
    destination: { ...MALOLOS, id: 'fac-malolos' }, changedAt: '2026-10-29T01:05:00.000Z', ...over,
  });

  describe('applyRouteUpdate (responder.route_updated → unit cache)', () => {
    it('replaces the leg, destination and route of the matching unit and keeps its position and ETA', () => {
      const before = unit();
      const next = applyRouteUpdate([before, unit({ dispatchId: 'dispatch-B' })], routeUpdate());
      expect(next![0]).toMatchObject({ leg: 'TO_FACILITY', destination: JONI, route: { distanceMeters: 1800 } });
      expect(next![0]!.position).toEqual(before.position);
      expect(next![0]!.eta.seconds).toBe(600);
      expect(next![1]!.leg).toBe('TO_SCENE');
    });

    it('a withdrawal (null route) clears the line', () => {
      const next = applyRouteUpdate([unit()], routeUpdate({ leg: 'AT_FACILITY', route: null }));
      expect(next![0]).toMatchObject({ leg: 'AT_FACILITY', route: null });
    });

    it('adds a unit not seeded yet without a position', () => {
      const next = applyRouteUpdate([unit()], routeUpdate({ dispatchId: 'dispatch-Z' }));
      expect(next).toHaveLength(2);
      expect(next![1]).toMatchObject({ dispatchId: 'dispatch-Z', position: null, leg: 'TO_FACILITY', destination: JONI });
    });

    it('leaves an unseeded cache alone', () => {
      expect(applyRouteUpdate(undefined, routeUpdate())).toBeUndefined();
    });
  });

  describe('applyTransportUpdate (incident.transport_updated → unit cache)', () => {
    it('swaps the destination, drops the old hospital route and never keeps the facility id', () => {
      const next = applyTransportUpdate([unit({ leg: 'TO_FACILITY', destination: JONI })], transportUpdate());
      expect(next![0]!.destination).toEqual(MALOLOS);
      expect(next![0]!.destination).not.toHaveProperty('id');
      expect(next![0]!.route).toBeNull();
      expect(next![0]!.leg).toBe('TO_FACILITY');
    });

    it('keeps the route when the hospital did not change', () => {
      const keep = route();
      const next = applyTransportUpdate(
        [unit({ leg: 'TO_FACILITY', destination: JONI, route: keep })],
        transportUpdate({ destination: { ...JONI, id: 'fac-joni' }, destinationWarning: 'FACILITY_AT_CAPACITY' }),
      );
      expect(next![0]!.route).toBe(keep);
    });

    it('touches only that dispatch', () => {
      const other = unit({ dispatchId: 'dispatch-B' });
      const next = applyTransportUpdate([unit(), other], transportUpdate());
      expect(next![1]).toBe(other);
    });
  });

  describe('transportUpdateNotices (toast text)', () => {
    it('"Destination changed: A → B" with the old name from the unit cache', () => {
      const notices = transportUpdateNotices(transportUpdate(), {
        units: [unit({ leg: 'TO_FACILITY', destination: JONI })],
        transports: undefined,
      });
      expect(notices).toEqual([
        { title: `Destination changed: ${JONI.name} → ${MALOLOS.name}`, description: 'Unit ALPHA-1', variant: 'default' },
      ]);
    });

    it('falls back to the transport list for the old name', () => {
      const [notice] = transportUpdateNotices(transportUpdate(), {
        units: undefined,
        transports: [{ id: 'tr-1', facilities: { name: JONI.name } }],
      });
      expect(notice!.title).toBe(`Destination changed: ${JONI.name} → ${MALOLOS.name}`);
    });

    it('"Destination set" when there was none', () => {
      const [notice] = transportUpdateNotices(transportUpdate(), { units: [unit()], transports: undefined });
      expect(notice!.title).toBe(`Destination set: ${MALOLOS.name}`);
    });

    it('a hospital that only moved gives no change toast', () => {
      const notices = transportUpdateNotices(
        transportUpdate({ destination: { ...JONI, latitude: 14.7969, id: 'fac-joni' } }),
        { units: [unit({ leg: 'TO_FACILITY', destination: JONI })], transports: undefined },
      );
      expect(notices).toEqual([]);
    });

    it.each([
      ['FACILITY_DEACTIVATED', 'was deactivated'],
      ['FACILITY_AT_CAPACITY', 'is at capacity or closed'],
    ] as const)('%s → a warning toast; the transport continues', (warning, text) => {
      const notices = transportUpdateNotices(
        transportUpdate({ destination: { ...JONI, id: 'fac-joni' }, destinationWarning: warning }),
        { units: [unit({ leg: 'TO_FACILITY', destination: JONI })], transports: undefined },
      );
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ title: `${JONI.name} ${text}`, variant: 'warning' });
      expect(notices[0]!.description).toMatch(/transport continues/);
    });
  });

  describe('stale route (plan §19: > 120 s is "last known")', () => {
    const now = Date.parse('2026-10-29T01:00:00.000Z');
    it.each([
      ['fresh', route({ calculatedAt: '2026-10-29T00:59:00.000Z' }), false],
      ['exactly 120 s', route({ calculatedAt: '2026-10-29T00:58:00.000Z' }), false],
      ['121 s old', route({ calculatedAt: '2026-10-29T00:57:59.000Z' }), true],
      ['marked stale by the server', route({ calculatedAt: '2026-10-29T01:00:00.000Z', stale: true }), true],
      ['no route', null, false],
    ] as const)('%s → %s', (_label, r, expected) => {
      expect(isRouteLastKnown(r, now)).toBe(expected);
    });
  });

  describe('legChip (ETA pill, unit popup, ops-map rows)', () => {
    it.each([
      [unit(), 'TO_SCENE', 'To scene'],
      [unit({ leg: 'TO_FACILITY', destination: JONI }), 'TO_FACILITY', `To hospital · ${JONI.name}`],
      [unit({ leg: 'TO_FACILITY', destination: null }), 'TO_FACILITY', 'To hospital'],
      [unit({ leg: 'AT_FACILITY', destination: JONI }), 'AT_FACILITY', `At hospital · ${JONI.name}`],
      [{ dispatchId: 'x' } as LatestUnitPosition, 'TO_SCENE', 'To scene'],
      [null, 'TO_SCENE', 'To scene'],
    ] as const)('%#: %s → "%s"', (u, leg, label) => {
      expect(legChip(u)).toEqual({ leg, label });
    });
  });

  describe('unitRoutePlan (server route first, client route only as a fallback)', () => {
    const scene = { lat: 14.79, lng: 120.92 };
    it('uses the server route when there is one', () => {
      const plan = unitRoutePlan(unit({ leg: 'TO_FACILITY', destination: JONI }), scene);
      expect(plan.server).not.toBeNull();
      expect(plan.fallbackTo).toBeNull();
    });
    it('falls back to the scene on the scene leg', () => {
      expect(unitRoutePlan(unit({ route: null }), scene).fallbackTo).toEqual(scene);
    });
    it('falls back to the hospital (never the scene) on the hospital leg', () => {
      expect(unitRoutePlan(unit({ leg: 'TO_FACILITY', destination: JONI, route: null }), scene).fallbackTo)
        .toEqual({ lat: JONI.latitude, lng: JONI.longitude });
      expect(unitRoutePlan(unit({ leg: 'TO_FACILITY', destination: null, route: null }), scene).fallbackTo).toBeNull();
    });
    it('draws nothing after arrival', () => {
      expect(unitRoutePlan(unit({ leg: 'AT_FACILITY', destination: JONI, route: null }), scene)).toMatchObject({
        server: null, fallbackTo: null,
      });
    });
  });

  describe('destinationFacilities and isUnitOnMap', () => {
    it('one marker per destination hospital; scene-leg units and hospitals without coordinates add none', () => {
      const markers = destinationFacilities([
        unit({ leg: 'TO_FACILITY', destination: JONI }),
        unit({ dispatchId: 'B', leg: 'AT_FACILITY', destination: JONI }),
        unit({ dispatchId: 'C', leg: 'TO_FACILITY', destination: { ...MALOLOS, latitude: null, longitude: null } }),
        unit({ dispatchId: 'D' }),
      ]);
      expect(markers).toEqual([
        expect.objectContaining({ name: JONI.name, latitude: JONI.latitude, longitude: JONI.longitude, verified: true, destination: true }),
      ]);
    });

    it('keeps a unit in the service area outside Bocaue (transport to Malolos) and drops one in Manila', () => {
      expect(isUnitOnMap(120.9436, 14.7968)).toBe(true);
      expect(isUnitOnMap(120.8114, 14.8433)).toBe(true);
      expect(isUnitOnMap(120.9842, 14.5995)).toBe(false);
    });
  });

  describe('destinationHistory (drawer, from the incident audit trail)', () => {
    const entry = (over: Partial<AuditLogEntry>): AuditLogEntry => ({
      id: 'a', action: 'UPDATE', entity_type: 'transport_record', entity_id: 'tr-1', actor_id: 'u', actor_role: 'DISPATCHER',
      module_id: 'MOD-40', incident_id: 'inc-1', ip_address: null, old_values: null, new_values: null,
      occurred_at: '2026-10-29T01:00:00.000Z', users: { full_name: 'Dana Dispatcher' }, ...over,
    });
    const names = new Map([['fac-joni', JONI.name], ['fac-malolos', MALOLOS.name]]);

    it('lists set and change entries oldest first, with reason and actor', () => {
      const history = destinationHistory({ id: 'tr-1' }, [
        entry({
          id: '2', occurred_at: '2026-10-29T01:10:00.000Z',
          old_values: { destination_id: 'fac-joni' }, new_values: { destinationId: 'fac-malolos', changeReason: 'ER full' },
        }),
        entry({ id: '1', old_values: { destination_id: null }, new_values: { destination_id: 'fac-joni' } }),
        entry({ id: '3', entity_id: 'tr-other', new_values: { destinationId: 'fac-joni' } }),
        entry({ id: '4', new_values: { reporter_patient_confirmed: true } }),
      ], names);
      expect(history).toEqual([
        { at: '2026-10-29T01:00:00.000Z', from: null, to: JONI.name, reason: null, actor: 'Dana Dispatcher' },
        { at: '2026-10-29T01:10:00.000Z', from: JONI.name, to: MALOLOS.name, reason: 'ER full', actor: 'Dana Dispatcher' },
      ]);
    });

    it('a hospital no longer listed is still shown, and an ETA-only update is not a change', () => {
      const history = destinationHistory({ id: 'tr-1' }, [
        entry({ old_values: { destination_id: 'fac-gone' }, new_values: { destinationId: 'fac-joni' } }),
        entry({ id: 'eta', old_values: { destination_id: 'fac-joni' }, new_values: { estimatedArrivalAt: 'x' } }),
      ], names);
      expect(history).toHaveLength(1);
      expect(history[0]!.from).toBe('a hospital no longer listed');
    });
  });
});
