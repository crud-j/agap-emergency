import { BadRequestException } from '@nestjs/common';
import { IncidentType, parseCitizenSosSms, type CitizenSosParseResult } from '@agap/shared';
import {
  CitizenSmsSosService,
  SMS_SOS_MAX_AGE_MS,
  citizenSosReply,
} from '../../src/emergency-alerts/sms-sos/citizen-sms-sos.service';
import { GuestReportLimitExceeded } from '../../src/emergency-alerts/guest-report-limit/guest-report-limit.service';
import { BarangayReplyService, type InboundSms } from '../../src/barangay-coordination/barangay-reply.service';

/** MOD-17/19: a citizen SOS text received on the Textbee phone becomes an incident. */

const ID = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';
const PHONE = '+639171234567';
const NOW = new Date('2026-11-14T08:00:00Z');
const BOCAUE = { lat: 14.7963, lng: 120.9272 };
const MANILA = { lat: 14.5995, lng: 120.9842 };

function ok(overrides: Partial<{ coords: { lat: number; lng: number } | null; sentAt: Date; type: IncidentType }> = {}): CitizenSosParseResult {
  return {
    ok: true,
    value: {
      eventId: ID,
      type: IncidentType.FIRE,
      coords: BOCAUE,
      sentAt: new Date(NOW.getTime() - 60_000),
      trigger: 'SOS_BUTTON',
      ...overrides,
    },
  };
}

function build(opts: { existing?: { incident_locations: { id: string } | null } | null; limited?: boolean; createError?: Error } = {}) {
  const prisma: any = {
    incident: {
      findFirst: jest.fn().mockResolvedValue(
        opts.existing ? { id: 'inc-0', public_reference: 'INC-2026-000099', ...opts.existing } : null,
      ),
    },
  };
  const config: any = { get: jest.fn((k: string) => (k === 'CITIZEN_SMS_SOS_ENABLED' ? 'true' : undefined)) };
  const incidents: any = {
    create: opts.createError
      ? jest.fn().mockRejectedValue(opts.createError)
      : jest.fn().mockResolvedValue({ id: 'inc-1', public_reference: 'INC-2026-000123' }),
  };
  const release = jest.fn().mockResolvedValue(undefined);
  const limits: any = {
    reserve: opts.limited ? jest.fn().mockRejectedValue(new GuestReportLimitExceeded(600)) : jest.fn().mockResolvedValue({ release }),
  };
  const smsQueue: any = { add: jest.fn().mockResolvedValue({}) };
  const service = new CitizenSmsSosService(prisma, config, incidents, limits, smsQueue);
  const replyText = () => smsQueue.add.mock.calls[0]?.[1].message as string | undefined;
  return { service, prisma, incidents, limits, release, smsQueue, replyText };
}

describe('CitizenSmsSosService', () => {
  it('creates an SMS incident through IncidentsService with the event id, and texts the reference back', async () => {
    const t = build();
    await expect(t.service.handle(ok(), PHONE, NOW)).resolves.toEqual({ outcome: 'SOS_CREATED', incidentId: 'inc-1' });

    expect(t.limits.reserve).toHaveBeenCalledWith({ phone: PHONE }, ID);
    const [dto, actorId, role, opts] = t.incidents.create.mock.calls[0];
    expect(dto).toEqual({
      type: 'FIRE',
      idempotencyKey: ID,
      triggerMethod: 'SOS_BUTTON',
      lat: BOCAUE.lat,
      lng: BOCAUE.lng,
      reporter: { type: 'GUEST_REPORTER' },
    });
    expect(actorId).toBeUndefined();
    expect(role).toBeUndefined();
    expect(opts).toMatchObject({ channel: 'SMS', senderPhone: PHONE });

    expect(t.smsQueue.add).toHaveBeenCalledWith(
      'citizen-sos-reply',
      expect.objectContaining({ phone: PHONE, incidentId: 'inc-1' }),
      expect.anything(),
    );
    expect(t.replyText()).toContain('Ref INC-2026-000123');
    expect(t.replyText()).not.toContain('location');
  });

  it('creates an incident without GPS and tells the sender to expect a call', async () => {
    const t = build();
    await t.service.handle(ok({ coords: null }), PHONE, NOW);
    const dto = t.incidents.create.mock.calls[0][0];
    expect(dto.lat).toBeUndefined();
    expect(dto.description).toBeUndefined();
    expect(t.replyText()).toContain("We don't have your location");
  });

  it('keeps GPS outside Bocaue as a note, not as the incident location', async () => {
    const t = build();
    await t.service.handle(ok({ coords: MANILA }), PHONE, NOW);
    const dto = t.incidents.create.mock.calls[0][0];
    expect(dto.lat).toBeUndefined();
    expect(dto.description).toBe('Reported GPS outside Bocaue: 14.59950,120.98420');
  });

  it('a known event id (resend, or the app got through) returns that incident, uncounted', async () => {
    const t = build({ existing: { incident_locations: { id: 'loc' } } });
    await expect(t.service.handle(ok(), PHONE, NOW)).resolves.toEqual({ outcome: 'SOS_EXISTING', incidentId: 'inc-0' });
    expect(t.incidents.create).not.toHaveBeenCalled();
    expect(t.limits.reserve).not.toHaveBeenCalled();
    expect(t.replyText()).toContain('Ref INC-2026-000099');
  });

  it(`logs a text sent more than ${SMS_SOS_MAX_AGE_MS / 3_600_000} h ago without an incident`, async () => {
    const t = build();
    const r = await t.service.handle(ok({ sentAt: new Date(NOW.getTime() - SMS_SOS_MAX_AGE_MS - 1000) }), PHONE, NOW);
    expect(r).toEqual({ outcome: 'SOS_STALE', incidentId: null });
    expect(t.incidents.create).not.toHaveBeenCalled();
    expect(t.replyText()).toContain('Call 911');
  });

  it('stops at the per-number limit', async () => {
    const t = build({ limited: true });
    await expect(t.service.handle(ok(), PHONE, NOW)).resolves.toEqual({ outcome: 'SOS_LIMITED', incidentId: null });
    expect(t.incidents.create).not.toHaveBeenCalled();
    expect(t.replyText()).toContain('Call 911');
  });

  it('a malformed text, or a sender that is not a mobile number, is INVALID', async () => {
    const t = build();
    await expect(t.service.handle({ ok: false, reason: 'TYPE' }, PHONE, NOW)).resolves.toEqual({ outcome: 'SOS_INVALID', incidentId: null });
    await expect(t.service.handle(ok(), null, NOW)).resolves.toEqual({ outcome: 'SOS_INVALID', incidentId: null });
    expect(t.incidents.create).not.toHaveBeenCalled();
    expect(t.smsQueue.add).toHaveBeenCalledTimes(1); // no reply to a non-mobile sender
  });

  it('a refused report is an outcome (never retried); the limit is given back', async () => {
    const t = build({ createError: new BadRequestException('nope') });
    await expect(t.service.handle(ok(), PHONE, NOW)).resolves.toEqual({ outcome: 'SOS_INVALID', incidentId: null });
    expect(t.release).toHaveBeenCalled();
  });

  it('a database failure throws so the poller retries; the limit is given back', async () => {
    const t = build({ createError: new Error('connection refused') });
    await expect(t.service.handle(ok(), PHONE, NOW)).rejects.toThrow('connection refused');
    expect(t.release).toHaveBeenCalled();
    expect(t.smsQueue.add).not.toHaveBeenCalled();
  });

  it('replies at most once a minute per sender, and a reply failure never fails the report', async () => {
    const t = build({ existing: { incident_locations: null } });
    await t.service.handle(ok(), PHONE, NOW);
    await t.service.handle(ok(), PHONE, NOW);
    expect(t.smsQueue.add).toHaveBeenCalledTimes(1);

    const u = build();
    u.smsQueue.add.mockRejectedValue(new Error('redis down'));
    await expect(u.service.handle(ok(), PHONE, NOW)).resolves.toMatchObject({ outcome: 'SOS_CREATED' });
  });

  it('every reply fits one SMS segment', () => {
    for (const outcome of ['SOS_CREATED', 'SOS_EXISTING', 'SOS_STALE', 'SOS_INVALID', 'SOS_LIMITED'] as const) {
      for (const hasLocation of [true, false]) {
        expect(citizenSosReply({ outcome, reference: 'INC-2026-001234', hasLocation }).length).toBeLessThanOrEqual(160);
      }
    }
  });
});

describe('BarangayReplyService routes citizen SOS texts first', () => {
  const sosBody = `AGAP|${ID}|14.79630,120.92720|${Math.floor(Date.now() / 1000)}|FIRE|C:Y|T:S`;
  let seq = 0;
  const sms = (body: string): InboundSms => ({
    providerMessageId: `m-${++seq}`,
    from: '09171234567',
    body,
    receivedAt: new Date(),
  });

  function build(enabled = true) {
    const prisma: any = {
      barangay_sms_inbound: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'row-1' }),
      },
      barangay_contacts: { findMany: jest.fn().mockResolvedValue([]) },
      incident_barangay_notices: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    const config: any = { get: jest.fn((k: string) => (k === 'BARANGAY_SMS_REPLIES_ENABLED' ? 'true' : undefined)) };
    const announcements: any = { optOutBySms: jest.fn().mockResolvedValue(true) };
    const citizenSos: any = {
      enabled: jest.fn(() => enabled),
      handle: jest.fn().mockResolvedValue({ outcome: 'SOS_CREATED', incidentId: 'inc-1' }),
    };
    const service = new BarangayReplyService(
      prisma, config, {} as any, { reportBySms: jest.fn() } as any, { emitUpdated: jest.fn() } as any,
      { add: jest.fn() } as any, announcements, { add: jest.fn() } as any, citizenSos,
    );
    return { service, prisma, citizenSos, announcements };
  }

  it('hands an AGAP SOS to CitizenSmsSosService and stores the row with its incident', async () => {
    const b = build();
    await expect(b.service.handleInbound(sms(sosBody))).resolves.toBe('SOS_CREATED');
    expect(b.citizenSos.handle).toHaveBeenCalledWith(parseCitizenSosSms(sosBody), '+639171234567');
    expect(b.prisma.barangay_sms_inbound.create.mock.calls[0][0].data).toMatchObject({
      outcome: 'SOS_CREATED',
      incident_id: 'inc-1',
      from_phone_e164: '+639171234567',
    });
    expect(b.announcements.optOutBySms).not.toHaveBeenCalled();
  });

  it('a malformed AGAP text still goes to the SOS path (INVALID), not the barangay logic', async () => {
    const b = build();
    b.citizenSos.handle.mockResolvedValue({ outcome: 'SOS_INVALID', incidentId: null });
    await expect(b.service.handleInbound(sms(`AGAP|${ID}|garbage`))).resolves.toBe('SOS_INVALID');
    expect(b.citizenSos.handle.mock.calls[0][0]).toEqual({ ok: false, reason: 'FIELDS' });
  });

  it('a message already stored is not handled again', async () => {
    const b = build();
    b.prisma.barangay_sms_inbound.findUnique.mockResolvedValue({ id: 'row-0' });
    await expect(b.service.handleInbound(sms(sosBody))).resolves.toBe('DUPLICATE');
    expect(b.citizenSos.handle).not.toHaveBeenCalled();
  });

  it('a database failure in the SOS path throws and stores nothing (the poller retries)', async () => {
    const b = build();
    b.citizenSos.handle.mockRejectedValue(new Error('db down'));
    await expect(b.service.handleInbound(sms(sosBody))).rejects.toThrow('db down');
    expect(b.prisma.barangay_sms_inbound.create).not.toHaveBeenCalled();
  });

  it('other texts take the existing path; with the flag off an AGAP text is not an SOS', async () => {
    const on = build();
    await on.service.handleInbound(sms('STOP'));
    expect(on.citizenSos.handle).not.toHaveBeenCalled();
    expect(on.announcements.optOutBySms).toHaveBeenCalled();

    const off = build(false);
    await expect(off.service.handleInbound(sms(sosBody))).resolves.toBe('UNKNOWN_SENDER');
    expect(off.citizenSos.handle).not.toHaveBeenCalled();
  });
});
