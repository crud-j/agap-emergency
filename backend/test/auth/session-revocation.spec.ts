const redisMock = {
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  exists: jest.fn(),
  pipeline: jest.fn(),
};
jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn(() => redisMock) }));

import {
  SessionRevocationService,
  parseDurationSeconds,
} from '../../src/auth/sessions/session-revocation.service';

function makeService(values: Record<string, string> = {}) {
  const config = { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) };
  return new SessionRevocationService(config as any);
}

describe('SessionRevocationService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('markRevoked writes one key per session with the access-token TTL and notifies listeners', async () => {
    const set = jest.fn();
    redisMock.pipeline.mockReturnValue({ set, exec: jest.fn().mockResolvedValue([]) });
    const service = makeService({ JWT_EXPIRES_IN: '15m' });
    const listener = jest.fn();
    service.onRevoked(listener);

    await service.markRevoked(['s-1', 's-2']);

    expect(set).toHaveBeenCalledWith('auth:revoked:s-1', '1', 'EX', 900);
    expect(set).toHaveBeenCalledWith('auth:revoked:s-2', '1', 'EX', 900);
    expect(listener).toHaveBeenCalledWith(['s-1', 's-2']);
  });

  it('isRevoked reflects Redis', async () => {
    const service = makeService();
    redisMock.exists.mockResolvedValueOnce(1);
    await expect(service.isRevoked('s-1')).resolves.toBe(true);
    redisMock.exists.mockResolvedValueOnce(0);
    await expect(service.isRevoked('s-1')).resolves.toBe(false);
  });

  it('fails OPEN when Redis errors or hangs — dispatchers are never locked out by a Redis outage', async () => {
    const service = makeService();
    redisMock.exists.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.isRevoked('s-1')).resolves.toBe(false);

    redisMock.exists.mockReturnValueOnce(new Promise(() => undefined));
    await expect(service.isRevoked('s-1')).resolves.toBe(false);
  });

  it('tokens without a sid (guest / legacy) are never treated as revoked', async () => {
    const service = makeService();
    await expect(service.isRevoked(undefined)).resolves.toBe(false);
    expect(redisMock.exists).not.toHaveBeenCalled();
  });

  it('markRevoked does not throw when Redis is down', async () => {
    redisMock.pipeline.mockReturnValue({ set: jest.fn(), exec: jest.fn().mockRejectedValue(new Error('down')) });
    await expect(makeService().markRevoked(['s-1'])).resolves.toBeUndefined();
  });
});

describe('parseDurationSeconds', () => {
  it.each([
    ['15m', 900],
    ['1h', 3600],
    ['7d', 604800],
    ['900', 900],
    ['30s', 30],
    ['nonsense', 86400],
  ])('%s → %i', (input, expected) => {
    expect(parseDurationSeconds(input)).toBe(expected);
  });
});
