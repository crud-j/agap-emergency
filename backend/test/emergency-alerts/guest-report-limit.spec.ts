import { lastValueFrom, of, throwError } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@agap/shared';
import { AuditAction } from '@agap/shared';
import {
  GUEST_REPORT_RULES,
  GuestReportLimitExceeded,
  GuestReportLimitService,
  normalizeDeviceId,
  spotKey,
} from '../../src/emergency-alerts/guest-report-limit/guest-report-limit.service';
import {
  GuestReportLimitInterceptor,
  deviceCode,
  isGuestRequest,
} from '../../src/emergency-alerts/guest-report-limit/guest-report-limit.interceptor';

// Nothing listens on port 1, so the service runs on its in-memory fallback — the
// same path it takes in production while Redis is down.
function makeService(env: Record<string, string> = {}, prisma?: unknown) {
  const values: Record<string, string> = { REDIS_URL: 'redis://127.0.0.1:1', ...env };
  const config = { get: (key: string, fallback?: string) => values[key] ?? fallback } as unknown as ConfigService;
  return new GuestReportLimitService(config, prisma as any);
}

/** A stand-in incident table: id → status, reference, and what it was merged into. */
type FakeIncident = { status: string; public_reference: string; duplicate_of_id?: string | null };
function fakePrisma(rows: Record<string, FakeIncident>) {
  return {
    incident: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows[where.id];
        return row ? { duplicate_of_id: null, ...row } : null;
      }),
    },
  };
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

  it('limits citizen SOS texts per sender number (MOD-17/19), separately from app reports', async () => {
    const phoneMax = GUEST_REPORT_RULES.find((r) => r.scope === 'phone')!.max;
    for (let i = 0; i < phoneMax; i++) await service.reserve({ phone: '+639171234567' }, `sms-${i}`);
    await expect(service.reserve({ phone: '+639171234567' }, 'sms-next')).rejects.toBeInstanceOf(GuestReportLimitExceeded);
    // Another number, and an app report from any device, are unaffected.
    await expect(service.reserve({ phone: '+639181234567' }, 'sms-other')).resolves.toBeDefined();
    await expect(service.reserve({ ip: '203.0.113.9', deviceId: 'device-zzzzzzzz' }, 'app-1')).resolves.toBeDefined();
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

  it('one network reporting the same place from many phones is capped at 3 per 10 minutes', async () => {
    const spotMax = GUEST_REPORT_RULES.find((r) => r.scope === 'spot')!.max;
    const ip = '203.0.113.20';
    const spot = spotKey(ip, 14.7963, 120.9272);
    for (let i = 0; i < spotMax; i++) {
      await service.reserve({ ip, deviceId: `phone-number-${i}`, spot }, `s-${i}`);
    }

    const blocked = await service.reserve({ ip, deviceId: 'phone-number-x', spot }, 's-x').catch((e) => e);
    expect(blocked).toBeInstanceOf(GuestReportLimitExceeded);
    expect(blocked.scope).toBe('spot');
    expect(blocked.rule).toEqual({ windowSeconds: 600, max: spotMax });
    expect(JSON.stringify(blocked.getResponse())).toMatch(/already reported.*911/);

    // Another place on the same network, and the same place from another network, still go through.
    await expect(service.reserve({ ip, deviceId: 'phone-number-y', spot: spotKey(ip, 14.81, 120.94) }, 's-y')).resolves.toBeDefined();
    await expect(
      service.reserve({ ip: '198.51.100.4', deviceId: 'phone-number-z', spot: spotKey('198.51.100.4', 14.7963, 120.9272) }, 's-z'),
    ).resolves.toBeDefined();
  });

  it('returns the 10-minute counts, and marks a retry of the same report as a repeat', async () => {
    const ip = '203.0.113.21';
    const spot = spotKey(ip, 14.7963, 120.9272);
    const first = await service.reserve({ ip, deviceId: 'phone-aaaaaaaa', spot }, 'c-1');
    const second = await service.reserve({ ip, deviceId: 'phone-bbbbbbbb', spot }, 'c-2');
    expect(first).toMatchObject({ repeat: false, counts: { device: 1, ip: 1, spot: 1 } });
    expect(second).toMatchObject({ repeat: false, counts: { device: 1, ip: 2, spot: 2 } });

    await expect(service.reserve({ ip, deviceId: 'phone-bbbbbbbb', spot }, 'c-2')).resolves.toMatchObject({ repeat: true });
  });

  it('spotKey: ~200 m cells per network; nothing without an IP or GPS', () => {
    const ip = '203.0.113.22';
    expect(spotKey(ip, 14.79630, 120.92720)).toBe(spotKey(ip, 14.79650, 120.92740)); // ~30 m apart
    expect(spotKey(ip, 14.79630, 120.92720)).not.toBe(spotKey(ip, 14.80130, 120.92720)); // ~550 m apart
    expect(spotKey(ip, 14.7963, 120.9272)).not.toBe(spotKey('198.51.100.1', 14.7963, 120.9272));
    expect(spotKey(undefined, 14.7963, 120.9272)).toBeUndefined();
    expect(spotKey(ip, undefined, 120.9272)).toBeUndefined();
    expect(spotKey(ip, '14.79' as unknown, 120.9272)).toBeUndefined();
  });

  it('ignores malformed device ids', () => {
    expect(normalizeDeviceId('abc')).toBeUndefined();
    expect(normalizeDeviceId('x'.repeat(65))).toBeUndefined();
    expect(normalizeDeviceId('bad id with spaces')).toBeUndefined();
    expect(normalizeDeviceId(['device-aaaaaaaa'])).toBeUndefined();
    expect(normalizeDeviceId('k3j4h5g6f7d8s9a0q1w2e3r4')).toBe('k3j4h5g6f7d8s9a0q1w2e3r4');
  });
});

describe('One open guest report per phone', () => {
  const PHONE = 'phone-open-aaaa';
  const OTHER = 'phone-open-bbbb';
  let rows: Record<string, FakeIncident>;
  let prisma: ReturnType<typeof fakePrisma>;
  let service: GuestReportLimitService;

  beforeEach(() => {
    rows = { 'inc-1': { status: 'RECEIVED', public_reference: 'INC-2026-000401' } };
    prisma = fakePrisma(rows);
    service = makeService({}, prisma);
  });
  afterEach(async () => {
    await service.onModuleDestroy();
  });

  async function firstReport() {
    await service.reserve({ ip: '203.0.113.40', deviceId: PHONE }, 'o-1');
    await service.rememberOpen(PHONE, 'inc-1');
  }

  it('refuses a second report while the first is open, naming it and the hotlines', async () => {
    await firstReport();

    const err = await service.reserve({ ip: '203.0.113.40', deviceId: PHONE }, 'o-2').catch((e) => e);
    expect(err).toBeInstanceOf(GuestReportLimitExceeded);
    expect(err.scope).toBe('open');
    expect(err.getStatus()).toBe(429);
    expect(err.retryAfterSeconds).toBe(0);
    const body = err.getResponse() as Record<string, unknown>;
    expect(body).toMatchObject({ code: 'GUEST_REPORT_OPEN', publicReference: 'INC-2026-000401' });
    expect(String(body['message'])).toMatch(/INC-2026-000401.*911/);
  });

  it.each(['ACKNOWLEDGED', 'DISPATCHED', 'ON_SCENE', 'TRANSPORTING'])('still refuses at %s', async (status) => {
    await firstReport();
    rows['inc-1']!.status = status;
    await expect(service.reserve({ deviceId: PHONE }, 'o-2')).rejects.toMatchObject({ scope: 'open' });
  });

  it.each(['RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'UNABLE_TO_RESPOND', 'REFERRED'])(
    'lets the phone report again once the first is %s',
    async (status) => {
      await firstReport();
      rows['inc-1']!.status = status;
      await expect(service.reserve({ deviceId: PHONE }, 'o-2')).resolves.toMatchObject({ repeat: false });
    },
  );

  it('a report merged into another stays open while that one is', async () => {
    await firstReport();
    rows['inc-1'] = { status: 'DUPLICATE', public_reference: 'INC-2026-000401', duplicate_of_id: 'inc-2' };
    rows['inc-2'] = { status: 'DISPATCHED', public_reference: 'INC-2026-000402' };

    // The guest is told their own reference, not the other reporter's.
    await expect(service.reserve({ deviceId: PHONE }, 'o-2')).rejects.toMatchObject({ openReference: 'INC-2026-000401' });

    rows['inc-2']!.status = 'CLOSED';
    await expect(service.reserve({ deviceId: PHONE }, 'o-3')).resolves.toBeDefined();
  });

  it('a retry of the same report (same idempotency key) is never refused', async () => {
    await firstReport();
    await expect(service.reserve({ deviceId: PHONE }, 'o-1')).resolves.toMatchObject({ repeat: true });
  });

  it('other phones, and signed-in reports (no device id), are not affected', async () => {
    await firstReport();
    await expect(service.reserve({ ip: '203.0.113.40', deviceId: OTHER }, 'p-1')).resolves.toBeDefined();
    await expect(service.reserve({ ip: '203.0.113.41' }, 'p-2')).resolves.toBeDefined();
  });

  it('a database error lets the report through (an outage never blocks help)', async () => {
    await firstReport();
    prisma.incident.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(service.reserve({ deviceId: PHONE }, 'o-2')).resolves.toBeDefined();
  });

  it('a deleted incident frees the phone', async () => {
    await firstReport();
    delete rows['inc-1'];
    await expect(service.reserve({ deviceId: PHONE }, 'o-2')).resolves.toBeDefined();
  });

  it('the interceptor remembers the new report and records the refusal with its reference', async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new GuestReportLimitInterceptor(service, audit as any);
    const req = (key: string) => ({ ip: '203.0.113.42', headers: { 'x-device-id': PHONE }, body: { idempotencyKey: key } });
    const res = { setHeader: jest.fn() };
    const ctx = (r: unknown) => ({ switchToHttp: () => ({ getRequest: () => r, getResponse: () => res }) }) as any;

    await lastValueFrom(await interceptor.intercept(ctx(req('i-1')), { handle: () => of({ id: 'inc-1', public_reference: 'INC-2026-000401' }) }));
    // rememberOpen is fire-and-forget; let it finish.
    await new Promise((r) => setImmediate(r));

    await expect(interceptor.intercept(ctx(req('i-2')), { handle: () => of({ id: 'never' }) })).rejects.toMatchObject({ scope: 'open' });
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: AuditAction.GUEST_REPORT_BLOCKED,
        newValues: expect.objectContaining({ reason: 'LIMIT_OPEN', openReport: 'INC-2026-000401', device: deviceCode(PHONE) }),
      }),
    );
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

describe('Guest reports in Security Events (IP + device code)', () => {
  const BOCAUE = { lat: 14.7963, lng: 120.9272 };

  function context(req: Record<string, unknown>) {
    const res = { setHeader: jest.fn() };
    return { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any;
  }
  const guestReq = (ip: string, device: string, key: string, body: Record<string, unknown> = BOCAUE) => ({
    ip,
    headers: { 'x-device-id': device, 'user-agent': 'okhttp/4.12.0' },
    body: { idempotencyKey: key, ...body },
  });

  let service: GuestReportLimitService;
  beforeEach(() => {
    service = makeService();
  });
  afterEach(async () => {
    await service.onModuleDestroy();
  });

  async function send(interceptor: GuestReportLimitInterceptor, req: Record<string, unknown>, result: unknown) {
    return lastValueFrom(await interceptor.intercept(context(req), { handle: () => of(result) }));
  }

  it('two phones on one network reporting the same place: the second is a repeat, both with the IP', async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new GuestReportLimitInterceptor(service, audit as any);

    await send(interceptor, guestReq('203.0.113.30', 'phone-one-aaaa', 'k-1'), { id: 'inc-1', public_reference: 'INC-2026-000301' });
    await send(interceptor, guestReq('203.0.113.30', 'phone-two-bbbb', 'k-2'), { id: 'inc-2', public_reference: 'INC-2026-000302' });

    const [first, second] = audit.log.mock.calls.map((c) => c[0]);
    expect(first).toMatchObject({
      action: AuditAction.GUEST_REPORT,
      ipAddress: '203.0.113.30',
      userAgent: 'okhttp/4.12.0',
      entityType: 'incident',
      entityId: 'inc-1',
      incidentId: 'inc-1',
      newValues: { publicReference: 'INC-2026-000301', device: deviceCode('phone-one-aaaa'), networkReports10m: 1, samePlaceReports10m: 1 },
    });
    expect(second).toMatchObject({
      action: AuditAction.GUEST_REPORT_REPEAT,
      ipAddress: '203.0.113.30',
      newValues: { publicReference: 'INC-2026-000302', device: deviceCode('phone-two-bbbb'), networkReports10m: 2, samePlaceReports10m: 2 },
    });
    expect(first.newValues.device).not.toBe(second.newValues.device);
  });

  it('records the refusal with the IP and which limit', async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new GuestReportLimitInterceptor(service, audit as any);
    const spotMax = GUEST_REPORT_RULES.find((r) => r.scope === 'spot')!.max;
    for (let i = 0; i < spotMax; i++) {
      await send(interceptor, guestReq('203.0.113.31', `phone-${i}-cccc`, `b-${i}`), { id: `inc-${i}` });
    }

    await expect(
      interceptor.intercept(context(guestReq('203.0.113.31', 'phone-x-dddd', 'b-x')), { handle: () => of({ id: 'never' }) }),
    ).rejects.toBeInstanceOf(GuestReportLimitExceeded);

    expect(audit.log).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: AuditAction.GUEST_REPORT_BLOCKED,
        ipAddress: '203.0.113.31',
        newValues: expect.objectContaining({ reason: 'LIMIT_SPOT', device: deviceCode('phone-x-dddd'), limit: spotMax, windowMinutes: 10 }),
      }),
    );
  });

  it('reads the SOS/shake response shape and their latitude/longitude fields', async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new GuestReportLimitInterceptor(service, audit as any);

    await send(
      interceptor,
      { ip: '203.0.113.32', headers: { 'x-device-id': 'phone-sos-eeee' }, body: { clientEventId: 'e-1', latitude: 14.7963, longitude: 120.9272 } },
      { incident: { id: 'inc-9', public_reference: 'INC-2026-000309' }, duplicate: false },
    );

    expect(audit.log.mock.calls[0][0]).toMatchObject({
      incidentId: 'inc-9',
      newValues: { publicReference: 'INC-2026-000309', samePlaceReports10m: 1 },
    });
  });

  it('a retry of the same report (same idempotency key) is not recorded twice', async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new GuestReportLimitInterceptor(service, audit as any);

    await send(interceptor, guestReq('203.0.113.33', 'phone-ffff-ffff', 'same'), { id: 'inc-1' });
    await send(interceptor, guestReq('203.0.113.33', 'phone-ffff-ffff', 'same'), { id: 'inc-1' });

    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('never records signed-in citizens here, nor a raw device id, nor a malformed IP', async () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new GuestReportLimitInterceptor(service, audit as any);

    await send(interceptor, { user: { id: 'u1', role: 'CITIZEN' }, body: BOCAUE }, { id: 'inc-1' });
    expect(audit.log).not.toHaveBeenCalled();

    await send(interceptor, guestReq('not-an-ip', 'phone-gggg-gggg', 'g-1'), { id: 'inc-2' });
    const entry = audit.log.mock.calls[0][0];
    expect(entry.ipAddress).toBeUndefined();
    expect(JSON.stringify(entry)).not.toContain('phone-gggg-gggg');
  });

  it('an audit failure never fails the report', async () => {
    const audit = { log: jest.fn().mockRejectedValue(new Error('db down')) };
    const interceptor = new GuestReportLimitInterceptor(service, audit as any);

    await expect(send(interceptor, guestReq('203.0.113.34', 'phone-hhhh-hhhh', 'h-1'), { id: 'inc-1' })).resolves.toEqual({ id: 'inc-1' });
  });
});
