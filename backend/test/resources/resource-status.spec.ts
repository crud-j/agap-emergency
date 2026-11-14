import 'reflect-metadata';
import { ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResourcesService } from '../../src/resources/resources.service';
import { UpdateResourceStatusDto } from '../../src/resources/dto/update-resource-status.dto';

/**
 * MOD-28 fleet board: a person sets only Available / Out of service / Offline /
 * Reserved, and never while the unit is on an active dispatch. Mission statuses
 * come from dispatch and the crew's progress.
 */
function build(opts: { activeDispatch?: boolean; lockedStatus?: string } = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ status: opts.lockedStatus ?? 'AVAILABLE' }]),
    dispatches: {
      findFirst: jest.fn().mockResolvedValue(
        opts.activeDispatch
          ? { resources: { name: 'Ambulance 1', call_sign: 'AMB-1' }, incidents: { public_reference: 'INC-2026-000123' } }
          : null,
      ),
    },
    resource_status_log: { create: jest.fn() },
    resources: {
      update: jest.fn(async ({ data }: { data: { status: string } }) => ({ id: 'res-1', status: data.status })),
    },
  };
  const prisma: any = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    resources: { findUnique: jest.fn().mockResolvedValue({ id: 'res-1', status: opts.lockedStatus ?? 'AVAILABLE' }) },
  };
  const audit: any = { log: jest.fn() };
  const realtime: any = { resourceStatusChanged: jest.fn() };
  const service = new ResourcesService(prisma, audit, realtime);
  return { service, tx, realtime, audit };
}

async function dtoErrors(status: string) {
  return validate(plainToInstance(UpdateResourceStatusDto, { status }));
}

describe('UpdateResourceStatusDto: only the statuses a person sets', () => {
  it.each(['AVAILABLE', 'OUT_OF_SERVICE', 'OFFLINE', 'RESERVED'])('accepts %s', async (status) => {
    expect(await dtoErrors(status)).toHaveLength(0);
  });

  it.each(['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'RETURNING', 'MAINTENANCE'])(
    'refuses %s (mission statuses come from dispatch and the crew)',
    async (status) => {
      const errors = await dtoErrors(status);
      expect(errors).toHaveLength(1);
      expect(Object.values(errors[0]!.constraints ?? {}).join()).toContain('AVAILABLE, OUT_OF_SERVICE, OFFLINE, RESERVED');
    },
  );
});

describe('ResourcesService.updateStatus', () => {
  it('refuses a unit on an active dispatch, names the incident, and changes nothing', async () => {
    const b = build({ activeDispatch: true, lockedStatus: 'TRANSPORTING' });
    const err = await b.service.updateStatus('res-1', { status: 'OUT_OF_SERVICE' } as any, 'sup-1').catch((e) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({
      code: 'UNIT_ON_MISSION',
      message: expect.stringContaining('AMB-1 is on INC-2026-000123'),
    });
    expect(b.tx.resources.update).not.toHaveBeenCalled();
    expect(b.tx.resource_status_log.create).not.toHaveBeenCalled();
    expect(b.realtime.resourceStatusChanged).not.toHaveBeenCalled();
  });

  it('checks for an active dispatch after locking the unit row', async () => {
    const b = build({ activeDispatch: true });
    await b.service.updateStatus('res-1', { status: 'OFFLINE' } as any, 'sup-1').catch(() => undefined);
    expect(b.tx.dispatches.findFirst.mock.invocationCallOrder[0]!).toBeGreaterThan(b.tx.$queryRaw.mock.invocationCallOrder[0]!);
    expect(b.tx.dispatches.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { resource_id: 'res-1', status: { in: ['PENDING', 'SENT', 'ACCEPTED'] } },
    }));
  });

  it('sets a free unit Out of service: logged, audited and broadcast', async () => {
    const b = build();
    await b.service.updateStatus('res-1', { status: 'OUT_OF_SERVICE' } as any, 'sup-1');

    expect(b.tx.resource_status_log.create).toHaveBeenCalledWith({
      data: { resource_id: 'res-1', from_status: 'AVAILABLE', to_status: 'OUT_OF_SERVICE', changed_by_id: 'sup-1' },
    });
    expect(b.audit.log).toHaveBeenCalledWith(expect.objectContaining({ moduleId: 'MOD-28' }));
    expect(b.realtime.resourceStatusChanged).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 'res-1', previousStatus: 'AVAILABLE', newStatus: 'OUT_OF_SERVICE',
    }));
  });

  it('can recover a unit stuck in a mission status with no active dispatch (old data), clearing its incident link', async () => {
    const b = build({ lockedStatus: 'TRANSPORTING' });
    await b.service.updateStatus('res-1', { status: 'AVAILABLE' } as any, 'sup-1');

    expect(b.tx.resources.update).toHaveBeenCalledWith({
      where: { id: 'res-1' },
      data: { status: 'AVAILABLE', current_incident_id: null },
    });
  });
});
