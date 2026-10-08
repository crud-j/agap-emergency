import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { FalseAlertsService } from '../../src/false-alerts/false-alerts.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { IncidentStatus, UserRole } from '@agap/shared';
import { CancellationReason } from '../../src/false-alerts/dto/cancel-incident.dto';

// ─── Minimal mocks ────────────────────────────────────────────────────────────

function makeIncident(overrides: Partial<{ id: string; status: string; incident_reporters: any }> = {}) {
  return {
    id: 'incident-uuid-1',
    public_reference: 'INC-2026-000001',
    status: IncidentStatus.SUBMITTED,
    incident_reporters: { user_id: 'citizen-1', is_guest: false },
    incident_patients: [],
    ...overrides,
  };
}

function makeMocks(incidentOverrides: Parameters<typeof makeIncident>[0] = {}) {
  const incident = makeIncident(incidentOverrides);

  const prisma = {
    $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => {
      const result = await fn({
        incident: { update: jest.fn().mockResolvedValue({ ...incident, status: 'MOCK_UPDATED' }) },
        incidentEvent: { create: jest.fn().mockResolvedValue({}) },
        alert_triggers: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        false_alerts: { create: jest.fn().mockResolvedValue({}) },
      });
      return result;
    }),
  };

  const incidents = {
    findById: jest.fn().mockResolvedValue(incident),
  };

  const statusService = new IncidentStatusService();

  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const realtime = { statusChanged: jest.fn() };

  const service = new FalseAlertsService(
    prisma as any,
    incidents as any,
    statusService,
    audit as any,
    realtime as any,
  );

  return { service, prisma, incidents, audit, realtime, incident };
}

// ─── cancel() ────────────────────────────────────────────────────────────────

describe('FalseAlertsService.cancel()', () => {
  it('cancels a SUBMITTED incident as a citizen owner', async () => {
    const { service } = makeMocks({ status: IncidentStatus.SUBMITTED });
    await expect(
      service.cancel('incident-uuid-1', 'citizen-1', UserRole.CITIZEN, CancellationReason.ACCIDENTAL_TRIGGER),
    ).resolves.toBeDefined();
  });

  it('cancels a RECEIVED incident as a dispatcher', async () => {
    const { service } = makeMocks({ status: IncidentStatus.RECEIVED });
    await expect(
      service.cancel('incident-uuid-1', 'dispatcher-1', UserRole.DISPATCHER, CancellationReason.SITUATION_RESOLVED),
    ).resolves.toBeDefined();
  });

  it('cancels a DISPATCH_PENDING incident as a dispatcher', async () => {
    const { service } = makeMocks({ status: IncidentStatus.DISPATCH_PENDING });
    await expect(
      service.cancel('incident-uuid-1', 'dispatcher-1', UserRole.DISPATCHER, CancellationReason.OTHER),
    ).resolves.toBeDefined();
  });

  it('emits incident.cancelled via realtime after persisting', async () => {
    const { service, realtime } = makeMocks({ status: IncidentStatus.SUBMITTED });
    await service.cancel('incident-uuid-1', 'citizen-1', UserRole.CITIZEN, CancellationReason.SITUATION_RESOLVED);
    expect(realtime.statusChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        incidentId: 'incident-uuid-1',
        newStatus: IncidentStatus.CANCELLED,
      }),
    );
  });

  it('writes an audit entry after persisting', async () => {
    const { service, audit } = makeMocks({ status: IncidentStatus.SUBMITTED });
    await service.cancel('incident-uuid-1', 'citizen-1', UserRole.CITIZEN, CancellationReason.WRONG_APP);
    // audit.log is called via void — it fires asynchronously; just verify it was called
    // (it resolves before the function returns because Promise.resolve happens in microtask queue)
    await Promise.resolve(); // flush microtasks
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'incident-uuid-1', newValues: expect.objectContaining({ status: IncidentStatus.CANCELLED }) }),
    );
  });

  it('throws ForbiddenException when a responder attempts to cancel', async () => {
    const { service } = makeMocks({ status: IncidentStatus.SUBMITTED });
    await expect(
      service.cancel('incident-uuid-1', 'responder-1', UserRole.RESPONDER, CancellationReason.OTHER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException when citizen tries to cancel someone else\'s incident', async () => {
    const { service } = makeMocks({
      status: IncidentStatus.SUBMITTED,
      incident_reporters: { user_id: 'other-citizen', is_guest: false },
    });
    await expect(
      service.cancel('incident-uuid-1', 'citizen-1', UserRole.CITIZEN, CancellationReason.ACCIDENTAL_TRIGGER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws BadRequestException when citizen tries to cancel a dispatched incident', async () => {
    const { service } = makeMocks({ status: IncidentStatus.DISPATCHED });
    await expect(
      service.cancel('incident-uuid-1', 'citizen-1', UserRole.CITIZEN, CancellationReason.SITUATION_RESOLVED),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException for invalid lifecycle transition (e.g. CLOSED → CANCELLED)', async () => {
    const { service } = makeMocks({ status: IncidentStatus.CLOSED });
    await expect(
      service.cancel('incident-uuid-1', 'dispatcher-1', UserRole.DISPATCHER, CancellationReason.OTHER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates NotFoundException when incident does not exist', async () => {
    const { service, incidents } = makeMocks();
    incidents.findById.mockRejectedValue(new NotFoundException('Incident not found'));
    await expect(
      service.cancel('bad-id', 'dispatcher-1', UserRole.DISPATCHER, CancellationReason.OTHER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── markFalseAlert() ────────────────────────────────────────────────────────

describe('FalseAlertsService.markFalseAlert()', () => {
  it('marks as false alert from ACKNOWLEDGED status (dispatcher)', async () => {
    const { service } = makeMocks({ status: IncidentStatus.ACKNOWLEDGED });
    await expect(
      service.markFalseAlert('incident-uuid-1', 'dispatcher-1', UserRole.DISPATCHER, 'test call'),
    ).resolves.toBeDefined();
  });

  it('marks as false alert from ASSESSED status (supervisor)', async () => {
    const { service } = makeMocks({ status: IncidentStatus.ASSESSED });
    await expect(
      service.markFalseAlert('incident-uuid-1', 'supervisor-1', UserRole.SUPERVISOR),
    ).resolves.toBeDefined();
  });

  it('emits incident.status_changed via realtime after persisting', async () => {
    const { service, realtime } = makeMocks({ status: IncidentStatus.ACKNOWLEDGED });
    await service.markFalseAlert('incident-uuid-1', 'dispatcher-1', UserRole.DISPATCHER);
    expect(realtime.statusChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        incidentId: 'incident-uuid-1',
        newStatus: IncidentStatus.FALSE_ALERT,
      }),
    );
  });

  it('throws ForbiddenException for citizens', async () => {
    const { service } = makeMocks({ status: IncidentStatus.ACKNOWLEDGED });
    await expect(
      service.markFalseAlert('incident-uuid-1', 'citizen-1', UserRole.CITIZEN),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws ForbiddenException for responders', async () => {
    const { service } = makeMocks({ status: IncidentStatus.ACKNOWLEDGED });
    await expect(
      service.markFalseAlert('incident-uuid-1', 'responder-1', UserRole.RESPONDER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws BadRequestException when transition is invalid (e.g. SUBMITTED → FALSE_ALERT)', async () => {
    const { service } = makeMocks({ status: IncidentStatus.SUBMITTED });
    await expect(
      service.markFalseAlert('incident-uuid-1', 'dispatcher-1', UserRole.DISPATCHER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException for already-terminal incidents', async () => {
    const { service } = makeMocks({ status: IncidentStatus.FALSE_ALERT });
    await expect(
      service.markFalseAlert('incident-uuid-1', 'dispatcher-1', UserRole.DISPATCHER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
