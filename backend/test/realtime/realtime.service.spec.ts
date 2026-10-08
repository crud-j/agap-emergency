import {
  INCIDENT_EVENTS,
  NOTIFICATION_EVENTS,
  ANNOUNCEMENT_EVENTS,
  DISPATCH_EVENTS,
  ESCALATION_EVENTS,
  IncidentStatus,
} from '@agap/shared';
import { RealtimeService } from '../../src/realtime/realtime.service';

function makeGateway() {
  return {
    emitToOps: jest.fn(),
    emitToIncident: jest.fn(),
    emitToUser: jest.fn(),
    broadcast: jest.fn(),
  };
}

describe('RealtimeService', () => {
  let gateway: ReturnType<typeof makeGateway>;
  let service: RealtimeService;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = makeGateway();
    service = new RealtimeService(gateway as any);
  });

  describe('statusChanged', () => {
    const payload = {
      incidentId: 'inc-1',
      previousStatus: 'SUBMITTED',
      newStatus: 'ACKNOWLEDGED',
      changedAt: '2026-10-06T00:00:00.000Z',
      changedBy: 'user-1',
    } as any;

    it('routes to BOTH the ops room and the incident room', () => {
      service.statusChanged(payload);

      expect(gateway.emitToOps).toHaveBeenCalledTimes(1);
      expect(gateway.emitToOps).toHaveBeenCalledWith(INCIDENT_EVENTS.STATUS_CHANGED, payload);

      expect(gateway.emitToIncident).toHaveBeenCalledTimes(1);
      expect(gateway.emitToIncident).toHaveBeenCalledWith(
        INCIDENT_EVENTS.STATUS_CHANGED,
        'inc-1',
        payload,
      );
    });

    it('is best-effort — a gateway failure never throws into the caller', () => {
      gateway.emitToOps.mockImplementation(() => {
        throw new Error('socket down');
      });
      expect(() => service.statusChanged(payload)).not.toThrow();
    });

    it('also fans out the dedicated lifecycle event for milestone statuses', () => {
      service.statusChanged({ ...payload, newStatus: IncidentStatus.DISPATCHED } as any);

      // Generic + specific, to BOTH ops and the incident room → 2 calls each.
      expect(gateway.emitToOps).toHaveBeenCalledWith(INCIDENT_EVENTS.STATUS_CHANGED, expect.anything());
      expect(gateway.emitToOps).toHaveBeenCalledWith(INCIDENT_EVENTS.DISPATCHED, expect.anything());
      expect(gateway.emitToIncident).toHaveBeenCalledWith(INCIDENT_EVENTS.DISPATCHED, 'inc-1', expect.anything());
      expect(gateway.emitToOps).toHaveBeenCalledTimes(2);
      expect(gateway.emitToIncident).toHaveBeenCalledTimes(2);
    });

    it('emits status_changed ONLY to ops and the incident\'s own room — never another incident (acceptance)', () => {
      // A status change on incident A must reach ops:all and incident:A only.
      service.statusChanged({ ...payload, incidentId: 'A', newStatus: IncidentStatus.ASSESSED } as any);

      // Ops always receives it.
      expect(gateway.emitToOps).toHaveBeenCalledWith(INCIDENT_EVENTS.STATUS_CHANGED, expect.objectContaining({ incidentId: 'A' }));
      // The incident room targeted is strictly 'A'; a client in incident:B gets nothing.
      const incidentRooms = gateway.emitToIncident.mock.calls.map((c) => c[1]);
      expect(incidentRooms).toEqual(['A']);
      expect(incidentRooms).not.toContain('B');
    });
  });

  describe('dispatchCreated', () => {
    it('emits dispatch.created to ops + the incident room', () => {
      service.dispatchCreated('inc-7', { dispatchId: 'd-1', resourceId: 'r-1', status: 'PENDING' });

      expect(gateway.emitToOps).toHaveBeenCalledWith(
        DISPATCH_EVENTS.CREATED,
        expect.objectContaining({ incidentId: 'inc-7', dispatchId: 'd-1' }),
      );
      expect(gateway.emitToIncident).toHaveBeenCalledWith(
        DISPATCH_EVENTS.CREATED,
        'inc-7',
        expect.objectContaining({ dispatchId: 'd-1' }),
      );
    });
  });

  describe('notifyDispatchCancelled', () => {
    it('emits dispatch.cancelled (not a bare incident.updated)', () => {
      service.notifyDispatchCancelled('inc-7', { dispatchId: 'd-1', resourceId: 'r-1' });

      expect(gateway.emitToOps).toHaveBeenCalledWith(
        DISPATCH_EVENTS.CANCELLED,
        expect.objectContaining({ incidentId: 'inc-7', dispatchId: 'd-1' }),
      );
      expect(gateway.emitToIncident).toHaveBeenCalledWith(
        DISPATCH_EVENTS.CANCELLED,
        'inc-7',
        expect.anything(),
      );
    });
  });

  describe('escalationUpdated', () => {
    it('routes to the ops room only (supervisor concern, not the citizen room)', () => {
      service.escalationUpdated('inc-7', { escalationId: 'e-1', status: 'RESOLVED' });

      expect(gateway.emitToOps).toHaveBeenCalledWith(
        ESCALATION_EVENTS.UPDATED,
        expect.objectContaining({ incidentId: 'inc-7', escalationId: 'e-1', status: 'RESOLVED' }),
      );
      expect(gateway.emitToIncident).not.toHaveBeenCalled();
    });
  });

  it('notificationCreated routes to the per-user room only', () => {
    const payload = {
      notificationId: 'n-1',
      userId: 'user-9',
      type: 'DISPATCH',
      title: 'Unit en route',
      createdAt: '2026-10-06T00:00:00.000Z',
    } as any;

    service.notificationCreated(payload);

    expect(gateway.emitToUser).toHaveBeenCalledWith(NOTIFICATION_EVENTS.CREATED, 'user-9', payload);
    expect(gateway.emitToOps).not.toHaveBeenCalled();
    expect(gateway.emitToIncident).not.toHaveBeenCalled();
  });

  it('announcementPublished broadcasts to all clients (one-way)', () => {
    const payload = {
      announcementId: 'a-1',
      title: 'Flood advisory',
      category: 'FLOOD_ALERT',
      severity: 'WARNING',
      scope: 'MUNICIPALITY_WIDE',
      publishedAt: '2026-10-06T00:00:00.000Z',
    } as any;

    service.announcementPublished(payload);

    expect(gateway.broadcast).toHaveBeenCalledWith(ANNOUNCEMENT_EVENTS.PUBLISHED, payload);
  });

  it('backward-compatible alias notifyIncidentStatusChanged delegates to statusChanged', () => {
    const payload = {
      incidentId: 'inc-2',
      previousStatus: 'RECEIVED',
      newStatus: 'ACKNOWLEDGED',
      changedAt: '2026-10-06T00:00:00.000Z',
      changedBy: 'user-1',
    } as any;

    service.notifyIncidentStatusChanged(payload);

    expect(gateway.emitToOps).toHaveBeenCalledWith(INCIDENT_EVENTS.STATUS_CHANGED, payload);
    expect(gateway.emitToIncident).toHaveBeenCalledWith(INCIDENT_EVENTS.STATUS_CHANGED, 'inc-2', payload);
  });
});
