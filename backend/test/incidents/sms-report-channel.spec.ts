import { BadRequestException } from '@nestjs/common';
import { IncidentStatus, IncidentType, ReporterStatus, UserRole } from '@agap/shared';
import { IncidentsService, SMS_REPORT_COMPLETION_WINDOW_MS } from '../../src/incidents/incidents.service';
import { PriorityService } from '../../src/incidents/priority/priority.service';

/**
 * MOD-17/19: a report that arrived as a citizen SMS (channel SMS), and the app's later
 * resend with the same event id completing it (link the account, fill blanks only).
 */

const KEY = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';
const PHONE = '+639171234567';

function smsIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    public_reference: 'INC-2026-000123',
    category: 'FIRE',
    priority: 'HIGH',
    status: IncidentStatus.SUBMITTED,
    client_event_id: KEY,
    report_channel: 'SMS',
    submitted_at: new Date(),
    created_at: new Date(),
    ...overrides,
  };
}

function build() {
  const created = { tx: null as any };
  const makeTx = () => ({
    incident: { create: jest.fn().mockResolvedValue(smsIncident()) },
    incidentReporter: { create: jest.fn().mockResolvedValue({}) },
    incident_patients: { create: jest.fn() },
    incident_locations: { create: jest.fn() },
    incident_details: { create: jest.fn() },
    incidentEvent: { create: jest.fn() },
  });
  // The completion transaction reads the current state, then fills blanks.
  const current = {
    description: null as string | null,
    hazard_flags: [] as string[],
    incident_reporters: {
      id: 'rep-1',
      user_id: null as string | null,
      reporter_status: null as string | null,
      reporter_phone: PHONE as string | null,
    },
    incident_patients: [] as { id: string }[],
    incident_details: null as { id: string; caller_answers: unknown } | null,
    incident_locations: null as { id: string } | null,
  };
  // The signed-in citizen: by default the verified owner of the number that sent the SMS.
  const account = { phone_number: '09171234567' as string | null, is_phone_verified: true };
  const completeTx = {
    incident: { findUnique: jest.fn(async () => current), update: jest.fn() },
    user: { findUnique: jest.fn(async () => account) },
    incidentReporter: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
    incident_patients: { create: jest.fn() },
    incident_details: { create: jest.fn(), update: jest.fn() },
    incident_locations: { create: jest.fn() },
  };
  const prisma: any = {
    incident: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(async () => smsIncident({ description: 'filled' })),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(async (fn: (tx: any) => unknown) => {
      created.tx = makeTx();
      return fn(created.tx);
    }),
  };
  const audit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const realtime = { notifyIncidentCreated: jest.fn(), incidentUpdated: jest.fn() };
  const contacts = { notifyContactsOfIncident: jest.fn() };
  const barangayNotify = { notifyForIncident: jest.fn().mockResolvedValue(undefined) };
  const opsAlert = { onIncidentSaved: jest.fn().mockResolvedValue(undefined) };
  const duplicates = { findNearbyRecent: jest.fn().mockResolvedValue(null) };
  const service = new IncidentsService(
    prisma,
    {} as any,
    duplicates as any,
    new PriorityService(),
    realtime as any,
    audit as any,
    contacts as any,
    barangayNotify as any,
    undefined,
    opsAlert as any,
    undefined,
  );
  /** Make the next lookup find the SMS incident, and route $transaction to the completion stub. */
  const existingSms = (overrides: Record<string, unknown> = {}) => {
    prisma.incident.findFirst.mockResolvedValue(smsIncident(overrides));
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => unknown) => fn(completeTx));
  };
  return { service, prisma, created, current, account, completeTx, audit, realtime, contacts, barangayNotify, opsAlert, existingSms };
}

describe('IncidentsService — SMS channel (MOD-17/19)', () => {
  describe('create via SMS', () => {
    it('creates a guest report with no GPS, keeps the sender as the callback number, and marks the channel', async () => {
      const t = build();
      const sentAt = new Date('2026-11-14T08:05:00Z');
      await t.service.create(
        { type: IncidentType.FIRE, idempotencyKey: KEY, triggerMethod: 'SOS_BUTTON' },
        undefined,
        undefined,
        { channel: 'SMS', senderPhone: PHONE, sentAt },
      );
      const tx = t.created.tx;
      expect(tx.incident.create.mock.calls[0][0].data).toMatchObject({ report_channel: 'SMS', client_event_id: KEY, trigger_method: 'SOS_BUTTON' });
      // SLA timing starts at receipt (the column default), not at the phone's send time.
      expect(tx.incident.create.mock.calls[0][0].data.submitted_at).toBeUndefined();
      expect(tx.incidentReporter.create.mock.calls[0][0].data).toMatchObject({
        is_guest: true,
        user_id: null,
        reporter_phone: PHONE,
        contact_callback: PHONE,
      });
      expect(tx.incident_locations.create).not.toHaveBeenCalled();
      expect(tx.incidentEvent.create.mock.calls[0][0].data.notes).toBe(
        'Received by SMS (no mobile data); sent from the phone at 2026-11-14 16:05',
      );
      // Same after-save work as an app report: ops SMS + SLA checks.
      expect(t.opsAlert.onIncidentSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'inc-1' }), null);
    });

    it('still refuses an app guest report without GPS', async () => {
      const t = build();
      await expect(t.service.create({ type: IncidentType.FIRE, idempotencyKey: KEY })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('an app report is marked APP and keeps no callback number', async () => {
      const t = build();
      await t.service.create({ type: IncidentType.FIRE, idempotencyKey: KEY }, 'user-1', UserRole.CITIZEN);
      expect(t.created.tx.incident.create.mock.calls[0][0].data.report_channel).toBe('APP');
      expect(t.created.tx.incidentReporter.create.mock.calls[0][0].data.contact_callback).toBeNull();
    });

    it('an SMS resend of a known event id returns the incident untouched', async () => {
      const t = build();
      t.existingSms();
      const r = await t.service.create({ type: IncidentType.FIRE, idempotencyKey: KEY }, undefined, undefined, { channel: 'SMS', senderPhone: PHONE });
      expect(r.id).toBe('inc-1');
      expect(t.prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('the app resend completes the SMS report', () => {
    const appDto = () => ({
      type: IncidentType.FIRE,
      idempotencyKey: KEY,
      description: 'Smoke from the second floor',
      lat: 14.7963,
      lng: 120.9272,
      patient: { isReporter: false, isUnknown: true },
      intake: { answers: {}, reporterStatus: ReporterStatus.SAFE, landmark: 'Near the chapel' },
    });

    it('links the citizen and fills every empty field, audited by field name only', async () => {
      const t = build();
      t.existingSms();
      await t.service.create(appDto() as any, 'user-1', UserRole.CITIZEN);

      expect(t.completeTx.incidentReporter.updateMany).toHaveBeenCalledWith({
        where: { id: 'rep-1', user_id: null },
        data: { user_id: 'user-1', is_guest: false },
      });
      expect(t.completeTx.incident.update).toHaveBeenCalledWith({ where: { id: 'inc-1' }, data: { description: 'Smoke from the second floor' } });
      expect(t.completeTx.incident_patients.create).toHaveBeenCalled();
      expect(t.completeTx.incident_locations.create.mock.calls[0][0].data).toMatchObject({
        latitude: 14.7963,
        longitude: 120.9272,
        landmark: 'Near the chapel',
        source: 'GPS',
      });
      const entry = t.audit.logInTransaction.mock.calls[0][1];
      expect(entry).toMatchObject({ action: 'UPDATE', actorId: 'user-1', moduleId: 'MOD-19', incidentId: 'inc-1' });
      expect(entry.newValues.completedFromApp).toEqual(
        expect.arrayContaining(['reporter_account', 'reporter_status', 'description', 'patient', 'location']),
      );
      expect(JSON.stringify(entry.newValues)).not.toContain('Smoke');
      expect(t.realtime.incidentUpdated).toHaveBeenCalledWith('inc-1', expect.objectContaining({ change: 'sms_report_completed' }));
      expect(t.contacts.notifyContactsOfIncident).toHaveBeenCalledWith('user-1', 'inc-1', 'INC-2026-000123', 'FIRE');
      expect(t.barangayNotify.notifyForIncident).toHaveBeenCalledWith('inc-1');
    });

    it('never overwrites what is already there', async () => {
      const t = build();
      t.existingSms();
      t.current.description = 'Dispatcher note';
      t.current.incident_reporters.user_id = 'someone-else';
      t.current.incident_reporters.reporter_status = 'NEEDS_HELP';
      t.current.incident_patients = [{ id: 'p-1' }];
      t.current.incident_locations = { id: 'loc-1' };
      t.current.hazard_flags = ['FIRE:SPREADING'];
      await t.service.create(appDto() as any, 'user-1', UserRole.CITIZEN);

      expect(t.completeTx.incidentReporter.updateMany).not.toHaveBeenCalled();
      expect(t.completeTx.incidentReporter.update).not.toHaveBeenCalled();
      expect(t.completeTx.incident.update).not.toHaveBeenCalled();
      expect(t.completeTx.incident_patients.create).not.toHaveBeenCalled();
      expect(t.completeTx.incident_locations.create).not.toHaveBeenCalled();
      expect(t.audit.logInTransaction).not.toHaveBeenCalled();
      expect(t.realtime.incidentUpdated).not.toHaveBeenCalled();
    });

    it('a description that is only the outside-Bocaue note still takes the app description, keeping the note', async () => {
      const t = build();
      t.existingSms();
      t.current.description = 'Reported GPS outside Bocaue: 14.59950,120.98420';
      await t.service.create(appDto() as any, 'user-1', UserRole.CITIZEN);
      expect(t.completeTx.incident.update).toHaveBeenCalledWith({
        where: { id: 'inc-1' },
        data: { description: 'Smoke from the second floor\n\nReported GPS outside Bocaue: 14.59950,120.98420' },
      });
    });

    it.each([
      ['a different number', { phone_number: '09189999999', is_phone_verified: true }],
      ['the same number, not verified', { phone_number: '09171234567', is_phone_verified: false }],
      ['no number on the account', { phone_number: null, is_phone_verified: true }],
    ])('does not link an account with %s, but still fills blanks and audits the refusal', async (_label, acct) => {
      const t = build();
      t.existingSms();
      Object.assign(t.account, acct);
      await t.service.create(appDto() as any, 'user-2', UserRole.CITIZEN);

      expect(t.completeTx.incidentReporter.updateMany).not.toHaveBeenCalled();
      expect(t.contacts.notifyContactsOfIncident).not.toHaveBeenCalled();
      expect(t.completeTx.incident.update).toHaveBeenCalled();
      const entry = t.audit.logInTransaction.mock.calls[0][1];
      expect(entry.newValues.accountLinkRefused).toBe('SENDER_NUMBER_MISMATCH');
      expect(entry.newValues.completedFromApp).not.toContain('reporter_account');
    });

    it('audits a refused link even when there is nothing left to fill', async () => {
      const t = build();
      t.existingSms();
      t.account.phone_number = '09189999999';
      t.current.description = 'Dispatcher note';
      t.current.incident_reporters.reporter_status = 'NEEDS_HELP';
      t.current.incident_patients = [{ id: 'p-1' }];
      t.current.incident_locations = { id: 'loc-1' };
      t.current.hazard_flags = ['FIRE:SPREADING'];
      await t.service.create(appDto() as any, 'user-2', UserRole.CITIZEN);

      expect(t.audit.logInTransaction).toHaveBeenCalledTimes(1);
      expect(t.audit.logInTransaction.mock.calls[0][1].newValues).toEqual({
        completedFromApp: [],
        channel: 'SMS',
        accountLinkRefused: 'SENDER_NUMBER_MISMATCH',
      });
      expect(t.realtime.incidentUpdated).not.toHaveBeenCalled();
    });

    it('does not link a non-citizen account', async () => {
      const t = build();
      t.existingSms();
      await t.service.create(appDto() as any, 'disp-1', UserRole.DISPATCHER);
      expect(t.completeTx.incidentReporter.updateMany).not.toHaveBeenCalled();
      expect(t.contacts.notifyContactsOfIncident).not.toHaveBeenCalled();
    });

    it('a guest app resend fills blanks without linking anyone', async () => {
      const t = build();
      t.existingSms();
      await t.service.create(appDto() as any);
      expect(t.completeTx.incidentReporter.updateMany).not.toHaveBeenCalled();
      expect(t.completeTx.incident.update).toHaveBeenCalled();
    });

    it('leaves an app-channel incident alone (plain idempotent return)', async () => {
      const t = build();
      t.existingSms({ report_channel: 'APP' });
      const r = await t.service.create(appDto() as any, 'user-1', UserRole.CITIZEN);
      expect(r.id).toBe('inc-1');
      expect(t.prisma.$transaction).not.toHaveBeenCalled();
    });

    it(`leaves an SMS report older than ${SMS_REPORT_COMPLETION_WINDOW_MS / 3_600_000} h alone`, async () => {
      const t = build();
      t.existingSms({ created_at: new Date(Date.now() - SMS_REPORT_COMPLETION_WINDOW_MS - 1000) });
      await t.service.create(appDto() as any, 'user-1', UserRole.CITIZEN);
      expect(t.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a failure while completing still returns the incident', async () => {
      const t = build();
      t.existingSms();
      t.audit.logInTransaction.mockRejectedValue(new Error('audit down'));
      const r = await t.service.create(appDto() as any, 'user-1', UserRole.CITIZEN);
      expect(r.id).toBe('inc-1');
      expect(t.realtime.incidentUpdated).not.toHaveBeenCalled();
    });
  });
});
