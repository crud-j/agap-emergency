import { IncidentsService } from '../../src/incidents/incidents.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { IncidentStatus } from '@agap/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * WS-1.2 acceptance (service side): a status transition must PERSIST first, then
 * emit `incident.status_changed` AFTER the Prisma write commits, and the emit is
 * best-effort — a thrown broadcast must never fail the request (Reliability Rule:
 * a lost WS broadcast can never undo a persisted incident state change).
 */
describe('IncidentsService.updateStatus — realtime emit (WS-1.2)', () => {
  const incidentId = uuidv4();

  function build(order: string[]) {
    const mockPrisma = {
      incident: {
        // findById() — current status is ACKNOWLEDGED (→ ASSESSED is a valid transition).
        findUnique: jest.fn().mockResolvedValue({
          id: incidentId,
          status: IncidentStatus.ACKNOWLEDGED,
        }),
      },
      $transaction: jest.fn(async (fn: (tx: any) => unknown) => {
        const tx = {
          incident: {
            update: jest.fn(async () => {
              order.push('update');
              return { id: incidentId, status: IncidentStatus.ASSESSED };
            }),
          },
          incidentEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      }),
    };
    const mockRealtime = {
      notifyIncidentStatusChanged: jest.fn(() => {
        order.push('emit');
      }),
    };
    const service = new IncidentsService(
      mockPrisma as any,
      new IncidentStatusService(),
      {} as any, // DuplicateDetectionService — unused by updateStatus
      {} as any, // PriorityService — unused by updateStatus
      mockRealtime as any,
      { log: jest.fn() } as any, // AuditService — unused by updateStatus
    );
    return { service, mockPrisma, mockRealtime };
  }

  it('emits incident.status_changed AFTER the Prisma update commits', async () => {
    const order: string[] = [];
    const { service, mockRealtime } = build(order);

    await service.updateStatus(incidentId, IncidentStatus.ASSESSED, 'dispatcher-1');

    expect(mockRealtime.notifyIncidentStatusChanged).toHaveBeenCalledTimes(1);
    expect(mockRealtime.notifyIncidentStatusChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        incidentId,
        previousStatus: IncidentStatus.ACKNOWLEDGED,
        newStatus: IncidentStatus.ASSESSED,
        changedBy: 'dispatcher-1',
      }),
    );
    // persist → commit → emit
    expect(order).toEqual(['update', 'emit']);
  });

  it('does not fail the request when the emit throws (best-effort)', async () => {
    const order: string[] = [];
    const { service, mockRealtime } = build(order);
    mockRealtime.notifyIncidentStatusChanged.mockImplementation(() => {
      throw new Error('ws down');
    });

    // The persisted transition still returns normally even though the emit threw.
    await expect(
      service.updateStatus(incidentId, IncidentStatus.ASSESSED, 'dispatcher-1'),
    ).resolves.toEqual(expect.objectContaining({ status: IncidentStatus.ASSESSED }));
    expect(order).toEqual(['update']); // update committed; emit threw before pushing
  });
});
