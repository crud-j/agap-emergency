import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { IncidentStatus } from '@agap/shared';

describe('IncidentStatusService', () => {
  let service: IncidentStatusService;

  beforeEach(() => {
    service = new IncidentStatusService();
  });

  describe('validateTransition', () => {
    it('allows valid transitions along the lifecycle', () => {
      expect(() => service.validateTransition(IncidentStatus.RECEIVED, IncidentStatus.ACKNOWLEDGED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.ACKNOWLEDGED, IncidentStatus.ASSESSED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.EN_ROUTE, IncidentStatus.ON_SCENE)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.ON_SCENE, IncidentStatus.RESOLVED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.RESOLVED, IncidentStatus.CLOSED)).not.toThrow();
    });

    it('rejects invalid transitions', () => {
      expect(() => service.validateTransition(IncidentStatus.SUBMITTED, IncidentStatus.CLOSED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.CLOSED, IncidentStatus.SUBMITTED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.EN_ROUTE, IncidentStatus.SUBMITTED)).toThrow();
    });

    it('rejects any transition from terminal states', () => {
      expect(() => service.validateTransition(IncidentStatus.CLOSED, IncidentStatus.ACKNOWLEDGED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.FALSE_ALERT, IncidentStatus.SUBMITTED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.DUPLICATE, IncidentStatus.ACKNOWLEDGED)).toThrow();
    });

    it('allows cancellation from early states', () => {
      expect(() => service.validateTransition(IncidentStatus.SUBMITTED, IncidentStatus.CANCELLED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.ACKNOWLEDGED, IncidentStatus.CANCELLED)).not.toThrow();
    });

    it('allows the dispatch progression from operational states', () => {
      expect(() => service.validateTransition(IncidentStatus.DISPATCH_PENDING, IncidentStatus.DISPATCHED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.DISPATCHED, IncidentStatus.EN_ROUTE)).not.toThrow();
    });
  });

  describe('isTerminal', () => {
    it('identifies terminal states', () => {
      expect(service.isTerminal(IncidentStatus.CLOSED)).toBe(true);
      expect(service.isTerminal(IncidentStatus.FALSE_ALERT)).toBe(true);
      expect(service.isTerminal(IncidentStatus.DUPLICATE)).toBe(true);
      expect(service.isTerminal(IncidentStatus.CANCELLED)).toBe(true);
    });

    it('identifies non-terminal states', () => {
      expect(service.isTerminal(IncidentStatus.SUBMITTED)).toBe(false);
      expect(service.isTerminal(IncidentStatus.RESOLVED)).toBe(false);
      expect(service.isTerminal(IncidentStatus.EN_ROUTE)).toBe(false);
    });
  });
});
