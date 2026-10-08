import { DuplicateDetectionService } from '../../src/incidents/duplicate-detection/duplicate-detection.service';
import { IncidentsService } from '../../src/incidents/incidents.service';
import { IncidentType, IncidentStatus, DUPLICATE_DETECTION_RADIUS_METERS } from '@agap/shared';

// ─── DuplicateDetectionService — PostGIS radius query (ST_DWithin + distance) ───

describe('DuplicateDetectionService.findCandidates', () => {
  const prisma = { $queryRaw: jest.fn(), incident: { findUnique: jest.fn() } };
  let service: DuplicateDetectionService;

  beforeEach(() => {
    service = new DuplicateDetectionService(prisma as any);
    jest.clearAllMocks();
  });

  it('returns nearby same-category candidates with distance, nearest first', async () => {
    // Two seeded reports near the query point (metres from ST_Distance).
    prisma.$queryRaw.mockResolvedValue([
      { id: 'inc-near', distance_meters: 45 },
      { id: 'inc-far', distance_meters: 180 },
    ]);

    const candidates = await service.findCandidates(14.7969, 120.9268, IncidentType.FIRE, {
      excludeId: 'inc-self',
    });

    expect(candidates).toEqual([
      { incidentId: 'inc-near', distanceMeters: 45 },
      { incidentId: 'inc-far', distanceMeters: 180 },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('passes the detection radius and the exclude id into the query', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await service.findCandidates(14.7, 120.9, IncidentType.MEDICAL, { excludeId: 'inc-self' });

    // Prisma.sql builds a parameterised query; the radius + excludeId are bound values.
    const sql = prisma.$queryRaw.mock.calls[0][0];
    expect(sql.values).toContain(DUPLICATE_DETECTION_RADIUS_METERS);
    expect(sql.values).toContain('inc-self');
    // A time-window lower bound (Date) is also bound.
    expect(sql.values.some((v: unknown) => v instanceof Date)).toBe(true);
  });

  it('two nearby same-category reports surface each other (reciprocal) with distance', async () => {
    // Query from A's point returns B; query from B's point returns A — ~90 m apart.
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'inc-B', distance_meters: 90 }])
      .mockResolvedValueOnce([{ id: 'inc-A', distance_meters: 90 }]);

    const fromA = await service.findCandidates(14.7969, 120.9268, IncidentType.FLOOD, { excludeId: 'inc-A' });
    const fromB = await service.findCandidates(14.7977, 120.9268, IncidentType.FLOOD, { excludeId: 'inc-B' });

    expect(fromA[0]).toEqual({ incidentId: 'inc-B', distanceMeters: 90 });
    expect(fromB[0]).toEqual({ incidentId: 'inc-A', distanceMeters: 90 });
  });

  it('findNearbyRecent returns the nearest full incident, or null when none', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'inc-B', distance_meters: 60 }]);
    prisma.incident.findUnique.mockResolvedValueOnce({ id: 'inc-B', category: 'FIRE' });
    const nearest = await service.findNearbyRecent(14.7, 120.9, IncidentType.FIRE);
    expect(nearest).toEqual({ id: 'inc-B', category: 'FIRE' });

    prisma.$queryRaw.mockResolvedValueOnce([]);
    const none = await service.findNearbyRecent(14.7, 120.9, IncidentType.FIRE);
    expect(none).toBeNull();
  });
});

// ─── IncidentsService.mergeDuplicate — advisory merge (status + link + audit) ───

describe('IncidentsService.mergeDuplicate', () => {
  const txUpdate = jest.fn();
  const txEventCreate = jest.fn();

  const prisma = {
    incident: { findUnique: jest.fn(), update: jest.fn() },
    incidentEvent: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const realtime = { notifyIncidentStatusChanged: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  function makeService() {
    return new IncidentsService(
      prisma as any,
      {} as any, // statusService (unused here)
      {} as any, // duplicateService (unused here)
      {} as any, // priorityService (unused here)
      realtime as any,
      audit as any,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.incident.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === 'inc-A') return Promise.resolve({ id: 'inc-A', status: IncidentStatus.ACKNOWLEDGED, public_reference: 'INC-A' });
      if (where.id === 'inc-master') return Promise.resolve({ id: 'inc-master', status: IncidentStatus.ACKNOWLEDGED, public_reference: 'INC-M' });
      return Promise.resolve(null);
    });
    txUpdate.mockResolvedValue({ id: 'inc-A', status: IncidentStatus.DUPLICATE, duplicate_of_id: 'inc-master' });
    txEventCreate.mockResolvedValue({});
    prisma.$transaction.mockImplementation((fn: (tx: any) => unknown) =>
      fn({ incident: { update: txUpdate }, incidentEvent: { create: txEventCreate } }),
    );
  });

  it('sets status=DUPLICATE + duplicate_of_id, audits, and emits', async () => {
    const result = await service_mergeDuplicate();

    // Persisted the link + status
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inc-A' },
        data: expect.objectContaining({
          status: IncidentStatus.DUPLICATE,
          duplicate_of_id: 'inc-master',
        }),
      }),
    );
    // Immutable audit entry (MOD-46)
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityId: 'inc-A',
        moduleId: 'MOD-26',
        newValues: expect.objectContaining({ duplicate_of_id: 'inc-master' }),
      }),
    );
    // Emitted the status change
    expect(realtime.notifyIncidentStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({ incidentId: 'inc-A', newStatus: IncidentStatus.DUPLICATE }),
    );
    expect(result.status).toBe(IncidentStatus.DUPLICATE);
  });

  it('rejects merging an incident into itself', async () => {
    await expect(makeService().mergeDuplicate('inc-A', 'inc-A', 'dispatcher-1')).rejects.toThrow(
      /itself/,
    );
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('throws when the master incident does not exist', async () => {
    await expect(
      makeService().mergeDuplicate('inc-A', 'inc-missing', 'dispatcher-1'),
    ).rejects.toThrow(/not found/);
  });

  function service_mergeDuplicate() {
    return makeService().mergeDuplicate('inc-A', 'inc-master', 'dispatcher-1');
  }
});
