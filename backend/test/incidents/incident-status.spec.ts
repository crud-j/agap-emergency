import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { IncidentStatus } from '@agap/shared';

describe('IncidentStatusService', () => {
  let service: IncidentStatusService;

  beforeEach(() => {
    service = new IncidentStatusService();
  });

  describe('validateTransition', () => {
    it('allows valid transitions', () => {
      expect(() => service.validateTransition(IncidentStatus.NEW, IncidentStatus.ACKNOWLEDGED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.ACKNOWLEDGED, IncidentStatus.TRIAGED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.EN_ROUTE, IncidentStatus.ON_SCENE)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.HANDED_OVER, IncidentStatus.RESOLVED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.RESOLVED, IncidentStatus.CLOSED)).not.toThrow();
    });

    it('rejects invalid transitions', () => {
      expect(() => service.validateTransition(IncidentStatus.NEW, IncidentStatus.CLOSED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.CLOSED, IncidentStatus.NEW)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.EN_ROUTE, IncidentStatus.NEW)).toThrow();
    });

    it('rejects any transition from terminal states', () => {
      expect(() => service.validateTransition(IncidentStatus.CLOSED, IncidentStatus.ACKNOWLEDGED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.FALSE_ALERT, IncidentStatus.NEW)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.DUPLICATE, IncidentStatus.VALIDATED)).toThrow();
    });

    it('allows cancellation from early states', () => {
      expect(() => service.validateTransition(IncidentStatus.NEW, IncidentStatus.CANCELLED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.ACKNOWLEDGED, IncidentStatus.CANCELLED)).not.toThrow();
    });

    it('allows escalation from operational states', () => {
      expect(() => service.validateTransition(IncidentStatus.ACKNOWLEDGED, IncidentStatus.ESCALATED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.DISPATCHED, IncidentStatus.ESCALATED)).not.toThrow();
    });
  });

  describe('isTerminal', () => {
    it('identifies terminal states', () => {
      expect(service.isTerminal(IncidentStatus.CLOSED)).toBe(true);
      expect(service.isTerminal(IncidentStatus.FALSE_ALERT)).toBe(true);
      expect(service.isTerminal(IncidentStatus.DUPLICATE)).toBe(true);
    });

    it('identifies non-terminal states', () => {
      expect(service.isTerminal(IncidentStatus.NEW)).toBe(false);
      expect(service.isTerminal(IncidentStatus.RESOLVED)).toBe(false);
      expect(service.isTerminal(IncidentStatus.EN_ROUTE)).toBe(false);
    });
  });
});
