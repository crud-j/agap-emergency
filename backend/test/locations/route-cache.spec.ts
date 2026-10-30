const redisMock = {
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};
jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn(() => redisMock) }));

import { RouteCacheService, type CachedRoute } from '../../src/locations/route-cache.service';

const value: CachedRoute = {
  leg: 'TO_FACILITY',
  destination: { kind: 'FACILITY', name: 'H', latitude: 14.79679, longitude: 120.94358, locationVerified: true },
  route: {
    geometry: [[120.92, 14.79], [120.94358, 14.79679]],
    distanceMeters: 1800,
    durationSeconds: 240,
    isEstimate: true,
    calculatedAt: '2026-10-28T01:00:00.000Z',
    stale: false,
  },
  fromFix: { lat: 14.79, lng: 120.92 },
};

function makeService() {
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback) };
  return new RouteCacheService(config as any);
}

describe('RouteCacheService (C4: fails open)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores under route:dispatch:{id} with a 120 s TTL and reads it back', async () => {
    const service = makeService();
    redisMock.set.mockResolvedValue('OK');
    await service.set('d-1', value);
    expect(redisMock.set).toHaveBeenCalledWith('route:dispatch:d-1', JSON.stringify(value), 'EX', 120);

    redisMock.get.mockResolvedValue(JSON.stringify(value));
    await expect(service.get('d-1')).resolves.toEqual(value);
    expect(redisMock.get).toHaveBeenCalledWith('route:dispatch:d-1');
  });

  it('get returns null on a miss', async () => {
    redisMock.get.mockResolvedValue(null);
    await expect(makeService().get('d-1')).resolves.toBeNull();
  });

  it('get returns null when Redis errors or hangs', async () => {
    const service = makeService();
    redisMock.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.get('d-1')).resolves.toBeNull();

    redisMock.get.mockReturnValueOnce(new Promise(() => undefined));
    await expect(service.get('d-1')).resolves.toBeNull();
  });

  it('set and clear never throw when Redis is down', async () => {
    const service = makeService();
    redisMock.set.mockRejectedValue(new Error('ECONNREFUSED'));
    redisMock.del.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.set('d-1', value)).resolves.toBeUndefined();
    await expect(service.clear('d-1')).resolves.toBeUndefined();
  });

  it('clear deletes the key; onModuleDestroy closes the client', async () => {
    const service = makeService();
    redisMock.del.mockResolvedValue(1);
    await service.clear('d-1');
    expect(redisMock.del).toHaveBeenCalledWith('route:dispatch:d-1');
    await service.onModuleDestroy();
    expect(redisMock.disconnect).toHaveBeenCalled();
  });
});
