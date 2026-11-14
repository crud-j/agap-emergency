import { v4 as uuidv4 } from 'uuid';
import { ResourcesService } from '../../src/resources/resources.service';

describe('ResourcesService.findAll — registry Organization column (MOD-27)', () => {
  it('returns each unit with its organization under `organization`', async () => {
    const org = { id: uuidv4(), name: 'Bocaue MDRRMO', short_name: 'MDRRMO' };
    const prisma = {
      resources: {
        findMany: jest.fn().mockResolvedValue([{ id: uuidv4(), organization_id: org.id, organizations: org, dispatches: [] }]),
      },
    };
    const service = new ResourcesService(prisma as any, {} as any);

    const [row] = await service.findAll({});

    expect(prisma.resources.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        organizations: { select: { id: true, name: true, short_name: true } },
        resource_capability_assignments: { include: { resource_capabilities: true }, orderBy: { assigned_at: 'asc' } },
        // The unit's active dispatch: the fleet board locks the status control while on one.
        dispatches: expect.objectContaining({ where: { status: { in: ['PENDING', 'SENT', 'ACCEPTED'] } }, take: 1 }),
      },
    }));
    expect(row).toMatchObject({ organization: org, capabilities: [], active_dispatch: null });
    expect(row).not.toHaveProperty('dispatches');
    expect(row).not.toHaveProperty('organizations');
  });

  it('returns each unit with its capabilities and whether each is verified (MOD-29)', async () => {
    const prisma = {
      resources: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'unit-1',
          organization_id: 'org-1',
          organizations: { id: 'org-1', name: 'MDRRMO', short_name: null },
          resource_capability_assignments: [
            { is_verified: true, resource_capabilities: { id: 'cap-1', name: 'WATER_RESCUE', category: 'FLOOD', description: 'x' } },
            { is_verified: false, resource_capabilities: { id: 'cap-2', name: 'ROPE_RESCUE', category: 'RESCUE', description: 'y' } },
          ],
          dispatches: [{ id: 'disp-1', incident_id: 'inc-1', incidents: { public_reference: 'INC-2026-000123' } }],
        }]),
      },
    };
    const service = new ResourcesService(prisma as any, {} as any);

    const [row] = await service.findAll({});

    expect(row!.capabilities).toEqual([
      { id: 'cap-1', name: 'WATER_RESCUE', category: 'FLOOD', is_verified: true },
      { id: 'cap-2', name: 'ROPE_RESCUE', category: 'RESCUE', is_verified: false },
    ]);
    expect(row).not.toHaveProperty('resource_capability_assignments');
    expect(row!.active_dispatch).toEqual({ dispatch_id: 'disp-1', incident_id: 'inc-1', incident_reference: 'INC-2026-000123' });
  });
});

describe('ResourcesService.updateStatus — fleet board (MOD-28)', () => {
  it('logs the change, writes an audit row and tells every open fleet board', async () => {
    // Interactive transaction: unit row lock, no active dispatch, then log + update.
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'AVAILABLE' }]),
      dispatches: { findFirst: jest.fn().mockResolvedValue(null) },
      resources: { update: jest.fn().mockResolvedValue({ id: 'unit-1', status: 'OUT_OF_SERVICE' }) },
      resource_status_log: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      resources: {
        findUnique: jest.fn().mockResolvedValue({ id: 'unit-1', status: 'AVAILABLE', organization_id: 'org-1' }),
      },
      resource_status_log: tx.resource_status_log,
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const realtime = { resourceStatusChanged: jest.fn() };
    const service = new ResourcesService(prisma as any, audit as any, realtime as any);

    await service.updateStatus('unit-1', { status: 'OUT_OF_SERVICE' } as any, 'dispatcher-1');

    expect(prisma.resource_status_log.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'STATUS_CHANGE', entityId: 'unit-1', moduleId: 'MOD-28',
      oldValues: { status: 'AVAILABLE' }, newValues: { status: 'OUT_OF_SERVICE' },
    }));
    expect(realtime.resourceStatusChanged).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 'unit-1', previousStatus: 'AVAILABLE', newStatus: 'OUT_OF_SERVICE',
    }));
  });
});
