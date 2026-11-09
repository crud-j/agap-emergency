import { EmergencyAlertsService } from '../../src/emergency-alerts/emergency-alerts.service';
import { IncidentPriority, IncidentType } from '@agap/shared';

/**
 * MOD-24 — an SOS gets the same rule-based priority as POST /incidents,
 * never the schema default (MEDIUM).
 */
describe('EmergencyAlertsService.createFromSos — priority', () => {
  function setup() {
    const tx = {
      incident: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: 'inc-1', created_at: new Date(), ...data }),
        ),
      },
      incidentReporter: { create: jest.fn().mockResolvedValue({}) },
      incident_patients: { create: jest.fn().mockResolvedValue({}) },
      incident_locations: { create: jest.fn().mockResolvedValue({}) },
      alert_triggers: { create: jest.fn().mockResolvedValue({}) },
      incidentEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      incident: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const service = new EmergencyAlertsService(
      prisma as any,
      { notifyIncidentCreated: jest.fn() } as any,
      { add: jest.fn().mockResolvedValue(undefined) } as any,
      { onIncidentSaved: jest.fn().mockResolvedValue(undefined) } as any,
    );
    return { service, tx };
  }

  it.each([
    [IncidentType.MEDICAL, IncidentPriority.HIGH],
    [IncidentType.FIRE, IncidentPriority.HIGH],
    [IncidentType.DEBRIS, IncidentPriority.MEDIUM],
  ])('stores the %s category default (%s)', async (incidentType, expected) => {
    const { service, tx } = setup();
    await service.createFromSos({ incidentType, clientEventId: `evt-${incidentType}` }, 'SOS_BUTTON');
    expect(tx.incident.create.mock.calls[0][0].data.priority).toBe(expected);
  });
});
