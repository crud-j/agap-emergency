import { Prisma } from '@prisma/client';
import { IncidentType, UserRole } from '@agap/shared';
import { IncidentsService } from '../../src/incidents/incidents.service';
import { PriorityService } from '../../src/incidents/priority/priority.service';

/** The real P2002 shape from the pg driver adapter (constraint name, no `target`). */
function uniqueViolation(index: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { driverAdapterError: { cause: { constraint: { index } } }, modelName: 'Incident' },
  });
}

describe('IncidentsService.create — simultaneous reports (MOD-14)', () => {
  function build() {
    const saved = { id: 'inc-2', public_reference: 'INC-2026-000002', category: 'FIRE', priority: 'HIGH', status: 'SUBMITTED', submitted_at: new Date() };
    const prisma = {
      incident: { findFirst: jest.fn().mockResolvedValue(null), count: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = new IncidentsService(
      prisma as any, {} as any, { findNearbyRecent: jest.fn() } as any, new PriorityService(),
      { notifyIncidentCreated: jest.fn() } as any, {} as any, { notifyContactsOfIncident: jest.fn() } as any,
    );
    return { service, prisma, saved };
  }

  it('retries with the next reference when another report took the same number', async () => {
    const { service, prisma, saved } = build();
    prisma.incident.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    prisma.$transaction
      .mockRejectedValueOnce(uniqueViolation('incidents_public_reference_key'))
      .mockResolvedValueOnce(saved);

    const result = await service.create({ type: IncidentType.FIRE, idempotencyKey: 'k-1' }, 'citizen-1', UserRole.CITIZEN);

    expect(result).toBe(saved);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('returns the original when a resend races it on the idempotency key', async () => {
    const { service, prisma } = build();
    const original = { id: 'inc-1', public_reference: 'INC-2026-000001' };
    prisma.incident.count.mockResolvedValue(0);
    prisma.incident.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(original);
    prisma.$transaction.mockRejectedValueOnce(uniqueViolation('incidents_client_event_id_key'));

    await expect(service.create({ type: IncidentType.FIRE, idempotencyKey: 'k-1' }, 'citizen-1', UserRole.CITIZEN))
      .resolves.toBe(original);
  });

  it('rethrows any other database error', async () => {
    const { service, prisma } = build();
    prisma.incident.count.mockResolvedValue(0);
    prisma.$transaction.mockRejectedValue(new Error('connection lost'));
    await expect(service.create({ type: IncidentType.FIRE, idempotencyKey: 'k-1' }, 'citizen-1', UserRole.CITIZEN))
      .rejects.toThrow('connection lost');
  });
});
