import { BadRequestException, ConflictException } from '@nestjs/common';
import { DisasterModeService } from '../../src/disaster-mode/disaster-mode.service';

/** MOD-52 — surge mode: one at a time, audited, and a broadcast that actually delivers. */
describe('DisasterModeService', () => {
  function build() {
    const prisma = {
      surge_incidents: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      user: { findMany: jest.fn() },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const notifications = { create: jest.fn().mockResolvedValue({}) };
    return { service: new DisasterModeService(prisma as any, audit as any, notifications as any), prisma, audit, notifications };
  }

  it('refuses a second active surge', async () => {
    const { service, prisma } = build();
    prisma.surge_incidents.findFirst.mockResolvedValue({ name: 'Typhoon Kristine' });
    await expect(service.activate({ name: 'Flood', category: 'FLOOD' } as any, 'sup-1', 'org-1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.surge_incidents.create).not.toHaveBeenCalled();
  });

  it('activates and audits', async () => {
    const { service, prisma, audit } = build();
    prisma.surge_incidents.findFirst.mockResolvedValue(null);
    prisma.surge_incidents.create.mockResolvedValue({ id: 's-1', name: 'Flood', category: 'FLOOD', affected_barangays: ['Lolomboy'] });
    await service.activate({ name: 'Flood', category: 'FLOOD', affectedBarangays: ['Lolomboy'] } as any, 'sup-1', 'org-1');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'surge_incident', moduleId: 'MOD-52' }));
  });

  it('broadcast sends a notice to every active responder and reports how many were delivered', async () => {
    const { service, prisma, notifications, audit } = build();
    prisma.surge_incidents.findUnique.mockResolvedValue({ id: 's-1', name: 'Flood', status: 'ACTIVE' });
    prisma.user.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);
    notifications.create.mockImplementation(({ userId }: { userId: string }) =>
      userId === 'r3' ? Promise.reject(new Error('db')) : Promise.resolve({}));

    const result = await service.broadcast({ surgeId: 's-1', message: '  Stage at Lolomboy covered court ' }, 'sup-1');

    expect(notifications.create).toHaveBeenCalledTimes(3);
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'r1', eventType: 'SURGE_BROADCAST', body: 'Stage at Lolomboy covered court',
    }));
    expect(result).toMatchObject({ recipientCount: 3, delivered: 2 });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'surge_broadcast', newValues: expect.objectContaining({ delivered: 2 }) }));
  });

  it('refuses to broadcast on an inactive surge', async () => {
    const { service, prisma } = build();
    prisma.surge_incidents.findUnique.mockResolvedValue({ id: 's-1', name: 'Flood', status: 'INACTIVE' });
    await expect(service.broadcast({ surgeId: 's-1', message: 'x' }, 'sup-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
