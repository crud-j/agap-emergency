import { RespondersService } from '../../src/responders/responders.service';
import { DispatchService } from '../../src/dispatch/dispatch.service';

const dispatchRow = { id: 'dispatch-1', incident_id: 'inc-1', resource_id: 'res-1' };

function respondersSetup() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValueOnce([{ user_id: 'resp-1', status: 'AVAILABLE' }]).mockResolvedValue([]),
    dispatches: {
      findUnique: jest.fn().mockResolvedValue({ ...dispatchRow, dispatch_crew: [{ user_id: 'resp-1' }] }),
      update: jest.fn().mockResolvedValue({ ...dispatchRow, status: 'ACCEPTED' }),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    dispatches: {
      findUnique: jest.fn().mockResolvedValue({ ...dispatchRow, dispatch_crew: [{ user_id: 'resp-1' }] }),
      update: jest.fn().mockResolvedValue({ ...dispatchRow, status: 'REJECTED' }),
      findFirst: jest.fn(),
    },
    location_history: { create: jest.fn().mockResolvedValue({ id: 'loc-1', recorded_at: new Date('2026-10-18T00:00:00Z') }) },
  };
  const realtime = { dispatchUpdated: jest.fn(), notifyResponderLocationUpdated: jest.fn() };
  const service = new RespondersService(prisma as any, realtime as any, {} as any);
  return { service, prisma, realtime };
}

describe('WP5 backend support for the dispatch dashboard', () => {
  describe('dispatch.updated on crew response', () => {
    it('emits after the crew accepts, so the dashboard leaves "Awaiting crew acceptance"', async () => {
      const { service, realtime } = respondersSetup();

      await service.acceptAssignment('dispatch-1', 'resp-1');

      expect(realtime.dispatchUpdated).toHaveBeenCalledWith('inc-1', {
        dispatchId: 'dispatch-1',
        resourceId: 'res-1',
        status: 'ACCEPTED',
      });
    });

    it('emits when the crew declines', async () => {
      const { service, realtime } = respondersSetup();

      await service.declineAssignment('dispatch-1', 'resp-1', 'Vehicle down');

      expect(realtime.dispatchUpdated).toHaveBeenCalledWith('inc-1', expect.objectContaining({ status: 'REJECTED' }));
    });

    it('still accepts when the realtime emit throws', async () => {
      const { service, realtime } = respondersSetup();
      realtime.dispatchUpdated.mockImplementation(() => {
        throw new Error('socket down');
      });

      await expect(service.acceptAssignment('dispatch-1', 'resp-1')).resolves.toMatchObject({ status: 'ACCEPTED' });
    });
  });

  describe('POST /responders/location (alternate push path)', () => {
    it('broadcasts the same dispatchId + call sign contract as /locations/track', async () => {
      const { service, prisma, realtime } = respondersSetup();
      prisma.dispatches.findFirst.mockResolvedValue({ id: 'dispatch-1', resources: { call_sign: 'ALPHA-1' } });

      await service.pushLocation({ incidentId: 'inc-1', latitude: 14.7993, longitude: 120.9266 } as any, 'resp-1');

      const [, payload] = realtime.notifyResponderLocationUpdated.mock.calls[0]!;
      expect(payload).toMatchObject({ responderId: 'resp-1', dispatchId: 'dispatch-1', callSign: 'ALPHA-1' });
      expect(JSON.stringify(payload)).not.toMatch(/name|phone/i);
    });
  });

  describe('GET /dispatch?incidentId= (staff-only)', () => {
    function dispatchService() {
      const prisma = {
        dispatches: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue({ id: 'd' }) },
      };
      const service = new DispatchService(prisma as any, {} as any, {} as any, {} as any);
      return { service, prisma };
    }

    it('includes crew names for the tracking card', async () => {
      const { service, prisma } = dispatchService();
      await service.findAll({ incidentId: 'inc-1' });

      const args = prisma.dispatches.findMany.mock.calls[0]![0];
      expect(args.where).toEqual({ incident_id: 'inc-1' });
      expect(args.include.dispatch_crew).toEqual({
        include: { users: { select: { id: true, full_name: true } } },
      });
    });

    it('does not add crew names to the role-unrestricted GET /dispatch/:id', async () => {
      const { service, prisma } = dispatchService();
      await service.findById('d');
      expect(prisma.dispatches.findUnique.mock.calls[0]![0].include.dispatch_crew).toBe(true);
    });
  });
});
