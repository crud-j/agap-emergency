import {
  BARANGAY_SMS_MAX_LENGTH,
  BarangayNotifyService,
  buildBarangayFollowupSms,
} from '../../src/barangay-coordination/barangay-notify.service';
import {
  BarangayCallbackNotFoundError,
  BarangayCallbackRefusedError,
  BarangayCallbackService,
} from '../../src/barangay-coordination/barangay-callback.service';

/** Phase 4: dispatcher callback automation and the "has not reported back" reminder. */

const INCIDENT = 'inc-1';
const ACTOR = { id: 'u-1', role: 'DISPATCHER' };
const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 600_000);

function notice(over: Record<string, unknown> = {}) {
  return {
    id: 'n-1',
    incident_id: INCIDENT,
    barangay_id: 'BATIA',
    match_method: 'POLYGON',
    is_approximate: false,
    short_code: '0420',
    sms_status: 'SENT',
    sms_sent_at: null,
    last_report: null,
    last_report_at: null,
    followup_due_at: PAST,
    followup_sent_at: null,
    closed_at: null,
    barangay: { id: 'BATIA', name: 'Batia' },
    ...over,
  };
}

describe('buildBarangayFollowupSms', () => {
  it('names the code, barangay and reference, and fits one segment for every barangay name', () => {
    const sms = buildBarangayFollowupSms({
      shortCode: '4821',
      barangayName: 'Batia',
      reference: 'INC-2026-001234',
      opsPhone: '+639171234567',
    });
    expect(sms).toBe(
      'AGAP 4821 REMINDER Brgy Batia INC-2026-001234: please report status. Call MDRRMO +639171234567',
    );
    expect(sms.length).toBeLessThan(BARANGAY_SMS_MAX_LENGTH);
    expect(
      buildBarangayFollowupSms({ shortCode: '4821', barangayName: 'Sulucan-Bambang'.padEnd(30, 'x'), reference: 'INC-2026-999999', opsPhone: '+639999999999' }).length,
    ).toBeLessThan(BARANGAY_SMS_MAX_LENGTH);
  });
});

describe('BarangayNotifyService.sendFollowup', () => {
  function build(stored: any, incident: any = { public_reference: 'INC-2026-000042', status: 'ASSESSED' }) {
    const prisma: any = {
      incident_barangay_notices: {
        findUnique: jest.fn(async () => stored),
        update: jest.fn(async ({ data }: any) => (stored = { ...stored, ...data })),
      },
      incident: { findUnique: jest.fn().mockResolvedValue(incident) },
    };
    const directory: any = {
      getAlertTargets: jest.fn().mockResolvedValue([{ phone_e164: '+639171111111', is_demo: false }]),
    };
    const realtime: any = { barangayNoticeUpdated: jest.fn() };
    const env: Record<string, string> = {
      BARANGAY_ALERTS_ENABLED: 'true',
      BARANGAY_SMS_TEST_OVERRIDE_PHONE: '09750000000',
      NODE_ENV: 'development',
    };
    const config: any = { get: jest.fn((k: string) => env[k]) };
    const smsQueue: any = { addBulk: jest.fn().mockResolvedValue([]), add: jest.fn() };
    const service = new BarangayNotifyService(prisma, directory, realtime, { log: jest.fn() } as any, config, smsQueue);
    return { service, prisma, smsQueue, realtime };
  }

  it('texts the targets once, without touching sms_status, and marks the reminder sent', async () => {
    const { service, smsQueue, prisma, realtime } = build(notice());
    await service.sendFollowup('n-1');

    const jobs = smsQueue.addBulk.mock.calls[0][0];
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.phone).toBe('+639750000000');
    expect(jobs[0].data.message).toContain('REMINDER');
    expect(jobs[0].data.noticeId).toBeUndefined(); // must not rewrite the alert's sms_status
    expect(prisma.incident_barangay_notices.update.mock.calls[0][0].data).toHaveProperty('followup_sent_at');
    expect(realtime.barangayNoticeUpdated).toHaveBeenCalledWith(expect.objectContaining({ followupDue: true }));
  });

  it.each([
    ['the barangay already reported', { last_report: 'ON_THE_WAY' }],
    ['the reminder was already sent', { followup_sent_at: PAST }],
    ['the notice is closed', { closed_at: PAST }],
    ['a resend moved the due time later', { followup_due_at: FUTURE }],
  ])('does nothing when %s', async (_label, over) => {
    const { service, smsQueue } = build(notice(over));
    await service.sendFollowup('n-1');
    expect(smsQueue.addBulk).not.toHaveBeenCalled();
  });

  it('does nothing once the incident is terminal', async () => {
    const { service, smsQueue } = build(notice(), { public_reference: 'INC-1', status: 'CLOSED' });
    await service.sendFollowup('n-1');
    expect(smsQueue.addBulk).not.toHaveBeenCalled();
  });

  it('never throws when the queue is down', async () => {
    const { service, smsQueue } = build(notice());
    smsQueue.addBulk.mockRejectedValue(new Error('redis down'));
    await expect(service.sendFollowup('n-1')).resolves.toBeUndefined();
  });
});

describe('BarangayCallbackService', () => {
  function build(opts: { stored?: any; status?: string; contact?: any; updateStatusFails?: boolean } = {}) {
    const stored = opts.stored === undefined ? notice() : opts.stored;
    const prisma: any = {
      incident_barangay_notices: {
        findFirst: jest.fn(async () => stored),
        update: jest.fn().mockResolvedValue({}),
      },
      barangay_contacts: {
        findFirst: jest.fn().mockResolvedValue(opts.contact === undefined ? { role: 'PRIMARY', label: 'BDRRMC' } : opts.contact),
      },
      incident: {
        findUnique: jest.fn().mockResolvedValue({ status: opts.status ?? 'ASSESSED', public_reference: 'INC-2026-000042' }),
      },
      incidentEvent: { create: jest.fn().mockResolvedValue({}) },
      escalation: { create: jest.fn().mockResolvedValue({ id: 'esc-1' }) },
      incident_resolutions: { delete: jest.fn().mockResolvedValue({}) },
    };
    const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
    const realtime: any = { notifyEscalation: jest.fn() };
    const notify: any = { emitUpdated: jest.fn().mockResolvedValue(undefined) };
    const incidents: any = {
      createResolution: jest.fn().mockResolvedValue({ id: 'res-1' }),
      updateStatus: opts.updateStatusFails
        ? jest.fn().mockRejectedValue(new Error('bad transition'))
        : jest.fn().mockResolvedValue({}),
    };
    const service = new BarangayCallbackService(prisma, audit, realtime, notify, incidents, {} as any, {} as any);
    return { service, prisma, audit, realtime, notify, incidents };
  }

  it('logs a call attempt on the timeline and in the audit log, without changing the status', async () => {
    const { service, prisma, audit } = build();
    await service.logCallAttempt(INCIDENT, 'c-1', ACTOR);

    const event = prisma.incidentEvent.create.mock.calls[0][0].data;
    expect(event).toMatchObject({ from_status: 'ASSESSED', to_status: 'ASSESSED', triggered_by_id: 'u-1' });
    expect(event.notes).toContain('Called Brgy Batia');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ incidentId: INCIDENT, moduleId: 'MOD-34' }));
  });

  it("refuses a contact that is not on the incident's barangay", async () => {
    const { service } = build({ contact: null });
    await expect(service.logCallAttempt(INCIDENT, 'c-9', ACTOR)).rejects.toBeInstanceOf(BarangayCallbackNotFoundError);
  });

  it('refuses callbacks when there is no notice or it is closed', async () => {
    await expect(build({ stored: null }).service.logCallAttempt(INCIDENT, 'c-1', ACTOR)).rejects.toBeInstanceOf(
      BarangayCallbackNotFoundError,
    );
    await expect(
      build({ stored: notice({ closed_at: PAST }) }).service.recordOutcome(INCIDENT, 'HANDLED', undefined, ACTOR),
    ).rejects.toBeInstanceOf(BarangayCallbackRefusedError);
  });

  it('records an outcome as a phone report and re-broadcasts', async () => {
    const { service, prisma, notify, realtime } = build();
    await service.recordOutcome(INCIDENT, 'ON_THE_WAY', 'ETA 10 min', ACTOR);

    expect(prisma.incident_barangay_notices.update.mock.calls[0][0].data).toMatchObject({
      last_report: 'ON_THE_WAY',
      last_report_source: 'PHONE_CALL',
      last_report_by_user_id: 'u-1',
    });
    expect(prisma.incidentEvent.create.mock.calls[0][0].data.notes).toContain('ETA 10 min');
    expect(prisma.escalation.create).not.toHaveBeenCalled();
    expect(realtime.notifyEscalation).not.toHaveBeenCalled();
    expect(notify.emitUpdated).toHaveBeenCalledWith('n-1');
  });

  it('NEEDS_BACKUP raises a supervisor escalation and tells ops', async () => {
    const { service, prisma, realtime } = build();
    await service.recordOutcome(INCIDENT, 'NEEDS_BACKUP', undefined, ACTOR);

    expect(prisma.escalation.create.mock.calls[0][0].data).toMatchObject({
      incident_id: INCIDENT,
      escalation_level: 'LEVEL_1_SUPERVISOR',
    });
    expect(prisma.escalation.create.mock.calls[0][0].data.triggered_reason).toContain('Barangay requested backup');
    expect(realtime.notifyEscalation).toHaveBeenCalledWith(
      INCIDENT,
      expect.objectContaining({ escalationId: 'esc-1', escalationType: 'BARANGAY_BACKUP_REQUESTED' }),
    );
  });

  it('keeps the recorded outcome when the escalation cannot be created', async () => {
    const { service, prisma, notify } = build();
    prisma.escalation.create.mockRejectedValue(new Error('db'));
    await expect(service.recordOutcome(INCIDENT, 'NEEDS_BACKUP', undefined, ACTOR)).resolves.toBeUndefined();
    expect(notify.emitUpdated).toHaveBeenCalled();
  });

  it('confirm handled: ASSESSED → resolution HANDLED_BY_BARANGAY → REFERRED', async () => {
    const { service, incidents, prisma } = build();
    await service.confirmHandled(INCIDENT, ACTOR, 'Captain on scene');

    expect(incidents.createResolution).toHaveBeenCalledWith(
      INCIDENT,
      expect.objectContaining({ outcome: 'HANDLED_BY_BARANGAY', resolutionNotes: 'Captain on scene' }),
      'u-1',
    );
    expect(incidents.updateStatus).toHaveBeenCalledWith(INCIDENT, 'REFERRED', 'u-1', expect.any(String));
    expect(prisma.incident_barangay_notices.update.mock.calls[0][0].data.last_report).toBe('HANDLED');
  });

  it('confirm handled is refused outside ASSESSED, and writes nothing', async () => {
    const { service, incidents } = build({ status: 'SUBMITTED' });
    await expect(service.confirmHandled(INCIDENT, ACTOR)).rejects.toBeInstanceOf(BarangayCallbackRefusedError);
    expect(incidents.createResolution).not.toHaveBeenCalled();
    expect(incidents.updateStatus).not.toHaveBeenCalled();
  });

  it('rolls back the resolution when the status change fails, so a retry is possible', async () => {
    const { service, prisma } = build({ updateStatusFails: true });
    await expect(service.confirmHandled(INCIDENT, ACTOR)).rejects.toThrow('bad transition');
    expect(prisma.incident_resolutions.delete).toHaveBeenCalledWith({ where: { id: 'res-1' } });
    expect(prisma.incident_barangay_notices.update).not.toHaveBeenCalled();
  });
});
