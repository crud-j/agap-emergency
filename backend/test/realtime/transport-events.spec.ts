import { INCIDENT_EVENTS, RESPONDER_EVENTS } from '@agap/shared';
import type {
  IncidentFacilityArrivalPayload,
  IncidentTransportingPayload,
  IncidentTransportUpdatedPayload,
  ResponderRouteUpdatedPayload,
} from '@agap/shared';
import { RealtimeService } from '../../src/realtime/realtime.service';

// MOD-40 transport events (Correction C18): the incident room includes the
// reporter, so it never gets a patient or a destination.

const SENSITIVE_FIELDS = ['patientId', 'destinationId', 'destinationName', 'destination'];

function makeGateway() {
  return {
    emitToOps: jest.fn(),
    emitToIncident: jest.fn(),
    emitToUser: jest.fn(),
    broadcast: jest.fn(),
  };
}

const destination = {
  kind: 'FACILITY' as const,
  name: 'DOH — Joni Villanueva General Hospital',
  latitude: 14.79679,
  longitude: 120.94358,
  locationVerified: true,
};

describe('RealtimeService — MOD-40 transport events', () => {
  let gateway: ReturnType<typeof makeGateway>;
  let service: RealtimeService;

  beforeEach(() => {
    gateway = makeGateway();
    service = new RealtimeService(gateway as any);
  });

  /** Serialized, so a nested or undefined-valued key cannot slip past the check. */
  function incidentRoomJson(): string {
    expect(gateway.emitToIncident).toHaveBeenCalledTimes(1);
    return JSON.stringify(gateway.emitToIncident.mock.calls[0][2]);
  }

  describe('incidentTransporting', () => {
    const payload: IncidentTransportingPayload = {
      incidentId: 'inc-1',
      transportId: 'tr-1',
      dispatchId: 'disp-1',
      destinationId: 'fac-1',
      destinationName: destination.name,
      destination,
      patientId: 'pat-1',
      transportStartedAt: '2026-10-28T01:00:00.000Z',
    };

    it('sends the incident room a status-only copy', () => {
      service.incidentTransporting(payload);

      const json = incidentRoomJson();
      for (const field of SENSITIVE_FIELDS) expect(json).not.toContain(`"${field}"`);
      expect(json).not.toContain('pat-1');
      expect(json).not.toContain('Joni Villanueva');
      expect(gateway.emitToIncident).toHaveBeenCalledWith(INCIDENT_EVENTS.TRANSPORTING, 'inc-1', {
        incidentId: 'inc-1',
        transportId: 'tr-1',
        dispatchId: 'disp-1',
        transportStartedAt: '2026-10-28T01:00:00.000Z',
      });
    });

    it('keeps the full payload for ops', () => {
      service.incidentTransporting(payload);
      expect(gateway.emitToOps).toHaveBeenCalledWith(INCIDENT_EVENTS.TRANSPORTING, payload);
    });
  });

  describe('facilityArrival', () => {
    const payload: IncidentFacilityArrivalPayload = {
      incidentId: 'inc-1',
      transportId: 'tr-1',
      dispatchId: 'disp-1',
      destinationId: 'fac-1',
      arrivedAt: '2026-10-28T01:20:00.000Z',
    };

    it('sends the incident room a copy without the destination', () => {
      service.facilityArrival(payload);

      const json = incidentRoomJson();
      for (const field of SENSITIVE_FIELDS) expect(json).not.toContain(`"${field}"`);
      expect(json).not.toContain('fac-1');
    });

    it('keeps the full payload for ops', () => {
      service.facilityArrival(payload);
      expect(gateway.emitToOps).toHaveBeenCalledWith(INCIDENT_EVENTS.FACILITY_ARRIVAL, payload);
    });
  });

  describe('transportUpdated', () => {
    const payload: IncidentTransportUpdatedPayload = {
      incidentId: 'inc-1',
      dispatchId: 'disp-1',
      transportId: 'tr-1',
      destination: { ...destination, id: 'fac-2' },
      changedAt: '2026-10-28T01:05:00.000Z',
    };

    it('never emits to the incident room', () => {
      service.transportUpdated(payload, ['crew-1']);
      expect(gateway.emitToIncident).not.toHaveBeenCalled();
    });

    it('gives ops the full payload and each user one copy without destination.id', () => {
      service.transportUpdated(payload, ['crew-1', 'crew-2', 'crew-1']);

      expect(gateway.emitToOps).toHaveBeenCalledWith(INCIDENT_EVENTS.TRANSPORT_UPDATED, payload);
      expect(gateway.emitToUser.mock.calls.map((c) => c[1])).toEqual(['crew-1', 'crew-2']);
      for (const [event, , sent] of gateway.emitToUser.mock.calls) {
        expect(event).toBe(INCIDENT_EVENTS.TRANSPORT_UPDATED);
        expect(sent.destination).toEqual(destination);
        expect(JSON.stringify(sent)).not.toContain('fac-2');
      }
      // The caller's object is not mutated (ops still has the id).
      expect(payload.destination?.id).toBe('fac-2');
    });

    it('handles a cleared destination', () => {
      service.transportUpdated({ ...payload, destination: null }, ['crew-1']);
      expect(gateway.emitToUser).toHaveBeenCalledWith(
        INCIDENT_EVENTS.TRANSPORT_UPDATED, 'crew-1', expect.objectContaining({ destination: null }),
      );
    });
  });

  describe('routeUpdated', () => {
    const payload: ResponderRouteUpdatedPayload = {
      incidentId: 'inc-1',
      dispatchId: 'disp-1',
      leg: 'TO_FACILITY',
      destination,
      route: {
        geometry: [[120.93, 14.79], [120.94358, 14.79679]],
        distanceMeters: 1800,
        durationSeconds: 240,
        isEstimate: true,
        calculatedAt: '2026-10-28T01:05:00.000Z',
        stale: false,
      },
    };

    it('emits to the incident room only when incidentRoom is true', () => {
      service.routeUpdated({ ...payload, leg: 'TO_SCENE', destination: null }, { incidentRoom: true, userIds: [] });
      expect(gateway.emitToIncident).toHaveBeenCalledWith(RESPONDER_EVENTS.ROUTE_UPDATED, 'inc-1', expect.anything());

      gateway.emitToIncident.mockClear();
      service.routeUpdated(payload, { incidentRoom: false, userIds: ['crew-1'] });
      expect(gateway.emitToIncident).not.toHaveBeenCalled();
    });

    it('always reaches ops and each user once', () => {
      service.routeUpdated(payload, { incidentRoom: false, userIds: ['crew-1', 'crew-1', 'reporter-1'] });

      expect(gateway.emitToOps).toHaveBeenCalledWith(RESPONDER_EVENTS.ROUTE_UPDATED, payload);
      expect(gateway.emitToUser.mock.calls.map((c) => c[1])).toEqual(['crew-1', 'reporter-1']);
    });
  });

  it('is best-effort: a gateway failure never throws into the caller', () => {
    gateway.emitToOps.mockImplementation(() => { throw new Error('socket down'); });
    expect(() => service.transportUpdated({
      incidentId: 'inc-1', dispatchId: 'd', transportId: 't', destination: null, changedAt: 'x',
    }, ['u'])).not.toThrow();
    expect(() => service.routeUpdated({
      incidentId: 'inc-1', dispatchId: 'd', leg: 'TO_SCENE', destination: null, route: null,
    }, { incidentRoom: true, userIds: [] })).not.toThrow();
  });
});
