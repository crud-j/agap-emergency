import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ID_IMAGE_MAX_BYTES } from '@agap/shared';
import { AuthService } from '../../src/auth/auth.service';
import { IdentityVerificationController } from '../../src/identity-verification/identity-verification.controller';
import { IdentityVerificationService } from '../../src/identity-verification/identity-verification.service';
import { JPEG, LICENCE_TEXT, PHILHEALTH_TEXT, PIN, PNG, makeKit, sha256 } from './id-test-kit';

// MOD-01 — POST /api/v1/auth/id-verification over real HTTP (multer limits, validation pipe,
// error bodies), with the real service over an in-memory database and storage. OCR is stubbed.
describe('POST /v1/auth/id-verification', () => {
  let app: INestApplication;
  let url: string;
  let kit: ReturnType<typeof makeKit>;
  const auth = { checkGeoFence: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityVerificationController],
      providers: [
        { provide: AuthService, useValue: auth },
        // The real service, rebuilt per test over a fresh kit (see beforeEach).
        { provide: IdentityVerificationService, useFactory: () => proxy },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/v1/auth/id-verification`;
  });

  afterAll(async () => {
    await app?.close();
  });

  // The controller holds one instance; forward to the current test's service.
  const proxy = new Proxy({} as IdentityVerificationService, {
    get: (_target, prop) => {
      if (!kit) return undefined; // Nest probes for lifecycle hooks before any test runs.
      const value = (kit.service as any)[prop];
      return typeof value === 'function' ? value.bind(kit.service) : value;
    },
  });

  beforeEach(() => {
    kit = makeKit();
    auth.checkGeoFence.mockReset().mockResolvedValue({ inside: true });
  });

  function form(fields: Record<string, string> = {}, image: Buffer | null = JPEG, type = 'image/jpeg') {
    const body = new FormData();
    if (image) body.append('image', new Blob([image], { type }), 'id.jpg');
    for (const [key, value] of Object.entries({ consentGiven: 'true', latitude: '14.7977', longitude: '120.9374', ...fields })) {
      body.append(key, value);
    }
    return body;
  }

  async function post(body: FormData) {
    const res = await fetch(url, { method: 'POST', body });
    const text = await res.text();
    return { status: res.status, text, json: JSON.parse(text) };
  }

  it('returns only the token, the name as read and the last 4 PIN digits', async () => {
    const res = await post(form({ clientText: 'PhilHealth 00 000000001 0', attemptNumber: '2' }));
    expect(res.status).toBe(200);
    expect(Object.keys(res.json).sort()).toEqual(['documentType', 'nameOnId', 'pinLast4', 'reviewRequired', 'token']);
    expect(res.json.reviewRequired).toBe(false);
    expect(res.json.pinLast4).toBe('0010');
    expect(res.json.nameOnId).toEqual({ last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' });
    expect(res.text).not.toContain(PIN);
    expect(res.json.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Stored: the token's hash, an HMAC of the PIN, the sealed name and a sealed image.
    const [row] = kit.prisma.db.idv;
    expect(row).toMatchObject({
      status: 'AUTO_VERIFIED',
      user_id: null,
      claim_token_hash: sha256(res.json.token),
      pin_hmac: kit.crypto.pinHmac(PIN),
      pin_last4: '0010',
      client_read_ok: true,
      attempt_number: 2,
    });
    expect(JSON.stringify(row)).not.toContain(PIN);
    expect(JSON.stringify(row)).not.toContain('DELA');
    expect(JSON.stringify(row)).not.toContain(res.json.token);
    expect(row.claim_expires_at.getTime() - Date.now()).toBeGreaterThan(29 * 60 * 1000);
    const stored = kit.storage.objects.get(row.image_storage_key)!;
    expect(row.image_storage_key).toBe(`local:id-documents/${row.id}`);
    expect(stored.subarray(0, 3).toString()).toBe('v1.');
    expect(kit.crypto.openImage(row.id, stored).equals(JPEG)).toBe(true);
  });

  it('accepts PNG and records when the phone read a different PIN', async () => {
    const res = await post(form({ clientText: 'nothing useful' }, PNG, 'image/png'));
    expect(res.status).toBe(200);
    expect(kit.prisma.db.idv[0].client_read_ok).toBe(false);
  });

  it('never verifies from the phone text: the server reads the image itself', async () => {
    kit.ocr.read.mockResolvedValue({ text: LICENCE_TEXT, confidence: 85 });
    const res = await post(form({ clientText: PHILHEALTH_TEXT }));
    expect(res.status).toBe(422);
    expect(res.json.code).toBe('NOT_PHILHEALTH_ID');
    expect(kit.prisma.db.idv).toHaveLength(0);
  });

  it('422 NOT_PHILHEALTH_ID for a clearly read card of another kind, with nothing stored', async () => {
    kit.ocr.read.mockResolvedValue({ text: LICENCE_TEXT, confidence: 85 });
    const res = await post(form());
    expect(res.status).toBe(422);
    expect(res.json).toMatchObject({ code: 'NOT_PHILHEALTH_ID', statusCode: 422 });
    expect(kit.prisma.db.idv).toHaveLength(0);
    expect(kit.storage.objects.size).toBe(0);
  });

  it('422 UNREADABLE when OCR fails, reads too poorly to tell, or finds no name line', async () => {
    for (const result of [
      null,
      { text: 'g i y L ¥ ] = a Fi', confidence: 28 },
      { text: 'PhilHealth\n00-000000001-0\nJANUARY 01, 1990', confidence: 70 },
    ]) {
      kit.ocr.read.mockResolvedValue(result);
      const res = await post(form());
      expect(res.status).toBe(422);
      expect(res.json.code).toBe('UNREADABLE');
    }
    expect(kit.prisma.db.idv).toHaveLength(0);
    expect(kit.storage.objects.size).toBe(0);
  });

  it('413 IMAGE_TOO_LARGE above 2 MB, before reading the card', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(ID_IMAGE_MAX_BYTES)]);
    const res = await post(form({}, big));
    expect(res.status).toBe(413);
    expect(res.json.code).toBe('IMAGE_TOO_LARGE');
    expect(kit.ocr.read).not.toHaveBeenCalled();
  });

  it('415 UNSUPPORTED_IMAGE_TYPE for other types, judged by the bytes and not the label', async () => {
    const gif = Buffer.from('GIF89a........');
    for (const [image, type] of [[gif, 'image/gif'], [gif, 'image/jpeg'], [JPEG, 'application/pdf']] as const) {
      const res = await post(form({}, image, type));
      expect(res.status).toBe(415);
      expect(res.json.code).toBe('UNSUPPORTED_IMAGE_TYPE');
    }
    const missing = await post(form({}, null));
    expect(missing.status).toBe(400);
    expect(missing.json.code).toBe('UNSUPPORTED_IMAGE_TYPE');
    expect(kit.ocr.read).not.toHaveBeenCalled();
  });

  it('400 CONSENT_REQUIRED without consent, before the geo-fence or any reading', async () => {
    for (const consentGiven of ['false', '']) {
      const res = await post(form({ consentGiven }));
      expect(res.status).toBe(400);
      expect(res.json.code).toBe('CONSENT_REQUIRED');
    }
    expect(auth.checkGeoFence).not.toHaveBeenCalled();
    expect(kit.ocr.read).not.toHaveBeenCalled();
  });

  it('400 OUTSIDE_SERVICE_AREA outside Bocaue, and coordinates are required', async () => {
    auth.checkGeoFence.mockResolvedValue({ inside: false });
    const outside = await post(form());
    expect(outside.status).toBe(400);
    expect(outside.json.code).toBe('OUTSIDE_SERVICE_AREA');
    expect(auth.checkGeoFence).toHaveBeenCalledWith(14.7977, 120.9374);

    const body = new FormData();
    body.append('image', new Blob([JPEG], { type: 'image/jpeg' }), 'id.jpg');
    body.append('consentGiven', 'true');
    expect((await post(body)).status).toBe(400);
    expect(kit.ocr.read).not.toHaveBeenCalled();
  });

  it('409 ID_ALREADY_REGISTERED when the PhilHealth ID belongs to an active account', async () => {
    kit.prisma.db.idv.push({ id: 'old', user_id: 'u-1', status: 'APPROVED', pin_hmac: kit.crypto.pinHmac(PIN) });
    const res = await post(form());
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('ID_ALREADY_REGISTERED');
    expect(res.json.message).toContain('already linked to an AGAP account');
    expect(kit.storage.objects.size).toBe(0);
  });

  it('allows a PhilHealth ID whose earlier scans expired, were rejected or were never claimed', async () => {
    const pin_hmac = kit.crypto.pinHmac(PIN);
    kit.prisma.db.idv.push(
      { id: 'a', user_id: null, status: 'AUTO_VERIFIED', pin_hmac },
      { id: 'b', user_id: null, status: 'EXPIRED', pin_hmac },
      { id: 'c', user_id: 'u-1', status: 'REJECTED', pin_hmac },
    );
    expect((await post(form())).status).toBe(200);
  });

  it('503 when the server has no ID key, without reading the card', async () => {
    kit = makeKit({ ID_DOCUMENT_ENCRYPTION_KEY: undefined });
    const res = await post(form());
    expect(res.status).toBe(503);
    expect(kit.ocr.read).not.toHaveBeenCalled();
  });

  describe('review scan after the third failed attempt (plan §3)', () => {
    const UNREADABLE_READ = { text: 'g i y L ¥ ] = a Fi', confidence: 28 };

    it('stores an unreadable card for staff review: no name, no PIN, a sealed image and the reason', async () => {
      kit.ocr.read.mockResolvedValue(UNREADABLE_READ);
      const res = await post(form({ attemptNumber: '3', requestReview: 'true' }));
      expect(res.status).toBe(200);
      expect(res.json).toEqual({ token: expect.any(String), nameOnId: null, pinLast4: null, reviewRequired: true, documentType: 'PHILHEALTH' });

      const [row] = kit.prisma.db.idv;
      expect(row).toMatchObject({
        status: 'PENDING_REVIEW',
        user_id: null,
        claim_token_hash: sha256(res.json.token),
        pin_hmac: null,
        pin_last4: null,
        name_on_id_sealed: null,
        match_result: { scanFailure: 'UNREADABLE' },
        attempt_number: 3,
      });
      expect(kit.crypto.openImage(row.id, kit.storage.objects.get(row.image_storage_key)!).equals(JPEG)).toBe(true);
    });

    it('records NOT_PHILHEALTH_ID as the reason when the card was read clearly as something else', async () => {
      kit.ocr.read.mockResolvedValue({ text: LICENCE_TEXT, confidence: 85 });
      const res = await post(form({ attemptNumber: '4', requestReview: 'true' }));
      expect(res.status).toBe(200);
      expect(kit.prisma.db.idv[0].match_result).toEqual({ scanFailure: 'NOT_PHILHEALTH_ID' });
    });

    it('keeps the readable PIN of a card whose name line failed, and still enforces one ID per account', async () => {
      kit.ocr.read.mockResolvedValue({ text: 'PhilHealth\n00-000000001-0\nJANUARY 01, 1990', confidence: 70 });
      const res = await post(form({ attemptNumber: '3', requestReview: 'true' }));
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ pinLast4: '0010', nameOnId: null, reviewRequired: true });
      expect(kit.prisma.db.idv[0].pin_hmac).toBe(kit.crypto.pinHmac(PIN));

      kit = makeKit();
      kit.ocr.read.mockResolvedValue({ text: 'PhilHealth\n00-000000001-0\nJANUARY 01, 1990', confidence: 70 });
      kit.prisma.db.idv.push({ id: 'old', user_id: 'u-1', status: 'AUTO_VERIFIED', pin_hmac: kit.crypto.pinHmac(PIN) });
      const taken = await post(form({ attemptNumber: '3', requestReview: 'true' }));
      expect(taken.status).toBe(409);
      expect(taken.json.code).toBe('ID_ALREADY_REGISTERED');
    });

    it('refuses review before the third attempt, or when requestReview is "false"', async () => {
      kit.ocr.read.mockResolvedValue(UNREADABLE_READ);
      for (const fields of [
        { attemptNumber: '2', requestReview: 'true' },
        { attemptNumber: '3', requestReview: 'false' },
        { attemptNumber: '3' },
      ]) {
        const res = await post(form(fields));
        expect(res.status).toBe(422);
        expect(res.json.code).toBe('UNREADABLE');
      }
      expect(kit.prisma.db.idv).toHaveLength(0);
      expect(kit.storage.objects.size).toBe(0);
    });

    it('processes a readable card normally even when review was asked for', async () => {
      const res = await post(form({ attemptNumber: '3', requestReview: 'true' }));
      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({ reviewRequired: false, pinLast4: '0010' });
      expect(res.json.nameOnId).toEqual({ last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' });
      expect(kit.prisma.db.idv[0].status).toBe('AUTO_VERIFIED');
    });
  });

  it('removes the stored image when the row cannot be saved', async () => {
    kit.prisma.identity_verifications.create.mockRejectedValueOnce(new Error('db down'));
    const res = await post(form());
    expect(res.status).toBe(500);
    expect(kit.storage.objects.size).toBe(0);
  });
});
