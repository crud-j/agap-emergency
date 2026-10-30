import { Prisma } from '@prisma/client';
import { AuditAction } from '@agap/shared';
import {
  AnnouncementsService,
  SMS_OPT_OUT_CONFIRMATION,
} from '../../src/announcements/announcements.service';
import { isOptOut, phoneVariants } from '../../src/announcements/sms-opt-out';
import * as parser from '../../src/barangay-coordination/barangay-reply.parser';
import { BarangayReplyService, type InboundSms } from '../../src/barangay-coordination/barangay-reply.service';
import { BarangaySmsPoller } from '../../src/barangay-coordination/barangay-sms-poller';

/**
 * AUTOMATION_NEEDS_PLAN Phase 1, C3 (MOD-53, RA 10173): every announcement SMS says
 * "Reply STOP to opt out", so a subscriber's STOP must unsubscribe them. A barangay hotline's
 * STOP is a barangay reply and must never unsubscribe anyone or skip barangay handling.
 */

const SUBSCRIBER = '+639171234567';
const BATIA_CONTACT = '+639181111111';
const OVERRIDE = '+639694784013';
const STRANGER = '+639999999999';

describe('isOptOut', () => {
  it.each(['STOP', 'stop', ' Stop ', 'stop.', 'STOP!', 'unsubscribe', 'CANCEL', 'end', 'Quit', 'Itigil', 'ITIGIL.', 'huwag na', 'Huwag  na!'])(
    'treats %p as an opt-out',
    (body) => expect(isOptOut(body)).toBe(true),
  );

  it.each(['stop please', 'STOP 3526', 'DONE 3526', 'huwag', 'stopp', '', 'nandito na kami', 'end.!'])(
    'does not treat %p as an opt-out',
    (body) => expect(isOptOut(body)).toBe(false),
  );

  it('handles a missing body', () => {
    expect(isOptOut(null)).toBe(false);
    expect(isOptOut(undefined)).toBe(false);
  });
});

describe('phoneVariants', () => {
  it('lists the three stored forms of a PH mobile number', () => {
    expect(phoneVariants(SUBSCRIBER)).toEqual(['+639171234567', '639171234567', '09171234567']);
  });
});

/** sms_subscribers rows as a tiny in-memory table, filtered like Prisma would. */
function subscribersTable(rows: Array<{ id: string; phone_number: string; is_active: boolean }>) {
  const matches = (where: any) => (r: (typeof rows)[number]) =>
    (where.phone_number?.in ? where.phone_number.in.includes(r.phone_number) : true) &&
    (where.id?.in ? where.id.in.includes(r.id) : true) &&
    (where.is_active === undefined || r.is_active === where.is_active);
  return {
    rows,
    findMany: jest.fn(async ({ where }: any) => rows.filter(matches(where)).map((r) => ({ id: r.id }))),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = rows.filter(matches(where));
      hit.forEach((r) => Object.assign(r, data));
      return { count: hit.length };
    }),
  };
}

function announcements(rows: Array<{ id: string; phone_number: string; is_active: boolean }>, opts: { smsFails?: boolean } = {}) {
  const sms_subscribers = subscribersTable(rows);
  const prisma: any = { sms_subscribers };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const smsQueue: any = { add: opts.smsFails ? jest.fn().mockRejectedValue(new Error('redis down')) : jest.fn().mockResolvedValue({}) };
  const service = new AnnouncementsService(prisma, {} as any, audit, { get: jest.fn() } as any, smsQueue, {} as any, {} as any);
  return { service, prisma, audit, smsQueue, rows };
}

describe('AnnouncementsService.optOutBySms', () => {
  it.each(['+639171234567', '639171234567', '09171234567'])('matches a subscriber stored as %s', async (stored) => {
    const a = announcements([{ id: 'sub-1', phone_number: stored, is_active: true }]);
    await expect(a.service.optOutBySms(SUBSCRIBER)).resolves.toBe(true);
    expect(a.rows[0]).toMatchObject({ is_active: false, opt_out_source: 'SMS_STOP' });
    expect(a.rows[0]).toHaveProperty('opted_out_at', expect.any(Date));
  });

  it('deactivates the subscriber, audits it and queues exactly one confirmation', async () => {
    const a = announcements([
      { id: 'sub-1', phone_number: '09171234567', is_active: true },
      { id: 'sub-2', phone_number: '09170000000', is_active: true },
    ]);
    await a.service.optOutBySms(SUBSCRIBER);

    expect(a.rows[1].is_active).toBe(true); // another number is untouched
    expect(a.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.UNSUBSCRIBE, entityType: 'sms_subscriber', entityId: 'sub-1', moduleId: 'MOD-53' }),
    );
    expect(a.smsQueue.add).toHaveBeenCalledTimes(1);
    expect(a.smsQueue.add.mock.calls[0][1]).toEqual({ phone: SUBSCRIBER, message: SMS_OPT_OUT_CONFIRMATION });
  });

  it('keeps the confirmation to one SMS segment with no personal data', () => {
    expect(SMS_OPT_OUT_CONFIRMATION.length).toBeLessThan(160);
    expect(SMS_OPT_OUT_CONFIRMATION).toContain('911');
    expect(SMS_OPT_OUT_CONFIRMATION).not.toMatch(/\d{7,}/);
  });

  it('returns false for a number that is not an active subscriber, and sends nothing', async () => {
    const a = announcements([{ id: 'sub-1', phone_number: '09171234567', is_active: false }]);
    await expect(a.service.optOutBySms(SUBSCRIBER)).resolves.toBe(false);
    expect(a.prisma.sms_subscribers.updateMany).not.toHaveBeenCalled();
    expect(a.smsQueue.add).not.toHaveBeenCalled();
    expect(a.audit.log).not.toHaveBeenCalled();
  });

  it('still reports the opt-out when the confirmation cannot be queued', async () => {
    const a = announcements([{ id: 'sub-1', phone_number: '09171234567', is_active: true }], { smsFails: true });
    await expect(a.service.optOutBySms(SUBSCRIBER)).resolves.toBe(true);
    expect(a.rows[0].is_active).toBe(false);
  });
});

describe('AnnouncementsService.unsubscribe (in-app)', () => {
  it('matches every stored form of the number and records the APP source', async () => {
    const a = announcements([{ id: 'sub-1', phone_number: '09171234567', is_active: true }]);
    await expect(a.service.unsubscribe('+639171234567')).resolves.toEqual({ message: 'Unsubscribed' });
    expect(a.rows[0]).toMatchObject({ is_active: false, opt_out_source: 'APP' });
  });

  it('falls back to the number as typed when it is not a PH mobile', async () => {
    const a = announcements([{ id: 'sub-1', phone_number: '12345', is_active: true }]);
    await a.service.unsubscribe(' 12345 ');
    expect(a.rows[0].is_active).toBe(false);
  });
});

describe('BarangayReplyService: STOP before barangay handling', () => {
  function build(opts: { env?: Record<string, string>; optedOut?: boolean; seen?: boolean } = {}) {
    const env: Record<string, string> = {
      BARANGAY_SMS_REPLIES_ENABLED: 'true',
      BARANGAY_SMS_TEST_OVERRIDE_PHONE: OVERRIDE,
      NODE_ENV: 'development',
      ...opts.env,
    };
    const contacts: Record<string, string[]> = { [BATIA_CONTACT]: ['BATIA'] };
    const prisma: any = {
      barangay_sms_inbound: {
        findUnique: jest.fn().mockResolvedValue(opts.seen ? { id: 'row-1' } : null),
        create: jest.fn().mockResolvedValue({}),
      },
      barangay_contacts: {
        findMany: jest.fn(async ({ where }: any) => (contacts[where.phone_e164] ?? []).map((barangay_id) => ({ barangay_id }))),
      },
      incident_barangay_notices: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const config: any = { get: jest.fn((k: string) => env[k]) };
    const links: any = { lettersMatch: jest.fn() };
    const callbacks: any = { reportBySms: jest.fn().mockResolvedValue(undefined) };
    const notify: any = { emitUpdated: jest.fn().mockResolvedValue(undefined) };
    const smsQueue: any = { add: jest.fn().mockResolvedValue({}) };
    const ann: any = { optOutBySms: jest.fn().mockResolvedValue(opts.optedOut ?? true) };
    const service = new BarangayReplyService(prisma, config, links, callbacks, notify, smsQueue, ann);
    return { service, prisma, callbacks, notify, smsQueue, ann };
  }

  let seq = 0;
  const sms = (body: string, from: string): InboundSms => ({
    providerMessageId: `stop-${++seq}`,
    from,
    body,
    receivedAt: new Date('2026-10-30T01:00:00Z'),
  });
  const stored = (prisma: any) => prisma.barangay_sms_inbound.create.mock.calls[0][0].data;

  afterEach(() => jest.restoreAllMocks());

  it("unsubscribes a subscriber's STOP and stores it as OPT_OUT, without any barangay logic", async () => {
    const parse = jest.spyOn(parser, 'parseBarangayReply');
    const b = build();
    await expect(b.service.handleInbound(sms('STOP', '09171234567'))).resolves.toBe('OPT_OUT');

    expect(b.ann.optOutBySms).toHaveBeenCalledWith(SUBSCRIBER);
    expect(stored(b.prisma)).toMatchObject({ outcome: 'OPT_OUT', notice_id: null, parsed_command: null, from_phone_e164: SUBSCRIBER });
    expect(parse).not.toHaveBeenCalled();
    expect(b.prisma.incident_barangay_notices.findFirst).not.toHaveBeenCalled();
    expect(b.callbacks.reportBySms).not.toHaveBeenCalled();
    expect(b.notify.emitUpdated).not.toHaveBeenCalled();
    // The confirmation comes from optOutBySms; no barangay auto-reply on top.
    expect(b.smsQueue.add).not.toHaveBeenCalled();
  });

  it("leaves subscribers alone for a barangay contact's STOP and runs barangay handling", async () => {
    const parse = jest.spyOn(parser, 'parseBarangayReply');
    const b = build();
    await expect(b.service.handleInbound(sms('STOP', BATIA_CONTACT))).resolves.toBe('UNPARSED');
    expect(b.ann.optOutBySms).not.toHaveBeenCalled();
    expect(parse).toHaveBeenCalledWith('STOP');
    expect(stored(b.prisma).outcome).toBe('UNPARSED');
    // A known barangay number still gets today's reply hint.
    expect(b.smsQueue.add).toHaveBeenCalledWith('barangay-reply-ack', expect.objectContaining({ phone: BATIA_CONTACT }), expect.anything());
  });

  it("treats the override phone's STOP as a barangay reply too", async () => {
    const b = build();
    await expect(b.service.handleInbound(sms('stop', OVERRIDE))).resolves.toBe('UNPARSED');
    expect(b.ann.optOutBySms).not.toHaveBeenCalled();
  });

  it('lets a non-subscriber STOP fall through unchanged', async () => {
    const b = build({ optedOut: false });
    await expect(b.service.handleInbound(sms('STOP', STRANGER))).resolves.toBe('UNKNOWN_SENDER');
    expect(b.ann.optOutBySms).toHaveBeenCalledWith(STRANGER);
    expect(stored(b.prisma).outcome).toBe('UNKNOWN_SENDER');
  });

  it('records a repeated provider message ID as DUPLICATE without opting out again', async () => {
    const b = build({ seen: true });
    await expect(b.service.handleInbound(sms('STOP', SUBSCRIBER))).resolves.toBe('DUPLICATE');
    expect(b.ann.optOutBySms).not.toHaveBeenCalled();
    expect(b.prisma.barangay_sms_inbound.create).not.toHaveBeenCalled();
  });

  it('treats a lost insert race after the opt-out as DUPLICATE', async () => {
    const b = build();
    b.prisma.barangay_sms_inbound.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(b.service.handleInbound(sms('STOP', SUBSCRIBER))).resolves.toBe('DUPLICATE');
  });

  it('does not unsubscribe on a message that only contains STOP', async () => {
    const b = build({ optedOut: true });
    await expect(b.service.handleInbound(sms('stop please', SUBSCRIBER))).resolves.toBe('UNKNOWN_SENDER');
    expect(b.ann.optOutBySms).not.toHaveBeenCalled();
  });

  it('with barangay replies off: STOP still opts out, other texts stay DISABLED', async () => {
    const b = build({ env: { BARANGAY_SMS_REPLIES_ENABLED: 'false' } });
    await expect(b.service.handleInbound(sms('STOP', SUBSCRIBER))).resolves.toBe('OPT_OUT');
    await expect(b.service.handleInbound(sms('DONE 3526', BATIA_CONTACT))).resolves.toBe('DISABLED');
    await expect(b.service.handleInbound(sms('hello', SUBSCRIBER))).resolves.toBe('DISABLED');
  });

  it('with SMS_OPT_OUT_ENABLED=false: STOP is not processed as an opt-out', async () => {
    const b = build({ env: { SMS_OPT_OUT_ENABLED: 'false' } });
    await expect(b.service.handleInbound(sms('STOP', SUBSCRIBER))).resolves.toBe('UNKNOWN_SENDER');
    expect(b.ann.optOutBySms).not.toHaveBeenCalled();
  });

  it('optOutEnabled defaults to on', () => {
    expect(build().service.optOutEnabled()).toBe(true);
  });
});

describe('BarangaySmsPoller: polls for STOP even with barangay replies off', () => {
  function poller(env: Record<string, string>) {
    const all: Record<string, string> = { TEXTBEE_API_KEY: 'key', ...env };
    const config: any = { get: jest.fn((k: string) => all[k]) };
    const replies: any = {
      repliesEnabled: jest.fn(() => all['BARANGAY_SMS_REPLIES_ENABLED'] === 'true'),
      optOutEnabled: jest.fn(() => (all['SMS_OPT_OUT_ENABLED'] ?? 'true') === 'true'),
    };
    return new BarangaySmsPoller(config, {} as any, replies, {} as any);
  }

  it('is on when only opt-out processing is on', () => {
    expect(poller({ BARANGAY_SMS_REPLIES_ENABLED: 'false' }).pollingOn()).toBe(true);
  });

  it('is off when both are off, or without a Textbee key', () => {
    expect(poller({ BARANGAY_SMS_REPLIES_ENABLED: 'false', SMS_OPT_OUT_ENABLED: 'false' }).pollingOn()).toBe(false);
    expect(poller({ TEXTBEE_API_KEY: '' }).pollingOn()).toBe(false);
  });
});
