import { ExecutionContext, INestApplication, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditAction, IdVerificationErrorCode, UserRole } from '@agap/shared';
import { AuthService } from '../../src/auth/auth.service';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { ConsentService } from '../../src/consent/consent.service';
import { IdReviewNotifier } from '../../src/identity-verification/id-review-notifier';
import { IdentityVerificationAdminController } from '../../src/identity-verification/identity-verification-admin.controller';
import {
  IdentityVerificationReviewService,
  reviewReasonOf,
} from '../../src/identity-verification/identity-verification-review.service';
import { IdentityVerificationController } from '../../src/identity-verification/identity-verification.controller';
import { IdentityVerificationService } from '../../src/identity-verification/identity-verification.service';
import { matches, type Row } from '../auth/fake-prisma';
import { JPEG, LICENCE_TEXT, PHILHEALTH_TEXT, PIN, file, jpegOfSize, makeAuth, makeKit, sha256 } from './id-test-kit';

// MOD-01 / MOD-48 — the National ID through the real scan, registration, consent and staff flows, over
// real HTTP where the DTOs and pipes matter. OCR is stubbed. Invented names and fake numbers only. The
// card text follows plan §6, NOT a real card: the plan's layout notes are still blank.

const PCN = '0000-0000-0000-0001';
const PCN_DIGITS = '0000000000000001';
const OTHER_PCN = '0000-0000-0000-0002';
const FREE_PCN = '0000-0000-0000-0003';
const PSN = '0000 0000 0012';

const nationalText = (number = PCN) =>
  [
    'REPUBLIKA NG PILIPINAS',
    'PAMBANSANG PAGKAKAKILANLAN',
    'Philippine Identification Card',
    number,
    'Apelyido/Last Name',
    'DELA CRUZ',
    'Mga Pangalan/Given Names',
    'JUAN',
    'Gitnang Apelyido/Middle Name',
    'SANTOS',
    'Petsa ng Kapanganakan/Date of Birth',
    'JANUARY 01, 1990',
    'Tirahan/Address',
    'BLK 1 LOT 2 SAMPLE STREET, BOCAUE, BULACAN',
  ].join('\n');

const NATIONAL_TEXT = nationalText();
/** The heading and name of a National ID, but only a PhilSys-Number-length run of digits. */
const TWELVE_DIGIT_TEXT = nationalText(PSN);
const UNREADABLE = { text: 'g i y L ¥ ] = a Fi', confidence: 28 };

const MATCH = { lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos' };
const WRONG = { lastName: 'Dela Rosa', firstName: 'Juan', middleName: 'S.' };
const account = (phoneNumber: string) => ({ phoneNumber, password: 'S3cure-Pass!', confirmPassword: 'S3cure-Pass!' });
const PHONE_1 = '09171234567';
const PHONE_2 = '09171234568';

const ADMIN = { id: 'u-sys', role: UserRole.SYSTEM_ADMINISTRATOR };
const recent = (actor: object) => ({ ...actor, authTime: Math.floor(Date.now() / 1000) });
const later = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);

/** What the review routes read beyond the kit's tables: the same shape as the real relation selects. */
function extendDb(kit: ReturnType<typeof makeKit>) {
  const prisma = kit.prisma;
  const db = prisma.db as Record<string, Row[]>;
  db.users!.push({ id: ADMIN.id, full_name: 'Ana Admin', role: ADMIN.role });
  prisma.identity_verifications.count = jest.fn(async ({ where }: any) => db.idv!.filter((r) => matches(r, where)).length);
  const plainFindMany = prisma.identity_verifications.findMany;
  prisma.identity_verifications.findMany = jest.fn(async (args: any) => {
    if (!args?.select?.user) return plainFindMany(args);
    return db.idv!
      .filter((r) => matches(r, args.where))
      .map((r) => ({
        ...r,
        user: db.users!.find((u) => u.id === r.user_id) ?? null,
        reviewer: db.users!.find((u) => u.id === r.reviewed_by_id) ?? null,
      }));
  });
  const plainFindFirst = prisma.identity_verifications.findFirst;
  prisma.identity_verifications.findFirst = jest.fn(async (args: any) => {
    if (!args?.select?.user) return plainFindFirst(args);
    const row = db.idv!.find((r) => matches(r, args.where));
    return row ? { ...row, user: db.users!.find((u) => u.id === row.user_id) ?? null } : null;
  });
  prisma.user.update = jest.fn(async ({ where, data }: any) => Object.assign(db.users!.find((u) => matches(u, where))!, data));
}

describe('National ID', () => {
  let app: INestApplication;
  let base: string;
  let kit: ReturnType<typeof makeKit>;
  let review: IdentityVerificationReviewService;
  let consent: ConsentService;
  let smsQueue: { add: jest.Mock };
  let pushQueue: { add: jest.Mock };
  const geo = { checkGeoFence: jest.fn() };

  const forward = <T extends object>(current: () => T | undefined) =>
    new Proxy({} as T, {
      get: (_target, prop) => {
        const target = current() as any;
        if (!target) return undefined; // Nest probes for lifecycle hooks before any test runs.
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityVerificationController, IdentityVerificationAdminController],
      providers: [
        { provide: AuthService, useValue: geo },
        { provide: IdentityVerificationService, useFactory: () => forward(() => kit?.service) },
        { provide: IdentityVerificationReviewService, useFactory: () => forward(() => review) },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          const req = ctx.switchToHttp().getRequest();
          const header = req.headers['x-test-user'];
          if (!header) return false;
          req.user = JSON.parse(header);
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
    base = `${await app.getUrl()}/v1`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    kit = makeKit({ ID_VERIFICATION_REQUIRED: 'true' });
    extendDb(kit);
    geo.checkGeoFence.mockReset().mockResolvedValue({ inside: true });
    smsQueue = { add: jest.fn().mockResolvedValue(undefined) };
    pushQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const notifier = new IdReviewNotifier(kit.prisma, { create: jest.fn().mockResolvedValue({ id: 'n-1' }) } as any, pushQueue as any, smsQueue as any);
    review = new IdentityVerificationReviewService(kit.prisma, kit.crypto, kit.storage as any, kit.audit, kit.service, notifier);
    consent = new ConsentService(kit.prisma, kit.service);
    kit.ocr.read.mockResolvedValue({ text: NATIONAL_TEXT, confidence: 80 });
  });

  const reads = (text: string, confidence = 80) => kit.ocr.read.mockResolvedValue({ text, confidence });
  const rows = () => kit.prisma.db.idv as Row[];
  const userOf = (id: string) => kit.prisma.db.users.find((u: Row) => u.id === id);
  const hmac = (digits: string) => kit.crypto.pinHmac(digits);

  async function postScan(fields: Record<string, string> = {}, image: Buffer = JPEG) {
    const body = new FormData();
    body.append('image', new Blob([image], { type: 'image/jpeg' }), 'id.jpg');
    for (const [key, value] of Object.entries({ consentGiven: 'true', latitude: '14.7977', longitude: '120.9374', ...fields })) {
      body.append(key, value);
    }
    const res = await fetch(`${base}/auth/id-verification`, { method: 'POST', body });
    const text = await res.text();
    return { status: res.status, text, json: JSON.parse(text) };
  }

  async function admin(method: 'GET' | 'POST', path: string, body?: unknown, actor: object = ADMIN) {
    const res = await fetch(`${base}/administration/id-verifications${path}`, {
      method,
      headers: { 'x-test-user': JSON.stringify(actor), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, text, json };
  }

  /** The real scan and registration. Returns the citizen's user and the row they now hold. */
  async function register(
    documentType: 'PHILHEALTH' | 'NATIONAL_ID',
    { text, names = MATCH, phone = PHONE_1, requestReview = false }: { text?: string; names?: object; phone?: string; requestReview?: boolean } = {},
  ): Promise<{ userId: string; row: Row }> {
    if (text) reads(text);
    else reads(documentType === 'NATIONAL_ID' ? NATIONAL_TEXT : PHILHEALTH_TEXT);
    const { token } = await kit.service.scan(file(JPEG), { documentType });
    const { auth } = makeAuth(kit);
    await auth.register({ ...account(phone), ...names, idVerificationToken: token, requestReview } as RegisterDto);
    const row = rows().find((r) => r.claim_token_hash === sha256(token))!;
    return { userId: row.user_id, row };
  }

  /** A citizen whose card the server couldn't read, sent to staff: no number and no name are stored. */
  async function unreadReviewScan(documentType: 'PHILHEALTH' | 'NATIONAL_ID', phone = PHONE_1): Promise<{ id: string; userId: string; imageKey: string }> {
    kit.ocr.read.mockResolvedValue(UNREADABLE);
    const { token } = await kit.service.scan(file(JPEG), { documentType, attemptNumber: 3, requestReview: true });
    const { auth } = makeAuth(kit);
    await auth.register({ ...account(phone), ...WRONG, idVerificationToken: token, requestReview: true } as RegisterDto);
    const row = rows().find((r) => r.claim_token_hash === sha256(token))!;
    expect(row).toMatchObject({ status: 'PENDING_REVIEW', pin_hmac: null, pin_last4: null, document_type: documentType });
    kit.prisma.db.audit.length = 0;
    return { id: row.id, userId: row.user_id, imageKey: row.image_storage_key };
  }

  describe('POST /auth/id-verification', () => {
    it('no documentType is a PhilHealth scan, exactly as an older app build sends it', async () => {
      reads(PHILHEALTH_TEXT);
      const res = await postScan();

      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ documentType: 'PHILHEALTH', pinLast4: '0010', reviewRequired: false });
      expect(rows()[0]).toMatchObject({ document_type: 'PHILHEALTH', pin_hmac: hmac(PIN), pin_last4: '0010' });
    });

    it('no documentType with National ID text is refused as not a PhilHealth ID, and stores nothing', async () => {
      const res = await postScan();
      expect(res.status).toBe(422);
      expect(res.json.code).toBe('NOT_PHILHEALTH_ID');
      expect(rows()).toHaveLength(0);
    });

    it.each(['LICENCE', 'national_id', ''])('an unknown documentType %j is 400, before reading the card', async (documentType) => {
      const res = await postScan({ documentType });
      expect(res.status).toBe(400);
      expect(kit.ocr.read).not.toHaveBeenCalled();
      expect(rows()).toHaveLength(0);
      expect(kit.storage.objects.size).toBe(0);
    });

    it('a National ID returns only the last 4 digits, and stores its type, HMAC and sealed name', async () => {
      const res = await postScan({ documentType: 'NATIONAL_ID', clientText: `PAMBANSANG PAGKAKAKILANLAN ${PCN}` });

      expect(res.status).toBe(200);
      expect(Object.keys(res.json).sort()).toEqual(['documentType', 'nameOnId', 'pinLast4', 'reviewRequired', 'token']);
      expect(res.json).toMatchObject({
        documentType: 'NATIONAL_ID',
        pinLast4: '0001',
        reviewRequired: false,
        nameOnId: { last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' },
      });
      expect(res.text).not.toContain(PCN_DIGITS);
      expect(res.text).not.toContain(PCN);

      const [row] = rows();
      expect(row).toMatchObject({
        document_type: 'NATIONAL_ID',
        status: 'AUTO_VERIFIED',
        pin_hmac: hmac(PCN_DIGITS),
        pin_last4: '0001',
        client_read_ok: true,
      });
      const stored = JSON.stringify(row);
      expect(stored).not.toContain(PCN_DIGITS);
      expect(stored).not.toContain('DELA');
    });

    it("compares the phone's reading with that ID's parser", async () => {
      await postScan({ documentType: 'NATIONAL_ID', clientText: PHILHEALTH_TEXT });
      expect(rows()[0]!.client_read_ok).toBe(false);
    });

    describe('wrong card, each way', () => {
      it('National ID chosen, another card scanned: NOT_NATIONAL_ID, stores nothing, names the National ID', async () => {
        for (const text of [PHILHEALTH_TEXT, LICENCE_TEXT]) {
          reads(text);
          const res = await postScan({ documentType: 'NATIONAL_ID' });
          expect(res.status).toBe(422);
          expect(res.json.code).toBe('NOT_NATIONAL_ID');
          expect(res.json.message).toContain('National ID');
          expect(res.json.message).not.toContain('PhilHealth');
        }
        expect(rows()).toHaveLength(0);
        expect(kit.storage.objects.size).toBe(0);
      });

      it('PhilHealth chosen, a National ID scanned: NOT_PHILHEALTH_ID, and its number is not stored as a PIN', async () => {
        const res = await postScan({ documentType: 'PHILHEALTH' });
        expect(res.status).toBe(422);
        expect(res.json.code).toBe('NOT_PHILHEALTH_ID');
        expect(res.json.message).toContain('PhilHealth');
        expect(res.json.message).not.toContain('National ID');
        expect(rows()).toHaveLength(0);
      });

      it('sent for review, a wrong card keeps no number and no name, whichever ID was chosen', async () => {
        const philhealthChosen = await postScan({ documentType: 'PHILHEALTH', attemptNumber: '3', requestReview: 'true' });
        expect(philhealthChosen.json).toMatchObject({ pinLast4: null, nameOnId: null, reviewRequired: true, documentType: 'PHILHEALTH' });
        expect(rows()[0]).toMatchObject({
          document_type: 'PHILHEALTH',
          pin_hmac: null,
          pin_last4: null,
          name_on_id_sealed: null,
          match_result: { scanFailure: 'NOT_PHILHEALTH_ID' },
        });

        reads(PHILHEALTH_TEXT);
        const nationalChosen = await postScan({ documentType: 'NATIONAL_ID', attemptNumber: '3', requestReview: 'true' });
        expect(nationalChosen.json).toMatchObject({ pinLast4: null, nameOnId: null, reviewRequired: true, documentType: 'NATIONAL_ID' });
        expect(rows()[1]).toMatchObject({
          document_type: 'NATIONAL_ID',
          pin_hmac: null,
          pin_last4: null,
          name_on_id_sealed: null,
          match_result: { scanFailure: 'NOT_NATIONAL_ID' },
        });
      });

      it('a valid number without the heading, sent for review, is not the chosen card: no number is kept', async () => {
        reads(NATIONAL_TEXT.replace('REPUBLIKA NG PILIPINAS\nPAMBANSANG PAGKAKAKILANLAN\nPhilippine Identification Card\n', ''));
        const res = await postScan({ documentType: 'NATIONAL_ID', attemptNumber: '3', requestReview: 'true' });
        expect(res.json).toMatchObject({ pinLast4: null, nameOnId: null, reviewRequired: true });
        expect(rows()[0]).toMatchObject({
          pin_hmac: null,
          pin_last4: null,
          name_on_id_sealed: null,
          match_result: { scanFailure: 'NOT_NATIONAL_ID' },
        });
      });

      it('a read too poor to tell is UNREADABLE, not a wrong card, and names the chosen ID', async () => {
        kit.ocr.read.mockResolvedValue(UNREADABLE);
        const res = await postScan({ documentType: 'NATIONAL_ID' });
        expect(res.status).toBe(422);
        expect(res.json.code).toBe('UNREADABLE');
        expect(res.json.message).toContain('National ID');
      });
    });

    describe('the 12-digit PhilSys Number (plan §6)', () => {
      it('with the National ID chosen, a 12-digit run is refused and nothing is stored', async () => {
        reads(TWELVE_DIGIT_TEXT);
        const res = await postScan({ documentType: 'NATIONAL_ID' });
        expect(res.status).toBe(422);
        expect(rows()).toHaveLength(0);
      });

      it('sent for review, a 12-digit run is still not stored in any form', async () => {
        reads(TWELVE_DIGIT_TEXT);
        const res = await postScan({ documentType: 'NATIONAL_ID', attemptNumber: '3', requestReview: 'true' });
        expect(res.json).toMatchObject({ pinLast4: null, reviewRequired: true });
        expect(rows()[0]).toMatchObject({ pin_hmac: null, pin_last4: null });
        expect(JSON.stringify(rows()[0])).not.toContain('000000000012');
        expect(JSON.stringify(rows()[0])).not.toContain(hmac('000000000012'));
      });

      it('PhilHealth chosen, a National ID with the 12 digits unspaced sent for review: they are not stored as a PIN', async () => {
        // The PhilHealth pattern alone would accept these digits. Only the card check keeps them out.
        reads(`${NATIONAL_TEXT}\n000000000012`);
        const res = await postScan({ documentType: 'PHILHEALTH', attemptNumber: '3', requestReview: 'true' });
        expect(res.json).toMatchObject({ pinLast4: null, nameOnId: null, reviewRequired: true });
        expect(rows()[0]).toMatchObject({ pin_hmac: null, pin_last4: null, name_on_id_sealed: null });
        expect(JSON.stringify(rows()[0])).not.toContain(hmac('000000000012'));
      });

      it('a card with both returns the card number, never the 12 digits', async () => {
        reads(`${NATIONAL_TEXT}\n${PSN}`);
        const res = await postScan({ documentType: 'NATIONAL_ID' });
        expect(res.json.pinLast4).toBe('0001');
        expect(rows()[0]!.pin_hmac).toBe(hmac(PCN_DIGITS));
      });

      it('a 16-digit run under PhilHealth, and a PIN under the National ID, are not read', async () => {
        // Refused and stored nowhere. The heading was read, so the message is "couldn't read", not "wrong card".
        reads(`PhilHealth\n${PCN}\nDELA CRUZ, JUAN SANTOS`);
        const underPhilHealth = await postScan({ documentType: 'PHILHEALTH' });
        expect(underPhilHealth.status).toBe(422);
        expect(underPhilHealth.json.code).toBe('UNREADABLE');
        reads(`PAMBANSANG PAGKAKAKILANLAN\n00-000000001-0`);
        const underNationalId = await postScan({ documentType: 'NATIONAL_ID' });
        expect(underNationalId.status).toBe(422);
        expect(underNationalId.json.code).toBe('UNREADABLE');
        expect(rows()).toHaveLength(0);
      });
    });

    it('keeps the readable number of a review scan whose name failed, and still checks the card is free', async () => {
      reads(`PAMBANSANG PAGKAKAKILANLAN\n${PCN}`);
      const res = await postScan({ documentType: 'NATIONAL_ID', attemptNumber: '3', requestReview: 'true' });
      expect(res.json).toMatchObject({ pinLast4: '0001', nameOnId: null, reviewRequired: true });
      expect(rows()[0]).toMatchObject({ pin_hmac: hmac(PCN_DIGITS), match_result: { scanFailure: 'UNREADABLE' } });
    });

    it('refuses review before the third attempt, the same as PhilHealth', async () => {
      kit.ocr.read.mockResolvedValue(UNREADABLE);
      for (const fields of [{ attemptNumber: '2', requestReview: 'true' }, { attemptNumber: '3', requestReview: 'false' }]) {
        expect((await postScan({ documentType: 'NATIONAL_ID', ...fields })).status).toBe(422);
      }
      expect(rows()).toHaveLength(0);
    });

    it('its consent and missing-image messages name the National ID', async () => {
      const noConsent = await postScan({ documentType: 'NATIONAL_ID', consentGiven: 'false' });
      expect(noConsent.json.code).toBe('CONSENT_REQUIRED');
      expect(noConsent.json.message).toContain('National ID');
      expect(noConsent.json.message).not.toContain('PhilHealth');

      const body = new FormData();
      for (const [key, value] of Object.entries({ documentType: 'NATIONAL_ID', consentGiven: 'true', latitude: '14.7977', longitude: '120.9374' })) {
        body.append(key, value);
      }
      const noImage = await (await fetch(`${base}/auth/id-verification`, { method: 'POST', body })).json();
      expect(noImage.message).toContain('National ID');
    });

    it('the 503 without the ID keys names no card', async () => {
      kit = makeKit({ ID_DOCUMENT_ENCRYPTION_KEY: undefined });
      const res = await postScan({ documentType: 'NATIONAL_ID' });
      expect(res.status).toBe(503);
      expect(res.text).not.toContain('PhilHealth');
    });
  });

  describe('registering', () => {
    it('verifies the account, records the National ID consent, audits the type, and deletes the image', async () => {
      const { userId, row } = await register('NATIONAL_ID');

      expect(row).toMatchObject({ status: 'AUTO_VERIFIED', document_type: 'NATIONAL_ID', image_storage_key: null });
      expect(kit.storage.objects.size).toBe(0);
      expect(userOf(userId).identity_verified_at).toBeInstanceOf(Date);
      expect(kit.prisma.db.consents).toEqual([
        expect.objectContaining({ user_id: userId, consent_type: 'ID_VERIFICATION_NATIONAL_ID', status: 'GRANTED' }),
      ]);
      expect(row.consent_record_id).toBe(kit.prisma.db.consents[0].id);
      const claimed = kit.prisma.db.audit.find((a: Row) => a.action === AuditAction.IDENTITY_VERIFICATION_CLAIMED);
      expect(claimed.new_values).toEqual({ outcome: 'AUTO_VERIFIED', documentType: 'NATIONAL_ID' });
    });

    it('a PhilHealth scan records the PhilHealth consent, as before', async () => {
      await register('PHILHEALTH', { names: { lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos' } });
      expect(kit.prisma.db.consents[0].consent_type).toBe('ID_VERIFICATION_PHILHEALTH');
    });

    it('the consent follows the row, even for an unread scan sent to review', async () => {
      const { userId } = await unreadReviewScan('NATIONAL_ID');
      expect(kit.prisma.db.consents).toEqual([expect.objectContaining({ user_id: userId, consent_type: 'ID_VERIFICATION_NATIONAL_ID' })]);
    });

    it('a name that does not match is refused, names the National ID, and creates nothing', async () => {
      const { token } = await kit.service.scan(file(JPEG), { documentType: 'NATIONAL_ID' });
      const { auth } = makeAuth(kit);
      const attempt = auth.register({ ...account(PHONE_1), ...WRONG, idVerificationToken: token } as RegisterDto);

      await expect(attempt).rejects.toMatchObject({ response: { code: IdVerificationErrorCode.NAME_DOES_NOT_MATCH_ID, message: expect.stringContaining('National ID') } });
      expect(rows()[0]!.user_id).toBeNull();
      expect(kit.prisma.db.consents).toHaveLength(0);
    });

    it('the same card on a second phone number: ID_ALREADY_REGISTERED at the scan, naming the National ID', async () => {
      await register('NATIONAL_ID');
      const again = await postScan({ documentType: 'NATIONAL_ID' });
      expect(again.status).toBe(409);
      expect(again.json.code).toBe('ID_ALREADY_REGISTERED');
      expect(again.json.message).toContain('This National ID is already linked');
      expect(rows()).toHaveLength(1);
    });

    it('two scans of one card raced: the second registration is refused by the index and rolled back', async () => {
      const first = await kit.service.scan(file(JPEG), { documentType: 'NATIONAL_ID' });
      const second = await kit.service.scan(file(JPEG), { documentType: 'NATIONAL_ID' });
      const { auth } = makeAuth(kit);
      await auth.register({ ...account(PHONE_1), ...MATCH, idVerificationToken: first.token } as RegisterDto);
      const usersBefore = kit.prisma.db.users.length;

      const raced = auth.register({ ...account(PHONE_2), ...MATCH, idVerificationToken: second.token } as RegisterDto);

      await expect(raced).rejects.toMatchObject({ status: 409, response: { code: 'ID_ALREADY_REGISTERED', message: expect.stringContaining('National ID') } });
      expect(kit.prisma.db.users).toHaveLength(usersBefore);
      expect(kit.prisma.db.consents).toHaveLength(1);
    });

    it('N2 — one person, both cards, two phone numbers: two verified accounts, by design (plan §11)', async () => {
      const philhealth = await register('PHILHEALTH', { phone: PHONE_1 });
      const national = await register('NATIONAL_ID', { phone: PHONE_2 });

      expect(philhealth.userId).not.toBe(national.userId);
      for (const { userId } of [philhealth, national]) {
        expect(userOf(userId).identity_verified_at).toBeInstanceOf(Date);
      }
      expect(philhealth.row).toMatchObject({ document_type: 'PHILHEALTH', status: 'AUTO_VERIFIED' });
      expect(national.row).toMatchObject({ document_type: 'NATIONAL_ID', status: 'AUTO_VERIFIED' });
      expect(philhealth.row.pin_hmac).not.toBe(national.row.pin_hmac);
    });

    it.each([
      ['PHILHEALTH', 'NATIONAL_ID', NATIONAL_TEXT],
      ['NATIONAL_ID', 'PHILHEALTH', PHILHEALTH_TEXT],
    ] as const)('an account holding a %s check cannot claim a %s scan', async (held, other, otherText) => {
      const { userId } = await register(held);
      reads(otherText);
      const { token } = await kit.service.scan(file(JPEG), { documentType: other });

      await expect(kit.service.claimForUser(userId, token, { last: 'Dela Cruz', first: 'Juan', middle: 'Santos' }, false)).rejects.toMatchObject({
        status: 409,
        response: { code: 'ID_ALREADY_REGISTERED' },
      });

      expect(rows().find((r) => r.claim_token_hash === sha256(token))!.user_id).toBeNull();
      expect(kit.prisma.db.consents).toHaveLength(1);
    });

    it('so can an account whose check on the other ID is still under review', async () => {
      const { userId } = await register('PHILHEALTH', { names: WRONG, requestReview: true });
      reads(NATIONAL_TEXT);
      const { token } = await kit.service.scan(file(JPEG), { documentType: 'NATIONAL_ID' });
      await expect(kit.service.claimForUser(userId, token, { last: 'Dela Cruz', first: 'Juan' }, false)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('withdrawing consent', () => {
    it('erases the card data, un-verifies the account and frees the card; the account is not blocked', async () => {
      const { userId, row } = await register('NATIONAL_ID');
      const statusBefore = userOf(userId).status;

      await consent.revokeConsent(userId, 'ID_VERIFICATION_NATIONAL_ID');

      expect(row).toMatchObject({ status: 'RELEASED', pin_hmac: null, pin_last4: null, name_on_id_sealed: null });
      expect(userOf(userId).identity_verified_at).toBeNull();
      expect(userOf(userId).status).toBe(statusBefore);
      expect(kit.prisma.db.consents[0]).toMatchObject({ status: 'WITHDRAWN', withdrawn_at: expect.any(Date) });
      expect((await postScan({ documentType: 'NATIONAL_ID' })).status).toBe(200);
    });

    it('deletes an image still waiting for review, and takes it off the queue', async () => {
      const { userId, imageKey } = await unreadReviewScan('NATIONAL_ID');
      await consent.revokeConsent(userId, 'ID_VERIFICATION_NATIONAL_ID');
      expect(kit.storage.objects.has(imageKey)).toBe(false);
      expect((await admin('GET', '')).json.data).toEqual([]);
    });

    it('with no active consent: 404, nothing changes', async () => {
      const { userId } = await register('NATIONAL_ID');
      await consent.revokeConsent(userId, 'ID_VERIFICATION_NATIONAL_ID');
      await expect(consent.revokeConsent(userId, 'ID_VERIFICATION_NATIONAL_ID')).rejects.toMatchObject({ status: 404 });
    });

    describe('someone rejected on one card who verified with the other holds both consents', () => {
      async function holdingBoth(): Promise<{ userId: string; rejected: Row; verified: Row }> {
        const { userId, row: rejected } = await register('PHILHEALTH', { names: WRONG, requestReview: true });
        await review.reject(ADMIN, rejected.id, 'NAME_MISMATCH');
        reads(NATIONAL_TEXT);
        const { token } = await kit.service.scan(file(JPEG), { documentType: 'NATIONAL_ID' });
        await kit.service.claimForUser(userId, token, { last: 'Dela Cruz', first: 'Juan', middle: 'Santos' }, false);
        expect(kit.prisma.db.consents.map((c: Row) => c.consent_type).sort()).toEqual(['ID_VERIFICATION_NATIONAL_ID', 'ID_VERIFICATION_PHILHEALTH']);
        return { userId, rejected, verified: rows().find((r) => r.claim_token_hash === sha256(token))! };
      }

      it.each(['ID_VERIFICATION_NATIONAL_ID', 'ID_VERIFICATION_PHILHEALTH'])('withdrawing %s withdraws both and erases every row', async (named) => {
        const { userId, rejected, verified } = await holdingBoth();
        expect(userOf(userId).identity_verified_at).toBeInstanceOf(Date);

        await consent.revokeConsent(userId, named);

        expect(kit.prisma.db.consents.map((c: Row) => c.status)).toEqual(['WITHDRAWN', 'WITHDRAWN']);
        for (const row of [rejected, verified]) {
          expect(row).toMatchObject({ status: 'RELEASED', pin_hmac: null, pin_last4: null, name_on_id_sealed: null });
        }
        expect(userOf(userId).identity_verified_at).toBeNull();
      });
    });

    it('naming the other ID still works: someone holding only a National ID consent is not left stuck', async () => {
      const { userId, row } = await register('NATIONAL_ID');
      await consent.revokeConsent(userId, 'ID_VERIFICATION_PHILHEALTH');
      expect(row.status).toBe('RELEASED');
      expect(kit.prisma.db.consents[0].status).toBe('WITHDRAWN');
    });
  });

  describe('when a claim on a National ID ends', () => {
    it('staff release: erases the data, un-verifies, tells the citizen, frees the card', async () => {
      const { userId, row } = await register('NATIONAL_ID');
      const res = await admin('POST', `/${row.id}/release`, { reason: 'OWNER_DISPUTE' }, recent(ADMIN));

      expect(res.status).toBe(200);
      expect(row).toMatchObject({ status: 'RELEASED', pin_hmac: null, pin_last4: null, name_on_id_sealed: null });
      expect(userOf(userId).identity_verified_at).toBeNull();
      expect(smsQueue.add).toHaveBeenCalledTimes(1);
      expect((await postScan({ documentType: 'NATIONAL_ID' })).status).toBe(200);
    });

    it('expiry: an unclaimed scan is erased, its image deleted, and its token refused', async () => {
      const { token } = await kit.service.scan(file(JPEG), { documentType: 'NATIONAL_ID' });
      const [row] = rows();

      await kit.service.cleanup(later(1));

      expect(row).toMatchObject({ status: 'EXPIRED', pin_hmac: null, pin_last4: null, name_on_id_sealed: null, image_storage_key: null });
      expect(kit.storage.objects.size).toBe(0);
      const { auth } = makeAuth(kit);
      const attempt = auth.register({ ...account(PHONE_1), ...MATCH, idVerificationToken: token } as RegisterDto);
      await expect(attempt).rejects.toMatchObject({ response: { code: 'ID_SCAN_EXPIRED' } });
    });

    it('an account that never confirmed its phone gives the card up after 24 hours', async () => {
      const { userId, row } = await register('NATIONAL_ID');
      userOf(userId).is_phone_verified = false;

      expect(await kit.service.releaseUnverifiedClaims(later(23))).toBe(0);
      expect(row.status).toBe('AUTO_VERIFIED');

      expect(await kit.service.releaseUnverifiedClaims(later(25))).toBe(1);
      expect(row).toMatchObject({ status: 'RELEASED', pin_hmac: null });
      expect(userOf(userId).identity_verified_at).toBeNull();
    });
  });

  describe('staff review', () => {
    it('reviewReasonOf reads both wrong-card codes, and still an unknown one as unknown', () => {
      expect(reviewReasonOf({ scanFailure: 'NOT_NATIONAL_ID' })).toEqual({ kind: 'SCAN_FAILURE', code: 'NOT_NATIONAL_ID' });
      expect(reviewReasonOf({ scanFailure: 'NOT_PHILHEALTH_ID' })).toEqual({ kind: 'SCAN_FAILURE', code: 'NOT_PHILHEALTH_ID' });
      expect(reviewReasonOf({ scanFailure: 'NOT_A_CODE' })).toEqual({ kind: 'UNKNOWN' });
    });

    it('the queue shows the type and whether a number is stored, and nothing read from the card', async () => {
      const unread = await unreadReviewScan('NATIONAL_ID', PHONE_1);
      const read = await register('NATIONAL_ID', { names: WRONG, requestReview: true, phone: PHONE_2 });

      const res = await admin('GET', '');

      const byId = (id: string) => res.json.data.find((item: Row) => item.id === id);
      expect(byId(unread.id)).toMatchObject({ documentType: 'NATIONAL_ID', hasCardNumber: false });
      expect(byId(read.row.id)).toMatchObject({ documentType: 'NATIONAL_ID', hasCardNumber: true, reason: { kind: 'NAME_MISMATCH' } });
      expect(res.text).not.toMatch(/pin_|0001|DELA CRUZ|SANTOS/);
      expect(res.text).not.toContain(read.row.pin_hmac);
    });

    it('the queue gives a wrong-card review scan its reason', async () => {
      reads(PHILHEALTH_TEXT);
      const { token } = await kit.service.scan(file(JPEG), { documentType: 'NATIONAL_ID', attemptNumber: 3, requestReview: true });
      const { auth } = makeAuth(kit);
      await auth.register({ ...account(PHONE_1), ...WRONG, idVerificationToken: token, requestReview: true } as RegisterDto);

      const [item] = (await admin('GET', '')).json.data;
      expect(item).toMatchObject({ documentType: 'NATIONAL_ID', hasCardNumber: false, reason: { kind: 'SCAN_FAILURE', code: 'NOT_NATIONAL_ID' } });
    });

    describe('rejecting', () => {
      it.each([
        ['NATIONAL_ID', 'NOT_PHILHEALTH'],
        ['PHILHEALTH', 'NOT_NATIONAL_ID'],
      ] as const)('a %s check refuses the reason %s (400), and nothing changes', async (documentType, reason) => {
        const { id, imageKey } = await unreadReviewScan(documentType);

        const res = await admin('POST', `/${id}/reject`, { reason });

        expect(res.status).toBe(400);
        expect(rows()[0]).toMatchObject({ status: 'PENDING_REVIEW', rejection_reason: null, reviewed_by_id: null });
        expect(kit.storage.objects.has(imageKey)).toBe(true);
        expect(kit.prisma.db.audit).toHaveLength(0);
        expect(smsQueue.add).not.toHaveBeenCalled();
      });

      it.each([
        ['NATIONAL_ID', 'NOT_NATIONAL_ID'],
        ['PHILHEALTH', 'NOT_PHILHEALTH'],
        ['NATIONAL_ID', 'UNREADABLE'],
        ['PHILHEALTH', 'SUSPECTED_FRAUD'],
      ] as const)('a %s check accepts the reason %s', async (documentType, reason) => {
        const { id } = await unreadReviewScan(documentType);
        const res = await admin('POST', `/${id}/reject`, { reason });
        expect(res.json).toMatchObject({ id, status: 'REJECTED' });
        expect(rows()[0]).toMatchObject({ status: 'REJECTED', rejection_reason: reason });
      });
    });

    describe('looking up who holds a card', () => {
      it('finds a National ID by its number, with the type given, and audits it without the number', async () => {
        const { userId, row } = await register('NATIONAL_ID');
        kit.prisma.db.audit.length = 0;

        const res = await admin('POST', '/find-by-pin', { pin: PCN, documentType: 'NATIONAL_ID' });

        expect(res.status).toBe(200);
        expect(res.json).toMatchObject({ id: row.id, account: { id: userId } });
        expect(res.text).not.toContain(PCN_DIGITS);
        expect(kit.prisma.db.audit).toEqual([expect.objectContaining({ action: AuditAction.ID_CARD_LOOKUP, new_values: { found: true } })]);
        expect(JSON.stringify(kit.prisma.db.audit)).not.toContain(PCN_DIGITS);
      });

      it('with no type it is a PhilHealth lookup, as existing calls send it: a card number is refused', async () => {
        await register('NATIONAL_ID');
        const res = await admin('POST', '/find-by-pin', { pin: PCN });
        expect(res.status).toBe(400);
        expect(res.json.message).toContain('12-digit');
      });

      it('a 12-digit number under the National ID is refused, and warns about the PhilSys Number', async () => {
        for (const pin of [PSN, '00-000000001-0', '000000000012']) {
          const res = await admin('POST', '/find-by-pin', { pin, documentType: 'NATIONAL_ID' });
          expect(res.status).toBe(400);
          expect(res.json.message).toContain('16-digit');
          expect(res.json.message).toContain('not the PhilSys Number');
        }
        expect(kit.prisma.db.audit).toHaveLength(0);
      });

      it('filters on the type: a row of the other type with the same hash is not found', async () => {
        const { row } = await register('NATIONAL_ID');
        row.document_type = 'PHILHEALTH';
        const res = await admin('POST', '/find-by-pin', { pin: PCN, documentType: 'NATIONAL_ID' });
        expect(res.status).toBe(404);
        expect(res.json.message).toContain('National ID');
      });

      it('an unknown type is 400, and a free number is 404 naming the ID', async () => {
        expect((await admin('POST', '/find-by-pin', { pin: PCN, documentType: 'UMID' })).status).toBe(400);
        const free = await admin('POST', '/find-by-pin', { pin: FREE_PCN, documentType: 'NATIONAL_ID' });
        expect(free.status).toBe(404);
        expect(free.json.message).toContain('No account holds this National ID');
      });
    });

    describe('approving a National ID whose number was not read (plan §7, §10)', () => {
      const nothingChanged = (userId: string, imageKey: string) => {
        expect(rows().find((r) => r.user_id === userId)).toMatchObject({
          status: 'PENDING_REVIEW',
          pin_hmac: null,
          pin_last4: null,
          reviewed_by_id: null,
          reviewed_at: null,
          image_storage_key: imageKey,
        });
        expect(userOf(userId).identity_verified_at).toBeNull();
        expect(kit.storage.objects.has(imageKey)).toBe(true);
        expect(kit.prisma.db.audit.filter((a: Row) => a.action === AuditAction.IDENTITY_VERIFICATION_APPROVED)).toHaveLength(0);
        expect(smsQueue.add).not.toHaveBeenCalled();
        expect(pushQueue.add).not.toHaveBeenCalled();
      };

      it('without a number: 400 asking for it, and nothing changes', async () => {
        const { id, userId, imageKey } = await unreadReviewScan('NATIONAL_ID');

        for (const body of [undefined, {}, { cardNumber: '' }]) {
          const res = await admin('POST', `/${id}/approve`, body);
          expect(res.status).toBe(400);
          expect(res.json.message).toContain('16-digit');
        }
        nothingChanged(userId, imageKey);
      });

      it.each([
        ['12 digits, the length of a PhilSys Number', PSN],
        ['12 digits, ungrouped', '000000000012'],
        ['a PhilHealth PIN', '00-000000001-0'],
        ['15 digits', '000000000000001'],
        ['17 digits', '00000000000000012'],
        ['text', 'not a number'],
      ])('with %s: 400, and nothing changes', async (_name, cardNumber) => {
        const { id, userId, imageKey } = await unreadReviewScan('NATIONAL_ID');
        expect((await admin('POST', `/${id}/approve`, { cardNumber })).status).toBe(400);
        nothingChanged(userId, imageKey);
      });

      it('a too-long value or an unknown field is 400 at the door', async () => {
        const { id, userId, imageKey } = await unreadReviewScan('NATIONAL_ID');
        expect((await admin('POST', `/${id}/approve`, { cardNumber: '0'.repeat(33) })).status).toBe(400);
        // A real number the parser would accept, so only the length limit can refuse it.
        expect((await admin('POST', `/${id}/approve`, { cardNumber: FREE_PCN.padEnd(33) })).status).toBe(400);
        expect((await admin('POST', `/${id}/approve`, { number: PCN })).status).toBe(400);
        nothingChanged(userId, imageKey);
      });

      it('with a number another account holds: 409 ID_ALREADY_REGISTERED, and nothing changes', async () => {
        const holder = await register('NATIONAL_ID', { phone: PHONE_2 });
        const { id, userId, imageKey } = await unreadReviewScan('NATIONAL_ID', PHONE_1);

        const res = await admin('POST', `/${id}/approve`, { cardNumber: PCN });

        expect(res.status).toBe(409);
        expect(res.json.code).toBe('ID_ALREADY_REGISTERED');
        expect(res.text).not.toContain(PCN_DIGITS);
        nothingChanged(userId, imageKey);
        // The holder is untouched, and staff can look them up.
        expect(holder.row).toMatchObject({ status: 'AUTO_VERIFIED', pin_hmac: hmac(PCN_DIGITS) });
        expect((await admin('POST', '/find-by-pin', { pin: PCN, documentType: 'NATIONAL_ID' })).json.account.id).toBe(holder.userId);
      });

      it('with a free number: approved, and that card is now held', async () => {
        const { id, userId, imageKey } = await unreadReviewScan('NATIONAL_ID');

        const res = await admin('POST', `/${id}/approve`, { cardNumber: FREE_PCN });

        expect(res.status).toBe(200);
        expect(res.json).toEqual({ id, status: 'APPROVED', imageDeleted: true });
        expect(rows()[0]).toMatchObject({
          status: 'APPROVED',
          pin_hmac: hmac('0000000000000003'),
          pin_last4: '0003',
          reviewed_by_id: ADMIN.id,
          image_storage_key: null,
        });
        expect(kit.storage.objects.has(imageKey)).toBe(false);
        expect(userOf(userId).identity_verified_at).toBeInstanceOf(Date);
        expect(kit.prisma.db.audit).toEqual([
          expect.objectContaining({ action: AuditAction.IDENTITY_VERIFICATION_APPROVED, new_values: { status: 'APPROVED' } }),
        ]);

        // The point of asking: a new scan of this card is refused, and staff can find who holds it.
        reads(nationalText(FREE_PCN));
        expect((await postScan({ documentType: 'NATIONAL_ID' })).json.code).toBe('ID_ALREADY_REGISTERED');
        expect((await admin('POST', '/find-by-pin', { pin: FREE_PCN, documentType: 'NATIONAL_ID' })).json.account.id).toBe(userId);
      });

      it('a decision already made is 409, not a request for a number', async () => {
        const { id } = await unreadReviewScan('NATIONAL_ID');
        await admin('POST', `/${id}/reject`, { reason: 'UNREADABLE' });
        expect((await admin('POST', `/${id}/approve`)).status).toBe(409);
        expect(rows()[0]).toMatchObject({ status: 'REJECTED', pin_hmac: null });
      });

      it('a failed audit write rolls the stored number back with the decision', async () => {
        const { id, userId, imageKey } = await unreadReviewScan('NATIONAL_ID');
        kit.prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));
        expect((await admin('POST', `/${id}/approve`, { cardNumber: FREE_PCN })).status).toBe(500);
        nothingChanged(userId, imageKey);
      });
    });

    describe('approving when no number is asked for', () => {
      it('a National ID with its number stored needs none, and a typed one never replaces it', async () => {
        const { row, userId } = await register('NATIONAL_ID', { names: WRONG, requestReview: true });
        const res = await admin('POST', `/${row.id}/approve`, { cardNumber: OTHER_PCN });
        expect(res.json.status).toBe('APPROVED');
        expect(row).toMatchObject({ pin_hmac: hmac(PCN_DIGITS), pin_last4: '0001' });
        expect(userOf(userId).identity_verified_at).toBeInstanceOf(Date);
      });

      it('an unread PhilHealth scan is approved with no number, as today (plan §7)', async () => {
        const { id, userId } = await unreadReviewScan('PHILHEALTH');
        const res = await admin('POST', `/${id}/approve`);
        expect(res.status).toBe(200);
        expect(rows()[0]).toMatchObject({ status: 'APPROVED', pin_hmac: null, pin_last4: null });
        expect(userOf(userId).identity_verified_at).toBeInstanceOf(Date);
      });

      it('a number sent with an unread PhilHealth scan is not stored', async () => {
        const { id } = await unreadReviewScan('PHILHEALTH');
        const res = await admin('POST', `/${id}/approve`, { cardNumber: '00-000000001-0' });
        expect(res.json.status).toBe('APPROVED');
        expect(rows()[0]).toMatchObject({ pin_hmac: null, pin_last4: null });
      });
    });
  });

  describe('a second read when the first fails', () => {
    const GARBLED = { text: 'g i y L ¥ ] = a Fi', confidence: 45 };
    const CARD = { text: NATIONAL_TEXT, confidence: 85 };
    /** The heading and number read, the name lost: what a photo beside the text can do to one layout. */
    const NO_NAME = { text: ['PAMBANSANG PAGKAKAKILANLAN', PCN, 'Apelyido/Last Name'].join('\n'), confidence: 60 };

    const readsInOrder = (...results: Array<{ text: string; confidence: number } | null>) => {
      kit.ocr.read.mockReset();
      results.forEach((result) => kit.ocr.read.mockResolvedValueOnce(result));
    };
    const withWarnings = async (run: () => Promise<void>): Promise<string> => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      try {
        await run();
        return JSON.stringify(warn.mock.calls);
      } finally {
        warn.mockRestore();
      }
    };

    it('a read that passes first time is not read again, and logs nothing', async () => {
      readsInOrder(CARD);
      const logged = await withWarnings(async () => {
        expect((await postScan({ documentType: 'NATIONAL_ID' })).status).toBe(200);
      });
      expect(kit.ocr.read).toHaveBeenCalledTimes(1);
      expect(kit.ocr.read.mock.calls[0]).toHaveLength(1);
      expect(logged).toBe('[]');
    });

    it('the second read, with automatic layout, verifies a card the first could not read', async () => {
      readsInOrder(NO_NAME, CARD);
      const res = await postScan({ documentType: 'NATIONAL_ID' });

      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ pinLast4: '0001', reviewRequired: false, documentType: 'NATIONAL_ID' });
      expect(res.json.nameOnId).toMatchObject({ last: 'DELA CRUZ', first: 'JUAN' });
      expect(kit.ocr.read).toHaveBeenCalledTimes(2);
      expect(kit.ocr.read.mock.calls[1][1]).toBe('auto');
      expect(rows()[0]).toMatchObject({ status: 'AUTO_VERIFIED', pin_hmac: hmac(PCN_DIGITS), pin_last4: '0001', document_type: 'NATIONAL_ID' });
    });

    it('a first read that lost only the heading is read again, and verifies', async () => {
      const noHeading = NATIONAL_TEXT.replace('PAMBANSANG PAGKAKAKILANLAN', '').replace('Philippine Identification Card', '');
      readsInOrder({ text: noHeading, confidence: 70 }, CARD);
      const res = await postScan({ documentType: 'NATIONAL_ID' });
      expect(res.status).toBe(200);
      expect(kit.ocr.read).toHaveBeenCalledTimes(2);
      expect(rows()[0]).toMatchObject({ status: 'AUTO_VERIFIED', pin_hmac: hmac(PCN_DIGITS) });
    });

    it('works the same for a scan with no documentType, as an older build sends', async () => {
      readsInOrder(GARBLED, { text: PHILHEALTH_TEXT, confidence: 85 });
      const res = await postScan();
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ pinLast4: PIN.slice(-4), reviewRequired: false, documentType: 'PHILHEALTH' });
      expect(rows()[0]).toMatchObject({ status: 'AUTO_VERIFIED', document_type: 'PHILHEALTH', pin_hmac: hmac(PIN) });
    });

    it('when both fail, the refusal is the one the first read gives, and nothing is stored', async () => {
      readsInOrder(GARBLED, GARBLED);
      const wrongCard = await postScan({ documentType: 'NATIONAL_ID' });
      expect(wrongCard.status).toBe(422);
      expect(wrongCard.json.code).toBe(IdVerificationErrorCode.NOT_NATIONAL_ID);

      readsInOrder(NO_NAME, GARBLED);
      const unreadable = await postScan({ documentType: 'NATIONAL_ID' });
      expect(unreadable.status).toBe(422);
      expect(unreadable.json.code).toBe(IdVerificationErrorCode.UNREADABLE);
      expect(rows()).toHaveLength(0);
    });

    it('a second read that only half-reads the card stores nothing, and the card is called unreadable', async () => {
      readsInOrder(GARBLED, NO_NAME);
      const res = await postScan({ documentType: 'NATIONAL_ID' });
      expect(res.json.code).toBe(IdVerificationErrorCode.UNREADABLE);
      expect(rows()).toHaveLength(0);
    });

    describe('two reads completing each other', () => {
      /** The name lines and no heading or number: what automatic layout can leave of a card. */
      const NAME_ONLY = {
        text: ['Apelyido/Last Name', 'DELA CRUZ', 'Mga Pangalan/Given Names', 'JUAN', 'Gitnang Apelyido/Middle Name', 'SANTOS'].join('\n'),
        confidence: 80,
      };

      it('heading and number from one read, name from the other: verified, with the number held', async () => {
        readsInOrder(NO_NAME, NAME_ONLY);
        const res = await postScan({ documentType: 'NATIONAL_ID' });
        expect(res.status).toBe(200);
        expect(res.json).toMatchObject({ pinLast4: '0001', reviewRequired: false });
        expect(res.json.nameOnId).toMatchObject({ last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' });
        expect(rows()[0]).toMatchObject({ status: 'AUTO_VERIFIED', pin_hmac: hmac(PCN_DIGITS) });
      });

      it('works in either order', async () => {
        readsInOrder(NAME_ONLY, NO_NAME);
        expect((await postScan({ documentType: 'NATIONAL_ID' })).status).toBe(200);
      });

      it('when both reads find a name, the more confident read gives it, whichever came first', async () => {
        const nameOnly = (last: string, first: string, confidence: number) => ({
          text: ['Apelyido/Last Name', last, 'Mga Pangalan/Given Names', first].join('\n'),
          confidence,
        });
        const whole = (last: string, first: string, confidence: number) => ({
          text: ['PAMBANSANG PAGKAKAKILANLAN', PCN, nameOnly(last, first, confidence).text].join('\n'),
          confidence,
        });
        readsInOrder(nameOnly('REYES', 'ANA', 40), whole('DELA CRUZ', 'JUAN', 90));
        expect((await postScan({ documentType: 'NATIONAL_ID' })).json.nameOnId.last).toBe('DELA CRUZ');

        readsInOrder(nameOnly('DELA CRUZ', 'JUAN', 90), whole('REYES', 'ANA', 40));
        expect((await postScan({ documentType: 'NATIONAL_ID' })).json.nameOnId.last).toBe('DELA CRUZ');
      });

      it('two reads that find different numbers trust neither, and store nothing', async () => {
        readsInOrder(NO_NAME, { text: nationalText(OTHER_PCN), confidence: 90 });
        const logged = await withWarnings(async () => {
          const res = await postScan({ documentType: 'NATIONAL_ID' });
          expect(res.json.code).toBe(IdVerificationErrorCode.UNREADABLE);
        });
        expect(logged).toContain('conflict=true');
        expect(rows()).toHaveLength(0);
      });

      it('a conflict on a review upload reaches staff with no number stored', async () => {
        readsInOrder(NO_NAME, { text: nationalText(OTHER_PCN), confidence: 90 });
        const res = await postScan({ documentType: 'NATIONAL_ID', attemptNumber: '4', requestReview: 'true' });
        expect(res.json.reviewRequired).toBe(true);
        expect(rows()[0]).toMatchObject({ status: 'PENDING_REVIEW', pin_hmac: null, pin_last4: null });
      });

      it('with no heading in either read, a number and a name still count for nothing', async () => {
        const noHeading = { text: [PCN, 'Apelyido/Last Name', 'DELA CRUZ', 'Mga Pangalan/Given Names', 'JUAN'].join('\n'), confidence: 80 };
        readsInOrder(noHeading, noHeading);
        const res = await postScan({ documentType: 'NATIONAL_ID' });
        expect(res.json.code).toBe(IdVerificationErrorCode.NOT_NATIONAL_ID);
        expect(rows()).toHaveLength(0);
      });

      it('a 12-digit run with the heading and a name stays refused', async () => {
        readsInOrder({ text: TWELVE_DIGIT_TEXT, confidence: 80 }, NAME_ONLY);
        expect((await postScan({ documentType: 'NATIONAL_ID' })).status).toBe(422);
        expect(rows()).toHaveLength(0);
      });

      it('the other ID cannot lend its heading: PhilHealth chosen, a National ID read twice', async () => {
        readsInOrder(NO_NAME, NAME_ONLY);
        expect((await postScan({ documentType: 'PHILHEALTH' })).status).toBe(422);
        expect(rows()).toHaveLength(0);
      });
    });

    describe('the wrong-card message', () => {
      it('a read that saw the heading calls the card unreadable, not the wrong card', async () => {
        const headingOnly = { text: 'PAMBANSANG PAGKAKAKILANLAN\ng i y L', confidence: 80 };
        readsInOrder(headingOnly, GARBLED);
        const res = await postScan({ documentType: 'NATIONAL_ID' });
        expect(res.json.code).toBe(IdVerificationErrorCode.UNREADABLE);
      });

      it('a clearly read card of another kind is still the wrong card', async () => {
        readsInOrder({ text: LICENCE_TEXT, confidence: 85 }, { text: LICENCE_TEXT, confidence: 85 });
        const res = await postScan({ documentType: 'NATIONAL_ID' });
        expect(res.json.code).toBe(IdVerificationErrorCode.NOT_NATIONAL_ID);
      });

      it('the phone reading the card never changes the verdict', async () => {
        readsInOrder({ text: LICENCE_TEXT, confidence: 85 }, { text: LICENCE_TEXT, confidence: 85 });
        const res = await postScan({ documentType: 'NATIONAL_ID', clientText: NATIONAL_TEXT });
        expect(res.status).toBe(422);
        expect(res.json.code).toBe(IdVerificationErrorCode.NOT_NATIONAL_ID);
        expect(rows()).toHaveLength(0);
      });
    });

    it('logs how much of the phone reading the server reads back up, as counts', async () => {
      readsInOrder(NO_NAME, GARBLED);
      const logged = await withWarnings(async () => {
        await postScan({ documentType: 'NATIONAL_ID', clientText: NATIONAL_TEXT });
      });
      expect(logged).toContain('phoneNumberSeen=4/4');
      expect(logged).toContain('phoneNameSeen=0/4');
    });

    it('a first read that timed out is not repeated: the worker is already in trouble', async () => {
      readsInOrder(null);
      const res = await postScan({ documentType: 'NATIONAL_ID' });
      expect(res.json.code).toBe(IdVerificationErrorCode.UNREADABLE);
      expect(kit.ocr.read).toHaveBeenCalledTimes(1);
    });

    it('a second read that fails outright leaves the first refusal', async () => {
      readsInOrder(NO_NAME, null);
      const res = await postScan({ documentType: 'NATIONAL_ID' });
      expect(res.json.code).toBe(IdVerificationErrorCode.UNREADABLE);
      expect(rows()).toHaveLength(0);
    });

    it('the second read still cannot accept a 12-digit number as a National ID number', async () => {
      readsInOrder(GARBLED, { text: TWELVE_DIGIT_TEXT, confidence: 85 });
      expect((await postScan({ documentType: 'NATIONAL_ID' })).status).toBe(422);
      expect(rows()).toHaveLength(0);
    });

    it('the second read still cannot store a card of the other ID', async () => {
      readsInOrder(GARBLED, CARD);
      expect((await postScan({ documentType: 'PHILHEALTH' })).status).toBe(422);
      readsInOrder(GARBLED, { text: PHILHEALTH_TEXT, confidence: 85 });
      expect((await postScan({ documentType: 'NATIONAL_ID' })).status).toBe(422);
      expect(rows()).toHaveLength(0);
    });

    it('a review upload the second read can read is verified normally, not sent to staff', async () => {
      readsInOrder(GARBLED, CARD);
      const res = await postScan({ documentType: 'NATIONAL_ID', attemptNumber: '4', requestReview: 'true' });
      expect(res.json.reviewRequired).toBe(false);
      expect(rows()[0]).toMatchObject({ status: 'AUTO_VERIFIED', pin_hmac: hmac(PCN_DIGITS) });
    });

    it('a review upload neither read can use still reaches staff, with no number', async () => {
      readsInOrder(UNREADABLE, UNREADABLE);
      const res = await postScan({ documentType: 'NATIONAL_ID', attemptNumber: '4', requestReview: 'true' });
      expect(res.json.reviewRequired).toBe(true);
      expect(rows()[0]).toMatchObject({ status: 'PENDING_REVIEW', pin_hmac: null, pin_last4: null });
    });

    it('a failed scan logs which stage failed on each read, and whether the phone read the card', async () => {
      readsInOrder(NO_NAME, GARBLED);
      const logged = await withWarnings(async () => {
        await postScan({ documentType: 'NATIONAL_ID', clientText: NATIONAL_TEXT });
      });

      expect(logged).toContain('NATIONAL_ID');
      expect(logged).toContain('phone=read');
      expect(logged).toContain('outcome=UNREADABLE');
      expect(logged).toContain('cleaned=no');
      expect(logged).toContain('raw/block[conf=60 card=true number=true name=false');
      expect(logged).toContain('digitRuns=4-4-4-4');
      expect(logged).toContain('raw/auto[conf=45 card=false number=false name=false');
    });

    it('a rescued scan logs that the second read saved it', async () => {
      readsInOrder(NO_NAME, CARD);
      const logged = await withWarnings(async () => {
        await postScan({ documentType: 'NATIONAL_ID' });
      });
      expect(logged).toContain('phone=none');
      expect(logged).toContain('outcome=passed after 2 reads');
    });

    it('those log lines hold no card number, name or card text, including a 12-digit run', async () => {
      const logged = await withWarnings(async () => {
        readsInOrder({ text: TWELVE_DIGIT_TEXT, confidence: 60 }, CARD);
        await postScan({ documentType: 'NATIONAL_ID', clientText: NATIONAL_TEXT });
        readsInOrder(NO_NAME, { text: nationalText(OTHER_PCN).replace('Apelyido/Last Name', ''), confidence: 50 });
        await postScan({ documentType: 'NATIONAL_ID', clientText: TWELVE_DIGIT_TEXT });
      });

      expect(logged).toContain('digitRuns=4-4-4');
      for (const secret of [PCN, PCN_DIGITS, OTHER_PCN, '0001', '0002', '0012', PSN, 'DELA CRUZ', 'JUAN', 'SANTOS', 'SAMPLE STREET', 'JANUARY', 'PAMBANSANG', '1990']) {
        expect(logged).not.toContain(secret);
      }
    });

    describe('a name-column read, when the whole card read but the name did not', () => {
      /** A card-shaped upload, 1600 × 1008 px; the name column is then left 688, top 282, 912 × 474. */
      const CARD_IMAGE = jpegOfSize(1600, 1008);
      const NAME_COLUMN_PX = { left: 688, top: 282, width: 912, height: 474 };
      /** What the name column alone reads: the labels and values, with no photo noise. */
      const NAME_COLUMN = {
        text: [
          'Apelyido/Last Name',
          'DELA CRUZ',
          'Mga Pangalan/Given Names',
          'JUAN',
          'Gitnang Apelyido/Middle Name',
          'SANTOS',
          'Petsa ng Kapanganakan/Date of Birth',
        ].join('\n'),
        confidence: 75,
      };
      /** Photo noise on every name line: the labels garbled, so the whole-card read finds no name. */
      const NOISY = {
        text: ['PAMBANSANG PAGKAKAKILANLAN', `${PCN} '`, ": j 7a Apelyldo / Lasi Narne", "| e 12 DELA CRUZ '", 'Petsa ng Kapanganakan/Date of Birth'].join('\n'),
        confidence: 41,
      };

      it('reads the name column alone, takes its name, and verifies the card with the number from the whole-card read', async () => {
        readsInOrder(NOISY, NOISY, NAME_COLUMN);
        const res = await postScan({ documentType: 'NATIONAL_ID' }, CARD_IMAGE);

        expect(res.status).toBe(200);
        expect(res.json).toMatchObject({ pinLast4: '0001', reviewRequired: false, documentType: 'NATIONAL_ID' });
        expect(res.json.nameOnId).toEqual({ last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' });
        expect(kit.ocr.read).toHaveBeenCalledTimes(3);
        expect(kit.ocr.read.mock.calls[2].slice(1)).toEqual(['block', NAME_COLUMN_PX]);
        expect(rows()[0]).toMatchObject({ status: 'AUTO_VERIFIED', pin_hmac: hmac(PCN_DIGITS), pin_last4: '0001', document_type: 'NATIONAL_ID' });
      });

      it('the typed name must still match the name it read', async () => {
        readsInOrder(NOISY, NOISY, NAME_COLUMN);
        const scan = await postScan({ documentType: 'NATIONAL_ID' }, CARD_IMAGE);
        const { auth } = makeAuth(kit);
        await expect(auth.register({ ...account(PHONE_1), ...WRONG, idVerificationToken: scan.json.token } as RegisterDto)).rejects.toMatchObject({
          response: { code: IdVerificationErrorCode.NAME_DOES_NOT_MATCH_ID },
        });
      });

      it('logs that the name column saved it, with no name, number or card text', async () => {
        readsInOrder(NOISY, NOISY, NAME_COLUMN);
        const logged = await withWarnings(async () => {
          await postScan({ documentType: 'NATIONAL_ID' }, CARD_IMAGE);
        });
        expect(logged).toContain('nameColumn[conf=75 card=false number=false name=true');
        expect(logged).toContain('outcome=name column read passed');
        for (const secret of [PCN, PCN_DIGITS, '0001', 'DELA', 'CRUZ', 'JUAN', 'SANTOS', 'Apelyldo', 'Narne', 'PAMBANSANG']) {
          expect(logged).not.toContain(secret);
        }
      });

      it('a name column that finds no name leaves the card unreadable, and stores nothing', async () => {
        readsInOrder(NOISY, NOISY, { text: 'g i y L ¥ ] = a Fi', confidence: 30 });
        const logged = await withWarnings(async () => {
          const res = await postScan({ documentType: 'NATIONAL_ID' }, CARD_IMAGE);
          expect(res.status).toBe(422);
          expect(res.json.code).toBe(IdVerificationErrorCode.UNREADABLE);
        });
        expect(rows()).toHaveLength(0);
        expect(logged).toContain('nameColumn[conf=30');
        expect(logged).toContain('outcome=UNREADABLE');
      });

      it('a different card number in the name column trusts neither number, and verifies nothing', async () => {
        readsInOrder(NOISY, NOISY, { ...NAME_COLUMN, text: `${OTHER_PCN}\n${NAME_COLUMN.text}` });
        const res = await postScan({ documentType: 'NATIONAL_ID' }, CARD_IMAGE);
        expect(res.status).toBe(422);
        expect(rows()).toHaveLength(0);
      });

      it('is not run when the whole card already read, when no number was read, or when the image size is unknown', async () => {
        readsInOrder(CARD);
        expect((await postScan({ documentType: 'NATIONAL_ID' }, CARD_IMAGE)).status).toBe(200);
        expect(kit.ocr.read).toHaveBeenCalledTimes(1);

        const headingOnly = { text: 'PAMBANSANG PAGKAKAKILANLAN\nApelyido/Last Name', confidence: 50 };
        readsInOrder(headingOnly, headingOnly, NAME_COLUMN);
        expect((await postScan({ documentType: 'NATIONAL_ID' }, CARD_IMAGE)).status).toBe(422);
        expect(kit.ocr.read).toHaveBeenCalledTimes(2);

        readsInOrder(NOISY, NOISY, NAME_COLUMN);
        const logged = await withWarnings(async () => {
          expect((await postScan({ documentType: 'NATIONAL_ID' })).status).toBe(422); // the 68-byte test stub has no size
        });
        expect(kit.ocr.read).toHaveBeenCalledTimes(2);
        expect(logged).toContain('nameColumn[not run]');
      });

      it('is not run for an image taller than wide: the card is on its side', async () => {
        readsInOrder(NOISY, NOISY, NAME_COLUMN);
        expect((await postScan({ documentType: 'NATIONAL_ID' }, jpegOfSize(1008, 1600))).status).toBe(422);
        expect(kit.ocr.read).toHaveBeenCalledTimes(2);
      });

      it('a PhilHealth ID has no name column and is read as before', async () => {
        const noName = { text: ['REPUBLIC OF THE PHILIPPINES PhilHealth', 'Philippine Health Insurance Corporation', 'am | 00-000000001-0'].join('\n'), confidence: 60 };
        readsInOrder(noName, noName, NAME_COLUMN);
        expect((await postScan({ documentType: 'PHILHEALTH' }, CARD_IMAGE)).status).toBe(422);
        expect(kit.ocr.read).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('privacy (plan §10)', () => {
    it('no card number, OCR text or card name in logs, audit rows, queued jobs or responses, through the whole flow', async () => {
      const spies = [
        ...(['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) => jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined)),
        ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => jest.spyOn(console, level).mockImplementation(() => undefined)),
      ];
      try {
        const bodies: string[] = [];
        const verified = await postScan({ documentType: 'NATIONAL_ID', clientText: NATIONAL_TEXT });
        bodies.push(JSON.stringify({ ...verified.json, nameOnId: null })); // nameOnId is the one allowed exception.
        const { auth } = makeAuth(kit);
        const held = await auth.register({ ...account(PHONE_2), ...MATCH, idVerificationToken: verified.json.token } as RegisterDto);
        expect(held).toBeTruthy();

        const { id } = await unreadReviewScan('NATIONAL_ID', PHONE_1);
        for (const call of [
          await admin('POST', `/${id}/approve`, { cardNumber: PSN }),
          await admin('POST', `/${id}/approve`, { cardNumber: PCN }),
          await admin('POST', '/find-by-pin', { pin: PCN, documentType: 'NATIONAL_ID' }),
          await admin('POST', '/find-by-pin', { pin: PSN, documentType: 'NATIONAL_ID' }),
          await admin('GET', ''),
          await admin('POST', `/${id}/approve`, { cardNumber: FREE_PCN }),
        ]) {
          bodies.push(call.text);
        }

        const everything = JSON.stringify({
          bodies,
          logged: spies.map((spy) => spy.mock.calls),
          audit: kit.prisma.db.audit,
          sms: smsQueue.add.mock.calls,
          push: pushQueue.add.mock.calls,
        });
        for (const secret of [PCN, PCN_DIGITS, FREE_PCN, '0000000000000003', PSN, '000000000012', 'SAMPLE STREET', 'JANUARY 01', 'PAMBANSANG', 'SANTOS']) {
          expect(everything).not.toContain(secret);
        }
        expect(smsQueue.add).toHaveBeenCalledTimes(1);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
    });
  });
});
