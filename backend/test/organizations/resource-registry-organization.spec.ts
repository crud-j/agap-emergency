import { v4 as uuidv4 } from 'uuid';
import { ResourcesService } from '../../src/resources/resources.service';

describe('ResourcesService.findAll — registry Organization column (MOD-27)', () => {
  it('returns each unit with its organization under `organization`', async () => {
    const org = { id: uuidv4(), name: 'Bocaue MDRRMO', short_name: 'MDRRMO' };
    const prisma = {
      resources: {
        findMany: jest.fn().mockResolvedValue([{ id: uuidv4(), organization_id: org.id, organizations: org }]),
      },
    };
    const service = new ResourcesService(prisma as any, {} as any);

    const [row] = await service.findAll({});

    expect(prisma.resources.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        organizations: { select: { id: true, name: true, short_name: true } },
        resource_capability_assignments: { include: { resource_capabilities: true }, orderBy: { assigned_at: 'asc' } },
      },
    }));
    expect(row).toMatchObject({ organization: org, capabilities: [] });
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
  });
});

describe('ResourcesService.updateStatus — fleet board (MOD-28)', () => {
  it('logs the change, writes an audit row and tells every open fleet board', async () => {
    const prisma = {
      resources: {
        findUnique: jest.fn().mockResolvedValue({ id: 'unit-1', status: 'AVAILABLE', organization_id: 'org-1' }),
        update: jest.fn().mockResolvedValue({ id: 'unit-1', status: 'OUT_OF_SERVICE' }),
      },
      resource_status_log: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
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
