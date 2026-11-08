import { ExecutionContext, ForbiddenException, INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditAction, IdVerificationErrorCode } from '@agap/shared';
import { AuthService } from '../../src/auth/auth.service';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { IdentityVerificationController } from '../../src/identity-verification/identity-verification.controller';
import { IdentityVerificationService } from '../../src/identity-verification/identity-verification.service';
import { type Row } from '../auth/fake-prisma';
import { JPEG, file, makeAuth, makeKit } from './id-test-kit';

// MOD-01: a signed-in citizen's PhilHealth ID status, and scanning again from the profile (plan §8).
// The real scan, registration and claim code over the in-memory database. The card reads
// DELA CRUZ, JUAN SANTOS. Invented names and fake PINs only.

const BASE = { phoneNumber: '09171234567', password: 'S3cure-Pass!', confirmPassword: 'S3cure-Pass!' };
const MATCH = { last: 'Dela Cruz', first: 'Juan', middle: 'Santos' };
const WRONG = { last: 'Dela Rosa', first: 'Juan', middle: 'S.' };

describe('PhilHealth ID status and scanning again', () => {
  let kit: ReturnType<typeof makeKit>;

  beforeEach(() => {
    kit = makeKit({ ID_VERIFICATION_REQUIRED: 'true' });
  });

  const userOf = (id: string) => kit.prisma.db.users.find((u: Row) => u.id === id);
  const rows = () => kit.prisma.db.idv as Row[];

  /** A citizen with no scan at all, as after a withdrawal or an old flag-off registration. */
  async function citizen(fields: Row = {}): Promise<string> {
    const { auth } = makeAuth(kit);
    kit.config.get.mockImplementation((name: string) => (name === 'ID_VERIFICATION_REQUIRED' ? 'false' : realGet(name)));
    await auth.register({ ...BASE, fullName: 'Old Name' } as RegisterDto);
    kit.config.get.mockImplementation(realGet);
    const user = kit.prisma.db.users[0];
    Object.assign(user, { is_phone_verified: true, ...fields });
    kit.prisma.db.audit.length = 0;
    return user.id;
  }

  let realGet: (name: string) => string | undefined;
  beforeEach(() => {
    realGet = kit.config.get.getMockImplementation();
  });

  const scan = async () => (await kit.service.scan(file(JPEG), {})).token;

  describe('status', () => {
    it('NOT_VERIFIED with no scan', async () => {
      expect(await kit.service.profileStatus(await citizen())).toEqual({ status: 'NOT_VERIFIED' });
    });

    it('VERIFIED after a matching scan', async () => {
      const id = await citizen();
      await kit.service.claimForUser(id, await scan(), MATCH, false);
      expect(await kit.service.profileStatus(id)).toEqual({ status: 'VERIFIED' });
    });

    it('UNDER_REVIEW while staff have it', async () => {
      const id = await citizen();
      await kit.service.claimForUser(id, await scan(), WRONG, true);
      expect(await kit.service.profileStatus(id)).toEqual({ status: 'UNDER_REVIEW' });
    });

    it('NOT_APPROVED after a rejection, and NOT_VERIFIED after a withdrawal', async () => {
      const id = await citizen();
      await kit.service.claimForUser(id, await scan(), WRONG, true);
      rows()[0]!.status = 'REJECTED';
      expect(await kit.service.profileStatus(id)).toEqual({ status: 'NOT_APPROVED' });

      await kit.service.claimForUser(id, await scan(), MATCH, false);
      await kit.service.withdrawConsent(id);
      expect(await kit.service.profileStatus(id)).toEqual({ status: 'NOT_VERIFIED' });
    });

    it('a new check under review replaces an older rejection', async () => {
      const id = await citizen();
      await kit.service.claimForUser(id, await scan(), WRONG, true);
      Object.assign(rows()[0]!, { status: 'REJECTED', created_at: new Date(Date.now() - 60_000) });
      await kit.service.claimForUser(id, await scan(), WRONG, true);
      expect(await kit.service.profileStatus(id)).toEqual({ status: 'UNDER_REVIEW' });
    });

    it.each(['REJECTED', 'PENDING_REVIEW'])("another citizen's %s scan changes nothing", async (status) => {
      const id = await citizen();
      kit.prisma.db.idv.push({ id: 'other', user_id: 'someone-else', status });
      expect(await kit.service.profileStatus(id)).toEqual({ status: 'NOT_VERIFIED' });
    });

    it('a check under review wins over a rejection of a scan taken later: "Scan again" would be refused', async () => {
      const id = await citizen();
      const olderToken = await scan();
      const newerToken = await scan();
      Object.assign(rows()[0]!, { created_at: new Date(Date.now() - 60_000), pin_hmac: 'another-card' });
      await kit.service.claimForUser(id, newerToken, WRONG, true);
      rows()[1]!.status = 'REJECTED';

      await kit.service.claimForUser(id, olderToken, WRONG, true);

      expect(await kit.service.profileStatus(id)).toEqual({ status: 'UNDER_REVIEW' });
    });
  });

  describe('claiming a new scan', () => {
    it('matching name: verified, consent recorded, image deleted, audited, and the name becomes the one checked', async () => {
      const id = await citizen();
      const token = await scan();
      const imageKey = rows()[0]!.image_storage_key;

      const result = await kit.service.claimForUser(id, token, MATCH, false);

      expect(result).toEqual({ identityVerification: 'AUTO_VERIFIED', fullName: 'Juan Santos Dela Cruz' });
      expect(userOf(id).identity_verified_at).toBeInstanceOf(Date);
      expect(userOf(id).full_name).toBe('Juan Santos Dela Cruz');
      expect(rows()[0]).toMatchObject({ user_id: id, status: 'AUTO_VERIFIED', image_storage_key: null });
      expect(kit.storage.objects.has(imageKey)).toBe(false);
      expect(kit.prisma.db.consents).toEqual([expect.objectContaining({ user_id: id, status: 'GRANTED' })]);
      expect(kit.prisma.db.audit).toEqual([
        expect.objectContaining({ action: AuditAction.IDENTITY_VERIFICATION_CLAIMED, actor_id: id, new_values: { outcome: 'AUTO_VERIFIED', documentType: 'PHILHEALTH' } }),
      ]);
    });

    it('name mismatch: refused, nothing changes, and the scan stays claimable to fix a typo', async () => {
      const id = await citizen();
      const token = await scan();

      await expect(kit.service.claimForUser(id, token, WRONG, false)).rejects.toMatchObject({
        response: { code: IdVerificationErrorCode.NAME_DOES_NOT_MATCH_ID },
      });
      expect(userOf(id).full_name).toBe('Old Name');
      expect(userOf(id).identity_verified_at).toBeNull();
      expect(rows()[0]!.user_id).toBeNull();

      await expect(kit.service.claimForUser(id, token, MATCH, false)).resolves.toMatchObject({ identityVerification: 'AUTO_VERIFIED' });
    });

    it('mismatch sent for review: under review, not verified, image kept for staff', async () => {
      const id = await citizen();
      const token = await scan();
      const imageKey = rows()[0]!.image_storage_key;

      const result = await kit.service.claimForUser(id, token, WRONG, true);

      expect(result.identityVerification).toBe('PENDING_REVIEW');
      expect(userOf(id).identity_verified_at).toBeNull();
      expect(rows()[0]).toMatchObject({ user_id: id, status: 'PENDING_REVIEW', image_storage_key: imageKey });
      expect(kit.storage.objects.has(imageKey)).toBe(true);
    });

    it('works again after a rejection, keeping the rejected row as history', async () => {
      const id = await citizen();
      await kit.service.claimForUser(id, await scan(), WRONG, true);
      rows()[0]!.status = 'REJECTED';

      await kit.service.claimForUser(id, await scan(), MATCH, false);

      expect(rows().map((row) => row.status)).toEqual(['REJECTED', 'AUTO_VERIFIED']);
      expect(userOf(id).identity_verified_at).toBeInstanceOf(Date);
    });

    it('works again after a withdrawal: consent is recorded anew, then a second withdrawal covers it', async () => {
      const id = await citizen();
      await kit.service.claimForUser(id, await scan(), MATCH, false);
      await kit.service.withdrawConsent(id);

      await kit.service.claimForUser(id, await scan(), MATCH, false);
      expect(kit.prisma.db.consents.map((c: Row) => c.status)).toEqual(['WITHDRAWN', 'GRANTED']);
      expect(userOf(id).identity_verified_at).toBeInstanceOf(Date);

      await kit.service.withdrawConsent(id);
      expect(kit.prisma.db.consents.map((c: Row) => c.status)).toEqual(['WITHDRAWN', 'WITHDRAWN']);
      expect(userOf(id).identity_verified_at).toBeNull();
    });

    it.each([
      ['already verified', MATCH, false],
      ['already under review', WRONG, true],
    ])('%s: refused, and the new scan stays unclaimed', async (_label, name, review) => {
      const id = await citizen();
      await kit.service.claimForUser(id, await scan(), name, review);
      // A second card, so only the account's own state can refuse this.
      rows()[0]!.pin_hmac = 'another-card';

      const token = await scan();
      await expect(kit.service.claimForUser(id, token, MATCH, false)).rejects.toMatchObject({
        status: 409,
        response: { code: IdVerificationErrorCode.ID_ALREADY_REGISTERED },
      });
      expect(rows()[1]!.user_id).toBeNull();
    });

    it('verified with no scan row (seeded without the pepper): refused too, matching the status it shows', async () => {
      const id = await citizen({ identity_verified_at: new Date() });
      expect(await kit.service.profileStatus(id)).toEqual({ status: 'VERIFIED' });

      await expect(kit.service.claimForUser(id, await scan(), MATCH, false)).rejects.toMatchObject({
        status: 409,
        response: { code: IdVerificationErrorCode.ID_ALREADY_REGISTERED },
      });
      expect(rows()[0]!.user_id).toBeNull();
    });

    it('an expired or reused token: ID_SCAN_EXPIRED', async () => {
      const id = await citizen();
      const token = await scan();
      rows()[0]!.claim_expires_at = new Date(Date.now() - 1000);

      await expect(kit.service.claimForUser(id, token, MATCH, false)).rejects.toMatchObject({
        response: { code: IdVerificationErrorCode.ID_SCAN_EXPIRED },
      });
      await expect(kit.service.claimForUser(id, 'unknown', MATCH, false)).rejects.toMatchObject({
        response: { code: IdVerificationErrorCode.ID_SCAN_EXPIRED },
      });
    });

    it('a card claimed by another account meanwhile: refused, and nothing changes', async () => {
      const first = await citizen();
      const token = await scan();
      kit.prisma.db.idv.push({ id: 'other', user_id: 'someone-else', status: 'AUTO_VERIFIED', pin_hmac: rows()[0]!.pin_hmac });

      await expect(kit.service.claimForUser(first, token, MATCH, false)).rejects.toMatchObject({
        response: { code: IdVerificationErrorCode.ID_ALREADY_REGISTERED },
      });
      expect(userOf(first).identity_verified_at).toBeNull();
      expect(userOf(first).full_name).toBe('Old Name');
      expect(kit.prisma.db.consents).toEqual([]);
    });

    it.each([
      ['a guest', { is_guest: true }],
      ['a staff account', { role: 'DISPATCHER' }],
    ])('%s cannot claim', async (_label, fields) => {
      const id = await citizen(fields);
      await expect(kit.service.claimForUser(id, await scan(), MATCH, false)).rejects.toBeInstanceOf(ForbiddenException);
      expect(rows()[0]!.user_id).toBeNull();
    });
  });
});

describe('GET /v1/auth/id-verification/status and POST .../claim', () => {
  let app: INestApplication;
  let base: string;
  const service = {
    profileStatus: jest.fn(async () => ({ status: 'VERIFIED' })),
    claimForUser: jest.fn(async () => ({ identityVerification: 'AUTO_VERIFIED', fullName: 'Juan Dela Cruz' })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityVerificationController],
      providers: [
        { provide: IdentityVerificationService, useValue: service },
        { provide: AuthService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          if (!req.headers['x-test-user']) return false;
          req.user = { id: req.headers['x-test-user'] };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/v1/auth/id-verification`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const post = (body: object, user: string | null = 'u-1') =>
    fetch(`${base}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) },
      body: JSON.stringify(body),
    });

  const NAME = { lastName: 'Dela Cruz', firstName: 'Juan', idVerificationToken: 'tok' };

  it('both routes need a signed-in user', async () => {
    expect((await fetch(`${base}/status`)).status).toBe(403);
    expect((await post(NAME, null)).status).toBe(403);
    expect(service.claimForUser).not.toHaveBeenCalled();
  });

  it('status answers for the signed-in user only', async () => {
    const res = await fetch(`${base}/status`, { headers: { 'x-test-user': 'u-1' } });
    expect(await res.json()).toEqual({ status: 'VERIFIED' });
    expect(service.profileStatus).toHaveBeenCalledWith('u-1');
  });

  it('claim passes the signed-in user, never one from the body', async () => {
    expect((await post({ ...NAME, userId: 'someone-else' })).status).toBe(400);
    const res = await post({ ...NAME, middleName: ' Santos ', suffix: '' });
    expect(res.status).toBe(200);
    expect(service.claimForUser).toHaveBeenCalledWith('u-1', 'tok', { last: 'Dela Cruz', first: 'Juan', middle: 'Santos' }, false);
  });

  it('requestReview "false" stays false, and last and first name are required', async () => {
    await post({ ...NAME, requestReview: 'false' });
    expect(service.claimForUser).toHaveBeenCalledWith('u-1', 'tok', { last: 'Dela Cruz', first: 'Juan' }, false);
    await post({ ...NAME, requestReview: true });
    expect(service.claimForUser).toHaveBeenLastCalledWith('u-1', 'tok', { last: 'Dela Cruz', first: 'Juan' }, true);

    jest.clearAllMocks();
    expect((await post({ idVerificationToken: 'tok', firstName: 'Juan' })).status).toBe(400);
    expect((await post({ lastName: 'Dela Cruz', firstName: 'Juan' })).status).toBe(400);
    expect(service.claimForUser).not.toHaveBeenCalled();
  });

  it('a last or first name of only spaces is refused, not passed on as no name at all', async () => {
    expect((await post({ ...NAME, lastName: '   ' })).status).toBe(400);
    expect((await post({ ...NAME, firstName: ' ' })).status).toBe(400);
    expect(service.claimForUser).not.toHaveBeenCalled();
  });
});
