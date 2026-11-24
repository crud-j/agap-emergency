import { QUEUE_NAMES } from '@agap/shared';
import {
  HEALTH_QUEUE_NAMES,
  STORAGE_CHECK_TIMEOUT_MS,
  SystemHealthService,
  parseRedisInfo,
} from '../../src/administration/system-health.service';
import { storageProviderName } from '../../src/administration/storage-probe';

const REDIS_INFO = [
  '# Server',
  'redis_version:7.2.4',
  'uptime_in_seconds:86400',
  '# Clients',
  'connected_clients:6',
  '# Memory',
  'used_memory:2097152',
  'maxmemory:0',
  'maxmemory_policy:noeviction',
  '',
].join('\r\n');

const ENDPOINT = 'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';

function makeQueue(name: string) {
  return {
    name,
    client: Promise.resolve({
      ping: jest.fn().mockResolvedValue('PONG'),
      info: jest.fn().mockResolvedValue(REDIS_INFO),
      dbsize: jest.fn().mockResolvedValue(42),
    }),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0, delayed: 0 }),
    getFailed: jest.fn().mockResolvedValue([]),
  };
}

function makePrisma() {
  const $queryRaw = jest.fn((strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('pg_database_size')) {
      return Promise.resolve([{ version: '16.4 (Debian 16.4-1)', size_bytes: BigInt(52428800), connections: BigInt(7), max_connections: '100' }]);
    }
    if (sql.includes('postgis_lib_version')) return Promise.resolve([{ version: '3.4.2' }]);
    return Promise.resolve([{ '?column?': 1 }]);
  });
  return {
    $queryRaw,
    system_configurations: { count: jest.fn().mockResolvedValue(3) },
    incidentAttachment: {
      aggregate: jest.fn().mockResolvedValue({ _count: { _all: 12 }, _sum: { file_size_bytes: 3_500_000 } }),
    },
    barangay_sms_inbound: { count: jest.fn().mockResolvedValue(2) },
    sms_log: {
      groupBy: jest.fn().mockResolvedValue([
        { status: 'ACCEPTED', _count: { _all: 9 } },
        { status: 'FAILED', _count: { _all: 1 } },
      ]),
      findFirst: jest.fn(({ where }: { where: { status: unknown } }) =>
        Promise.resolve(
          where.status === 'ACCEPTED'
            ? { created_at: new Date('2026-11-24T03:00:00Z') }
            : { created_at: new Date('2026-11-24T02:00:00Z'), error: 'HTTP 500 to +63 917 000 0001', gateway_status: 500 },
        ),
      ),
    },
  };
}

function makeProbe(head: jest.Mock = jest.fn().mockResolvedValue(undefined), configured = true) {
  return {
    describe: () => ({ configured, provider: storageProviderName(ENDPOINT), localFallback: false }),
    headBucket: head,
  };
}

const CONFIG = { TEXTBEE_API_KEY: 'k', TEXTBEE_DEVICE_ID: 'd' };

function makeService(probe: ReturnType<typeof makeProbe> | undefined = makeProbe(), prisma = makePrisma()) {
  return new SystemHealthService(
    prisma as any,
    { get: (k: string) => (CONFIG as Record<string, string>)[k] } as any,
    HEALTH_QUEUE_NAMES.map(makeQueue) as any,
    probe as any,
  );
}

describe('SystemHealthService measurements (admin UI, 2026-11-24)', () => {
  afterEach(() => jest.useRealTimers());

  it('measures the database: latency, version, PostGIS, size and connections', async () => {
    const h = await makeService().getHealth();
    expect(h.database).toBe('ok');
    expect(h.details.database).toEqual({
      latencyMs: expect.any(Number),
      version: '16.4',
      postgisVersion: '3.4.2',
      sizeBytes: 52428800,
      connections: 7,
      maxConnections: 100,
    });
    expect(h.details.database.latencyMs).toBeGreaterThanOrEqual(1);
  });

  it('reads Redis INFO: version, uptime, memory, policy, clients and keys', async () => {
    const h = await makeService().getHealth();
    expect(h.redis).toBe('ok');
    expect(h.details.redis).toEqual({
      latencyMs: expect.any(Number),
      version: '7.2.4',
      uptimeSeconds: 86400,
      usedMemoryBytes: 2097152,
      maxMemoryBytes: 0,
      memoryPolicy: 'noeviction',
      connectedClients: 6,
      keys: 42,
    });
  });

  it('checks the bucket and reports the provider, never the endpoint', async () => {
    const h = await makeService().getHealth();
    expect(h.storage).toBe('ok');
    expect(h.details.storage).toEqual(
      expect.objectContaining({ configured: true, provider: 'Cloudflare R2', localFallback: false, incidentFiles: 12, incidentFileBytes: 3_500_000 }),
    );
    expect(JSON.stringify(h)).not.toContain('0123456789abcdef');
  });

  it('reports storage as error when the bucket refuses', async () => {
    const h = await makeService(makeProbe(jest.fn().mockRejectedValue(new Error('AccessDenied')))).getHealth();
    expect(h.storage).toBe('error');
    expect(h.details.storage.latencyMs).toBeNull();
    expect(h.database).toBe('ok');
  });

  it('reports storage as error when it is not configured, without calling the bucket', async () => {
    const head = jest.fn();
    const h = await makeService(makeProbe(head, false)).getHealth();
    expect(h.storage).toBe('error');
    expect(head).not.toHaveBeenCalled();
  });

  it('turns a hung bucket into error after the storage timeout', async () => {
    jest.useFakeTimers();
    const pending = makeService(makeProbe(jest.fn(() => new Promise(() => undefined)))).getHealth();
    await jest.advanceTimersByTimeAsync(STORAGE_CHECK_TIMEOUT_MS + 10);
    expect((await pending).storage).toBe('error');
  });

  it('counts SMS from the log and scrubs the last failure', async () => {
    const h = await makeService().getHealth();
    expect(h.integrations.sms).toEqual({
      configured: true,
      last24h: { accepted: 9, failed: 1, notConfigured: 0 },
      lastAcceptedAt: '2026-11-24T03:00:00.000Z',
      inbound24h: 2,
      lastFailure: { at: '2026-11-24T02:00:00.000Z', reason: 'HTTP 500 to [number]' },
    });
    expect(h.integrations.push.registeredDevices).toBe(3);
  });

  it('prefers the newer of the log failure and the queue failure', async () => {
    const queues = HEALTH_QUEUE_NAMES.map(makeQueue);
    const sms = queues.find((q) => q.name === QUEUE_NAMES.SMS)!;
    sms.getFailed = jest.fn().mockResolvedValue([{ finishedOn: Date.parse('2026-11-24T05:00:00Z'), failedReason: 'HTTP 503' }]);
    const service = new SystemHealthService(makePrisma() as any, { get: () => 'x' } as any, queues as any, makeProbe() as any);
    const h = await service.getHealth();
    expect(h.integrations.sms.lastFailure).toEqual({ at: '2026-11-24T05:00:00.000Z', reason: 'HTTP 503' });
  });

  it('parses INFO and names storage providers', () => {
    expect(parseRedisInfo('# Server\r\nredis_version:7.0.0\r\nos:Linux 6.1\r\n')).toEqual({ redis_version: '7.0.0', os: 'Linux 6.1' });
    expect(storageProviderName(undefined)).toBe('Not set');
    expect(storageProviderName('https://s3.ap-southeast-1.amazonaws.com')).toBe('Amazon S3');
    expect(storageProviderName('http://localhost:3900')).toBe('Local S3 (development)');
    expect(storageProviderName('https://storage.example.com')).toBe('S3-compatible');
  });
});
