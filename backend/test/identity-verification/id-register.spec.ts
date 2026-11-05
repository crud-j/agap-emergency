import { BadRequestException, HttpException } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { JPEG, PIN, file, makeAuth, makeKit } from './id-test-kit';

// MOD-01 — POST /auth/register with a PhilHealth ID scan (plan §5.3, §5.2a). The real
// AuthService and IdentityVerificationService over an in-memory database and storage.
const BASE = {
  phoneNumber: '09171234567',
  password: 'S3cure-Pass!',
  confirmPassword: 'S3cure-Pass!',
};
const NAME = { lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'S.' };

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof HttpException) return (err.getResponse() as { code?: string }).code;
    throw err;
  }
  throw new Error('expected the call to fail');
}

describe('AuthService.register with a PhilHealth ID scan', () => {
  let kit: ReturnType<typeof makeKit>;
  let auth: ReturnType<typeof makeAuth>['auth'];
  let smsQueue: ReturnType<typeof makeAuth>['smsQueue'];

  async function scan(): Promise<string> {
    return (await kit.service.scan(file(JPEG), {})).token;
  }
  const row = () => kit.prisma.db.idv[0];

  beforeEach(() => {
    kit = makeKit({ ID_VERIFICATION_REQUIRED: 'true' });
    ({ auth, smsQueue } = makeAuth(kit));
  });

  it('matching name: verified account, consent recorded, scan claimed, image deleted, OTP sent', async () => {
    const token = await scan();
    const imageKey = row().image_storage_key;
    expect(kit.storage.objects.has(imageKey)).toBe(true);

    const result = await auth.register({ ...BASE, ...NAME, suffix: '', idVerificationToken: token } as RegisterDto);

    expect(result.identityVerification).toBe('AUTO_VERIFIED');
    const [user] = kit.prisma.db.users;
    expect(user.full_name).toBe('Juan S. Dela Cruz');
    expect(user.identity_verified_at).toBeInstanceOf(Date);
    expect(user.status).toBe('PENDING_VERIFICATION');

    const [consent] = kit.prisma.db.consents;
    expect(consent).toMatchObject({ user_id: user.id, consent_type: 'ID_VERIFICATION_PHILHEALTH', status: 'GRANTED' });
    expect(row()).toMatchObject({
      user_id: user.id,
      status: 'AUTO_VERIFIED',
      consent_record_id: consent.id,
      match_result: { last: true, first: true, middle: 'initial', suffix: true },
      image_storage_key: null,
    });
    expect(kit.storage.objects.has(imageKey)).toBe(false);

    expect(kit.prisma.db.audit).toEqual([
      expect.objectContaining({
        action: 'IDENTITY_VERIFICATION_CLAIMED',
        actor_id: user.id,
        entity_id: user.id,
        new_values: { outcome: 'AUTO_VERIFIED' },
      }),
    ]);
    expect(JSON.stringify(kit.prisma.db.audit)).not.toMatch(/DELA|JUAN|0000000/i);

    expect(kit.prisma.db.verifications).toHaveLength(1);
    expect(smsQueue.add).toHaveBeenCalledWith('otp-sms', expect.objectContaining({ phone: '+639171234567' }));
  });

  it('name mismatch: 400 NAME_DOES_NOT_MATCH_ID, nothing created, the scan stays claimable', async () => {
    const token = await scan();
    const err = await auth
      .register({ ...BASE, lastName: 'Reyes', firstName: 'Juan', idVerificationToken: token } as RegisterDto)
      .catch((e: HttpException) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(400);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: 'NAME_DOES_NOT_MATCH_ID',
      parts: { last: false, first: true },
    });
    expect(JSON.stringify((err as HttpException).getResponse())).not.toContain('DELA');

    expect(kit.prisma.db.users).toHaveLength(0);
    expect(kit.prisma.db.consents).toHaveLength(0);
    expect(row()).toMatchObject({ user_id: null, status: 'AUTO_VERIFIED' });
    expect(kit.storage.objects.size).toBe(1);

    // The citizen fixes the typo and the same scan works.
    await auth.register({ ...BASE, ...NAME, idVerificationToken: token } as RegisterDto);
    expect(kit.prisma.db.users).toHaveLength(1);
  });

  it('mismatch with "Send for review": account created, PENDING_REVIEW, not verified, image kept', async () => {
    const token = await scan();
    const result = await auth.register({
      ...BASE,
      lastName: 'Reyes',
      firstName: 'Juan',
      idVerificationToken: token,
      requestReview: true,
    } as RegisterDto);

    expect(result.identityVerification).toBe('PENDING_REVIEW');
    const [user] = kit.prisma.db.users;
    expect(user.identity_verified_at).toBeNull();
    expect(row()).toMatchObject({ user_id: user.id, status: 'PENDING_REVIEW', match_result: { last: false } });
    expect(row().image_storage_key).not.toBeNull();
    expect(kit.storage.objects.size).toBe(1);
    expect(kit.prisma.db.audit[0].new_values).toEqual({ outcome: 'PENDING_REVIEW' });
    expect(kit.prisma.db.verifications).toHaveLength(1); // OTP still sent
  });

  it('review scan (unreadable card after 3 attempts): account created under review, image kept for staff', async () => {
    kit.ocr.read.mockResolvedValue({ text: 'g i y L', confidence: 20 });
    const scanned = await kit.service.scan(file(JPEG), { attemptNumber: 3, requestReview: true });
    expect(scanned.reviewRequired).toBe(true);

    // Nothing to match the typed name against, so it never blocks: staff check it.
    const result = await auth.register({ ...BASE, ...NAME, idVerificationToken: scanned.token, requestReview: true } as RegisterDto);

    expect(result.identityVerification).toBe('PENDING_REVIEW');
    const [user] = kit.prisma.db.users;
    expect(user.full_name).toBe('Juan S. Dela Cruz');
    expect(user.identity_verified_at).toBeNull();
    expect(row()).toMatchObject({
      user_id: user.id,
      status: 'PENDING_REVIEW',
      match_result: { scanFailure: 'UNREADABLE' },
      consent_record_id: kit.prisma.db.consents[0].id,
    });
    expect(kit.storage.objects.has(row().image_storage_key)).toBe(true);
    expect(kit.prisma.db.audit[0].new_values).toEqual({ outcome: 'PENDING_REVIEW' });
    expect(kit.prisma.db.verifications).toHaveLength(1); // OTP still sent

    // A claimed review scan can't be claimed again.
    const again = { ...BASE, ...NAME, phoneNumber: '09171234568', idVerificationToken: scanned.token } as RegisterDto;
    expect(await codeOf(auth.register(again))).toBe('ID_SCAN_EXPIRED');
  });

  it('ID_SCAN_EXPIRED for an expired, reused or unknown token', async () => {
    const expired = await scan();
    row().claim_expires_at = new Date(Date.now() - 1000);
    expect(await codeOf(auth.register({ ...BASE, ...NAME, idVerificationToken: expired } as RegisterDto))).toBe(
      'ID_SCAN_EXPIRED',
    );

    const fresh = await scan();
    await auth.register({ ...BASE, ...NAME, idVerificationToken: fresh } as RegisterDto);
    const reuse = { ...BASE, ...NAME, phoneNumber: '09171234568', idVerificationToken: fresh } as RegisterDto;
    expect(await codeOf(auth.register(reuse))).toBe('ID_SCAN_EXPIRED');

    expect(await codeOf(auth.register({ ...reuse, idVerificationToken: 'made-up' }))).toBe('ID_SCAN_EXPIRED');
    expect(kit.prisma.db.users).toHaveLength(1);
  });

  it('a registration that loses the race for the token creates nothing', async () => {
    const token = await scan();
    // Both registrations pass the pre-check; the other one commits its claim first.
    const prepared = await kit.service.prepareClaim(token, { last: 'Dela Cruz', first: 'Juan' }, false);
    jest.spyOn(kit.service, 'prepareClaim').mockResolvedValueOnce(prepared);
    row().user_id = 'someone-else';

    expect(await codeOf(auth.register({ ...BASE, ...NAME, idVerificationToken: token } as RegisterDto))).toBe(
      'ID_SCAN_EXPIRED',
    );
    expect(kit.prisma.db.users).toHaveLength(0);
    expect(kit.prisma.db.consents).toHaveLength(0);
    expect(kit.prisma.db.audit).toHaveLength(0);
  });

  it('409 ID_ALREADY_REGISTERED when the same PhilHealth ID was claimed by another account meanwhile', async () => {
    const first = await scan();
    const second = await scan(); // both scanned before either registered
    await auth.register({ ...BASE, ...NAME, idVerificationToken: first } as RegisterDto);

    const other = { ...BASE, ...NAME, phoneNumber: '09171234568', idVerificationToken: second } as RegisterDto;
    expect(await codeOf(auth.register(other))).toBe('ID_ALREADY_REGISTERED');
    expect(kit.prisma.db.users).toHaveLength(1);
    expect(kit.prisma.db.idv[1].user_id).toBeNull();
  });

  it('a failed image delete never fails the registration; the cleanup job deletes it later', async () => {
    const token = await scan();
    const imageKey = row().image_storage_key;
    kit.storage.deletePrivateObject.mockRejectedValueOnce(Object.assign(new Error('storage down'), { name: 'ServiceUnavailable' }));

    const result = await auth.register({ ...BASE, ...NAME, idVerificationToken: token } as RegisterDto);
    expect(result.identityVerification).toBe('AUTO_VERIFIED');
    expect(row().image_storage_key).toBe(imageKey);
    expect(kit.storage.objects.has(imageKey)).toBe(true);

    expect(await kit.service.cleanup()).toEqual({ expired: 0, deleted: 1, failed: 0 });
    expect(row().image_storage_key).toBeNull();
    expect(kit.storage.objects.has(imageKey)).toBe(false);
  });

  it('flag on: refuses a registration without a scan (400 ID_VERIFICATION_REQUIRED), creating nothing', async () => {
    expect(await codeOf(auth.register({ ...BASE, fullName: 'Juan dela Cruz' } as RegisterDto))).toBe(
      'ID_VERIFICATION_REQUIRED',
    );
    expect(await codeOf(auth.register({ ...BASE, ...NAME } as RegisterDto))).toBe('ID_VERIFICATION_REQUIRED');
    expect(kit.prisma.db.users).toHaveLength(0);
  });

  it('needs last and first name with a scan', async () => {
    const token = await scan();
    await expect(
      auth.register({ ...BASE, firstName: 'Juan', idVerificationToken: token } as RegisterDto),
    ).rejects.toThrow(BadRequestException);
    expect(kit.prisma.db.users).toHaveLength(0);
  });

  it('flag off: older clients register with fullName exactly as before, no scan rows touched', async () => {
    kit = makeKit({ ID_VERIFICATION_REQUIRED: 'false' });
    ({ auth, smsQueue } = makeAuth(kit));
    const result = await auth.register({ ...BASE, fullName: 'Juan dela Cruz' } as RegisterDto);

    expect(result.identityVerification).toBeNull();
    expect(kit.prisma.db.users[0]).toMatchObject({ full_name: 'Juan dela Cruz', identity_verified_at: null });
    expect(kit.prisma.db.consents).toHaveLength(0);
    expect(kit.prisma.db.audit).toHaveLength(0);
    expect(kit.prisma.identity_verifications.findUnique).not.toHaveBeenCalled();
    expect(smsQueue.add).toHaveBeenCalledWith('otp-sms', expect.anything());

    // Name parts without a scan build full_name the same way.
    await auth.register({ ...BASE, ...NAME, phoneNumber: '09171234568', suffix: 'Jr.' } as RegisterDto);
    expect(kit.prisma.db.users[1].full_name).toBe('Juan S. Dela Cruz Jr.');
  });

  it('keeps the existing duplicate-phone check ahead of the scan', async () => {
    const token = await scan();
    await auth.register({ ...BASE, ...NAME, idVerificationToken: token } as RegisterDto);
    await expect(auth.register({ ...BASE, ...NAME, idVerificationToken: token } as RegisterDto)).rejects.toThrow(
      'Phone number already registered',
    );
  });

  it('returns the full PIN nowhere and stores no card text', async () => {
    const token = await scan();
    const result = await auth.register({ ...BASE, ...NAME, idVerificationToken: token } as RegisterDto);
    expect(JSON.stringify(result)).not.toContain(PIN);
    expect(JSON.stringify(kit.prisma.db)).not.toContain(PIN);
  });
});

describe('RegisterDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const validate = (body: object) => pipe.transform(body, { type: 'body', metatype: RegisterDto });

  it('accepts the name parts, token and review flag; requestReview "false" stays false', async () => {
    const dto = await validate({ ...BASE, ...NAME, suffix: 'Jr.', idVerificationToken: 'abc', requestReview: 'false' });
    expect(dto).toMatchObject({ lastName: 'Dela Cruz', firstName: 'Juan', requestReview: false });
    expect((await validate({ ...BASE, requestReview: true })).requestReview).toBe(true);
  });

  it('still accepts the older fullName-only body', async () => {
    await expect(validate({ ...BASE, fullName: 'Juan dela Cruz' })).resolves.toMatchObject({ fullName: 'Juan dela Cruz' });
  });
});
