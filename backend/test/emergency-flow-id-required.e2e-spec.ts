/**
 * Getting help with ID_VERIFICATION_REQUIRED=true, end to end (PhilHealth plan §9 Phase 6).
 *
 *   cd backend && pnpm test:e2e:db   # once: create, migrate and seed the scratch database
 *   cd backend && pnpm test:e2e
 *
 * The flag gates account creation and nothing else (rules 5, 8, 14), so this boots the real
 * AppModule with it on and sends each kind of reporter through the routes the apps use, over
 * real HTTP and real PostgreSQL + PostGIS: a guest, a seeded citizen, a citizen who scanned and
 * matched, and a citizen still under review. Each report must reach the dispatcher's queue and
 * be dispatchable, with the same priority.
 *
 * Replaced: the outside world, as in transport-flow.e2e-spec.ts (no SMS or push can leave), plus
 * the server OCR (no image library to draw a card in Jest) and the ID image storage (so nothing
 * lands in the development bucket). Made-up names and fake PINs only.
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { randomBytes, randomInt, randomUUID } from 'crypto';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Queue } from 'bullmq';
import { IncidentStatus, IncidentType, ReporterType } from '@agap/shared';
import { e2eDatabaseUrl, e2eRedisUrl } from './e2e/e2e-database';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const E2E_URL = e2eDatabaseUrl();
const describeE2E = E2E_URL ? describe : describe.skip;
if (!E2E_URL) {
  console.warn('emergency-flow-id-required.e2e-spec: skipped. Set E2E_DATABASE_URL in backend/.env and run `pnpm test:e2e:db`.');
}

jest.setTimeout(120_000);

// Inside Bocaue (the seeded demo scene, Turo).
const SCENE = { lat: 14.7969, lng: 120.9268 };
const SEEDED_UNIT_ID = '00000000-0000-0000-0003-000000000002';
const PASSWORD = 'S3curePass!e2e';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);

// A new number each run: the scratch database keeps earlier runs' accounts.
const phone = () => `+639${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;
const fakePin = () => `00${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}0`;
const dashed = (pin: string) => `${pin.slice(0, 2)}-${pin.slice(2, 11)}-${pin.slice(11)}`;

/** Made-up OCR text in the Phase 0 card layout. */
const cardText = (pin: string, nameLine: string) => [
  'REPUBLIC OF THE PHILIPPINES PhilHealth',
  'Philippine Health Insurance Corporation',
  dashed(pin),
  nameLine,
  'JANUARY 01, 1990 - MALE',
  'BLK 1 LOT 2 SAMPLE STREET, POBLACION,',
  'BOCAUE, BULACAN - 3018',
].join('\n');

describeE2E('Emergency flow with PhilHealth ID verification on (E2E)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prisma: any;
  let incidents: any;
  let dispatch: any;
  let dispatcherId: string;
  let resourceTemplate: any;

  // Everything written to the logs or handed to a background job during the run.
  const logged: string[] = [];
  const jobs: string[] = [];
  const opsFrames: Array<{ event: string; payload: any }> = [];
  const stored = new Map<string, Buffer>();
  const ocr = { read: jest.fn(), onModuleDestroy: jest.fn() };

  const pushLog = (...args: unknown[]) => { logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
  const logger: LoggerService = { log: pushLog, warn: pushLog, error: pushLog, debug: pushLog, verbose: pushLog, fatal: pushLog };

  // Priorities of the same report from each kind of reporter (rule 8).
  const priorities: Record<string, string> = {};
  const verifiedCard = { pin: fakePin(), nameLine: 'TESTCRUZ, JUANITO SANTOS' };
  const reviewCard = { pin: fakePin(), nameLine: 'SAMPLEREYES, ANABELLE MARIE' };

  beforeAll(async () => {
    // Before the app is imported: ConfigModule reads the environment once, and the
    // process environment wins over backend/.env.
    process.env['DATABASE_URL'] = E2E_URL!;
    process.env['REDIS_URL'] = e2eRedisUrl();
    process.env['ID_VERIFICATION_REQUIRED'] = 'true';
    process.env['ID_DOCUMENT_ENCRYPTION_KEY'] = randomBytes(32).toString('base64');
    process.env['ID_PIN_PEPPER'] = randomBytes(32).toString('base64');
    for (const key of ['TEXTBEE_API_KEY', 'TEXTBEE_DEVICE_ID', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
      process.env[key] = '';
    }

    const { ValidationPipe, VersioningType } = (require('@nestjs/common') as typeof import('@nestjs/common'));
    const { Test } = (require('@nestjs/testing') as typeof import('@nestjs/testing'));
    const { AppModule } = (require('../src/app.module') as typeof import('../src/app.module'));
    const { PrismaExceptionFilter } = (require('../src/common/filters/prisma-exception.filter') as typeof import('../src/common/filters/prisma-exception.filter'));
    const { ROUTING_PROVIDER, GEOCODING_PROVIDER } = (require('../src/locations/maps/maps.tokens') as typeof import('../src/locations/maps/maps.tokens'));
    const { SmsProcessor } = (require('../src/jobs/processors/sms.processor') as typeof import('../src/jobs/processors/sms.processor'));
    const { NotificationProcessor } = (require('../src/jobs/processors/notification.processor') as typeof import('../src/jobs/processors/notification.processor'));
    const { AnnouncementPushProcessor } = (require('../src/jobs/processors/announcement-push.processor') as typeof import('../src/jobs/processors/announcement-push.processor'));
    const { BarangaySmsPoller, BarangaySmsPollProcessor } = (require('../src/barangay-coordination/barangay-sms-poller') as typeof import('../src/barangay-coordination/barangay-sms-poller'));
    const { AgapGateway } = (require('../src/realtime/agap.gateway') as typeof import('../src/realtime/agap.gateway'));
    const { PrismaService } = (require('../src/common/prisma/prisma.service') as typeof import('../src/common/prisma/prisma.service'));
    const { IncidentsService } = (require('../src/incidents/incidents.service') as typeof import('../src/incidents/incidents.service'));
    const { DispatchService } = (require('../src/dispatch/dispatch.service') as typeof import('../src/dispatch/dispatch.service'));
    const { MediaService } = (require('../src/media/media.service') as typeof import('../src/media/media.service'));
    const { IdOcrService } = (require('../src/identity-verification/id-ocr.service') as typeof import('../src/identity-verification/id-ocr.service'));

    const originalAdd = Queue.prototype.add;
    jest.spyOn(Queue.prototype, 'add').mockImplementation(function (this: Queue, name: string, data: unknown, opts?: unknown) {
      jobs.push(`${name} ${JSON.stringify(data)}`);
      return (originalAdd as any).call(this, name, data, opts);
    } as never);
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(console, method).mockImplementation(pushLog);
    }

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .setLogger(logger)
      .overrideProvider(ROUTING_PROVIDER).useValue({ route: jest.fn(async () => null) })
      .overrideProvider(GEOCODING_PROVIDER).useValue({ reverseGeocode: async () => null, search: async () => [] })
      .overrideProvider(IdOcrService).useValue(ocr)
      // No worker, no poller: nothing can send an SMS or a push from a test run.
      .overrideProvider(SmsProcessor).useValue({})
      .overrideProvider(NotificationProcessor).useValue({})
      .overrideProvider(AnnouncementPushProcessor).useValue({})
      .overrideProvider(BarangaySmsPoller).useValue({})
      .overrideProvider(BarangaySmsPollProcessor).useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    // As in main.ts: the routes, DTO checks and error bodies the apps really get.
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new PrismaExceptionFilter());

    const media = app.get(MediaService);
    jest.spyOn(media, 'putPrivateObject').mockImplementation(async (key: string, body: Buffer) => {
      stored.set(`e2e:${key}`, body);
      return `e2e:${key}`;
    });
    jest.spyOn(media, 'deletePrivateObject').mockImplementation(async (location: string) => {
      stored.delete(location);
    });

    jest.spyOn(app.get(AgapGateway), 'emitToOps').mockImplementation(((event: string, payload: unknown) => {
      opsFrames.push({ event, payload });
    }) as never);

    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();

    prisma = app.get(PrismaService);
    incidents = app.get(IncidentsService);
    dispatch = app.get(DispatchService);
    dispatcherId = (await prisma.user.findUniqueOrThrow({ where: { email: 'dispatcher1@mdrrmo.bocaue.gov.ph' } })).id;
    resourceTemplate = await prisma.resources.findUniqueOrThrow({ where: { id: SEEDED_UNIT_ID } });
  });

  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  async function post(route: string, body: unknown, token?: string) {
    const res = await fetch(`${baseUrl}/v1${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  /** The report the app's emergency flow sends (app/emergency/transmission.tsx). */
  async function report(reporterType: ReporterType, token?: string) {
    const res = await post('/incidents', {
      type: IncidentType.MEDICAL,
      triggerMethod: 'SOS_BUTTON',
      idempotencyKey: randomUUID(),
      lat: SCENE.lat,
      lng: SCENE.lng,
      reporter: { type: reporterType },
    }, token);
    expect(res.status).toBe(201);
    return res.json as { id: string; priority: string };
  }

  /** The dispatcher's side: in the queue, announced to the ops room, and dispatchable. */
  async function expectDispatchable(incidentId: string) {
    const queue = await incidents.findAll({ statuses: [IncidentStatus.SUBMITTED], perPage: 100 });
    expect(queue.data.map((row: { id: string }) => row.id)).toContain(incidentId);
    expect(opsFrames.some((f) => f.event === 'incident.created' && f.payload?.incidentId === incidentId)).toBe(true);

    await incidents.updateStatus(incidentId, IncidentStatus.RECEIVED, dispatcherId);
    await incidents.updateStatus(incidentId, IncidentStatus.ACKNOWLEDGED, dispatcherId);
    // A unit of its own: the scratch database keeps earlier runs' dispatches, and those hold theirs.
    const unit = await prisma.resources.create({
      data: {
        organization_id: resourceTemplate.organization_id,
        name: `E2E unit ${randomUUID().slice(0, 8)}`,
        resource_type: resourceTemplate.resource_type,
        status: 'AVAILABLE',
        is_active: true,
      },
    });
    await dispatch.create({ incidentId, resourceId: unit.id }, dispatcherId);

    expect(await prisma.dispatches.count({ where: { incident_id: incidentId, resource_id: unit.id } })).toBe(1);
    const { status } = await prisma.incident.findUniqueOrThrow({ where: { id: incidentId }, select: { status: true } });
    expect(['DISPATCH_PENDING', 'DISPATCHED']).toContain(status);
  }

  async function scan(card: { pin: string; nameLine: string }) {
    ocr.read.mockResolvedValueOnce({ text: cardText(card.pin, card.nameLine), confidence: 90 });
    const body = new FormData();
    body.append('image', new Blob([JPEG], { type: 'image/jpeg' }), 'id.jpg');
    body.append('consentGiven', 'true');
    body.append('latitude', String(SCENE.lat));
    body.append('longitude', String(SCENE.lng));
    const res = await fetch(`${baseUrl}/v1/auth/id-verification`, { method: 'POST', body });
    expect(res.status).toBe(200);
    return (await res.json()) as { token: string };
  }

  const registration = (phoneNumber: string, fields: Record<string, unknown>) => post('/auth/register', {
    phoneNumber,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    latitude: SCENE.lat,
    longitude: SCENE.lng,
    ...fields,
  });

  /** Enters the OTP the way the app does; the code comes from the row, not from an SMS. */
  async function confirmPhone(userId: string, phoneNumber: string) {
    const { token: otp } = await prisma.user_verifications.findFirstOrThrow({
      where: { user_id: userId, verification_type: 'PHONE', status: 'PENDING' },
      orderBy: { created_at: 'desc' },
    });
    const res = await post('/auth/verify/phone', { phoneNumber, otp });
    expect(res.status).toBeLessThan(300);
    expect(res.json.accessToken).toEqual(expect.any(String));
  }

  it('refuses a new account without a scan, and creates nothing', async () => {
    const phoneNumber = phone();
    const res = await registration(phoneNumber, { fullName: 'No Scan Citizen' });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('ID_VERIFICATION_REQUIRED');
    expect(await prisma.user.count({ where: { phone_number: phoneNumber } })).toBe(0);
  });

  it('a guest with no account and no scan still reaches dispatch (rule 14)', async () => {
    const incident = await report(ReporterType.GUEST_REPORTER);
    priorities['guest'] = incident.priority;

    const reporter = await prisma.incidentReporter.findFirstOrThrow({ where: { incident_id: incident.id } });
    expect(reporter).toMatchObject({ is_guest: true, user_id: null });
    expect(await incidents.getReporterIdVerified(incident.id)).toBeNull();
    await expectDispatchable(incident.id);

    // The short-lived guest account is still issued too, and it can report.
    const guest = await post('/auth/register/guest', { reporterName: 'Bystander' });
    expect(guest.status).toBe(201);
    await expectDispatchable((await report(ReporterType.GUEST_REPORTER, guest.json.accessToken)).id);
  });

  it('a seeded citizen signs in without scanning, and the report reaches dispatch', async () => {
    const signIn = await post('/auth/login', { identifier: 'citizen@demo.agap', password: 'AgapDev2026!' });
    expect(signIn.status).toBeLessThan(300);
    expect(signIn.json.accessToken).toEqual(expect.any(String));

    const incident = await report(ReporterType.REGISTERED_CITIZEN, signIn.json.accessToken);
    priorities['seeded'] = incident.priority;
    expect(await incidents.getReporterIdVerified(incident.id)).toBe(true);
    await expectDispatchable(incident.id);
  });

  it('a citizen who scanned and matched is verified, the image is gone, and the report reaches dispatch', async () => {
    const { token } = await scan(verifiedCard);
    const phoneNumber = phone();
    const res = await registration(phoneNumber, {
      idVerificationToken: token,
      lastName: 'Testcruz',
      firstName: 'Juanito',
      middleName: 'Santos',
    });
    expect(res.status).toBe(201);
    expect(res.json.identityVerification).toBe('AUTO_VERIFIED');
    const userId = res.json.user.id;

    const row = await prisma.identity_verifications.findFirstOrThrow({ where: { user_id: userId } });
    expect(row).toMatchObject({ status: 'AUTO_VERIFIED', image_storage_key: null });
    expect(stored.size).toBe(0);

    await confirmPhone(userId, phoneNumber);
    const signIn = await post('/auth/login', { identifier: phoneNumber, password: PASSWORD });
    expect(signIn.status).toBeLessThan(300);

    const incident = await report(ReporterType.REGISTERED_CITIZEN, signIn.json.accessToken);
    priorities['verified'] = incident.priority;
    expect(await incidents.getReporterIdVerified(incident.id)).toBe(true);
    await expectDispatchable(incident.id);
  });

  it('a citizen under review signs in and the report reaches dispatch, labelled but not held back (rules 5, 8)', async () => {
    const { token } = await scan(reviewCard);
    const phoneNumber = phone();
    const typed = { idVerificationToken: token, lastName: 'Wrongname', firstName: 'Anabelle' };

    // A different name is refused and creates nothing, until the citizen asks for review.
    const refused = await registration(phoneNumber, typed);
    expect(refused.status).toBe(400);
    expect(refused.json.code).toBe('NAME_DOES_NOT_MATCH_ID');
    expect(await prisma.user.count({ where: { phone_number: phoneNumber } })).toBe(0);

    const res = await registration(phoneNumber, { ...typed, requestReview: true });
    expect(res.status).toBe(201);
    expect(res.json.identityVerification).toBe('PENDING_REVIEW');
    const userId = res.json.user.id;

    const row = await prisma.identity_verifications.findFirstOrThrow({ where: { user_id: userId } });
    expect(row.status).toBe('PENDING_REVIEW');
    expect(stored.has(row.image_storage_key)).toBe(true); // kept for the reviewer

    await confirmPhone(userId, phoneNumber);
    const signIn = await post('/auth/login', { identifier: phoneNumber, password: PASSWORD });
    expect(signIn.status).toBeLessThan(300);

    const incident = await report(ReporterType.REGISTERED_CITIZEN, signIn.json.accessToken);
    priorities['underReview'] = incident.priority;
    expect(await incidents.getReporterIdVerified(incident.id)).toBe(false);
    await expectDispatchable(incident.id);
  });

  it('the ID status never changes the priority of the same report (rule 8)', () => {
    expect(Object.keys(priorities).sort()).toEqual(['guest', 'seeded', 'underReview', 'verified']);
    expect(new Set(Object.values(priorities)).size).toBe(1);
  });

  it('no log line and no background job carried the PIN or text read from a card', () => {
    // Positive controls: the capture really saw this run's logs and its queued SMS.
    expect(logged.join('\n')).toContain('Registration OTP');
    expect(jobs.join('\n')).toContain('otp-sms');

    const everything = [...logged, ...jobs].join('\n');
    for (const card of [verifiedCard, reviewCard]) {
      expect(everything).not.toContain(card.pin);
      expect(everything).not.toContain(dashed(card.pin));
    }
    // Only ever on a card: never typed, so it can't reach a log or a job from the account name.
    expect(everything).not.toContain('SAMPLEREYES');
    // The OCR text itself: the card's name line, birth line and address.
    expect(everything).not.toContain(verifiedCard.nameLine);
    expect(everything).not.toContain('JANUARY 01, 1990');
    expect(everything).not.toContain('SAMPLE STREET');
  });
});
