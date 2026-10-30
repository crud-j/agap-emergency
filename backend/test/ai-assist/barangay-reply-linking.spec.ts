import { BarangayReplyService, type InboundSms } from '../../src/barangay-coordination/barangay-reply.service';
import { validateConfig } from '../../src/config/config.validation';

/**
 * AUTOMATION_NEEDS_PLAN Phase 3 (C4), steps 1 and 3: a free-text reply is linked to its case
 * when the sender's barangay has exactly one open notice (so it shows in the drawer, AI or
 * not), and only such a reply is queued for AI Assist, only with the flag on.
 */

const OVERRIDE = '+639694784013';
const BUNLO_CONTACT = '+639182222222';
const TWO_BARANGAYS = '+639193333333';

const notice = (id: string, barangay_id: string) => ({
  id,
  incident_id: `inc-${id}`,
  barangay_id,
  short_code: '3526',
  closed_at: null,
  last_report: null,
  barangay: { id: barangay_id, name: barangay_id },
});

function build(opts: { env?: Record<string, string>; open?: any[]; subscriber?: boolean } = {}) {
  const env: Record<string, string> = {
    BARANGAY_SMS_REPLIES_ENABLED: 'true',
    BARANGAY_SMS_TEST_OVERRIDE_PHONE: OVERRIDE,
    NODE_ENV: 'development',
    ...opts.env,
  };
  const contacts: Record<string, string[]> = {
    [BUNLO_CONTACT]: ['BUNLO'],
    [TWO_BARANGAYS]: ['BUNLO', 'IGULOT'],
  };
  const open = opts.open ?? [notice('n-1', 'BUNLO')];
  const prisma: any = {
    barangay_sms_inbound: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'in-1' }),
    },
    barangay_contacts: {
      findMany: jest.fn(async ({ where }: any) => (contacts[where.phone_e164] ?? []).map((barangay_id) => ({ barangay_id }))),
    },
    incident_barangay_notices: {
      findFirst: jest.fn().mockResolvedValue(notice('n-1', 'BUNLO')),
      findMany: jest.fn(async ({ where }: any) =>
        open.filter((n) => !where.barangay_id || where.barangay_id.in.includes(n.barangay_id)).slice(0, where.take ?? 2),
      ),
    },
  };
  const config: any = { get: jest.fn((k: string) => env[k]) };
  const links: any = { lettersMatch: jest.fn(() => true) };
  const callbacks: any = { reportBySms: jest.fn().mockResolvedValue(undefined) };
  const notify: any = { emitUpdated: jest.fn().mockResolvedValue(undefined) };
  const smsQueue: any = { add: jest.fn().mockResolvedValue({}) };
  const announcements: any = { optOutBySms: jest.fn().mockResolvedValue(!!opts.subscriber) };
  const aiQueue: any = { add: jest.fn().mockResolvedValue({}) };
  const service = new BarangayReplyService(prisma, config, links, callbacks, notify, smsQueue, announcements, aiQueue);
  return { service, prisma, notify, aiQueue, callbacks };
}

const AI_ON = { AI_ASSIST_ENABLED: 'true', GEMINI_API_KEY: 'test-key-not-real', GEMINI_MODEL: 'gemini-3.8-flash' };

let seq = 0;
const sms = (body: string, from = BUNLO_CONTACT): InboundSms => ({
  providerMessageId: `m-${++seq}`,
  from,
  body,
  receivedAt: new Date('2026-10-30T05:00:00Z'),
});
const stored = (b: ReturnType<typeof build>) => b.prisma.barangay_sms_inbound.create.mock.calls[0][0].data;

describe('linking a free-text reply (no AI needed)', () => {
  it('one open case for the barangay: stored UNPARSED with that notice, and the message log refreshes', async () => {
    const b = build();
    await expect(b.service.handleInbound(sms('nandito na kami'))).resolves.toBe('UNPARSED');
    expect(stored(b)).toMatchObject({ outcome: 'UNPARSED', notice_id: 'n-1' });
    expect(b.notify.emitUpdated).toHaveBeenCalledWith('n-1');
    // Only the sender's barangays are searched.
    expect(b.prisma.incident_barangay_notices.findMany.mock.calls[0][0].where).toEqual({
      closed_at: null,
      barangay_id: { in: ['BUNLO'] },
    });
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
  });

  it('several open cases: not linked (the text cannot say which one)', async () => {
    const b = build({ open: [notice('n-1', 'BUNLO'), notice('n-2', 'BUNLO')] });
    await expect(b.service.handleInbound(sms('nandito na kami'))).resolves.toBe('UNPARSED');
    expect(stored(b).notice_id).toBeNull();
    expect(b.notify.emitUpdated).not.toHaveBeenCalled();
  });

  it('no open case: not linked', async () => {
    const b = build({ open: [] });
    await b.service.handleInbound(sms('nandito na kami'));
    expect(stored(b).notice_id).toBeNull();
  });

  it('a number shared by two barangays counts both barangays\' open cases', async () => {
    const b = build({ open: [notice('n-1', 'BUNLO'), notice('n-3', 'IGULOT')] });
    await b.service.handleInbound(sms('papunta na kami', TWO_BARANGAYS));
    expect(stored(b).notice_id).toBeNull();
  });

  it('the dev override phone answers any barangay: the one open case overall', async () => {
    const b = build({ open: [notice('n-9', 'BATIA')] });
    await b.service.handleInbound(sms('nandito na kami', OVERRIDE));
    expect(b.prisma.incident_barangay_notices.findMany.mock.calls[0][0].where).toEqual({ closed_at: null });
    expect(stored(b).notice_id).toBe('n-9');
  });
});

describe('queueing the AI reading', () => {
  it('with AI_ASSIST_ENABLED unset: nothing is queued, and barangay handling is unchanged', async () => {
    const b = build();
    await expect(b.service.handleInbound(sms('nandito na kami'))).resolves.toBe('UNPARSED');
    expect(b.aiQueue.add).not.toHaveBeenCalled();
    await expect(b.service.handleInbound(sms('DONE 3526'))).resolves.toBe('APPLIED');
    expect(b.aiQueue.add).not.toHaveBeenCalled();
  });

  it('with the flag on: one job, reply-<inboundId>, one attempt', async () => {
    const b = build({ env: AI_ON });
    await b.service.handleInbound(sms('nandito na kami'));
    expect(b.aiQueue.add).toHaveBeenCalledWith(
      'barangay-reply',
      { task: 'BARANGAY_REPLY', inboundId: 'in-1' },
      expect.objectContaining({ jobId: 'reply-in-1', attempts: 1 }),
    );
    expect(b.aiQueue.add.mock.calls[0][2].jobId).not.toContain(':');
  });

  it.each([
    ['an exact code', () => sms('OTW 3526'), {}],
    ['an unknown sender', () => sms('nandito na kami', '+639999999999'), {}],
    ['a reply with several open cases', () => sms('nandito na kami'), { open: [notice('n-1', 'BUNLO'), notice('n-2', 'BUNLO')] }],
    ['a subscriber\'s STOP', () => sms('STOP', '+639990000000'), { subscriber: true }],
  ])('never queues %s', async (_label, message, extra) => {
    const b = build({ env: AI_ON, ...extra });
    await b.service.handleInbound(message());
    expect(b.aiQueue.add).not.toHaveBeenCalled();
  });

  it('a queue failure never changes the outcome', async () => {
    const b = build({ env: AI_ON });
    b.aiQueue.add.mockRejectedValue(new Error('redis down'));
    await expect(b.service.handleInbound(sms('nandito na kami'))).resolves.toBe('UNPARSED');
    expect(stored(b).notice_id).toBe('n-1');
  });
});

describe('AI Assist boot check', () => {
  const base = {
    JWT_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
    DATABASE_URL: 'postgresql://u:p@localhost:5432/d',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('the flag on without a key or a model refuses to boot', () => {
    expect(() => validateConfig({ ...base, AI_ASSIST_ENABLED: 'true', GEMINI_MODEL: 'gemini-3.8-flash' })).toThrow(/GEMINI_API_KEY and GEMINI_MODEL/);
    expect(() => validateConfig({ ...base, AI_ASSIST_ENABLED: 'true', GEMINI_API_KEY: 'k' })).toThrow(/GEMINI_API_KEY and GEMINI_MODEL/);
  });

  it('boots with the flag off and nothing set, or with the flag on and both set', () => {
    expect(() => validateConfig({ ...base })).not.toThrow();
    expect(() => validateConfig({ ...base, AI_ASSIST_ENABLED: 'true', GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.8-flash' })).not.toThrow();
  });
});
