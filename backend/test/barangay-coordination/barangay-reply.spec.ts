import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import {
  BARANGAY_SMS_MAX_LENGTH,
  buildBarangayAlertSms,
  buildBarangayFollowupSms,
} from '../../src/barangay-coordination/barangay-notify.service';
import { parseBarangayReply } from '../../src/barangay-coordination/barangay-reply.parser';
import { BarangayReplyService, replyText, type InboundSms } from '../../src/barangay-coordination/barangay-reply.service';
import { BarangaySmsPoller, toInbound } from '../../src/barangay-coordination/barangay-sms-poller';

/** Phase 5: barangay SMS replies. A reply is information only and never changes incident status. */

jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  return { __esModule: true, default: { ...actual, get: jest.fn(), post: jest.fn() }, isAxiosError: actual.isAxiosError };
});
const axiosGet = axios.get as jest.Mock;

const OVERRIDE = '+639694784013';
const BATIA_CONTACT = '+639171111111';
const BUNLO_CONTACT = '+639182222222';
const NO_URL = /https?:|www\.|\.(com|ph|net|org)\b/i;

const BARANGAY_NAMES: string[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../docs/automation/bocaue-barangay-hotlines.json'), 'utf8'),
).barangays.map((b: { name: string }) => b.name);
const CATEGORIES = ['MEDICAL', 'ROAD_ACCIDENT', 'FLOOD', 'NATURAL_DISASTER', 'RESCUE', 'FIRE', 'INDUSTRIAL', 'DEBRIS', 'OTHER'];

describe('parseBarangayReply', () => {
  it.each([
    ['DONE 3526', 'HANDLED'],
    ['done 3526', 'HANDLED'],
    ['3526 tapos na po', 'HANDLED'],
    ['  OTW   3526 ', 'ON_THE_WAY'],
    ['papunta na kami 3526!', 'ON_THE_WAY'],
    ['omw 3526', 'ON_THE_WAY'],
    ['SEEN 3526', 'SEEN'],
    ['nakita 3526', 'SEEN'],
    ['on scene 3526', 'ON_SCENE'],
    ['ONSCENE 3526', 'ON_SCENE'],
    ['nandito na 3526', 'ON_SCENE'],
    ['NEED 3526', 'NEEDS_BACKUP'],
    ['need backup 3526', 'NEEDS_BACKUP'],
    ['TULONG 3526', 'NEEDS_BACKUP'],
  ])('reads %p as %s', (body, status) => {
    expect(parseBarangayReply(body)).toEqual({ status, code: '3526', letters: null });
  });

  it('keeps the letters of a full access code', () => {
    expect(parseBarangayReply('DONE 3526-ANWQ')).toEqual({ status: 'HANDLED', code: '3526', letters: 'ANWQ' });
    expect(parseBarangayReply('3526anwq otw')).toEqual({ status: 'ON_THE_WAY', code: '3526', letters: 'ANWQ' });
  });

  it.each([
    ['', 'empty'],
    ['DONE', 'no code'],
    ['3526', 'no status'],
    ['OTW 3526 DONE', 'two statuses'],
    ['DONE 3526 4821', 'two codes'],
    [
      'AGAP 3526 MEDICAL Brgy Batia 14.83221,120.94920 INC-2026-000023. Code 3526-ANWQ. Reply OTW/DONE/NEED 3526.',
      'a forwarded alert (its reply hint names three statuses)',
    ],
    ['DONE 352', 'a 3-digit code'],
    ['DONE 35267', 'a 5-digit number'],
    ['DONE +639694784013', 'a phone number'],
    ['salamat po', 'a thank-you'],
  ])('refuses %p (%s)', (body) => {
    expect(parseBarangayReply(body)).toBeNull();
  });
});

describe('alert and reminder texts with SMS replies on', () => {
  const base = {
    shortCode: '3526',
    category: 'MEDICAL',
    barangayName: 'Batia',
    isApproximate: false,
    latitude: 14.83221,
    longitude: 120.9492,
    reference: 'INC-2026-000023',
    opsPhone: '+639755247821',
    accessCode: '3526-ANWQ',
  };

  it('adds the reply hint after the code', () => {
    expect(buildBarangayAlertSms({ ...base, replyCode: '3526' })).toBe(
      'AGAP 3526 MEDICAL Brgy Batia 14.83221,120.94920 INC-2026-000023. Code 3526-ANWQ. ' +
        'Reply OTW/DONE/NEED 3526. Call MDRRMO +639755247821',
    );
  });

  it('is unchanged when replies are off', () => {
    expect(buildBarangayAlertSms(base)).not.toContain('Reply');
  });

  it('stays under 160 for every barangay and category; drops the call-back, then the hint, never the code first', () => {
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
          replyCode: '3526',
        });
        expect(sms.length).toBeLessThan(BARANGAY_SMS_MAX_LENGTH);
        expect(sms).toContain('Code 3526-ANWQ.');
        if (sms.includes('Call MDRRMO')) expect(sms).toContain('Reply OTW/DONE/NEED 3526.');
        expect(sms).not.toMatch(NO_URL);
      }
    }
  });

  it('keeps the hint in the reminder', () => {
    const sms = buildBarangayFollowupSms({
      shortCode: '3526',
      barangayName: 'Batia',
      reference: 'INC-2026-000023',
      accessCode: '3526-ANWQ',
      replyCode: '3526',
    });
    expect(sms).toContain('Reply OTW/DONE/NEED 3526.');
    expect(sms.length).toBeLessThan(BARANGAY_SMS_MAX_LENGTH);
  });
});

describe('replyText', () => {
  const parsed = { code: '3526', letters: null };

  it('acknowledges an applied reply, and says MDRRMO was alerted on NEED', () => {
    expect(replyText('APPLIED', { ...parsed, status: 'ON_THE_WAY' })).toBe('AGAP 3526: received "on the way". Salamat.');
    expect(replyText('APPLIED', { ...parsed, status: 'NEEDS_BACKUP' })).toContain('MDRRMO has been alerted');
  });

  it('sends nothing for unknown senders, duplicates or while disabled', () => {
    expect(replyText('UNKNOWN_SENDER', null)).toBeNull();
    expect(replyText('DUPLICATE', null)).toBeNull();
    expect(replyText('DISABLED', null)).toBeNull();
  });

  it('keeps every reply one segment with no web address', () => {
    const texts = [
      replyText('APPLIED', { ...parsed, status: 'NEEDS_BACKUP' }),
      replyText('UNPARSED', null),
      replyText('UNKNOWN_CODE', { ...parsed, status: 'HANDLED' }),
      replyText('NOT_NOTIFIED', { ...parsed, status: 'HANDLED' }),
    ];
    for (const t of texts) {
      expect(t!.length).toBeLessThan(BARANGAY_SMS_MAX_LENGTH);
      expect(t).not.toMatch(NO_URL);
    }
  });
});

describe('BarangayReplyService.handleInbound', () => {
  const open = (over: Record<string, unknown> = {}) => ({
    id: 'n-1',
    incident_id: 'inc-1',
    barangay_id: 'BATIA',
    short_code: '3526',
    closed_at: null,
    last_report: null,
    barangay: { id: 'BATIA', name: 'Batia' },
    ...over,
  });

  function build(opts: { env?: Record<string, string>; notice?: any; seen?: boolean } = {}) {
    const env: Record<string, string> = {
      BARANGAY_SMS_REPLIES_ENABLED: 'true',
      BARANGAY_SMS_TEST_OVERRIDE_PHONE: OVERRIDE,
      NODE_ENV: 'development',
      ...opts.env,
    };
    const contacts: Record<string, string[]> = {
      [BATIA_CONTACT]: ['BATIA'],
      [OVERRIDE]: ['BATIA'],
      [BUNLO_CONTACT]: ['BUNLO'],
    };
    const prisma: any = {
      barangay_sms_inbound: {
        findUnique: jest.fn().mockResolvedValue(opts.seen ? { id: 'row-1' } : null),
        create: jest.fn().mockResolvedValue({}),
      },
      barangay_contacts: {
        findMany: jest.fn(async ({ where }: any) => (contacts[where.phone_e164] ?? []).map((barangay_id) => ({ barangay_id }))),
      },
      incident_barangay_notices: {
        findFirst: jest.fn().mockResolvedValue(opts.notice === undefined ? open() : opts.notice),
        // AI Assist (C4): an unparsed reply is linked when its barangay has one open case.
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const config: any = { get: jest.fn((k: string) => env[k]) };
    const links: any = { lettersMatch: jest.fn((_id: string, letters: string) => letters === 'ANWQ') };
    const callbacks: any = { reportBySms: jest.fn().mockResolvedValue(undefined) };
    const notify: any = { emitUpdated: jest.fn().mockResolvedValue(undefined) };
    const smsQueue: any = { add: jest.fn().mockResolvedValue({}) };
    const service = new BarangayReplyService(prisma, config, links, callbacks, notify, smsQueue);
    return { service, prisma, callbacks, notify, smsQueue };
  }

  let seq = 0;
  const sms = (body: string, from = BATIA_CONTACT): InboundSms => ({
    providerMessageId: `msg-${++seq}`,
    from,
    body,
    receivedAt: new Date('2026-10-22T01:00:00Z'),
  });
  const stored = (prisma: any) => prisma.barangay_sms_inbound.create.mock.calls[0][0].data;

  it('applies a reply from a registered number and acknowledges it', async () => {
    const b = build();
    await expect(b.service.handleInbound(sms('DONE 3526'))).resolves.toBe('APPLIED');
    expect(b.callbacks.reportBySms).toHaveBeenCalledWith(expect.objectContaining({ id: 'n-1' }), 'HANDLED');
    expect(stored(b.prisma)).toMatchObject({
      outcome: 'APPLIED',
      notice_id: 'n-1',
      parsed_command: 'HANDLED',
      parsed_code: '3526',
      from_phone_e164: BATIA_CONTACT,
    });
    expect(b.notify.emitUpdated).toHaveBeenCalledWith('n-1');
    expect(b.smsQueue.add).toHaveBeenCalledWith(
      'barangay-reply-ack',
      { phone: BATIA_CONTACT, message: 'AGAP 3526: received "done". Salamat.' },
      expect.anything(),
    );
  });

  it('never changes incident status: it only records the report', async () => {
    const b = build();
    await b.service.handleInbound(sms('DONE 3526'));
    // reportBySms is the status-page path; nothing else is called that could move the lifecycle.
    expect(Object.keys(b.callbacks)).toEqual(['reportBySms']);
  });

  it('records a repeated message as DUPLICATE without applying or storing it again', async () => {
    const b = build({ seen: true });
    await expect(b.service.handleInbound(sms('DONE 3526'))).resolves.toBe('DUPLICATE');
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
    expect(b.prisma.barangay_sms_inbound.create).not.toHaveBeenCalled();
    expect(b.smsQueue.add).not.toHaveBeenCalled();
  });

  it('treats a lost insert race (unique violation) as DUPLICATE', async () => {
    const b = build();
    b.prisma.barangay_sms_inbound.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(b.service.handleInbound(sms('DONE 3526'))).resolves.toBe('DUPLICATE');
  });

  it('stores an unknown number as UNKNOWN_SENDER and never texts it back', async () => {
    const b = build();
    await expect(b.service.handleInbound(sms('DONE 3526', '+639999999999'))).resolves.toBe('UNKNOWN_SENDER');
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
    expect(stored(b.prisma)).toMatchObject({ outcome: 'UNKNOWN_SENDER', notice_id: null });
    expect(b.smsQueue.add).not.toHaveBeenCalled();
  });

  it('stores carrier texts (TM, 8080) as UNKNOWN_SENDER, with no reply', async () => {
    const b = build();
    await expect(b.service.handleInbound(sms('Registered ka na sa EasySURF!', '8080'))).resolves.toBe('UNKNOWN_SENDER');
    expect(stored(b.prisma)).toMatchObject({ from_phone: '8080', from_phone_e164: null });
    expect(b.smsQueue.add).not.toHaveBeenCalled();
  });

  it('records an unreadable reply from a known number as UNPARSED and sends one help text', async () => {
    const b = build();
    await expect(b.service.handleInbound(sms('ano po ito?'))).resolves.toBe('UNPARSED');
    expect(b.smsQueue.add).toHaveBeenCalledTimes(1);
    expect(b.smsQueue.add.mock.calls[0][1].message).toContain('DONE 1234');
  });

  it('records a code with no open case as UNKNOWN_CODE', async () => {
    const b = build({ notice: null });
    await expect(b.service.handleInbound(sms('DONE 9999'))).resolves.toBe('UNKNOWN_CODE');
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
  });

  it('refuses a full access code whose letters are wrong', async () => {
    const b = build();
    await expect(b.service.handleInbound(sms('DONE 3526-ZZZZ'))).resolves.toBe('UNKNOWN_CODE');
    await expect(b.service.handleInbound(sms('DONE 3526-ANWQ'))).resolves.toBe('APPLIED');
  });

  it("records another barangay's code as NOT_NOTIFIED", async () => {
    const b = build();
    await expect(b.service.handleInbound(sms('DONE 3526', BUNLO_CONTACT))).resolves.toBe('NOT_NOTIFIED');
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
    expect(stored(b.prisma).notice_id).toBeNull();
  });

  it('lets the dev override phone answer any barangay case (demo rule)', async () => {
    const b = build({ notice: open({ barangay_id: 'BUNLO', barangay: { id: 'BUNLO', name: 'Bunlo' } }) });
    await expect(b.service.handleInbound(sms('OTW 3526', OVERRIDE))).resolves.toBe('APPLIED');
  });

  it('turns the demo rule off in production', async () => {
    const b = build({
      env: { NODE_ENV: 'production' },
      notice: open({ barangay_id: 'BUNLO', barangay: { id: 'BUNLO', name: 'Bunlo' } }),
    });
    // In production the override phone is only Batia's (demo) contact, and demo contacts are ignored.
    b.prisma.barangay_contacts.findMany.mockResolvedValue([]);
    await expect(b.service.handleInbound(sms('OTW 3526', OVERRIDE))).resolves.toBe('UNKNOWN_SENDER');
    expect(b.prisma.barangay_contacts.findMany.mock.calls[0][0].where).toMatchObject({ is_demo: false });
  });

  it('stores the message as DISABLED, applying nothing, while the flag is off', async () => {
    const b = build({ env: { BARANGAY_SMS_REPLIES_ENABLED: 'false' } });
    await expect(b.service.handleInbound(sms('DONE 3526'))).resolves.toBe('DISABLED');
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
    expect(stored(b.prisma).outcome).toBe('DISABLED');
    expect(b.smsQueue.add).not.toHaveBeenCalled();
  });

  it('stores nothing when applying fails, so the next poll retries the message', async () => {
    const b = build();
    b.callbacks.reportBySms.mockRejectedValue(new Error('db down'));
    await expect(b.service.handleInbound(sms('DONE 3526'))).rejects.toThrow('db down');
    expect(b.prisma.barangay_sms_inbound.create).not.toHaveBeenCalled();
  });

  it('sends at most one automatic reply per number per minute', async () => {
    const b = build();
    await b.service.handleInbound(sms('OTW 3526'));
    await b.service.handleInbound(sms('DONE 3526'));
    expect(b.smsQueue.add).toHaveBeenCalledTimes(1);
  });

  it('still records the reply when queueing the acknowledgement fails', async () => {
    const b = build();
    b.smsQueue.add.mockRejectedValue(new Error('redis down'));
    await expect(b.service.handleInbound(sms('DONE 3526'))).resolves.toBe('APPLIED');
  });
});

describe('toInbound', () => {
  it('maps a Textbee message', () => {
    expect(
      toInbound({ _id: 'm1', sender: '+639694784013', message: 'DONE 3526', receivedAt: '2026-10-22T01:00:00.000Z' }),
    ).toEqual({
      providerMessageId: 'm1',
      from: '+639694784013',
      body: 'DONE 3526',
      receivedAt: new Date('2026-10-22T01:00:00.000Z'),
    });
  });

  it('falls back to createdAt for a bogus 1999 receivedAt', () => {
    const msg = toInbound({ _id: 'm1', sender: 'x', message: '', receivedAt: '1999-12-31T00:00:00Z', createdAt: '2026-10-22T01:00:06Z' });
    expect(msg!.receivedAt).toEqual(new Date('2026-10-22T01:00:06Z'));
  });

  it('skips a message without an id or sender', () => {
    expect(toInbound({ sender: '+639694784013' })).toBeNull();
    expect(toInbound({ _id: 'm1', sender: ' ' })).toBeNull();
  });
});

describe('BarangaySmsPoller.poll', () => {
  beforeEach(() => axiosGet.mockReset());

  function build(env: Record<string, string> = {}, newest: Date | null = null) {
    const all: Record<string, string> = {
      TEXTBEE_API_KEY: 'key',
      TEXTBEE_DEVICE_ID: 'dev-1',
      ...env,
    };
    const config: any = { get: jest.fn((k: string) => all[k]) };
    const prisma: any = {
      barangay_sms_inbound: { aggregate: jest.fn().mockResolvedValue({ _max: { created_at: newest } }) },
    };
    const replies: any = {
      repliesEnabled: jest.fn(() => (all['BARANGAY_SMS_REPLIES_ENABLED'] ?? 'true') === 'true'),
      optOutEnabled: jest.fn(() => (all['SMS_OPT_OUT_ENABLED'] ?? 'true') === 'true'),
      handleInbound: jest.fn().mockResolvedValue('APPLIED'),
    };
    const queue: any = { upsertJobScheduler: jest.fn().mockResolvedValue({}), removeJobScheduler: jest.fn().mockResolvedValue(true) };
    return { poller: new BarangaySmsPoller(config, prisma, replies, queue), replies, queue };
  }
  const msg = (id: string, device = 'dev-1') => ({
    _id: id,
    sender: '+639694784013',
    message: 'DONE 3526',
    receivedAt: '2026-10-22T01:00:00Z',
    device: { _id: device },
  });

  it('hands every received message to the reply service, following the cursor', async () => {
    axiosGet
      .mockResolvedValueOnce({ data: { data: [msg('a'), msg('b')], meta: { hasMore: true, nextCursor: 'c1' } } })
      .mockResolvedValueOnce({ data: { data: [msg('c')], meta: { hasMore: false } } });
    const b = build();
    await expect(b.poller.poll()).resolves.toBe(3);
    expect(axiosGet.mock.calls[0][1].params).toMatchObject({ direction: 'received', order: 'asc' });
    expect(axiosGet.mock.calls[1][1].params.cursor).toBe('c1');
  });

  it('ignores messages received by another Textbee device', async () => {
    axiosGet.mockResolvedValueOnce({ data: { data: [msg('a', 'other-phone'), msg('b')], meta: {} } });
    const b = build();
    await expect(b.poller.poll()).resolves.toBe(1);
  });

  it('reads from 2 minutes before the newest stored message', async () => {
    axiosGet.mockResolvedValueOnce({ data: { data: [], meta: {} } });
    const newest = new Date(Date.now() - 60 * 60_000);
    const b = build({}, newest);
    await b.poller.poll();
    expect(axiosGet.mock.calls[0][1].params.from).toBe(new Date(newest.getTime() - 2 * 60_000).toISOString());
  });

  it('does nothing while replies and STOP processing are off, or without a Textbee key', async () => {
    await expect(build({ BARANGAY_SMS_REPLIES_ENABLED: 'false', SMS_OPT_OUT_ENABLED: 'false' }).poller.poll()).resolves.toBe(0);
    await expect(build({ TEXTBEE_API_KEY: '' }).poller.poll()).resolves.toBe(0);
    await expect(build({ BARANGAY_SMS_INBOUND_MODE: 'webhook' }).poller.poll()).resolves.toBe(0);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('survives a Textbee error; the next poll starts from the same place', async () => {
    axiosGet.mockRejectedValueOnce(Object.assign(new Error('x'), { isAxiosError: true, response: { status: 503 } }));
    await expect(build().poller.poll()).resolves.toBe(0);
  });

  it('schedules one repeating poll at boot only when polling is on', () => {
    const on = build();
    on.poller.onApplicationBootstrap();
    expect(on.queue.upsertJobScheduler).toHaveBeenCalledWith('barangay-sms-poll', { every: 15_000 }, expect.anything());

    const off = build({ BARANGAY_SMS_REPLIES_ENABLED: 'false', SMS_OPT_OUT_ENABLED: 'false' });
    off.poller.onApplicationBootstrap();
    expect(off.queue.upsertJobScheduler).not.toHaveBeenCalled();
    expect(off.queue.removeJobScheduler).toHaveBeenCalledWith('barangay-sms-poll');
  });
});
