import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { MedicalCryptoService, type MedicalFields } from '../../src/medical-profiles/medical-crypto.service';
import { MedicalProfilesService } from '../../src/medical-profiles/medical-profiles.service';
import { isSealed } from '../../src/common/crypto/secret-box';

const KEY = randomBytes(32).toString('base64');
const USER_ID = uuidv4();

function cryptoWith(key: string | undefined) {
  return new MedicalCryptoService({ get: () => key } as unknown as ConfigService);
}

const PLAIN: MedicalFields = {
  blood_type: 'O+',
  allergies: ['Penicillin'],
  current_medications: ['Metformin'],
  medical_conditions: ['Diabetes'],
  disabilities: [],
  responder_notes: 'Uses an insulin pump',
};

describe('MedicalCryptoService — MOD-03 encryption at rest', () => {
  const crypto = cryptoWith(KEY);

  it('seals every medical value and opens it back', () => {
    const sealed = crypto.sealFields(USER_ID, PLAIN);
    expect(isSealed(sealed.blood_type!)).toBe(true);
    expect(sealed.allergies.every(isSealed)).toBe(true);
    expect(sealed.responder_notes).not.toContain('insulin');
    const opened = crypto.openProfile({ ...sealed, user_id: USER_ID });
    expect(opened).toEqual({ ...PLAIN, user_id: USER_ID });
  });

  it('keeps null and leaves out fields that are not given', () => {
    const sealed = crypto.sealFields(USER_ID, { blood_type: null, allergies: undefined });
    expect(sealed).toEqual({ blood_type: null });
  });

  it("refuses a value copied onto another user's row", () => {
    const sealed = crypto.sealFields(USER_ID, PLAIN);
    expect(() => crypto.openProfile({ ...sealed, user_id: uuidv4() })).toThrow();
  });

  it('returns rows saved before encryption as they are', () => {
    expect(crypto.openProfile({ ...PLAIN, user_id: USER_ID })).toEqual({ ...PLAIN, user_id: USER_ID });
  });

  it('cannot save without a key (503), but still reads old plaintext rows', () => {
    const noKey = cryptoWith(undefined);
    expect(noKey.isConfigured()).toBe(false);
    expect(() => noKey.sealFields(USER_ID, PLAIN)).toThrow(ServiceUnavailableException);
    expect(noKey.openProfile({ ...PLAIN, user_id: USER_ID }).blood_type).toBe('O+');
  });

  it('reports a malformed key as not configured', () => {
    expect(cryptoWith('too-short').isConfigured()).toBe(false);
  });
});

describe('MedicalProfilesService — stores only sealed values', () => {
  const crypto = cryptoWith(KEY);
  let stored: Record<string, unknown> | null;

  const prisma = {
    consent_records: { findFirst: jest.fn().mockResolvedValue({ id: uuidv4() }) },
    sensitive_data_access_log: { create: jest.fn() },
    medicalProfile: {
      findUnique: jest.fn(() => Promise.resolve(stored)),
      create: jest.fn(({ data }) => { stored = { id: uuidv4(), ...data }; return Promise.resolve(stored); }),
      update: jest.fn(({ data }) => { stored = { ...stored, ...data }; return Promise.resolve(stored); }),
    },
  };
  const service = new MedicalProfilesService(prisma as any, crypto);

  beforeEach(() => { stored = null; jest.clearAllMocks(); });

  it('create writes sealed values and returns readable ones', async () => {
    const result = await service.create(USER_ID, { bloodType: 'A-', allergies: ['Latex'] } as any);
    const data = prisma.medicalProfile.create.mock.calls[0][0].data;
    expect(isSealed(data.blood_type)).toBe(true);
    expect(isSealed(data.allergies[0])).toBe(true);
    expect(result.blood_type).toBe('A-');
    expect(result.allergies).toEqual(['Latex']);
  });

  it('an edit re-seals every field of a profile saved before encryption', async () => {
    stored = { id: uuidv4(), user_id: USER_ID, ...PLAIN };
    const result = await service.update(USER_ID, { allergies: ['Aspirin'] } as any);
    const data = prisma.medicalProfile.update.mock.calls[0][0].data;
    expect(isSealed(data.blood_type)).toBe(true);
    expect(isSealed(data.responder_notes)).toBe(true);
    expect(data.current_medications.every(isSealed)).toBe(true);
    expect(result.allergies).toEqual(['Aspirin']);
    expect(result.blood_type).toBe('O+');
  });

  it('a responder read logs the access and returns readable values', async () => {
    stored = { id: uuidv4(), ...crypto.sealFields(USER_ID, PLAIN), user_id: USER_ID };
    const result = await service.findForResponder(USER_ID, uuidv4());
    expect(prisma.sensitive_data_access_log.create).toHaveBeenCalled();
    expect(result.medical_conditions).toEqual(['Diabetes']);
  });
});
