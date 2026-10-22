import { QUEUE_NAMES } from '@agap/shared';
import {
  HEALTH_CHECK_TIMEOUT_MS,
  HEALTH_QUEUE_NAMES,
  SystemHealthService,
  scrubReason,
} from '../../src/administration/system-health.service';

const SECRETS = {
  TEXTBEE_API_KEY: 'tb_live_9f8e7d6c5b4a39281706f5e4d3c2b1a0',
  TEXTBEE_DEVICE_ID: '66f1c0ffee1234567890abcd',
  FIREBASE_PROJECT_ID: 'agap-test-project',
  FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk@agap-test-project.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\\n-----END PRIVATE KEY-----\\n',
  MAP_API_KEY: 'pk.eyJ1IjoiYWdhcCIsImEiOiJjbHRlc3RrZXkxMjM0NSJ9',
  MAP_PROVIDER: 'mapbox',
  MAP_ROUTER: 'osrm',
  MDRRMO_OPS_PHONE: '+639170000001',
};

function makeConfig(values: Record<string, string>) {
  return { get: jest.fn((key: string) => values[key]) };
}

function makeQueue(name: string, overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    name,
    client: Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') }),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 1, active: 0, failed: 0, delayed: 2 }),
    getFailed: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const never = () => new Promise<never>(() => undefined);

function makeService(opts: { config?: Record<string, string>; queues?: ReturnType<typeof makeQueue>[]; db?: jest.Mock } = {}) {
  const prisma = { $queryRaw: opts.db ?? jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
  const queues = opts.queues ?? HEALTH_QUEUE_NAMES.map((n) => makeQueue(n));
  return new SystemHealthService(prisma as any, makeConfig(opts.config ?? SECRETS) as any, queues as any);
}

describe('SystemHealthService (Phase 5a)', () => {
  afterEach(() => jest.useRealTimers());

  it('reports database, Redis, every queue and the integrations', async () => {
    const health = await makeService().getHealth();

    expect(health.database).toBe('ok');
    expect(health.redis).toBe('ok');
    expect(health.queues.map((q) => q.name).sort()).toEqual([...Object.values(QUEUE_NAMES)].sort());
    expect(health.queues[0]).toEqual(
      expect.objectContaining({ status: 'ok', waiting: 1, active: 0, failed: 0, delayed: 2 }),
    );
    expect(health.integrations).toEqual({
      sms: { configured: true },
      push: { configured: true },
      maps: { configured: true, tiles: 'mapbox', routing: 'osrm' },
    });
  });

  it('never returns a key, token, device ID or phone number', async () => {
    const sms = makeQueue(QUEUE_NAMES.SMS, {
      getFailed: jest.fn().mockResolvedValue([
        {
          finishedOn: Date.parse('2026-10-22T03:00:00Z'),
          failedReason: `Gateway refused ${SECRETS.TEXTBEE_API_KEY} for +63 917 000 0001`,
        },
      ]),
    });
    const queues = HEALTH_QUEUE_NAMES.map((n) => (n === QUEUE_NAMES.SMS ? sms : makeQueue(n)));

    const json = JSON.stringify(await makeService({ queues }).getHealth());

    for (const [key, value] of Object.entries(SECRETS)) {
      if (key === 'MAP_PROVIDER' || key === 'MAP_ROUTER') continue; // provider names are shown on purpose
      expect(json).not.toContain(value);
    }
    expect(json).not.toContain('917');
    expect(json).toContain('"lastFailure":{"at":"2026-10-22T03:00:00.000Z"');
  });

  it('reports unconfigured integrations as false', async () => {
    const health = await makeService({ config: { MAP_PROVIDER: 'mapbox' } }).getHealth();
    expect(health.integrations.sms.configured).toBe(false);
    expect(health.integrations.push.configured).toBe(false);
    expect(health.integrations.maps).toEqual({ configured: false, tiles: 'mapbox', routing: 'osrm' });
  });

  it('counts OSM tiles as configured without a key', async () => {
    const health = await makeService({ config: { MAP_PROVIDER: 'maplibre', MAP_ROUTER: 'mapbox' } }).getHealth();
    // Mapbox routing without a key falls back to OSRM, as in maps.module.ts.
    expect(health.integrations.maps).toEqual({ configured: true, tiles: 'maplibre', routing: 'osrm' });
  });

  it('turns a hung Redis, queue or database into error instead of hanging', async () => {
    jest.useFakeTimers();
    const queues = HEALTH_QUEUE_NAMES.map((n) =>
      makeQueue(n, {
        getJobCounts: jest.fn(never),
        getFailed: jest.fn(never),
      }),
    );
    queues[0]!.client = Promise.resolve({ ping: jest.fn(never) });

    const pending = makeService({ queues, db: jest.fn(never) }).getHealth();
    await jest.advanceTimersByTimeAsync(HEALTH_CHECK_TIMEOUT_MS + 10);
    const health = await pending;

    expect(health.database).toBe('error');
    expect(health.redis).toBe('error');
    expect(health.queues.every((q) => q.status === 'error')).toBe(true);
    expect(health.integrations.sms.lastFailure).toBeUndefined();
  });

  it('reports a failing database as error', async () => {
    const health = await makeService({ db: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) }).getHealth();
    expect(health.database).toBe('error');
    expect(health.redis).toBe('ok');
  });

  it('scrubs failure reasons', () => {
    expect(scrubReason(undefined)).toBe('Unknown error');
    expect(scrubReason('HTTP 500 (ERR_BAD_RESPONSE)')).toBe('HTTP 500 (ERR_BAD_RESPONSE)');
    expect(scrubReason('to 09170000001')).toBe('to [number]');
    expect(scrubReason('timeout '.repeat(60))).toHaveLength(200);
  });
});
