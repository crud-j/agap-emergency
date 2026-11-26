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
    await service.createFromSos({ incidentType, clientEventId: `evt-${incidentType}` }, 'SOS_BUTTON', 'citizen-1');
    expect(tx.incident.create.mock.calls[0][0].data.priority).toBe(expected);
  });

  describe('guests (no account) need GPS inside Bocaue, as on POST /incidents', () => {
    it.each([
      ['no GPS', {}],
      ['GPS outside Bocaue (Manila)', { latitude: 14.5995, longitude: 120.9842 }],
    ])('refuses %s', async (_label, gps) => {
      const { service, tx } = setup();
      await expect(
        service.createFromSos({ incidentType: IncidentType.FIRE, clientEventId: 'evt-g', ...gps }, 'SOS_BUTTON'),
      ).rejects.toThrow('within Bocaue');
      expect(tx.incident.create).not.toHaveBeenCalled();
    });

    it('accepts GPS inside Bocaue', async () => {
      const { service, tx } = setup();
      await service.createFromSos(
        { incidentType: IncidentType.FIRE, clientEventId: 'evt-ok', latitude: 14.7963, longitude: 120.9272 },
        'SOS_BUTTON',
      );
      expect(tx.incident.create).toHaveBeenCalled();
    });

    it('a signed-in citizen without GPS is not blocked (GPS never blocks a report)', async () => {
      const { service, tx } = setup();
      await service.createFromSos({ incidentType: IncidentType.FIRE, clientEventId: 'evt-c' }, 'SOS_BUTTON', 'citizen-1');
      expect(tx.incident.create).toHaveBeenCalled();
    });
  });
});

describe('removed routes (2026-11-25)', () => {
  it('the alert controller no longer has cancel or status (anyone with an id could cancel or read the reporter)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EmergencyAlertsController } = require('../../src/emergency-alerts/emergency-alerts.controller');
    const methods = Object.getOwnPropertyNames(EmergencyAlertsController.prototype);
    expect(methods).toEqual(expect.arrayContaining(['sos', 'shake']));
    expect(methods).not.toContain('cancel');
    expect(methods).not.toContain('status');
    expect(Object.getOwnPropertyNames(EmergencyAlertsService.prototype)).not.toEqual(
      expect.arrayContaining(['cancel']),
    );
    expect(Object.getOwnPropertyNames(EmergencyAlertsService.prototype)).not.toContain('getStatus');
  });
});
