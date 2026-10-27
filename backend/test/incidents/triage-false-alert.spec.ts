import { BadRequestException } from '@nestjs/common';
import { IncidentStatus } from '@agap/shared';
import { IncidentsService } from '../../src/incidents/incidents.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';

/** POST /incidents/:id/false-alert — the Triage page's False Alert button (MOD-08). */
describe('IncidentsService.markFalseAlert (Triage)', () => {
  function build(status: IncidentStatus) {
    const tx = {
      incident: { update: jest.fn().mockResolvedValue({ id: 'inc-1', status: IncidentStatus.FALSE_ALERT }) },
      false_alerts: { create: jest.fn() },
      incidentEvent: { create: jest.fn() },
    };
    const prisma = {
      incident: { findUnique: jest.fn().mockResolvedValue({ id: 'inc-1', status }) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new IncidentsService(
      prisma as any,
      new IncidentStatusService(),
      {} as any,
      {} as any,
      { notifyIncidentStatusChanged: jest.fn() } as any,
      audit as any,
      {} as any,
    );
    return { service, tx, audit };
  }

  it('classifies an acknowledged incident and writes an audit row', async () => {
    const { service, tx, audit } = build(IncidentStatus.ACKNOWLEDGED);
    await service.markFalseAlert('inc-1', 'dispatcher-1', 'prank call');
    expect(tx.false_alerts.create).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'STATUS_CHANGE', actorId: 'dispatcher-1', moduleId: 'MOD-08',
      oldValues: { status: IncidentStatus.ACKNOWLEDGED },
      newValues: { status: IncidentStatus.FALSE_ALERT, notes: 'prank call' },
    }));
  });

  it.each([IncidentStatus.CLOSED, IncidentStatus.FALSE_ALERT, IncidentStatus.DISPATCHED])(
    'refuses a %s incident and records nothing',
    async (status) => {
      const { service, tx, audit } = build(status);
      await expect(service.markFalseAlert('inc-1', 'dispatcher-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.false_alerts.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    },
  );
});
