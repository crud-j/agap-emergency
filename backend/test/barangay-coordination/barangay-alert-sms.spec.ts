import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { UnrecoverableError } from 'bullmq';
import {
  BARANGAY_SMS_MAX_LENGTH,
  BarangayNoticeMissingError,
  BarangayNotifyService,
  BarangayResendRefusedError,
  buildBarangayAlertSms,
  configuredOpsPhone,
} from '../../src/barangay-coordination/barangay-notify.service';
import { SmsProcessor } from '../../src/jobs/processors/sms.processor';

/** Phase 3: the automatic alert SMS to the barangay. Information only, never blocks. */

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return { __esModule: true, default: { ...actual, post: jest.fn(), get: jest.fn() }, isAxiosError: actual.isAxiosError };
});
const axiosPost = axios.post as jest.Mock;

const INCIDENT = 'inc-1';
const OVERRIDE = '+639750000000';
const BATIA = { barangayId: 'BATIA', name: 'Batia', matchMethod: 'POLYGON' as const, isApproximate: false };

const PRIMARY = { id: 'c-1', phone_e164: '+639171111111', role: 'PRIMARY', is_demo: false };
const BACKUP = { id: 'c-2', phone_e164: '+639182222222', role: 'BACKUP', is_demo: false };

const directoryFile = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../docs/automation/bocaue-barangay-hotlines.json'), 'utf8'),
);
const BARANGAY_NAMES: string[] = directoryFile.barangays.map((b: { name: string }) => b.name);
const CATEGORIES = ['MEDICAL', 'ROAD_ACCIDENT', 'FLOOD', 'NATURAL_DISASTER', 'RESCUE', 'FIRE', 'INDUSTRIAL', 'DEBRIS', 'OTHER'];

describe('buildBarangayAlertSms', () => {
  const base = {
    shortCode: '4821',
    category: 'ROAD_ACCIDENT',
    barangayName: 'Batia',
    isApproximate: false,
    latitude: 14.832214,
    longitude: 120.949201,
    reference: 'INC-2026-001234',
    opsPhone: '+639171234567',
  };

  it('matches the planned format', () => {
    expect(buildBarangayAlertSms(base)).toBe(
      'AGAP 4821 ROAD_ACCIDENT Brgy Batia 14.83221,120.94920 INC-2026-001234. Call MDRRMO +639171234567',
    );
  });

  it('marks an approximate barangay and a location without GPS', () => {
    const sms = buildBarangayAlertSms({ ...base, isApproximate: true, latitude: 0, longitude: 0 });
    expect(sms).toContain('Brgy Batia (approx) no GPS INC-2026-001234.');
  });

  it('omits the call-back line when MDRRMO_OPS_PHONE is unset', () => {
    expect(buildBarangayAlertSms({ ...base, opsPhone: '' })).not.toContain('Call MDRRMO');
  });

  it('stays under 160 characters for every barangay and category, worst case', () => {
    for (const barangayName of BARANGAY_NAMES) {
      for (const category of CATEGORIES) {
        const sms = buildBarangayAlertSms({
          ...base,
          barangayName,
          category,
          isApproximate: true,
          latitude: -14.123456,
          longitude: -120.123456,
          reference: 'INC-2026-999999',
          opsPhone: '+639999999999',
        });
        expect(sms.length).toBeLessThan(BARANGAY_SMS_MAX_LENGTH);
        expect(sms).toContain('Call MDRRMO'); // nothing was dropped to make it fit
      }
    }
  });

  it('drops the call-back before exceeding one segment, and refuses if still too long', () => {
    const longOps = buildBarangayAlertSms({ ...base, opsPhone: 'x'.repeat(100) });
    expect(longOps).not.toContain('Call MDRRMO');
    expect(() => buildBarangayAlertSms({ ...base, barangayName: 'y'.repeat(160) })).toThrow(/under 160/);
  });
});

// ── Notify service ───────────────────────────────────────────────────────────

function notice(over: Record<string, unknown> = {}) {
  return {
    id: 'n-1',
    incident_id: INCIDENT,
    barangay_id: 'BATIA',
    match_method: 'POLYGON',
    is_approximate: false,
    short_code: '0420',
    sms_status: 'DISABLED',
    sms_sent_at: null,
    last_report: null,
    last_report_at: null,
    followup_due_at: null,
    followup_sent_at: null,
    closed_at: null,
    barangay: { id: 'BATIA', name: 'Batia' },
    ...over,
  };
}

function build(
  opts: {
    env?: Record<string, string>;
    existing?: Record<string, unknown> | null;
    targets?: unknown[];
    queueFails?: boolean;
  } = {},
) {
  const env: Record<string, string> = {
    BARANGAY_ALERTS_ENABLED: 'true',
    BARANGAY_SMS_TEST_OVERRIDE_PHONE: '09750000000',
    NODE_ENV: 'development',
    MDRRMO_OPS_PHONE: '+639171234567',
    ...opts.env,
  };
  // A single stored notice row, so create → update → re-read behave like the DB.
  let stored: any = opts.existing ? notice(opts.existing) : null;
  const prisma: any = {
    incident_barangay_notices: {
      findFirst: jest.fn(async () => stored),
      findUnique: jest.fn(async () => stored),
      create: jest.fn(async ({ data }: any) => (stored = notice(data))),
      update: jest.fn(async ({ data }: any) => (stored = { ...stored, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    incident_locations: {
      findUnique: jest.fn().mockResolvedValue({ latitude: 14.79, longitude: 120.97, source: 'GPS' }),
      update: jest.fn().mockResolvedValue({}),
    },
    incident: {
      findUnique: jest.fn().mockResolvedValue({
        public_reference: 'INC-2026-000042',
        category: 'FLOOD',
        incident_locations: { latitude: 14.79, longitude: 120.97 },
      }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const directory: any = {
    resolve: jest.fn().mockResolvedValue(BATIA),
    barangayExists: jest.fn().mockImplementation(async (id: string) => ({ id, name: id === 'BATIA' ? 'Batia' : 'Bunlo' })),
    listContacts: jest.fn().mockResolvedValue([]),
    getAlertTargets: jest.fn().mockResolvedValue(opts.targets ?? [PRIMARY, BACKUP]),
  };
  const realtime: any = { barangayNoticeUpdated: jest.fn() };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const config: any = { get: jest.fn((key: string) => env[key]) };
  const smsQueue: any = {
    add: jest.fn().mockResolvedValue(undefined),
    addBulk: opts.queueFails
      ? jest.fn().mockRejectedValue(new Error('redis down'))
      : jest.fn().mockResolvedValue([]),
  };
  const service = new BarangayNotifyService(prisma, directory, realtime, audit, config, smsQueue);
  const lastEmit = () => realtime.barangayNoticeUpdated.mock.calls.at(-1)?.[0];
  return { service, prisma, directory, realtime, audit, smsQueue, lastEmit, stored: () => stored };
}

describe('configuredOpsPhone', () => {
  it.each(['', '   ', undefined, null, '+639000000000', '09000000000', '639000000000'])(
    'treats %p as not configured',
    (raw) => expect(configuredOpsPhone(raw)).toBeNull(),
  );

  it('keeps a real number', () => {
    expect(configuredOpsPhone(' +639171234567 ')).toBe('+639171234567');
  });

  it('leaves the call-back out of the alert when the number is a placeholder', () => {
    const sms = buildBarangayAlertSms({
      shortCode: '3526', category: 'MEDICAL', barangayName: 'Batia', isApproximate: false,
      latitude: 14.83221, longitude: 120.9492, reference: 'INC-2026-000001',
      accessCode: '3526-ANWQ', opsPhone: configuredOpsPhone('+639000000000'),
    });
    expect(sms).not.toContain('Call MDRRMO');
  });
});

describe('BarangayNotifyService: automatic alert', () => {
  it('queues one critical, retried alert job per target to the override phone and reports PENDING', async () => {
    const { service, smsQueue, lastEmit, stored } = build();
    await service.notifyForIncident(INCIDENT);

    const alerts = smsQueue.addBulk.mock.calls[0][0].filter((j: any) => j.name === 'barangay-alert-sms');
    expect(alerts).toHaveLength(2);
    for (const job of alerts) {
      expect(job.data).toMatchObject({ phone: OVERRIDE, incidentId: INCIDENT, noticeId: 'n-1', critical: true });
      expect(job.data.message).toMatch(/^AGAP \d{4} FLOOD Brgy Batia 14\.79000,120\.97000 INC-2026-000042\./);
      expect(job.opts).toMatchObject({ attempts: 4, backoff: { type: 'exponential' } });
    }
    expect(stored().sms_status).toBe('PENDING');
    expect(lastEmit()).toMatchObject({ smsStatus: 'PENDING', barangayName: 'Batia' });
  });

  it('follows each alert with a coordinates-only text that never touches sms_status', async () => {
    const { service, smsQueue } = build();
    await service.notifyForIncident(INCIDENT);

    const jobs = smsQueue.addBulk.mock.calls[0][0];
    expect(jobs.map((j: any) => j.name)).toEqual([
      'barangay-alert-sms', 'barangay-coordinates-sms', 'barangay-alert-sms', 'barangay-coordinates-sms',
    ]);
    const coords = jobs.filter((j: any) => j.name === 'barangay-coordinates-sms');
    for (const job of coords) {
      expect(job.data).toEqual({ phone: OVERRIDE, message: '14.79000,120.97000', incidentId: INCIDENT, critical: true });
    }
  });

  it('never puts a web address in any barangay text', async () => {
    const { service, smsQueue } = build();
    await service.notifyForIncident(INCIDENT);
    for (const job of smsQueue.addBulk.mock.calls[0][0]) {
      expect(job.data.message).not.toMatch(/https?:|www\.|\.(com|ph|net|org)\b/i);
    }
  });

  it('never puts reporter or patient data in the text', async () => {
    const { service, smsQueue, prisma } = build();
    await service.notifyForIncident(INCIDENT);
    // The only incident fields read for the SMS are the reference, category and location.
    expect(prisma.incident.findUnique.mock.calls[0][0].select).toEqual({
      public_reference: true,
      category: true,
      incident_locations: { select: { latitude: true, longitude: true } },
    });
    expect(smsQueue.addBulk.mock.calls[0][0][0].data.message.length).toBeLessThan(160);
  });

  it('stays DISABLED and queues nothing while the flag is off', async () => {
    const { service, smsQueue, stored } = build({ env: { BARANGAY_ALERTS_ENABLED: 'false' } });
    await service.notifyForIncident(INCIDENT);
    expect(smsQueue.addBulk).not.toHaveBeenCalled();
    expect(stored().sms_status).toBe('DISABLED');
  });

  it('refuses to text real numbers outside production without an override phone', async () => {
    const { service, smsQueue, stored } = build({ env: { BARANGAY_SMS_TEST_OVERRIDE_PHONE: '' } });
    await service.notifyForIncident(INCIDENT);
    expect(smsQueue.addBulk).not.toHaveBeenCalled();
    expect(stored().sms_status).toBe('DISABLED');
  });

  it('sets SKIPPED when the barangay has no SMS-capable primary or backup', async () => {
    const { service, smsQueue, stored } = build({ targets: [] });
    await service.notifyForIncident(INCIDENT);
    expect(smsQueue.addBulk).not.toHaveBeenCalled();
    expect(stored().sms_status).toBe('SKIPPED');
  });

  it('texts the real numbers in production and refuses demo numbers there', async () => {
    const { service, smsQueue } = build({
      env: { NODE_ENV: 'production', BARANGAY_SMS_TEST_OVERRIDE_PHONE: '' },
      targets: [{ ...PRIMARY, is_demo: true }, BACKUP],
    });
    await service.notifyForIncident(INCIDENT);
    const jobs = smsQueue.addBulk.mock.calls[0][0];
    expect([...new Set(jobs.map((j: any) => j.data.phone))]).toEqual([BACKUP.phone_e164]);
  });

  it('records FAILED when the queue is down, and never throws', async () => {
    const { service, stored } = build({ queueFails: true });
    await expect(service.notifyForIncident(INCIDENT)).resolves.toBeUndefined();
    expect(stored().sms_status).toBe('FAILED');
  });
});

describe('BarangayNotifyService: manual correction', () => {
  it('texts the new barangay when the dispatcher changes it', async () => {
    const { service, smsQueue, directory } = build({ existing: { barangay_id: 'BUNLO', sms_status: 'SENT' } });
    await service.setManual(INCIDENT, 'BATIA', 'u-1');
    expect(directory.getAlertTargets).toHaveBeenCalledWith('BATIA');
    expect(smsQueue.addBulk).toHaveBeenCalledTimes(1);
  });

  it('does not re-text when the dispatcher only confirms the same barangay', async () => {
    const { service, smsQueue } = build({ existing: { barangay_id: 'BATIA', sms_status: 'SENT' } });
    await service.setManual(INCIDENT, 'BATIA', 'u-1');
    expect(smsQueue.addBulk).not.toHaveBeenCalled();
  });
});

describe('BarangayNotifyService.resend', () => {
  it('requeues a failed alert and audits it', async () => {
    const { service, smsQueue, audit, stored } = build({ existing: { sms_status: 'FAILED' } });
    await service.resend(INCIDENT, 'u-1');
    expect(smsQueue.addBulk).toHaveBeenCalledTimes(1);
    expect(stored().sms_status).toBe('PENDING');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-1',
        moduleId: 'MOD-17',
        oldValues: { sms_status: 'FAILED' },
        newValues: { sms_status: 'PENDING', action: 'RESEND' },
      }),
    );
  });

  it('rejects an incident with no notice', async () => {
    const { service } = build();
    await expect(service.resend(INCIDENT, 'u-1')).rejects.toBeInstanceOf(BarangayNoticeMissingError);
  });

  it.each([
    ['alerts are switched off', { env: { BARANGAY_ALERTS_ENABLED: 'false' }, existing: { sms_status: 'FAILED' } }],
    ['the alert is still sending', { existing: { sms_status: 'PENDING' } }],
    ['the alert already went out', { existing: { sms_status: 'SENT' } }],
    ['the notice is closed', { existing: { sms_status: 'FAILED', closed_at: new Date() } }],
  ])('refuses when %s', async (_label, opts) => {
    const { service, smsQueue } = build(opts as any);
    await expect(service.resend(INCIDENT, 'u-1')).rejects.toBeInstanceOf(BarangayResendRefusedError);
    expect(smsQueue.addBulk).not.toHaveBeenCalled();
  });
});

describe('BarangayNotifyService.recordSmsResult', () => {
  it('merges the result in one statement and emits the new status', async () => {
    const { service, prisma, realtime } = build({ existing: { sms_status: 'SENT' } });
    await service.recordSmsResult('n-1', 'SENT');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(realtime.barangayNoticeUpdated).toHaveBeenCalledWith(expect.objectContaining({ smsStatus: 'SENT' }));
  });

  it('never throws, so a delivered text is never retried', async () => {
    const { service, prisma } = build();
    prisma.$executeRaw.mockRejectedValue(new Error('db down'));
    await expect(service.recordSmsResult('n-1', 'SENT')).resolves.toBeUndefined();
  });
});

// ── SMS processor ────────────────────────────────────────────────────────────

describe('SmsProcessor', () => {
  function processor(env: Record<string, string> = { TEXTBEE_API_KEY: 'k', TEXTBEE_DEVICE_ID: 'd' }, open = true) {
    const config: any = { get: jest.fn((k: string) => env[k]) };
    const notify: any = {
      isNoticeOpen: jest.fn().mockResolvedValue(open),
      recordSmsResult: jest.fn().mockResolvedValue(undefined),
    };
    return { proc: new SmsProcessor(config, notify), notify };
  }
  const job = (over: Record<string, unknown> = {}, attemptsMade = 0) =>
    ({
      id: 'j-1',
      attemptsMade,
      opts: { attempts: 4 },
      data: { phone: OVERRIDE, message: 'AGAP 0420 …', incidentId: INCIDENT, noticeId: 'n-1', critical: true, ...over },
    }) as any;
  const httpError = (status: number) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      isAxiosError: true,
      response: { status },
      code: 'ERR_BAD_REQUEST',
    });

  beforeEach(() => axiosPost.mockReset());

  it('records SENT after a critical send succeeds', async () => {
    axiosPost.mockResolvedValue({ data: {} });
    const { proc, notify } = processor();
    await proc.process(job());
    expect(notify.recordSmsResult).toHaveBeenCalledWith('n-1', 'SENT');
  });

  it('rethrows a failed critical send so BullMQ retries, without recording yet', async () => {
    axiosPost.mockRejectedValue(httpError(401));
    const { proc, notify } = processor();
    await expect(proc.process(job({}, 0))).rejects.toThrow();
    expect(notify.recordSmsResult).not.toHaveBeenCalled();
  });

  it('records FAILED on the last attempt (bad Textbee key)', async () => {
    axiosPost.mockRejectedValue(httpError(401));
    const { proc, notify } = processor();
    await expect(proc.process(job({}, 3))).rejects.toThrow();
    expect(notify.recordSmsResult).toHaveBeenCalledWith('n-1', 'FAILED');
  });

  it('fails a critical job at once, without retries, when Textbee is not configured', async () => {
    const { proc, notify } = processor({});
    await expect(proc.process(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(notify.recordSmsResult).toHaveBeenCalledWith('n-1', 'FAILED');
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('skips the text when the incident was cancelled while the job waited', async () => {
    const { proc, notify } = processor(undefined, false);
    await proc.process(job());
    expect(axiosPost).not.toHaveBeenCalled();
    expect(notify.recordSmsResult).toHaveBeenCalledWith('n-1', 'SKIPPED');
  });

  describe('delivery confirmation', () => {
    const axiosGet = axios.get as jest.Mock;
    const withQueue = () => {
      const config: any = { get: jest.fn((k: string) => ({ TEXTBEE_API_KEY: 'k', TEXTBEE_DEVICE_ID: 'd' })[k]) };
      const notify: any = {
        isNoticeOpen: jest.fn().mockResolvedValue(true),
        recordSmsResult: jest.fn().mockResolvedValue(undefined),
      };
      const queue: any = { add: jest.fn().mockResolvedValue(undefined) };
      return { proc: new SmsProcessor(config, notify, queue), notify, queue };
    };
    const check = (polls = 0) =>
      ({ name: 'barangay-sms-delivery-check', data: { noticeId: 'n-1', batchId: 'b-1', polls } }) as any;
    const messages = (...statuses: string[]) => ({ data: { data: statuses.map((status) => ({ status })) } });

    it('defers SENT to a delivery check when Textbee returns a batch id', async () => {
      axiosPost.mockResolvedValue({ data: { data: { smsBatchId: 'b-1' } } });
      const { proc, notify, queue } = withQueue();
      await proc.process(job());
      expect(notify.recordSmsResult).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'barangay-sms-delivery-check',
        expect.objectContaining({ noticeId: 'n-1', batchId: 'b-1', polls: 0 }),
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('records SENT when the message is delivered', async () => {
      axiosGet.mockResolvedValue(messages('delivered'));
      const { proc, notify } = withQueue();
      await proc.process(check());
      expect(notify.recordSmsResult).toHaveBeenCalledWith('n-1', 'SENT');
    });

    it('records FAILED when the device reports failed (no load)', async () => {
      axiosGet.mockResolvedValue(messages('failed'));
      const { proc, notify } = withQueue();
      await proc.process(check());
      expect(notify.recordSmsResult).toHaveBeenCalledWith('n-1', 'FAILED');
    });

    it('polls again while the message is still pending', async () => {
      axiosGet.mockResolvedValue(messages('pending'));
      const { proc, notify, queue } = withQueue();
      await proc.process(check(3));
      expect(notify.recordSmsResult).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'barangay-sms-delivery-check',
        expect.objectContaining({ polls: 4 }),
        expect.anything(),
      );
    });

    it('at the end of the window: sent → SENT, still pending → FAILED', async () => {
      axiosGet.mockResolvedValue(messages('sent'));
      const a = withQueue();
      await a.proc.process(check(23));
      expect(a.notify.recordSmsResult).toHaveBeenCalledWith('n-1', 'SENT');

      axiosGet.mockResolvedValue(messages('pending'));
      const b = withQueue();
      await b.proc.process(check(23));
      expect(b.notify.recordSmsResult).toHaveBeenCalledWith('n-1', 'FAILED');
    });
  });

  it('keeps swallowing failures for non-critical jobs (OTP)', async () => {
    axiosPost.mockRejectedValue(httpError(500));
    const { proc, notify } = processor();
    await expect(proc.process(job({ critical: undefined, noticeId: undefined }))).resolves.toBeUndefined();
    expect(notify.recordSmsResult).not.toHaveBeenCalled();
  });
});
