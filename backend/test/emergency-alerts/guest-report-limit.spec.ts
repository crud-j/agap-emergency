import { lastValueFrom, of, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@agap/shared';
import {
  GUEST_REPORT_RULES,
  GuestReportLimitExceeded,
  GuestReportLimitService,
  normalizeDeviceId,
} from '../../src/emergency-alerts/guest-report-limit/guest-report-limit.service';
import {
  GuestReportLimitInterceptor,
  isGuestRequest,
} from '../../src/emergency-alerts/guest-report-limit/guest-report-limit.interceptor';

// Nothing listens on port 1, so the service runs on its in-memory fallback — the
// same path it takes in production while Redis is down.
function makeService(env: Record<string, string> = {}) {
  const values: Record<string, string> = { REDIS_URL: 'redis://127.0.0.1:1', ...env };
  const config = { get: (key: string, fallback?: string) => values[key] ?? fallback } as unknown as ConfigService;
  return new GuestReportLimitService(config);
}

const DEVICE_MAX = GUEST_REPORT_RULES.find((r) => r.scope === 'device')!.max;
const IP_MAX = GUEST_REPORT_RULES.find((r) => r.scope === 'ip')!.max;

describe('GuestReportLimitService', () => {
  let service: GuestReportLimitService;

  beforeEach(() => {
    service = makeService();
  });
  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('allows a few reports from one phone, then blocks with a hotline message', async () => {
    const source = { ip: '203.0.113.5', deviceId: 'device-aaaaaaaa' };
    for (let i = 0; i < DEVICE_MAX; i++) await service.reserve(source, `key-${i}`);

    const blocked = service.reserve(source, 'key-next');
    await expect(blocked).rejects.toBeInstanceOf(GuestReportLimitExceeded);
    const err = (await blocked.catch((e) => e)) as GuestReportLimitExceeded;
    expect(err.getStatus()).toBe(429);
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
    expect(JSON.stringify(err.getResponse())).toContain('911');
  });

  it('does not count a retry of the same report (offline queue / Try Again)', async () => {
    const source = { ip: '203.0.113.6', deviceId: 'device-bbbbbbbb' };
    for (let i = 0; i < DEVICE_MAX + 3; i++) await service.reserve(source, 'same-key');
    await expect(service.reserve(source, 'other-key')).resolves.toBeDefined();
  });

  it('gives the slot back when the report was not created', async () => {
    const source = { ip: '203.0.113.7', deviceId: 'device-cccccccc' };
    for (let i = 0; i < DEVICE_MAX; i++) {
      const lease = await service.reserve(source, `failed-${i}`);
      await lease.release();
    }
    await expect(service.reserve(source, 'real-report')).resolves.toBeDefined();
  });

  it('caps one network even when every request claims a new device id', async () => {
    const ip = '203.0.113.8';
    for (let i = 0; i < IP_MAX; i++) {
      await service.reserve({ ip, deviceId: `spoofed-device-${i}` }, `k-${i}`);
    }
    await expect(service.reserve({ ip, deviceId: 'spoofed-device-new' }, 'k-new')).rejects.toBeInstanceOf(
      GuestReportLimitExceeded,
    );
  });

  it('keeps other phones on the same network reporting (shared carrier IP)', async () => {
    const ip = '203.0.113.9';
    for (let i = 0; i < DEVICE_MAX; i++) await service.reserve({ ip, deviceId: 'device-dddddddd' }, `d-${i}`);
    await expect(service.reserve({ ip, deviceId: 'device-eeeeeeee' }, 'e-1')).resolves.toBeDefined();
  });

  it('can be switched off by the operations center', async () => {
    const off = makeService({ GUEST_REPORT_LIMIT_DISABLED: 'true' });
    const source = { ip: '203.0.113.10', deviceId: 'device-ffffffff' };
    for (let i = 0; i < DEVICE_MAX + 5; i++) await off.reserve(source, `off-${i}`);
    await off.onModuleDestroy();
  });

  it('ignores malformed device ids', () => {
    expect(normalizeDeviceId('abc')).toBeUndefined();
    expect(normalizeDeviceId('x'.repeat(65))).toBeUndefined();
    expect(normalizeDeviceId('bad id with spaces')).toBeUndefined();
    expect(normalizeDeviceId(['device-aaaaaaaa'])).toBeUndefined();
    expect(normalizeDeviceId('k3j4h5g6f7d8s9a0q1w2e3r4')).toBe('k3j4h5g6f7d8s9a0q1w2e3r4');
  });
});

describe('GuestReportLimitInterceptor', () => {
  function context(req: Record<string, unknown>) {
    const res = { setHeader: jest.fn() };
    return {
      res,
      ctx: { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any,
    };
  }

  it('treats signed-in citizens as accountable and bystander accounts as guests', () => {
    expect(isGuestRequest({})).toBe(true);
    expect(isGuestRequest({ user: { id: 'u1', role: UserRole.BYSTANDER } })).toBe(true);
    expect(isGuestRequest({ user: { id: 'u1', role: UserRole.CITIZEN } })).toBe(false);
  });

  it('never limits a signed-in citizen', async () => {
    const limiter = { reserve: jest.fn() };
    const interceptor = new GuestReportLimitInterceptor(limiter as any);
    const { ctx } = context({ user: { id: 'u1', role: UserRole.CITIZEN }, body: {} });
    await lastValueFrom(await interceptor.intercept(ctx, { handle: () => of('created') }));
    expect(limiter.reserve).not.toHaveBeenCalled();
  });

  it('releases the slot when creating the report fails', async () => {
    const release = jest.fn().mockResolvedValue(undefined);
    const limiter = { reserve: jest.fn().mockResolvedValue({ release }) };
    const interceptor = new GuestReportLimitInterceptor(limiter as any);
    const { ctx } = context({
      ip: '203.0.113.11',
      headers: { 'x-device-id': 'device-gggggggg' },
      body: { idempotencyKey: 'abc' },
    });

    const result = await interceptor.intercept(ctx, { handle: () => throwError(() => new Error('db down')) });
    await expect(lastValueFrom(result)).rejects.toThrow('db down');
    expect(limiter.reserve).toHaveBeenCalledWith({ ip: '203.0.113.11', deviceId: 'device-gggggggg' }, 'abc');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('sets Retry-After when the limit is reached', async () => {
    const limiter = { reserve: jest.fn().mockRejectedValue(new GuestReportLimitExceeded(300)) };
    const interceptor = new GuestReportLimitInterceptor(limiter as any);
    const { ctx, res } = context({ ip: '203.0.113.12', headers: {}, body: {} });

    await expect(interceptor.intercept(ctx, { handle: () => of('x') })).rejects.toBeInstanceOf(
      GuestReportLimitExceeded,
    );
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '300');
  });
});
