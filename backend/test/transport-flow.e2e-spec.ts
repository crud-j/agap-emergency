/**
 * Emergency transport flow, end to end (plan §20 Scenario A + C, Phase 5; Prompt 16).
 *
 *   cd backend && pnpm test:e2e:db   # once: create, migrate and seed the scratch database
 *   cd backend && pnpm test:e2e
 *
 * The real AppModule (services, Prisma + PostGIS, BullMQ worker, realtime) runs against the
 * E2E scratch database (E2E_DATABASE_URL) and Redis database 15. Only the outside world is
 * replaced: the router (a straight line to the target), the geocoder, and SMS / push senders
 * (so no real text message or notification can go out). Each run creates its own incident
 * and dispatch with fresh ids; the seeded hospital and users are reused.
 *
 * Flow: dispatch accepted → EN_ROUTE → ON_SCENE → TRANSPORTING (record exists) → destination
 * Joni Villanueva → the ETA job's TO_FACILITY route ends at [120.94358, 14.79679] → resolve
 * refused before arrival → arrival → RESOLVED → the bystander reporter never received the
 * destination, a position or a route during the hospital leg (WebSocket frames and REST).
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import type { LatLng, RouteResult } from '@agap/shared';
import { haversineMeters } from '@agap/shared';
import { e2eDatabaseUrl, e2eRedisUrl } from './e2e/e2e-database';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const E2E_URL = e2eDatabaseUrl();
const describeE2E = E2E_URL ? describe : describe.skip;
if (!E2E_URL) {
  console.warn('transport-flow.e2e-spec: skipped. Set E2E_DATABASE_URL in backend/.env and run `pnpm test:e2e:db`.');
}

jest.setTimeout(120_000);

// Seeded fixtures (backend/prisma/seed/seed.ts).
const JONI_ID = '00000000-0000-0000-0002-000000000006';
const JONI = { lat: 14.79679, lng: 120.94358 };
const RESOURCE_ID = '00000000-0000-0000-0003-000000000002';
// Inside Bocaue (the seeded demo scene, Turo).
const SCENE = { lat: 14.7969, lng: 120.9268 };

interface Frame { to: 'ops' | 'incident' | 'user'; target?: string; event: string; payload: unknown; at: number }

describeE2E('Emergency transport flow (E2E)', () => {
  let app: INestApplication;
  let prisma: any;
  let responders: any;
  let transport: any;
  let locations: any;
  let routeCache: any;
  const frames: Frame[] = [];

  let responderId: string;
  let bystanderId: string;
  const incidentId = randomUUID();
  const dispatchId = randomUUID();
  const reference = `E2E-${incidentId.slice(0, 8).toUpperCase()}`;
  let transportStartedAt = 0;

  // Straight line from the unit to the target, so the route ends exactly at the target.
  const router = {
    route: jest.fn(async (from: LatLng, to: LatLng): Promise<RouteResult> => ({
      distanceMeters: Math.round(haversineMeters(from.lat, from.lng, to.lat, to.lng)),
      durationSeconds: 365,
      isEstimate: true,
      geometry: [[from.lng, from.lat], [(from.lng + to.lng) / 2, (from.lat + to.lat) / 2], [to.lng, to.lat]],
    })),
  };

  beforeAll(async () => {
    // Before the app is imported: ConfigModule reads the environment once, and the
    // process environment wins over backend/.env.
    process.env['DATABASE_URL'] = E2E_URL!;
    process.env['REDIS_URL'] = e2eRedisUrl();
    process.env['TRANSPORT_ROUTING_ENABLED'] = 'true';
    process.env['REPORTER_DESTINATION_SHARING_ENABLED'] = 'false';
    for (const key of ['TEXTBEE_API_KEY', 'TEXTBEE_DEVICE_ID', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
      process.env[key] = '';
    }

    const { Test } = (require('@nestjs/testing') as typeof import('@nestjs/testing'));
    const { AppModule } = (require('../src/app.module') as typeof import('../src/app.module'));
    const { ROUTING_PROVIDER, GEOCODING_PROVIDER } = (require('../src/locations/maps/maps.tokens') as typeof import('../src/locations/maps/maps.tokens'));
    const { SmsProcessor } = (require('../src/jobs/processors/sms.processor') as typeof import('../src/jobs/processors/sms.processor'));
    const { NotificationProcessor } = (require('../src/jobs/processors/notification.processor') as typeof import('../src/jobs/processors/notification.processor'));
    const { AnnouncementPushProcessor } = (require('../src/jobs/processors/announcement-push.processor') as typeof import('../src/jobs/processors/announcement-push.processor'));
    const { BarangaySmsPoller, BarangaySmsPollProcessor } = (require('../src/barangay-coordination/barangay-sms-poller') as typeof import('../src/barangay-coordination/barangay-sms-poller'));
    const { AgapGateway } = (require('../src/realtime/agap.gateway') as typeof import('../src/realtime/agap.gateway'));
    const { PrismaService } = (require('../src/common/prisma/prisma.service') as typeof import('../src/common/prisma/prisma.service'));
    const { RespondersService } = (require('../src/responders/responders.service') as typeof import('../src/responders/responders.service'));
    const { TransportService } = (require('../src/incidents/transport/transport.service') as typeof import('../src/incidents/transport/transport.service'));
    const { LocationsService } = (require('../src/locations/locations.service') as typeof import('../src/locations/locations.service'));
    const { RouteCacheService } = (require('../src/locations/route-cache.service') as typeof import('../src/locations/route-cache.service'));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ROUTING_PROVIDER).useValue(router)
      .overrideProvider(GEOCODING_PROVIDER).useValue({ reverseGeocode: async () => null, search: async () => [] })
      // No worker, no poller: nothing can send an SMS or a push from a test run.
      .overrideProvider(SmsProcessor).useValue({})
      .overrideProvider(NotificationProcessor).useValue({})
      .overrideProvider(AnnouncementPushProcessor).useValue({})
      .overrideProvider(BarangaySmsPoller).useValue({})
      .overrideProvider(BarangaySmsPollProcessor).useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Record every realtime frame (ops room, incident room, user rooms) instead of sending it.
    const gateway = app.get(AgapGateway);
    const record = (to: Frame['to']) => (event: string, a: unknown, b?: unknown) => {
      frames.push(to === 'ops'
        ? { to, event, payload: a, at: Date.now() }
        : { to, target: a as string, event, payload: b, at: Date.now() });
    };
    jest.spyOn(gateway, 'emitToOps').mockImplementation(record('ops') as never);
    jest.spyOn(gateway, 'emitToIncident').mockImplementation(record('incident') as never);
    jest.spyOn(gateway, 'emitToUser').mockImplementation(record('user') as never);

    prisma = app.get(PrismaService);
    responders = app.get(RespondersService);
    transport = app.get(TransportService);
    locations = app.get(LocationsService);
    routeCache = app.get(RouteCacheService);

    // The seeded hospital is the reference destination (plan §6).
    const joni = await prisma.facility.findUnique({ where: { id: JONI_ID } });
    expect(joni).toMatchObject({ is_active: true, location_status: 'VERIFIED' });
    expect(Number(joni.latitude)).toBeCloseTo(JONI.lat, 5);
    expect(Number(joni.longitude)).toBeCloseTo(JONI.lng, 5);

    const responder = await prisma.user.findUniqueOrThrow({ where: { email: 'responder2@mdrrmo.bocaue.gov.ph' } });
    const dispatcher = await prisma.user.findUniqueOrThrow({ where: { email: 'dispatcher1@mdrrmo.bocaue.gov.ph' } });
    const bystander = await prisma.user.findUniqueOrThrow({ where: { email: 'bystander@demo.agap' } });
    const resource = await prisma.resources.findUniqueOrThrow({ where: { id: RESOURCE_ID } });
    responderId = responder.id;
    bystanderId = bystander.id;

    await prisma.responderAvailability.upsert({
      where: { user_id: responderId },
      update: { status: 'AVAILABLE', changed_by_id: responderId },
      create: { user_id: responderId, status: 'AVAILABLE', changed_by_id: responderId },
    });
    // A registered bystander reported it; nobody claimed or confirmed being the patient.
    await prisma.incident.create({
      data: {
        id: incidentId,
        public_reference: reference,
        category: 'MEDICAL',
        priority: 'HIGH',
        status: 'DISPATCHED',
        description: 'E2E transport flow (automated test incident).',
        number_of_patients: 1,
        dispatched_at: new Date(),
        incident_reporters: {
          create: { user_id: bystanderId, is_guest: false, reporter_name: 'Demo Bystander', reporter_phone: '+639170000002' },
        },
        incident_locations: {
          create: {
            latitude: SCENE.lat, longitude: SCENE.lng,
            formatted_address: 'E2E scene, Turo, Bocaue, Bulacan', barangay: 'Turo', municipality: 'Bocaue', province: 'Bulacan',
          },
        },
      },
    });
    await prisma.dispatches.create({
      data: {
        id: dispatchId,
        incident_id: incidentId,
        resource_id: RESOURCE_ID,
        dispatcher_id: dispatcher.id,
        organization_id: resource.organization_id,
        status: 'SENT',
        sent_at: new Date(),
        dispatch_crew: { create: { user_id: responderId, role_on_scene: 'Lead Responder' } },
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Waits for the BullMQ ETA worker to cache this dispatch's route on the given leg. */
  async function cachedRoute(leg: string, timeoutMs = 30_000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const cached = await routeCache.get(dispatchId);
      if (cached?.leg === leg) return cached;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No ${leg} route cached for the dispatch within ${timeoutMs} ms`);
  }

  it('runs accept → transport → hospital route → arrival → resolve, and the bystander never gets the destination', async () => {
    // Dispatch accepted, on the way, on scene, with a crew fix at the scene.
    await responders.acceptAssignment(dispatchId, responderId);
    await responders.updateStatus(dispatchId, responderId, { status: 'EN_ROUTE' });
    await responders.pushLocation({ incidentId, latitude: SCENE.lat, longitude: SCENE.lng, accuracyMeters: 10 }, responderId);
    await responders.updateStatus(dispatchId, responderId, { status: 'ON_SCENE' });

    // TRANSPORTING: the open record exists from the tap, before any hospital is chosen.
    transportStartedAt = Date.now();
    const started = await responders.updateStatus(dispatchId, responderId, { status: 'TRANSPORTING' });
    expect(started).toMatchObject({ incidentStatus: 'TRANSPORTING' });
    const [record] = await prisma.transportRecord.findMany({ where: { dispatch_id: dispatchId } });
    expect(record).toMatchObject({ incident_id: incidentId, destination_id: null, arrived_at: null });
    expect(await prisma.incident.findUnique({ where: { id: incidentId }, select: { status: true } }))
      .toEqual({ status: 'TRANSPORTING' });

    // Destination: the seeded hospital, chosen by the crew.
    const updated = await transport.updateTransport(incidentId, record.id, { destinationId: JONI_ID }, responderId, 'RESPONDER');
    expect(updated).toMatchObject({ destination_id: JONI_ID, warnings: [] });

    // The ETA job (real BullMQ worker) routes the hospital leg from the crew's fix.
    const route = await cachedRoute('TO_FACILITY');
    const last = route.route.geometry.at(-1) as [number, number];
    expect(haversineMeters(last[1], last[0], JONI.lat, JONI.lng)).toBeLessThan(25);
    expect(last[0]).toBeCloseTo(120.94358, 4);
    expect(last[1]).toBeCloseTo(14.79679, 4);
    expect(router.route).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ lat: JONI.lat, lng: JONI.lng }));
    const withEta = await prisma.transportRecord.findUnique({ where: { id: record.id } });
    expect(withEta.estimated_arrival_at).not.toBeNull();

    // Positive control for the frame capture: the console did get the hospital route.
    const opsRoutes = frames.filter((f) => f.to === 'ops' && f.event === 'responder.route_updated'
      && JSON.stringify(f.payload).includes('TO_FACILITY'));
    expect(opsRoutes.length).toBeGreaterThan(0);

    // The bystander's REST view during the hospital leg: no destination, position or route.
    const reporterView = JSON.stringify(await locations.getLatestUnitPositions(incidentId, { id: bystanderId, role: 'BYSTANDER' }));
    expect(reporterView).not.toContain(JONI_ID);
    expect(reporterView).not.toContain('Joni Villanueva');
    expect(reporterView).not.toMatch(/geometry|"lat(itude)?":\s*-?\d/);

    // The crew cannot resolve before recording arrival.
    await expect(responders.updateStatus(dispatchId, responderId, { status: 'RESOLVED' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'TRANSPORT_OPEN' }) });

    // Arrival, then RESOLVED is allowed.
    const arrived = await transport.recordArrival(incidentId, record.id, {}, responderId, 'RESPONDER');
    expect(arrived.arrived_at).not.toBeNull();
    const resolved = await responders.updateStatus(dispatchId, responderId, { status: 'RESOLVED' });
    expect(resolved).toMatchObject({ incidentStatus: 'RESOLVED' });
    expect(await prisma.incident.findUnique({ where: { id: incidentId }, select: { status: true } }))
      .toEqual({ status: 'RESOLVED' });

    // One transport, one arrival, both audited.
    expect(await prisma.transportRecord.count({ where: { dispatch_id: dispatchId } })).toBe(1);
    const audits = await prisma.auditLog.findMany({ where: { entity_type: 'transport_record', entity_id: record.id } });
    expect(audits.filter((a: any) => a.new_values?.arrived_at)).toHaveLength(1);

    // What reached the bystander (incident room + their own user room): never the hospital,
    // and nothing with a position or route once the hospital leg began (C17/C18).
    const toBystander = frames.filter((f) => (f.to === 'incident' && f.target === incidentId)
      || (f.to === 'user' && f.target === bystanderId));
    expect(toBystander.length).toBeGreaterThan(0);
    for (const frame of toBystander) {
      const body = JSON.stringify(frame.payload);
      expect({ event: frame.event, body }).not.toEqual(expect.objectContaining({ body: expect.stringContaining(JONI_ID) }));
      expect(body).not.toContain('Joni Villanueva');
    }
    const duringHospitalLeg = toBystander.filter((f) => f.at >= transportStartedAt);
    for (const frame of duringHospitalLeg) {
      expect({ event: frame.event, body: JSON.stringify(frame.payload) })
        .not.toEqual(expect.objectContaining({ body: expect.stringMatching(/geometry|"lat(itude)?":\s*-?\d/) }));
    }
    // The status itself does reach the incident room (status-only copy).
    expect(duringHospitalLeg.map((f) => f.event)).toContain('incident.transporting');
  });
});
