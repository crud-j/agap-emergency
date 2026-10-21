import { BarangayLinkService } from '../../src/barangay-coordination/barangay-link.service';
import { BarangayCallbackService } from '../../src/barangay-coordination/barangay-callback.service';
import {
  BARANGAY_SMS_MAX_LENGTH,
  buildBarangayAlertSms,
  buildBarangayCoordinatesSms,
  buildBarangayFollowupSms,
} from '../../src/barangay-coordination/barangay-notify.service';

/** The status-page access code in the barangay alert SMS (replaced the link: carriers drop texts with URLs). */

const OPEN = { id: '11111111-1111-4111-8111-111111111111', short_code: '5172' };
const OTHER = { id: '22222222-2222-4222-8222-222222222222', short_code: '5172' }; // same code, reused later

function linkService(notices: any[], env: Record<string, string> = {}) {
  const config: any = {
    get: jest.fn((k: string) => env[k]),
    getOrThrow: jest.fn(() => 'test-jwt-secret'),
  };
  const prisma: any = { incident_barangay_notices: { findMany: jest.fn().mockResolvedValue(notices) } };
  return new BarangayLinkService(prisma, config);
}

describe('BarangayLinkService', () => {
  it('builds <4-digit code>-<4 letters>, with no I, L or O', () => {
    expect(linkService([]).accessCodeFor(OPEN)).toMatch(/^5172-[A-HJKMNP-Z]{4}$/);
  });

  it('is stable per notice and different between notices that reuse the same code', () => {
    const svc = linkService([]);
    expect(svc.accessCodeFor(OPEN)).toBe(svc.accessCodeFor(OPEN));
    expect(svc.accessCodeFor(OPEN)).not.toBe(svc.accessCodeFor(OTHER));
    expect(svc.tokenFor(OPEN)).not.toBe(svc.tokenFor(OTHER));
  });

  it('resolves a typed code to its own notice even when an older notice shares the digits', async () => {
    const svc = linkService([{ ...OTHER, barangay: {} }, { ...OPEN, barangay: {} }]);
    const code = svc.accessCodeFor(OPEN);
    for (const typed of [code, code.toLowerCase(), code.replace('-', ''), ` ${code.replace('-', ' ')} `]) {
      expect((await svc.resolve(typed))?.id).toBe(OPEN.id);
    }
  });

  it('still resolves the older 16-character link token', async () => {
    const svc = linkService([{ ...OTHER, barangay: {} }, { ...OPEN, barangay: {} }]);
    expect((await svc.resolve(svc.tokenFor(OPEN)))?.id).toBe(OPEN.id);
  });

  it('rejects a wrong code, a forged signature, a bare number, and malformed input', async () => {
    const svc = linkService([{ ...OPEN, barangay: {} }]);
    const letters = svc.accessCodeFor(OPEN).slice(5);
    const wrong = letters === 'AAAA' ? 'BBBB' : 'AAAA';
    expect(await svc.resolve(`5172-${wrong}`)).toBeNull();
    expect(await svc.resolve('5172AAAAAAAAAAAA')).toBeNull();
    expect(await svc.resolve('5172')).toBeNull();
    expect(await svc.resolve('../../etc/passwd')).toBeNull();
    expect(await svc.resolve('')).toBeNull();
  });

  it('a dedicated BARANGAY_LINK_SECRET changes the code', () => {
    const a = linkService([]).accessCodeFor(OPEN);
    const b = linkService([], { BARANGAY_LINK_SECRET: 'another-key' }).accessCodeFor(OPEN);
    expect(a).not.toBe(b);
  });
});

describe('barangay SMS with the access code', () => {
  const accessCode = '5172-KXPM';
  const base = {
    shortCode: '5172',
    category: 'ROAD_ACCIDENT',
    barangayName: 'Batia',
    isApproximate: false,
    latitude: 14.832214,
    longitude: 120.949201,
    reference: 'INC-2026-001234',
    opsPhone: '+639171234567',
    accessCode,
  };

  it('carries the exact coordinates, the code and the call-back in one segment, and no web address', () => {
    const sms = buildBarangayAlertSms(base);
    expect(sms).toBe(
      'AGAP 5172 ROAD_ACCIDENT Brgy Batia 14.83221,120.94920 INC-2026-001234. Code 5172-KXPM. Call MDRRMO +639171234567',
    );
    expect(sms).not.toMatch(/https?:|www.|.(com|ph|net|org)/i);
    expect(sms.length).toBeLessThan(BARANGAY_SMS_MAX_LENGTH);
  });

  it('drops the MDRRMO call-back before the code when space runs out', () => {
    const sms = buildBarangayAlertSms({ ...base, barangayName: 'x'.repeat(60) });
    expect(sms).toContain(`Code ${accessCode}.`);
    expect(sms).not.toContain('Call MDRRMO');
    expect(sms.length).toBeLessThan(BARANGAY_SMS_MAX_LENGTH);
  });

  it('drops the code only as a last resort, and the alert itself is never cut', () => {
    const sms = buildBarangayAlertSms({ ...base, barangayName: 'y'.repeat(80) });
    expect(sms).not.toContain(accessCode);
    expect(sms).toContain('14.83221,120.94920');
    expect(() => buildBarangayAlertSms({ ...base, barangayName: 'z'.repeat(160) })).toThrow(/under 160/);
  });

  it('the reminder also carries the code', () => {
    const sms = buildBarangayFollowupSms({
      shortCode: '5172', barangayName: 'Batia', reference: 'INC-2026-001234', opsPhone: '+639171234567', accessCode,
    });
    expect(sms).toContain(`Code ${accessCode}.`);
    expect(sms.length).toBeLessThan(BARANGAY_SMS_MAX_LENGTH);
  });

  it('the second text is the coordinates alone, and there is none without GPS', () => {
    expect(buildBarangayCoordinatesSms(14.832214, 120.949201)).toBe('14.83221,120.94920');
    expect(buildBarangayCoordinatesSms(0, 0)).toBeNull();
    expect(buildBarangayCoordinatesSms(null, null)).toBeNull();
  });
});

describe('BarangayCallbackService: status link', () => {
  const NOTICE: any = {
    id: 'n-1',
    incident_id: 'inc-1',
    short_code: '5172',
    barangay_id: 'BATIA',
    is_approximate: false,
    last_report: null,
    last_report_at: null,
    closed_at: null,
    barangay: { id: 'BATIA', name: 'Batia' },
  };

  function build(over: { notice?: any; incidentStatus?: string; resolves?: boolean } = {}) {
    const notice = over.notice ?? NOTICE;
    const prisma: any = {
      incident_barangay_notices: { update: jest.fn().mockResolvedValue({}) },
      incident: {
        findUnique: jest.fn().mockResolvedValue({
          public_reference: 'INC-2026-000042',
          category: 'FLOOD',
          status: over.incidentStatus ?? 'SUBMITTED',
          submitted_at: new Date('2026-10-21T09:00:00Z'),
          incident_locations: {
            latitude: '14.8322100',
            longitude: '120.9492000',
            accuracy_meters: '8.50',
            formatted_address: 'Batia, Bocaue',
            landmark: 'beside the barangay hall',
          },
        }),
      },
      incidentEvent: { create: jest.fn().mockResolvedValue({}) },
      escalation: { create: jest.fn().mockResolvedValue({ id: 'esc-1' }) },
    };
    const links: any = { resolve: jest.fn().mockResolvedValue(over.resolves === false ? null : notice) };
    const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
    const realtime: any = { notifyEscalation: jest.fn() };
    const notify: any = { emitUpdated: jest.fn().mockResolvedValue(undefined) };
    const config: any = { get: jest.fn(() => '+639171234567') };
    const service = new BarangayCallbackService(prisma, audit, realtime, notify, {} as any, links, config);
    return { service, prisma, audit, realtime, notify };
  }

  it('shows the exact position, address, accuracy and the MDRRMO number — and no reporter or patient data', async () => {
    const view = await build().service.viewByLink('5172xxxxxxxxxxxx');
    expect(view).toMatchObject({
      closed: false,
      barangayName: 'Batia',
      reference: 'INC-2026-000042',
      location: {
        latitude: 14.83221,
        longitude: 120.9492,
        accuracyMeters: 8.5,
        address: 'Batia, Bocaue',
        landmark: 'beside the barangay hall',
      },
      mdrrmoPhone: '+639171234567',
    });
    expect(JSON.stringify(view)).not.toMatch(/reporter|patient|phone_number|email/i);
  });

  it('hides the position once the case is closed', async () => {
    const view = await build({ notice: { ...NOTICE, closed_at: new Date() } }).service.viewByLink('x');
    expect(view?.closed).toBe(true);
    expect(view?.location).toBeNull();
  });

  it('returns null for a link that does not resolve', async () => {
    expect(await build({ resolves: false }).service.viewByLink('nope')).toBeNull();
  });

  it.each([
    ['SEEN', 'has seen'],
    ['ON_THE_WAY', 'acting on it'],
    ['ON_SCENE', 'on scene'],
    ['HANDLED', 'completed'],
  ] as const)('records %s as a link report, on the timeline and in the audit log, then tells ops', async (status, words) => {
    const { service, prisma, audit, notify, realtime } = build();
    await service.reportByLink('tok', status);

    expect(prisma.incident_barangay_notices.update.mock.calls[0][0].data).toMatchObject({
      last_report: status,
      last_report_source: 'LINK',
      last_report_by_user_id: null,
    });
    const event = prisma.incidentEvent.create.mock.calls[0][0].data;
    expect(event).toMatchObject({ from_status: 'SUBMITTED', to_status: 'SUBMITTED', triggered_by_id: null });
    expect(event.notes).toContain('via link');
    expect(event.notes).toContain(words);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ moduleId: 'MOD-34', newValues: { last_report: status, source: 'LINK' } }),
    );
    expect(notify.emitUpdated).toHaveBeenCalledWith('n-1');
    expect(realtime.notifyEscalation).not.toHaveBeenCalled();
  });

  it('a completed report does not change the incident status', async () => {
    const { service, prisma } = build({ incidentStatus: 'DISPATCHED' });
    await service.reportByLink('tok', 'HANDLED');
    expect(prisma.incidentEvent.create.mock.calls[0][0].data).toMatchObject({
      from_status: 'DISPATCHED',
      to_status: 'DISPATCHED',
    });
  });

  it('NEEDS_BACKUP also escalates to a supervisor', async () => {
    const { service, prisma, realtime } = build();
    await service.reportByLink('tok', 'NEEDS_BACKUP');
    expect(prisma.escalation.create.mock.calls[0][0].data.escalation_level).toBe('LEVEL_1_SUPERVISOR');
    expect(realtime.notifyEscalation).toHaveBeenCalledWith(
      'inc-1',
      expect.objectContaining({ escalationType: 'BARANGAY_BACKUP_REQUESTED' }),
    );
  });

  it('tapping the status already recorded changes nothing', async () => {
    const { service, prisma, notify } = build({ notice: { ...NOTICE, last_report: 'ON_SCENE' } });
    await service.reportByLink('tok', 'ON_SCENE');
    expect(prisma.incident_barangay_notices.update).not.toHaveBeenCalled();
    expect(prisma.incidentEvent.create).not.toHaveBeenCalled();
    expect(notify.emitUpdated).not.toHaveBeenCalled();
  });

  it('refuses reports on a closed case and on a bad link', async () => {
    await expect(build({ notice: { ...NOTICE, closed_at: new Date() } }).service.reportByLink('tok', 'SEEN')).rejects.toThrow(/closed/);
    await expect(build({ resolves: false }).service.reportByLink('tok', 'SEEN')).rejects.toThrow(/not valid/);
  });
});
