import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AuditAction } from '@agap/shared';
import { MedicalCryptoService } from '../../src/medical-profiles/medical-crypto.service';
import { MedicalProfilesService } from '../../src/medical-profiles/medical-profiles.service';
import { findSharedReporterProfile } from '../../src/medical-profiles/patient-medical-access';

/**
 * MOD-03 / MOD-32 / MOD-48 — the assigned crew sees a medical profile only when the
 * reporter said they themselves need help (reporter ≠ patient, rule 2), after the
 * crew accepted, and every read is logged with its incident.
 */

const OWNER = uuidv4();
const PROFILE_ID = uuidv4();
const KEY = randomBytes(32).toString('base64');
const crypto = new MedicalCryptoService({ get: () => KEY } as unknown as ConfigService);

describe('findSharedReporterProfile (who counts as the patient)', () => {
  it('asks for a registered reporter who marked "Also needs help", consented and has a profile, on an active incident', async () => {
    const prisma = { incidentReporter: { findFirst: jest.fn().mockResolvedValue(null) } };
    await findSharedReporterProfile(prisma as any, 'inc-1');

    const where = prisma.incidentReporter.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      incident_id: 'inc-1',
      is_guest: false,
      user_id: { not: null },
      incidents: { incident_patients: { some: { is_reporter: true } } },
      users: {
        medical_profiles: { isNot: null },
        consent_records: { some: { consent_type: 'MEDICAL_PROFILE', status: 'GRANTED' } },
      },
    });
    expect(where.incidents.status.in).toEqual(expect.arrayContaining(['DISPATCHED', 'ON_SCENE', 'TRANSPORTING']));
    expect(where.incidents.status.in).not.toContain('RESOLVED');
    expect(where.incidents.status.in).not.toContain('CLOSED');
  });

  it('never matches another AGAP user as the patient (no incident_patients.user_id path)', async () => {
    const prisma = { incidentReporter: { findFirst: jest.fn().mockResolvedValue(null) } };
    await findSharedReporterProfile(prisma as any, 'inc-1');
    expect(JSON.stringify(prisma.incidentReporter.findFirst.mock.calls[0][0])).not.toContain('"user_id":"');
  });

  it('returns the owner and profile id, or null', async () => {
    const found = { incidentReporter: { findFirst: jest.fn().mockResolvedValue({ user_id: OWNER, users: { medical_profiles: { id: PROFILE_ID } } }) } };
    await expect(findSharedReporterProfile(found as any, 'inc-1')).resolves.toEqual({ userId: OWNER, profileId: PROFILE_ID });
    const none = { incidentReporter: { findFirst: jest.fn().mockResolvedValue(null) } };
    await expect(findSharedReporterProfile(none as any, 'inc-1')).resolves.toBeNull();
  });
});

describe('MedicalProfilesService.findForAssignment', () => {
  function build(opts: { crewAccepted?: boolean; shared?: boolean } = {}) {
    const stored = {
      id: PROFILE_ID, user_id: OWNER, consent_record_id: uuidv4(),
      ...crypto.sealFields(OWNER, {
        blood_type: 'O+', allergies: ['Penicillin'], current_medications: ['Metformin'],
        medical_conditions: ['Diabetes'], disabilities: [], responder_notes: 'Insulin pump',
      }),
      last_reviewed_at: new Date('2026-11-01T00:00:00Z'), created_at: new Date(), updated_at: new Date('2026-11-01T00:00:00Z'),
    };
    const prisma = {
      dispatches: {
        findFirst: jest.fn().mockResolvedValue(
          opts.crewAccepted === false ? null : { incident_id: 'inc-1', incidents: { public_reference: 'INC-2026-000777' } },
        ),
      },
      incidentReporter: {
        findFirst: jest.fn().mockResolvedValue(opts.shared === false ? null : { user_id: OWNER, users: { medical_profiles: { id: PROFILE_ID } } }),
      },
      medicalProfile: { findUnique: jest.fn().mockResolvedValue(stored) },
      sensitive_data_access_log: { create: jest.fn() },
    };
    const audit = { log: jest.fn() };
    const service = new MedicalProfilesService(prisma as any, crypto, audit as any);
    return { service, prisma, audit };
  }
  const actor = { id: 'resp-1', role: 'RESPONDER' };

  it('returns readable medical fields only, labelled self-reported, with no internal ids', async () => {
    const b = build();
    const result = await b.service.findForAssignment('disp-1', actor);
    expect(result).toEqual({
      source: 'REPORTER_SELF_REPORTED',
      blood_type: 'O+', allergies: ['Penicillin'], current_medications: ['Metformin'],
      medical_conditions: ['Diabetes'], disabilities: [], responder_notes: 'Insulin pump',
      last_reviewed_at: expect.any(Date), updated_at: expect.any(Date),
    });
    expect(JSON.stringify(result)).not.toContain(OWNER);
    expect(JSON.stringify(result)).not.toContain(PROFILE_ID);
  });

  it('looks for the caller on an ACCEPTED dispatch only', async () => {
    const b = build();
    await b.service.findForAssignment('disp-1', actor);
    expect(b.prisma.dispatches.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'disp-1', status: 'ACCEPTED', dispatch_crew: { some: { user_id: 'resp-1' } } },
    }));
  });

  it('logs the read for the citizen with the incident, and audits it', async () => {
    const b = build();
    await b.service.findForAssignment('disp-1', actor);
    expect(b.prisma.sensitive_data_access_log.create).toHaveBeenCalledWith({
      data: {
        accessor_id: 'resp-1', data_type: 'MEDICAL_PROFILE', entity_id: PROFILE_ID, incident_id: 'inc-1',
        purpose: 'Patient care by the assigned crew, INC-2026-000777',
      },
    });
    expect(b.audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: AuditAction.READ, actorId: 'resp-1', entityType: 'medical_profile', entityId: PROFILE_ID, incidentId: 'inc-1',
    }));
  });

  it('refuses someone not on an accepted crew (403), audits the refusal, and reads nothing', async () => {
    const b = build({ crewAccepted: false });
    await expect(b.service.findForAssignment('disp-1', actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(b.audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: AuditAction.PERMISSION_DENIED, moduleId: 'MOD-48' }));
    expect(b.prisma.incidentReporter.findFirst).not.toHaveBeenCalled();
    expect(b.prisma.medicalProfile.findUnique).not.toHaveBeenCalled();
    expect(b.prisma.sensitive_data_access_log.create).not.toHaveBeenCalled();
  });

  it('404 when the reporter did not say they need help (or did not consent), and nothing is logged', async () => {
    const b = build({ shared: false });
    await expect(b.service.findForAssignment('disp-1', actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(b.prisma.medicalProfile.findUnique).not.toHaveBeenCalled();
    expect(b.prisma.sensitive_data_access_log.create).not.toHaveBeenCalled();
  });
});

describe('RespondersService.getAssignment: patient_medical_shared', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { RespondersService } = require('../../src/responders/responders.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { IncidentStatusService } = require('../../src/incidents/incident-status/incident-status.service');

  function build(status: string, shared: boolean) {
    const prisma = {
      dispatches: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'disp-1', incident_id: 'inc-1', status, dispatch_crew: [{ user_id: 'resp-1' }],
          incidents: { id: 'inc-1', status: 'EN_ROUTE', incident_reporters: { is_guest: false, users: null } },
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      incidentReporter: {
        findFirst: jest.fn().mockResolvedValue(shared ? { user_id: OWNER, users: { medical_profiles: { id: PROFILE_ID } } } : null),
      },
    };
    return { prisma, service: new RespondersService(prisma as any, {} as any, {} as any, new IncidentStatusService()) };
  }

  it('is true for an accepted crew when the reporter shared a profile, without reading any medical field', async () => {
    const b = build('ACCEPTED', true);
    const result: any = await b.service.getAssignment('disp-1', 'resp-1');
    expect(result.incidents.patient_medical_shared).toBe(true);
    expect(JSON.stringify(result)).not.toContain(PROFILE_ID);
  });

  it('is false, without a lookup, before the crew accepts', async () => {
    const b = build('PENDING', true);
    const result: any = await b.service.getAssignment('disp-1', 'resp-1');
    expect(result.incidents.patient_medical_shared).toBe(false);
    expect(b.prisma.incidentReporter.findFirst).not.toHaveBeenCalled();
  });
});
