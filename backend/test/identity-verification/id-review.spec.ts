import { ExecutionContext, INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditAction, IdVerificationErrorCode, UserRole } from '@agap/shared';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { IdReviewNotifier, ID_REVIEW_MESSAGES } from '../../src/identity-verification/id-review-notifier';
import { IdentityVerificationAdminController } from '../../src/identity-verification/identity-verification-admin.controller';
import {
  IdentityVerificationReviewService,
  reviewReasonOf,
} from '../../src/identity-verification/identity-verification-review.service';
import { matches, type Row } from '../auth/fake-prisma';
import { JPEG, file, makeAuth, makeKit } from './id-test-kit';

// MOD-01 / MOD-48 — staff review of PhilHealth IDs (plan §7) over real HTTP: the real guards
// (RolesGuard; JwtAuthGuard replaced by a header), the real review service and notifier, and
// the real scan + registration flow to create the rows. In-memory database and storage.

const SYS_ADMIN = { id: 'u-sys', role: UserRole.SYSTEM_ADMINISTRATOR };
const MDRRMO_ADMIN = { id: 'u-mdrrmo', role: UserRole.ORG_ADMINISTRATOR };
const BFP_ADMIN = { id: 'u-bfp', role: UserRole.ORG_ADMINISTRATOR };
const INACTIVE_MDRRMO_ADMIN = { id: 'u-left', role: UserRole.ORG_ADMINISTRATOR };
const DISPATCHER = { id: 'u-disp', role: UserRole.DISPATCHER };

const BASE = { phoneNumber: '09171234567', password: 'S3cure-Pass!', confirmPassword: 'S3cure-Pass!' };
/** The card (test kit) reads DELA CRUZ, JUAN SANTOS: this typed name doesn't match. */
const WRONG_NAME = { lastName: 'Dela Rosa', firstName: 'Juan', middleName: 'S.' };

/** Adds what the review service reads on top of the kit's tables. */
function extendDb(kit: ReturnType<typeof makeKit>) {
  const prisma = kit.prisma;
  const db = prisma.db as Record<string, Row[]>;
  db.organizations = [
    { id: 'org-mdrrmo', organization_type: 'MDRRMO', is_active: true },
    { id: 'org-bfp', organization_type: 'BFP', is_active: true },
  ];
  db.memberships = [
    { user_id: MDRRMO_ADMIN.id, organization_id: 'org-mdrrmo', is_active: true },
    { user_id: BFP_ADMIN.id, organization_id: 'org-bfp', is_active: true },
    { user_id: INACTIVE_MDRRMO_ADMIN.id, organization_id: 'org-mdrrmo', is_active: false },
  ];
  db.users.push({ id: SYS_ADMIN.id, full_name: 'Ana Admin', role: SYS_ADMIN.role });

  prisma.organization_memberships = {
    findFirst: jest.fn(async ({ where }: any) => {
      const orgFilter = where.organizations?.is ?? {};
      const found = db.memberships!.find((m) => {
        const { organizations: _ignored, ...own } = where;
        const org = db.organizations!.find((o) => o.id === m.organization_id);
        return matches(m, own) && org && matches(org, orgFilter);
      });
      return found ? { id: `${found.user_id}:${found.organization_id}` } : null;
    }),
  };
  prisma.identity_verifications.count = jest.fn(async ({ where }: any) => db.idv!.filter((r) => matches(r, where)).length);
  // The list's select joins the account and the reviewer.
  const plainFindMany = prisma.identity_verifications.findMany;
  prisma.identity_verifications.findMany = jest.fn(async (args: any) => {
    if (!args?.select?.user) return plainFindMany(args);
    return db.idv!
      .filter((r) => matches(r, args.where))
      .slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? Infinity))
      .map((r) => {
        const user = db.users!.find((u) => u.id === r.user_id);
        const reviewer = db.users!.find((u) => u.id === r.reviewed_by_id);
        return {
          ...r,
          user: user ? { id: user.id, full_name: user.full_name, phone_number: user.phone_number } : null,
          reviewer: reviewer ? { full_name: reviewer.full_name } : null,
        };
      });
  });
  // Lookups by PIN and the release read the account through the relation.
  const plainFindFirst = prisma.identity_verifications.findFirst;
  prisma.identity_verifications.findFirst = jest.fn(async (args: any) => {
    if (!args?.select?.user) return plainFindFirst(args);
    const row = db.idv!.find((r) => matches(r, args.where));
    if (!row) return null;
    return { ...row, user: db.users!.find((u) => u.id === row.user_id) ?? null };
  });
  prisma.user.update = jest.fn(async ({ where, data }: any) => {
    const user = db.users!.find((u) => matches(u, where));
    if (!user) throw new Error('user not found');
    Object.assign(user, data);
    return { ...user };
  });
}

describe('/v1/administration/id-verifications (staff review)', () => {
  let app: INestApplication;
  let base: string;
  let kit: ReturnType<typeof makeKit>;
  let service: IdentityVerificationReviewService;
  let notifications: { create: jest.Mock };
  let notificationQueue: { add: jest.Mock };
  let smsQueue: { add: jest.Mock };

  // Signed in as whoever the x-test-user header says; RolesGuard is the real one.
  const signedIn = {
    canActivate: (ctx: ExecutionContext) => {
      const req = ctx.switchToHttp().getRequest();
      const header = req.headers['x-test-user'];
      if (!header) return false;
      req.user = JSON.parse(header);
      return true;
    },
  };

  const proxy = new Proxy({} as IdentityVerificationReviewService, {
    get: (_target, prop) => {
      if (!service) return undefined;
      const value = (service as any)[prop];
      return typeof value === 'function' ? value.bind(service) : value;
    },
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityVerificationAdminController],
      providers: [{ provide: IdentityVerificationReviewService, useFactory: () => proxy }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(signedIn)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
    );
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/v1/administration/id-verifications`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    kit = makeKit({ ID_VERIFICATION_REQUIRED: 'true' });
    extendDb(kit);
    notifications = { create: jest.fn().mockResolvedValue({ id: 'n-1' }) };
    notificationQueue = { add: jest.fn().mockResolvedValue(undefined) };
    smsQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const notifier = new IdReviewNotifier(kit.prisma, notifications as any, notificationQueue as any, smsQueue as any);
    service = new IdentityVerificationReviewService(kit.prisma, kit.crypto, kit.storage as any, kit.audit, kit.service, notifier);
  });

  /** A citizen whose typed name didn't match, sent for review: the real scan + register flow. */
  async function pendingReview(): Promise<{ id: string; userId: string; imageKey: string }> {
    const { auth } = makeAuth(kit);
    const { token } = await kit.service.scan(file(JPEG), {});
    const result = await auth.register({ ...BASE, ...WRONG_NAME, idVerificationToken: token, requestReview: true } as RegisterDto);
    expect(result.identityVerification).toBe('PENDING_REVIEW');
    const row = kit.prisma.db.idv[0];
    kit.prisma.db.audit.length = 0; // only the review's own audit rows from here on
    return { id: row.id, userId: row.user_id, imageKey: row.image_storage_key };
  }

  async function call(method: 'GET' | 'POST', path: string, user: object | null, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(user ? { 'x-test-user': JSON.stringify(user) } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const buffer = Buffer.from(await res.arrayBuffer());
    let json: any = null;
    try {
      json = JSON.parse(buffer.toString('utf8'));
    } catch {
      /* binary */
    }
    return { status: res.status, headers: res.headers, buffer, json };
  }

  describe('who may review', () => {
    it('a dispatcher gets 403 on the queue, the image and the decisions', async () => {
      const { id } = await pendingReview();
      expect((await call('GET', '', DISPATCHER)).status).toBe(403);
      expect((await call('GET', `/${id}/image`, DISPATCHER)).status).toBe(403);
      expect((await call('POST', `/${id}/approve`, DISPATCHER)).status).toBe(403);
      expect((await call('POST', `/${id}/reject`, DISPATCHER, { reason: 'SUSPECTED_FRAUD' })).status).toBe(403);
      expect(kit.prisma.db.idv[0].status).toBe('PENDING_REVIEW');
      expect(kit.prisma.db.audit).toHaveLength(0);
    });

    it('an Org Administrator of BFP gets 403, and so does one whose MDRRMO membership ended', async () => {
      const { id } = await pendingReview();
      for (const admin of [BFP_ADMIN, INACTIVE_MDRRMO_ADMIN]) {
        expect((await call('GET', '', admin)).status).toBe(403);
        expect((await call('GET', `/${id}/image`, admin)).status).toBe(403);
        expect((await call('POST', `/${id}/approve`, admin)).status).toBe(403);
      }
      expect(kit.prisma.db.idv[0].status).toBe('PENDING_REVIEW');
      expect(kit.prisma.db.audit).toHaveLength(0);
    });

    it('an Org Administrator of MDRRMO and a System Administrator can open the queue', async () => {
      await pendingReview();
      expect((await call('GET', '', MDRRMO_ADMIN)).status).toBe(200);
      expect((await call('GET', '', SYS_ADMIN)).status).toBe(200);
    });

    it('no signed-in user: refused', async () => {
      expect((await call('GET', '', null)).status).toBe(403);
    });
  });

  describe('GET / (queue)', () => {
    it('lists the account, attempts and which name parts failed: no image, no PIN, no card name', async () => {
      const { id, userId } = await pendingReview();
      const res = await call('GET', '', MDRRMO_ADMIN);

      expect(res.json.meta).toMatchObject({ total: 1, page: 1, totalPages: 1 });
      expect(res.json.data).toEqual([
        {
          id,
          status: 'PENDING_REVIEW',
          submittedAt: expect.any(String),
          attemptNumber: 1,
          account: { id: userId, name: 'Juan S. Dela Rosa', phoneNumber: '+639171234567' },
          reason: { kind: 'NAME_MISMATCH', failedParts: ['last'] },
          hasImage: true,
          reviewedAt: null,
          reviewedByName: null,
          rejectionReason: null,
        },
      ]);
      // Nothing read from the card leaves the server.
      const text = res.buffer.toString('utf8');
      expect(text).not.toMatch(/DELA CRUZ|SANTOS|000000000010|0010|pin/i);
    });

    it('filters by status and rejects an unknown one', async () => {
      await pendingReview();
      expect((await call('GET', '?status=APPROVED', SYS_ADMIN)).json.data).toEqual([]);
      expect((await call('GET', '?status=EXPIRED', SYS_ADMIN)).status).toBe(400);
    });
  });

  describe('GET /:id/image', () => {
    it('streams the opened image with no-store, and audits the view (actor + id only)', async () => {
      const { id } = await pendingReview();
      const res = await call('GET', `/${id}/image`, MDRRMO_ADMIN);

      expect(res.status).toBe(200);
      expect(res.buffer.equals(JPEG)).toBe(true);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(kit.prisma.db.audit).toHaveLength(1);
      expect(kit.prisma.db.audit[0]).toMatchObject({
        action: AuditAction.ID_IMAGE_VIEWED,
        actor_id: MDRRMO_ADMIN.id,
        entity_type: 'identity_verification',
        entity_id: id,
      });
      expect(kit.prisma.db.audit[0].new_values).toBeUndefined();
    });

    it('every view is audited, not just the first', async () => {
      const { id } = await pendingReview();
      await call('GET', `/${id}/image`, SYS_ADMIN);
      await call('GET', `/${id}/image`, SYS_ADMIN);
      expect(kit.prisma.db.audit.filter((a: Row) => a.action === AuditAction.ID_IMAGE_VIEWED)).toHaveLength(2);
    });

    it('if the audit row cannot be written, the image is not shown', async () => {
      const { id } = await pendingReview();
      kit.prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));
      const res = await call('GET', `/${id}/image`, SYS_ADMIN);
      expect(res.status).toBe(500);
      expect(res.buffer.includes(JPEG)).toBe(false);
    });

    it('410 once the image is deleted (after a decision), 404 for an unknown or unclaimed scan', async () => {
      const { id } = await pendingReview();
      await call('POST', `/${id}/approve`, SYS_ADMIN);
      expect((await call('GET', `/${id}/image`, SYS_ADMIN)).status).toBe(410);

      expect((await call('GET', '/00000000-0000-4000-8000-000000000000/image', SYS_ADMIN)).status).toBe(404);
      // A scan nobody registered with yet (its image is stored) is not open to reviewers.
      const unclaimed = { id: '11111111-1111-4111-8111-111111111111', user_id: null, status: 'PENDING_REVIEW', image_storage_key: 'local:x' };
      kit.prisma.db.idv.push(unclaimed);
      kit.storage.objects.set('local:x', JPEG);
      expect((await call('GET', `/${unclaimed.id}/image`, SYS_ADMIN)).status).toBe(404);
      expect((await call('POST', `/${unclaimed.id}/approve`, SYS_ADMIN)).status).toBe(404);
      expect((await call('GET', '/not-a-uuid/image', SYS_ADMIN)).status).toBe(400);
    });

    it('410 once a check is decided, even while a failed delete leaves the file stored (plan §5.2a)', async () => {
      const { id, imageKey } = await pendingReview();
      kit.storage.deletePrivateObject.mockRejectedValueOnce(new Error('storage down'));
      await call('POST', `/${id}/reject`, SYS_ADMIN, { reason: 'UNREADABLE' });
      kit.prisma.db.audit.length = 0;
      expect(kit.storage.objects.has(imageKey)).toBe(true);

      const res = await call('GET', `/${id}/image`, SYS_ADMIN);

      expect(res.status).toBe(410);
      expect(res.buffer.includes(JPEG)).toBe(false);
      expect(kit.prisma.db.audit).toHaveLength(0);
      // The queue doesn't offer an image it won't serve.
      const list = await call('GET', '?status=REJECTED', SYS_ADMIN);
      expect(list.json.data[0].hasImage).toBe(false);
    });

    it('410 for an auto-verified scan whose delete failed: staff never review those', async () => {
      const row = {
        id: '22222222-2222-4222-8222-222222222222',
        user_id: 'u-citizen',
        status: 'AUTO_VERIFIED',
        image_storage_key: 'local:y',
      };
      kit.prisma.db.idv.push(row);
      kit.storage.objects.set('local:y', JPEG);

      const res = await call('GET', `/${row.id}/image`, SYS_ADMIN);

      expect(res.status).toBe(410);
      expect(res.buffer.includes(JPEG)).toBe(false);
    });
  });

  describe('POST /:id/approve and /:id/reject', () => {
    it('approve: APPROVED, account verified, audited, image deleted, citizen told by push and SMS', async () => {
      const { id, userId, imageKey } = await pendingReview();
      const res = await call('POST', `/${id}/approve`, MDRRMO_ADMIN);

      expect(res.status).toBe(200);
      expect(res.json).toEqual({ id, status: 'APPROVED', imageDeleted: true });
      expect(kit.prisma.db.idv[0]).toMatchObject({
        status: 'APPROVED',
        reviewed_by_id: MDRRMO_ADMIN.id,
        reviewed_at: expect.any(Date),
        rejection_reason: null,
        image_storage_key: null,
      });
      expect(kit.storage.objects.has(imageKey)).toBe(false);
      expect(kit.prisma.db.users.find((u: Row) => u.id === userId).identity_verified_at).toBeInstanceOf(Date);
      expect(kit.prisma.db.audit).toEqual([
        expect.objectContaining({
          action: AuditAction.IDENTITY_VERIFICATION_APPROVED,
          actor_id: MDRRMO_ADMIN.id,
          entity_id: id,
          new_values: { status: 'APPROVED' },
        }),
      ]);

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId, body: 'Your AGAP account ID check was approved.' }),
      );
      expect(notificationQueue.add.mock.calls[0][1]).toMatchObject({ userId, channel: 'PUSH', body: ID_REVIEW_MESSAGES.APPROVED.body });
      expect(smsQueue.add.mock.calls[0][1]).toEqual({
        phone: '+639171234567',
        message: 'Your AGAP account ID check was approved.',
      });
    });

    it('reject: REJECTED with the reason code, account stays unverified, image deleted, citizen told', async () => {
      const { id, userId, imageKey } = await pendingReview();
      const res = await call('POST', `/${id}/reject`, SYS_ADMIN, { reason: 'NAME_MISMATCH' });

      expect(res.json).toEqual({ id, status: 'REJECTED', imageDeleted: true });
      expect(kit.prisma.db.idv[0]).toMatchObject({ status: 'REJECTED', rejection_reason: 'NAME_MISMATCH', image_storage_key: null });
      expect(kit.storage.objects.has(imageKey)).toBe(false);
      expect(kit.prisma.db.users.find((u: Row) => u.id === userId).identity_verified_at).toBeNull();
      expect(kit.prisma.db.audit[0]).toMatchObject({
        action: AuditAction.IDENTITY_VERIFICATION_REJECTED,
        new_values: { status: 'REJECTED', reason: 'NAME_MISMATCH' },
      });
      expect(smsQueue.add.mock.calls[0][1].message).toBe('Your AGAP account ID check was not approved. Open AGAP to scan again.');
    });

    it('reject needs one of the fixed reason codes; free text is refused', async () => {
      const { id } = await pendingReview();
      expect((await call('POST', `/${id}/reject`, SYS_ADMIN, {})).status).toBe(400);
      expect((await call('POST', `/${id}/reject`, SYS_ADMIN, { reason: 'looks fake to me' })).status).toBe(400);
      expect(kit.prisma.db.idv[0].status).toBe('PENDING_REVIEW');
    });

    it('a second decision on the same check is refused (409) and changes nothing', async () => {
      const { id } = await pendingReview();
      await call('POST', `/${id}/approve`, SYS_ADMIN);
      const again = await call('POST', `/${id}/reject`, MDRRMO_ADMIN, { reason: 'SUSPECTED_FRAUD' });

      expect(again.status).toBe(409);
      expect(kit.prisma.db.idv[0]).toMatchObject({ status: 'APPROVED', reviewed_by_id: SYS_ADMIN.id, rejection_reason: null });
      expect(kit.prisma.db.audit).toHaveLength(1);
      expect(smsQueue.add).toHaveBeenCalledTimes(1);
    });

    it('a failed push and SMS never undo the decision', async () => {
      const { id, userId } = await pendingReview();
      notifications.create.mockRejectedValue(new Error('db down'));
      smsQueue.add.mockRejectedValue(new Error('redis down'));

      const res = await call('POST', `/${id}/approve`, SYS_ADMIN);

      expect(res.status).toBe(200);
      expect(kit.prisma.db.idv[0].status).toBe('APPROVED');
      expect(kit.prisma.db.users.find((u: Row) => u.id === userId).identity_verified_at).toBeInstanceOf(Date);
    });

    it('a failed image delete keeps the decision; the image key stays for the cleanup job', async () => {
      const { id, imageKey } = await pendingReview();
      kit.storage.deletePrivateObject.mockRejectedValueOnce(new Error('storage down'));

      const res = await call('POST', `/${id}/reject`, SYS_ADMIN, { reason: 'UNREADABLE' });

      expect(res.json).toEqual({ id, status: 'REJECTED', imageDeleted: false });
      expect(kit.prisma.db.idv[0]).toMatchObject({ status: 'REJECTED', image_storage_key: imageKey });
      // The next cleanup run removes it (REJECTED is a decided status).
      await kit.service.cleanup();
      expect(kit.prisma.db.idv[0].image_storage_key).toBeNull();
      expect(kit.storage.objects.has(imageKey)).toBe(false);
    });

    it('a failed audit write rolls the decision back', async () => {
      const { id, imageKey } = await pendingReview();
      kit.prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));

      expect((await call('POST', `/${id}/approve`, SYS_ADMIN)).status).toBe(500);
      expect(kit.prisma.db.idv[0]).toMatchObject({ status: 'PENDING_REVIEW', reviewed_by_id: null, image_storage_key: imageKey });
      expect(kit.storage.objects.has(imageKey)).toBe(true);
      expect(smsQueue.add).not.toHaveBeenCalled();
    });

    it('never answers 500 for a decision that saved: a failed read of the image key rolls it back', async () => {
      const { id, imageKey } = await pendingReview();
      const realFindFirst = kit.prisma.identity_verifications.findFirst;
      kit.prisma.identity_verifications.findFirst = jest
        .fn()
        .mockImplementationOnce(realFindFirst) // the lookup before the decision
        .mockRejectedValueOnce(new Error('db down')) // the image key
        .mockImplementation(realFindFirst);

      expect((await call('POST', `/${id}/approve`, SYS_ADMIN)).status).toBe(500);

      expect(kit.prisma.db.idv[0]).toMatchObject({ status: 'PENDING_REVIEW', reviewed_by_id: null, image_storage_key: imageKey });
      expect(kit.prisma.db.audit).toHaveLength(0);
      expect(smsQueue.add).not.toHaveBeenCalled();
    });

    it('a review scan (unreadable card) is listed with its scan failure and can be approved', async () => {
      kit.ocr.read.mockResolvedValue({ text: 'g i y L', confidence: 20 });
      const { auth } = makeAuth(kit);
      const scanned = await kit.service.scan(file(JPEG), { attemptNumber: 3, requestReview: true });
      await auth.register({ ...BASE, ...WRONG_NAME, idVerificationToken: scanned.token, requestReview: true } as RegisterDto);

      const list = await call('GET', '', SYS_ADMIN);
      expect(list.json.data[0].reason).toEqual({ kind: 'SCAN_FAILURE', code: IdVerificationErrorCode.UNREADABLE });
      expect((await call('POST', `/${list.json.data[0].id}/approve`, SYS_ADMIN)).json.status).toBe('APPROVED');
    });
  });

  describe('releasing a card from the account that holds it', () => {
    const recent = (actor: object) => ({ ...actor, authTime: Math.floor(Date.now() / 1000) });
    const CARD = { pin: '00-000000001-0' }; // The PIN on the test kit's card.

    /** A citizen whose name matched: the card is theirs and the account is verified. */
    async function verifiedHolder(): Promise<{ id: string; userId: string }> {
      const { auth } = makeAuth(kit);
      const { token } = await kit.service.scan(file(JPEG), {});
      await auth.register({ ...BASE, lastName: 'Dela Cruz', firstName: 'Juan', middleName: 'Santos', idVerificationToken: token } as RegisterDto);
      const row = kit.prisma.db.idv[0];
      kit.prisma.db.audit.length = 0;
      return { id: row.id, userId: row.user_id };
    }

    it('finds the account from the number on the card, and audits the lookup without the number', async () => {
      const { id, userId } = await verifiedHolder();
      const res = await call('POST', '/find-by-pin', MDRRMO_ADMIN, CARD);

      expect(res.status).toBe(200);
      expect(res.json).toMatchObject({
        id,
        status: 'AUTO_VERIFIED',
        account: { id: userId, name: 'Juan Santos Dela Cruz', phoneNumber: '+639171234567' },
      });
      expect(res.buffer.toString('utf8')).not.toMatch(/000000000010|0010|pin/i);
      expect(kit.prisma.db.audit).toHaveLength(1);
      expect(kit.prisma.db.audit[0]).toMatchObject({
        action: AuditAction.ID_CARD_LOOKUP,
        actor_id: MDRRMO_ADMIN.id,
        entity_id: id,
        new_values: { found: true },
      });
      expect(JSON.stringify(kit.prisma.db.audit[0])).not.toContain('000000000010');
    });

    it('a number no account holds is 404 and still audited; a malformed one is refused', async () => {
      const missing = await call('POST', '/find-by-pin', SYS_ADMIN, { pin: '11-111111111-1' });
      expect(missing.status).toBe(404);
      expect(kit.prisma.db.audit[0]).toMatchObject({ action: AuditAction.ID_CARD_LOOKUP, new_values: { found: false } });

      expect((await call('POST', '/find-by-pin', SYS_ADMIN, { pin: '1234' })).status).toBe(400);
      expect((await call('POST', '/find-by-pin', SYS_ADMIN, {})).status).toBe(400);
    });

    it('a dispatcher and a BFP administrator can neither look up nor release', async () => {
      const { id } = await verifiedHolder();
      for (const actor of [DISPATCHER, BFP_ADMIN]) {
        expect((await call('POST', '/find-by-pin', actor, CARD)).status).toBe(403);
        expect((await call('POST', `/${id}/release`, recent(actor), { reason: 'OWNER_DISPUTE' })).status).toBe(403);
      }
      expect(kit.prisma.db.idv[0].status).toBe('AUTO_VERIFIED');
    });

    it('release: needs a recent sign-in and a fixed reason', async () => {
      const { id } = await verifiedHolder();
      expect((await call('POST', `/${id}/release`, MDRRMO_ADMIN, { reason: 'OWNER_DISPUTE' })).status).toBe(401);
      expect((await call('POST', `/${id}/release`, recent(MDRRMO_ADMIN), { reason: 'because' })).status).toBe(400);
      expect(kit.prisma.db.idv[0].status).toBe('AUTO_VERIFIED');
    });

    it('release: erases the card data, un-verifies the holder, tells them, and frees the card for its owner', async () => {
      const { id, userId } = await verifiedHolder();
      const res = await call('POST', `/${id}/release`, recent(MDRRMO_ADMIN), { reason: 'OWNER_DISPUTE' });

      expect(res.status).toBe(200);
      expect(res.json).toEqual({ id, imageDeleted: true });
      expect(kit.prisma.db.idv[0]).toMatchObject({ status: 'RELEASED', pin_hmac: null, pin_last4: null, name_on_id_sealed: null });
      expect(kit.prisma.db.users.find((u: Row) => u.id === userId).identity_verified_at).toBeNull();
      expect(kit.prisma.db.audit).toEqual([
        expect.objectContaining({
          action: AuditAction.IDENTITY_VERIFICATION_RELEASED,
          actor_id: MDRRMO_ADMIN.id,
          entity_id: userId,
          new_values: { reason: 'OWNER_DISPUTE', scans: 1 },
        }),
      ]);
      expect(smsQueue.add.mock.calls[0][1].message).toBe(ID_REVIEW_MESSAGES.RELEASED.body);
      expect(smsQueue.add.mock.calls[0][1].message).not.toMatch(/dela cruz|juan|0010/i);

      // The real owner can now scan the same card.
      await expect(kit.service.scan(file(JPEG), {})).resolves.toMatchObject({ reviewRequired: false });
      // The holder's account still exists and isn't blocked: getting help never depends on this (rule 14).
      expect(kit.prisma.db.users.find((u: Row) => u.id === userId).status).not.toBe('DEACTIVATED');
    });

    it('a second release of the same check is refused and changes nothing', async () => {
      const { id } = await verifiedHolder();
      await call('POST', `/${id}/release`, recent(SYS_ADMIN), { reason: 'STAFF_CORRECTION' });
      const again = await call('POST', `/${id}/release`, recent(SYS_ADMIN), { reason: 'STAFF_CORRECTION' });
      expect(again.status).toBe(409);
      expect(kit.prisma.db.audit).toHaveLength(1);
      expect(smsQueue.add).toHaveBeenCalledTimes(1);
    });

    it('a deactivated holder is released without being messaged', async () => {
      const { id, userId } = await verifiedHolder();
      kit.prisma.db.users.find((u: Row) => u.id === userId).status = 'DEACTIVATED';
      const res = await call('POST', `/${id}/release`, recent(SYS_ADMIN), { reason: 'ACCOUNT_CLOSED' });
      expect(res.status).toBe(200);
      expect(kit.prisma.db.idv[0].status).toBe('RELEASED');
      expect(smsQueue.add).not.toHaveBeenCalled();
    });

    it('a failed audit write keeps the card held and nothing erased', async () => {
      const { id } = await verifiedHolder();
      kit.prisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));
      expect((await call('POST', `/${id}/release`, recent(SYS_ADMIN), { reason: 'OWNER_DISPUTE' })).status).toBe(500);
      expect(kit.prisma.db.idv[0]).toMatchObject({ status: 'AUTO_VERIFIED', pin_last4: '0010' });
      expect(smsQueue.add).not.toHaveBeenCalled();
    });
  });
});

describe('reviewReasonOf', () => {
  it('reads a scan failure, the failed name parts, or nothing', () => {
    expect(reviewReasonOf({ scanFailure: 'NOT_PHILHEALTH_ID' })).toEqual({ kind: 'SCAN_FAILURE', code: 'NOT_PHILHEALTH_ID' });
    expect(reviewReasonOf({ last: true, first: false, middle: 'mismatch', suffix: false })).toEqual({
      kind: 'NAME_MISMATCH',
      failedParts: ['first', 'middle', 'suffix'],
    });
    // An initial or an omitted middle name isn't a failure.
    expect(reviewReasonOf({ last: true, first: true, middle: 'initial', suffix: true })).toEqual({
      kind: 'NAME_MISMATCH',
      failedParts: [],
    });
    expect(reviewReasonOf(null)).toEqual({ kind: 'UNKNOWN' });
    expect(reviewReasonOf({ scanFailure: 'something else' })).toEqual({ kind: 'UNKNOWN' });
    expect(reviewReasonOf(['last'])).toEqual({ kind: 'UNKNOWN' });
  });
});
