import * as path from 'path';
import * as dotenv from 'dotenv';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { AuditAction } from '@agap/shared';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { IncidentsService } from '../src/incidents/incidents.service';
import { IdDocumentCryptoService } from '../src/identity-verification/id-document-crypto.service';
import { IdentityVerificationService } from '../src/identity-verification/identity-verification.service';
import { UsersService } from '../src/users/users.service';
import { e2eDatabaseUrl } from './e2e/e2e-database';

// MOD-48 — when a claim on a PhilHealth ID ends, against real PostgreSQL: the partial unique index,
// the relation filter and the new enum values, which the unit tests' in-memory database can only
// imitate. Runs on the E2E database (pnpm test:e2e:db). No backend, no Redis, no SMS.

const PHONE = () => `+639${randomBytes(4).readUInt32BE().toString().padStart(9, '0').slice(0, 9)}`;
const HOUR = 60 * 60 * 1000;

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const E2E_URL = e2eDatabaseUrl();
const describeE2E = E2E_URL ? describe : describe.skip;
if (!E2E_URL) {
  console.warn('identity-verification-release.e2e-spec: skipped. Set E2E_DATABASE_URL in backend/.env and run `pnpm test:e2e:db`.');
}

describeE2E('PhilHealth ID release (real database)', () => {
  let prisma: PrismaService;
  let service: IdentityVerificationService;
  let crypto: IdDocumentCryptoService;
  const media = { deletePrivateObject: jest.fn(async () => undefined) };
  const userIds: string[] = [];
  const scanIds: string[] = [];

  beforeAll(() => {
    // Before PrismaService reads it, and never the development database. The real service, so
    // the session time zone that created_at comparisons depend on is the production one.
    process.env['DATABASE_URL'] = E2E_URL!;
    prisma = new PrismaService();
    const secrets: Record<string, string> = {
      ID_DOCUMENT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      ID_PIN_PEPPER: randomBytes(32).toString('base64'),
    };
    crypto = new IdDocumentCryptoService({ get: (name: string) => secrets[name] } as any);
    service = new IdentityVerificationService(
      prisma,
      crypto,
      {} as any,
      media as any,
      new AuditService(prisma),
    );
  });

  afterAll(async () => {
    await prisma.identity_verifications.deleteMany({ where: { id: { in: scanIds } } });
    await prisma.consent_records.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function account(fields: Record<string, unknown> = {}): Promise<string> {
    const user = await prisma.user.create({
      data: {
        full_name: 'Test Citizen',
        phone_number: PHONE(),
        password_hash: 'x',
        identity_verified_at: new Date(),
        is_phone_verified: true,
        status: 'ACTIVE',
        ...fields,
      } as any,
    });
    userIds.push(user.id);
    return user.id;
  }

  async function scan(pinHmac: string, fields: Record<string, unknown> = {}): Promise<string> {
    const id = randomUUID();
    scanIds.push(id);
    await prisma.identity_verifications.create({
      data: {
        id,
        status: 'AUTO_VERIFIED',
        claim_token_hash: randomBytes(32).toString('hex'),
        claim_expires_at: new Date(Date.now() + HOUR),
        pin_hmac: pinHmac,
        pin_last4: '0010',
        name_on_id_sealed: 'sealed',
        image_storage_key: `local:id-documents/${id}`,
        ...fields,
      } as any,
    });
    return id;
  }

  const hmac = () => randomBytes(32).toString('hex');
  const row = (id: string) => prisma.identity_verifications.findUniqueOrThrow({ where: { id } });

  it('the partial index blocks a second account until the first claim is released', async () => {
    const pin = hmac();
    const holder = await account();
    await scan(pin, { user_id: holder });
    const owner = await account();

    await expect(scan(pin, { user_id: owner })).rejects.toMatchObject({ code: 'P2002' });

    await prisma.$transaction((tx) => service.releaseInTransaction(tx, holder, 'OWNER_DISPUTE'));

    // The same card can now be claimed by its owner: the hash was erased from the released row.
    await expect(scan(pin, { user_id: owner })).resolves.toEqual(expect.any(String));
  });

  it('a release erases the card data, un-verifies the account and writes the audit row', async () => {
    const holder = await account();
    const id = await scan(hmac(), { user_id: holder });

    const released = await prisma.$transaction((tx) => service.releaseInTransaction(tx, holder, 'STAFF_CORRECTION'));

    expect(released).toEqual([{ id, image_storage_key: `local:id-documents/${id}` }]);
    expect(await row(id)).toMatchObject({ status: 'RELEASED', pin_hmac: null, pin_last4: null, name_on_id_sealed: null });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: holder } })).identity_verified_at).toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { entity_id: holder, action: AuditAction.IDENTITY_VERIFICATION_RELEASED as any } });
    expect(audit?.new_values).toEqual({ reason: 'STAFF_CORRECTION', scans: 1 });
  });

  it('a failure later in the transaction rolls the whole release back', async () => {
    const holder = await account();
    const id = await scan(hmac(), { user_id: holder });

    await expect(
      prisma.$transaction(async (tx) => {
        await service.releaseInTransaction(tx, holder, 'OWNER_DISPUTE');
        throw new Error('later failure');
      }),
    ).rejects.toThrow('later failure');

    expect(await row(id)).toMatchObject({ status: 'AUTO_VERIFIED', pin_last4: '0010', name_on_id_sealed: 'sealed' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: holder } })).identity_verified_at).not.toBeNull();
  });

  it('the job releases only a stale claim of an account that never confirmed its phone', async () => {
    const old = new Date(Date.now() - 25 * HOUR);
    const unconfirmed = await account({ is_phone_verified: false });
    const staleId = await scan(hmac(), { user_id: unconfirmed, created_at: old });
    const confirmed = await account();
    const keptId = await scan(hmac(), { user_id: confirmed, created_at: old });
    const banned = await account({ is_phone_verified: false, status: 'DEACTIVATED' });
    const bannedId = await scan(hmac(), { user_id: banned, created_at: old });
    const recent = await account({ is_phone_verified: false });
    const recentId = await scan(hmac(), { user_id: recent });

    await expect(service.releaseUnverifiedClaims()).resolves.toBeGreaterThanOrEqual(1);

    expect((await row(staleId)).status).toBe('RELEASED');
    expect((await row(keptId)).status).toBe('AUTO_VERIFIED');
    expect((await row(bannedId)).status).toBe('AUTO_VERIFIED');
    expect((await row(recentId)).status).toBe('AUTO_VERIFIED');
  });

  it('withdrawing consent erases the data and frees the card, in one transaction', async () => {
    const pin = hmac();
    const holder = await account();
    const consent = await prisma.consent_records.create({
      data: { user_id: holder, consent_type: 'ID_VERIFICATION_PHILHEALTH', status: 'GRANTED' },
    });
    const id = await scan(pin, { user_id: holder, status: 'PENDING_REVIEW', consent_record_id: consent.id });

    await service.withdrawConsent(holder);

    expect(await row(id)).toMatchObject({ status: 'RELEASED', pin_hmac: null, image_storage_key: null });
    expect((await prisma.consent_records.findUniqueOrThrow({ where: { id: consent.id } })).status).toBe('WITHDRAWN');
    const other = await account();
    await expect(scan(pin, { user_id: other })).resolves.toEqual(expect.any(String));
  });

  describe('scanning again from the profile', () => {
    const token = () => randomBytes(32).toString('base64url');

    /** An unclaimed scan of a card reading DELA CRUZ, JUAN, with its token. */
    async function unclaimedScan(pin = hmac()): Promise<{ id: string; token: string }> {
      const id = randomUUID();
      const raw = token();
      await scan(pin, {
        id,
        claim_token_hash: createHash('sha256').update(raw, 'utf8').digest('hex'),
        name_on_id_sealed: crypto.sealName(id, { last: 'DELA CRUZ', first: 'JUAN' }),
      });
      scanIds.push(id);
      return { id, token: raw };
    }

    const CITIZEN = { role: 'CITIZEN', identity_verified_at: null };

    it('a rejected citizen is verified by a new matching scan, and the status follows each step', async () => {
      const citizen = await account(CITIZEN);
      const rejected = await unclaimedScan();
      await service.claimForUser(citizen, rejected.token, { last: 'Dela Rosa', first: 'Juan' }, true);
      expect(await service.profileStatus(citizen)).toEqual({ status: 'UNDER_REVIEW' });

      await prisma.identity_verifications.update({ where: { id: rejected.id }, data: { status: 'REJECTED' } });
      expect(await service.profileStatus(citizen)).toEqual({ status: 'NOT_APPROVED' });

      const again = await unclaimedScan();
      const result = await service.claimForUser(citizen, again.token, { last: 'Dela Cruz', first: 'Juan' }, false);

      expect(result).toEqual({ identityVerification: 'AUTO_VERIFIED', fullName: 'Juan Dela Cruz' });
      expect(await service.profileStatus(citizen)).toEqual({ status: 'VERIFIED' });
      expect(await row(again.id)).toMatchObject({ user_id: citizen, status: 'AUTO_VERIFIED', image_storage_key: null });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: citizen } })).toMatchObject({ full_name: 'Juan Dela Cruz' });
    });

    it('a card another account holds trips the real index, and the whole claim rolls back', async () => {
      const pin = hmac();
      const holder = await account();
      await scan(pin, { user_id: holder });
      const citizen = await account(CITIZEN);
      // A scan taken before the other account claimed the card: only the index can refuse it now.
      const raced = await unclaimedScan(pin);

      await expect(service.claimForUser(citizen, raced.token, { last: 'Dela Cruz', first: 'Juan' }, false)).rejects.toMatchObject({
        status: 409,
      });

      expect((await row(raced.id)).user_id).toBeNull();
      const after = await prisma.user.findUniqueOrThrow({ where: { id: citizen } });
      expect(after).toMatchObject({ full_name: 'Test Citizen', identity_verified_at: null });
      expect(await prisma.consent_records.count({ where: { user_id: citizen } })).toBe(0);
    });

    it('two cards claimed at once for one account: only one wins, one card per account', async () => {
      const citizen = await account(CITIZEN);
      const [first, second] = await Promise.all([unclaimedScan(), unclaimedScan()]);

      const results = await Promise.allSettled([
        service.claimForUser(citizen, first.token, { last: 'Dela Cruz', first: 'Juan' }, false),
        service.claimForUser(citizen, second.token, { last: 'Dela Cruz', first: 'Juan' }, false),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
      expect(await prisma.identity_verifications.count({ where: { user_id: citizen } })).toBe(1);
      expect(await prisma.consent_records.count({ where: { user_id: citizen } })).toBe(1);
    });

    it('a verified name is locked until the citizen withdraws', async () => {
      const users = new UsersService(prisma, { log: jest.fn() } as any, {} as any);
      const citizen = await account(CITIZEN);
      await service.claimForUser(citizen, (await unclaimedScan()).token, { last: 'Dela Cruz', first: 'Juan' }, false);

      await expect(users.updateMe(citizen, { fullName: 'Someone Else' })).rejects.toMatchObject({ status: 409 });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: citizen } })).toMatchObject({ full_name: 'Juan Dela Cruz' });

      await service.withdrawConsent(citizen);
      await users.updateMe(citizen, { fullName: 'Someone Else' });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: citizen } })).toMatchObject({ full_name: 'Someone Else' });
    });
  });

  it('getReporterIdVerified: true or false for an account, null for a guest', async () => {
    const incidents: IncidentsService = new (IncidentsService as any)(prisma); // This read needs only the database.
    const verified = await account();
    const unverified = await account({ identity_verified_at: null });
    const incident = async (reporter: Record<string, unknown>) => {
      const id = randomUUID();
      await prisma.incident.create({
        data: {
          id,
          public_reference: `INC-E2E-${randomBytes(4).toString('hex')}`,
          category: 'MEDICAL',
          incident_reporters: { create: reporter as any },
        } as any,
      });
      return id;
    };

    expect(await incidents.getReporterIdVerified(await incident({ user_id: verified }))).toBe(true);
    expect(await incidents.getReporterIdVerified(await incident({ user_id: unverified }))).toBe(false);
    expect(await incidents.getReporterIdVerified(await incident({ is_guest: true }))).toBeNull();

    // Only citizens can scan: "ID not verified" would be a label these accounts could never lose.
    for (const role of ['BYSTANDER', 'RESPONDER', 'DISPATCHER']) {
      const staff = await account({ role, identity_verified_at: null });
      expect(await incidents.getReporterIdVerified(await incident({ user_id: staff }))).toBeNull();
    }
  });

  it('cleanup erases the card data of an expired scan with nobody behind it', async () => {
    const id = await scan(hmac(), { claim_expires_at: new Date(Date.now() - HOUR) });

    await service.cleanup();

    expect(await row(id)).toMatchObject({ status: 'EXPIRED', pin_hmac: null, pin_last4: null, name_on_id_sealed: null, image_storage_key: null });
  });
});
