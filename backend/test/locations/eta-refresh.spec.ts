import { EtaRefreshProcessor } from '../../src/jobs/processors/eta-refresh.processor';

const job = {
  data: {
    dispatchId: 'dispatch-1',
    incidentId: 'inc-1',
    responderLat: 14.79,
    responderLng: 120.92,
    incidentLat: 14.8,
    incidentLng: 120.93,
  },
} as any;

function setup(dispatchStatus: string | null, freshest: { latitude: number; longitude: number } | null) {
  const prisma = {
    dispatches: { findUnique: jest.fn().mockResolvedValue(dispatchStatus ? { status: dispatchStatus } : null) },
    location_history: { findFirst: jest.fn().mockResolvedValue(freshest) },
    transportRecord: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const realtime = { notifyEtaUpdated: jest.fn() };
  const maps = { route: jest.fn().mockResolvedValue({ durationSeconds: 240 }) };
  return { processor: new EtaRefreshProcessor(prisma as any, realtime as any, maps as any), prisma, realtime, maps };
}

describe('EtaRefreshProcessor', () => {
  it("routes from the freshest fix of this dispatch's crew, not the enqueued point", async () => {
    const { processor, prisma, maps, realtime } = setup('ACCEPTED', { latitude: 14.795, longitude: 120.925 });

    await processor.process(job);

    expect(prisma.location_history.findFirst.mock.calls[0][0].where).toEqual({
      incident_id: 'inc-1',
      users: { is: { dispatch_crew: { some: { dispatch_id: 'dispatch-1' } } } },
    });
    expect(maps.route).toHaveBeenCalledWith({ lat: 14.795, lng: 120.925 }, { lat: 14.8, lng: 120.93 });
    expect(realtime.notifyEtaUpdated).toHaveBeenCalledWith(
      'inc-1',
      expect.objectContaining({ dispatchId: 'dispatch-1', etaSeconds: 240, isEstimate: true }),
    );
  });

  it('falls back to the enqueued point when no fix is stored', async () => {
    const { processor, maps } = setup('ACCEPTED', null);
    await processor.process(job);
    expect(maps.route).toHaveBeenCalledWith({ lat: 14.79, lng: 120.92 }, { lat: 14.8, lng: 120.93 });
  });

  it.each(['COMPLETED', 'CANCELLED', null])('skips a %s dispatch without routing', async (status) => {
    const { processor, maps, realtime } = setup(status, null);
    await processor.process(job);
    expect(maps.route).not.toHaveBeenCalled();
    expect(realtime.notifyEtaUpdated).not.toHaveBeenCalled();
  });

  it('swallows routing failures and emits nothing', async () => {
    const { processor, maps, realtime } = setup('ACCEPTED', null);
    maps.route.mockRejectedValue(new Error('OSRM down'));
    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(realtime.notifyEtaUpdated).not.toHaveBeenCalled();
  });
});
