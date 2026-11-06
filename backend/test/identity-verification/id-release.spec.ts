import { NotFoundException } from '@nestjs/common';
import { AuditAction, ID_VERIFICATION_CONSENT_TYPE } from '@agap/shared';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { ConsentService } from '../../src/consent/consent.service';
import { type Row } from '../auth/fake-prisma';
import { JPEG, file, makeAuth, makeKit } from './id-test-kit';

// MOD-48: when a claim on a PhilHealth ID ends. The citizen withdraws consent, or the account
// never confirmed its phone. The real scan + registration flow creates the rows.

const BASE = { phoneNumber: '09171234567', password: 'S3cure-Pass!', confirmPassword: 'S3cure-Pass!' };
const MATCH = { lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos' };
const WRONG = { lastName: 'Dela Rosa', firstName: 'Juan', middleName: 'S.' };

describe('PhilHealth ID claims that end', () => {
  let kit: ReturnType<typeof makeKit>;

  beforeEach(() => {
    kit = makeKit({ ID_VERIFICATION_REQUIRED: 'true' });
  });

  const scanRow = () => kit.prisma.db.idv[0];
  const userOf = (id: string) => kit.prisma.db.users.find((u: Row) => u.id === id);

  async function register(names: object, requestReview = false): Promise<{ userId: string; imageKey: string }> {
    const { auth } = makeAuth(kit);
    const { token } = await kit.service.scan(file(JPEG), {});
    const imageKey = scanRow().image_storage_key;
    await auth.register({ ...BASE, ...names, idVerificationToken: token, requestReview } as RegisterDto);
    kit.prisma.db.audit.length = 0;
    return { userId: scanRow().user_id, imageKey };
  }

  describe('withdrawing consent', () => {
    let consent: ConsentService;

    beforeEach(() => {
      consent = new ConsentService(kit.prisma, kit.service);
    });

    it('erases the name and PIN data, un-verifies the account, and records the withdrawal', async () => {
      const { userId } = await register(MATCH);
      expect(userOf(userId).identity_verified_at).toBeInstanceOf(Date);

      await consent.revokeConsent(userId, ID_VERIFICATION_CONSENT_TYPE);

      expect(scanRow()).toMatchObject({ status: 'RELEASED', pin_hmac: null, pin_last4: null, name_on_id_sealed: null });
      expect(userOf(userId).identity_verified_at).toBeNull();
      expect(kit.prisma.db.consents[0]).toMatchObject({ status: 'WITHDRAWN', withdrawn_at: expect.any(Date) });
      expect(kit.prisma.db.audit).toEqual([
        expect.objectContaining({
          action: AuditAction.IDENTITY_VERIFICATION_RELEASED,
          actor_id: userId,
          entity_id: userId,
          new_values: { reason: 'CONSENT_WITHDRAWN', scans: 1 },
        }),
      ]);
    });

    it('deletes an image still waiting for review right away, and takes it off the queue', async () => {
      const { userId, imageKey } = await register(WRONG, true);
      expect(scanRow().status).toBe('PENDING_REVIEW');
      expect(kit.storage.objects.has(imageKey)).toBe(true);

      await consent.revokeConsent(userId, ID_VERIFICATION_CONSENT_TYPE);

      expect(kit.storage.objects.has(imageKey)).toBe(false);
      expect(scanRow()).toMatchObject({ status: 'RELEASED', image_storage_key: null });
    });

    it('a failed image delete keeps the withdrawal; the cleanup job removes it', async () => {
      const { userId, imageKey } = await register(WRONG, true);
      kit.storage.deletePrivateObject.mockRejectedValueOnce(new Error('storage down'));

      await consent.revokeConsent(userId, ID_VERIFICATION_CONSENT_TYPE);

      expect(scanRow()).toMatchObject({ status: 'RELEASED', image_storage_key: imageKey, name_on_id_sealed: null });
      await kit.service.cleanup();
      expect(kit.storage.objects.has(imageKey)).toBe(false);
      expect(scanRow().image_storage_key).toBeNull();
    });

    it('a failed audit write withdraws nothing', async () => {
      const { userId } = await register(MATCH);
      kit.prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));

      await expect(consent.revokeConsent(userId, ID_VERIFICATION_CONSENT_TYPE)).rejects.toThrow('db down');

      expect(scanRow().status).toBe('AUTO_VERIFIED');
      expect(scanRow().pin_last4).toBe('0010');
      expect(userOf(userId).identity_verified_at).not.toBeNull();
      expect(kit.prisma.db.consents[0].status).toBe('GRANTED');
    });

    it('with no active consent: 404, nothing changes', async () => {
      const { userId } = await register(MATCH);
      await consent.revokeConsent(userId, ID_VERIFICATION_CONSENT_TYPE);
      await expect(consent.revokeConsent(userId, ID_VERIFICATION_CONSENT_TYPE)).rejects.toBeInstanceOf(NotFoundException);
      expect(kit.prisma.db.audit).toHaveLength(1);
    });

    it('frees the card, and leaves the account able to sign in (not blocked)', async () => {
      const { userId } = await register(MATCH);
      const statusBefore = userOf(userId).status;

      await consent.revokeConsent(userId, ID_VERIFICATION_CONSENT_TYPE);

      expect(userOf(userId).status).toBe(statusBefore);
      await expect(kit.service.scan(file(JPEG), {})).resolves.toMatchObject({ reviewRequired: false });
    });

    it('other consent types behave exactly as before and never touch ID data', async () => {
      const { userId } = await register(MATCH);
      kit.prisma.db.consents.push({ id: 'c-med', user_id: userId, consent_type: 'MEDICAL_PROFILE', status: 'GRANTED' });
      kit.prisma.consent_records.update = jest.fn(async ({ where, data }: any) =>
        Object.assign(kit.prisma.db.consents.find((c: Row) => c.id === where.id), data),
      );

      await consent.revokeConsent(userId, 'MEDICAL_PROFILE');

      expect(kit.prisma.db.consents.find((c: Row) => c.id === 'c-med').status).toBe('WITHDRAWN');
      expect(scanRow().status).toBe('AUTO_VERIFIED');
      expect(userOf(userId).identity_verified_at).toBeInstanceOf(Date);
    });
  });

  describe('accounts that never confirmed their phone', () => {
    const later = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);

    it('release the card after 24 hours, so a stranger cannot lock out its owner for good', async () => {
      const { userId, imageKey } = await register(MATCH);
      userOf(userId).is_phone_verified = false;
      scanRow().image_storage_key = imageKey;
      kit.storage.objects.set(imageKey, JPEG);

      expect(await kit.service.releaseUnverifiedClaims(later(23))).toBe(0);
      expect(scanRow().status).toBe('AUTO_VERIFIED');

      expect(await kit.service.releaseUnverifiedClaims(later(25))).toBe(1);
      expect(scanRow()).toMatchObject({ status: 'RELEASED', pin_hmac: null, name_on_id_sealed: null });
      expect(userOf(userId).identity_verified_at).toBeNull();
      expect(kit.prisma.db.audit).toEqual([
        expect.objectContaining({
          action: AuditAction.IDENTITY_VERIFICATION_RELEASED,
          entity_id: userId,
          new_values: { reason: 'PHONE_NOT_VERIFIED', scans: 1 },
        }),
      ]);
      await kit.service.cleanup();
      expect(kit.storage.objects.has(imageKey)).toBe(false);
    });

    it('never touch a citizen who did confirm their phone', async () => {
      const { userId } = await register(MATCH);
      userOf(userId).is_phone_verified = true;
      expect(await kit.service.releaseUnverifiedClaims(later(100))).toBe(0);
      expect(scanRow().status).toBe('AUTO_VERIFIED');
    });

    it.each(['DEACTIVATED', 'SUSPENDED'])('a %s account keeps its claim, so a ban cannot be undone by waiting', async (status) => {
      const { userId } = await register(MATCH);
      Object.assign(userOf(userId), { is_phone_verified: false, status });
      expect(await kit.service.releaseUnverifiedClaims(later(100))).toBe(0);
      expect(scanRow().status).toBe('AUTO_VERIFIED');
    });

    it('a failure on one account is logged and retried on the next run', async () => {
      const { userId } = await register(MATCH);
      userOf(userId).is_phone_verified = false;
      kit.prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));

      await expect(kit.service.releaseUnverifiedClaims(later(25))).resolves.toBe(0);
      expect(scanRow().status).toBe('AUTO_VERIFIED');

      await expect(kit.service.releaseUnverifiedClaims(later(25))).resolves.toBe(1);
      expect(scanRow().status).toBe('RELEASED');
    });
  });
});
