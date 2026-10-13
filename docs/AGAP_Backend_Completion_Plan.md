# AGAP — Backend Completion Plan
## Gap Analysis & Prioritised Implementation Roadmap

**Reviewed against:** `http://localhost:3002/api/docs` (live, 197 endpoints registered)  
**Reference:** `AGAP_Complete_Master_Enterprise_Architecture.md` + `AGAP_Backend_Implementation_Plan.md`  
**Date:** 2026-09-24  
**Status:** All 197 endpoints are registered and visible in Swagger. Most services have real Prisma logic. The gaps are in external integrations, job processors, and security hardening — NOT in endpoint registration.

---

## Quick Health Check — What to Test First

Run these in Swagger UI (`http://localhost:3002/api/docs`) to confirm working baseline before implementing gaps:

```
POST /v1/auth/register           → should return user + accessToken + refreshToken
POST /v1/auth/login              → should return tokens
GET  /v1/users/me                → should return profile (Bearer token)
POST /v1/incidents               → should create incident and return publicReference
GET  /v1/incidents               → should return paginated list
GET  /v1/incidents/:id           → should return incident with status
POST /v1/dispatch                → should create dispatch record
POST /v1/emergency-alerts/sos    → should create incident (dedup check included)
GET  /v1/locations/tracking/:id  → should return latest positions
```

---

## Current State Audit

### ✅ Fully Implemented (Prisma logic, real DB operations)

| Module | Controller | Service | Notes |
|---|---|---|---|
| Auth | auth.controller.ts | auth.service.ts + webauthn.service.ts | Register, login, refresh, logout, OTP verify, forgot/reset/change password, 6 WebAuthn passkey endpoints |
| Users | users.controller.ts | users.service.ts | CRUD, readiness status |
| Incidents | incidents.controller.ts | incidents.service.ts | 520 lines, 28+ methods — create, list, get, status transitions, acknowledge, assess, false-alert, duplicate, resolution, close, feedback, messages, agencies, ICS, handover, attachments, assessments |
| Emergency Alerts | emergency-alerts.controller.ts | emergency-alerts.service.ts | SOS + shake trigger with dedup, cancel window, status — **but no queue jobs fired** (see gaps) |
| Emergency Contacts | emergency-contacts.controller.ts | emergency-contacts.service.ts | Full CRUD + priority reorder |
| Dispatch | dispatch.controller.ts | dispatch.service.ts | Create, list, get, cancel, reassign, crew add/remove, triage, priority, duplicate merge |
| Resources | resources.controller.ts | resources.service.ts | CRUD, availability, recommend, capabilities, mutual aid requests |
| Responders | responders.controller.ts | responders.service.ts | List, assignments (accept/decline/status), location push, my assignments |
| Locations | locations.controller.ts | locations.service.ts | GPS capture, track, live tracking, responder positions, history — **ETA stub** |
| Organizations | organizations.controller.ts | organizations.service.ts | CRUD, members |
| Fleet | fleet.controller.ts | fleet.service.ts | CRUD, activate/deactivate |
| Hospitals | hospitals.controller.ts | hospitals.service.ts | CRUD, nearby, referrals (create/list/acknowledge/arrived) |
| Facilities | facilities.controller.ts | facilities.service.ts | CRUD, status/capacity update |
| Medical Profiles | medical-profiles.controller.ts | medical-profiles.service.ts | CRUD + consent-gated patient access |
| Notifications | notifications.controller.ts | notifications.service.ts | List, read, read-all, unread count, push token register/remove — **delivery not wired** |
| Announcements | announcements.controller.ts | announcements.service.ts | Draft, publish, schedule, supersede, archive, SMS subscribe/unsubscribe, delivery stats — **SMS broadcast not wired** |
| Audit | audit.controller.ts | audit.service.ts | List, get, incident trail |
| Analytics | analytics.controller.ts | analytics.service.ts | Response times, volume, daily, SLA compliance, resource utilization, false-alert rate, incident report |
| Escalations | escalations.controller.ts | escalations.service.ts | List, get, acknowledge, resolve — **not triggered by SLA timer** |
| Risk Intelligence | risk-intelligence.controller.ts | risk-intelligence.service.ts | Heatmap, patterns, flood zones, risk areas CRUD |
| Communications | communications.controller.ts | communications.service.ts | Incident-scoped chat messages (send, list, mark read) |
| Consent | consent.controller.ts | consent.service.ts | Grant, revoke, check |
| Privacy | privacy.controller.ts | privacy.service.ts | Access log, GDPR export |
| Permissions | permissions.controller.ts | permissions.service.ts | List, role-based grant/revoke |
| Offline Sync | offline-sync.controller.ts | offline-sync.service.ts | Status, flush — **processor stub** |
| Disaster Mode | disaster-mode.controller.ts | disaster-mode.service.ts | Activate/deactivate, surge resources, triage tags, link incidents |
| Administration | administration.controller.ts | administration.service.ts | System config, health, user admin |
| Realtime | agap.gateway.ts | realtime.service.ts | WS gateway with room subscriptions (join:incident, join:ops) — **no auth guard** |

---

### ❌ Gaps — What Still Needs Implementation

---

## GAP 1 — BullMQ Job Processors (All Stubs)

**Criticality: CRITICAL** — Without these, AGAP's core promise (dual-path SMS + push at trigger) is silent.

All six processors in `backend/src/jobs/processors/` are scaffolded but have `// TODO` bodies.

### GAP 1-A: SMS Processor → Textbee.dev API
**File:** `backend/src/jobs/processors/sms.processor.ts`

```typescript
// Implement: POST https://api.textbee.dev/api/v1/gateway/devices/{TEXTBEE_DEVICE_ID}/send-sms
// Headers: { 'x-api-key': TEXTBEE_API_KEY, 'Content-Type': 'application/json' }
// Body: { recipients: [phone], message }
// SMS format: AGAP|INC-2026-001234|14.5995,120.9842|1754179200|FIRE|C:Y
// MUST be under 160 chars — validate before send
// On failure: log error, do NOT propagate (reliability rule)
```

**Env vars needed:** `TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID`

### GAP 1-B: Push Notification Processor → Firebase FCM
**File:** `backend/src/jobs/processors/notification.processor.ts`

```typescript
// Install: pnpm --filter @agap/backend add firebase-admin
// Initialize firebase-admin with service account credentials
// For PUSH channel: call admin.messaging().send({ token, notification: { title, body }, data })
// For SMS channel: enqueue SMS queue job (delegate — don't call Semaphore directly here)
// For IN_APP channel: call RealtimeService.emit(NOTIFICATION_EVENTS.CREATED, payload)
// Critical: catch all errors — notification failure must NOT affect incident
```

**Env vars needed:** `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

### GAP 1-C: SLA Monitor Processor
**File:** `backend/src/jobs/processors/sla-monitor.processor.ts`

```typescript
// Triggered as a delayed BullMQ job after incident creation
// Logic:
//   1. Load incident by incidentId
//   2. Check if incident has reached the expected status by the threshold time
//   3. If NOT → create escalation record (prisma.escalation.create)
//   4. Enqueue notification job to all supervisors for this org
//   5. Emit escalation.created WebSocket event via RealtimeService
// Thresholds from env: DEFAULT_SLA_ACKNOWLEDGE_SECONDS, DEFAULT_SLA_DISPATCH_SECONDS, DEFAULT_SLA_ON_SCENE_SECONDS
```

### GAP 1-D: Escalation Processor
**File:** `backend/src/jobs/processors/escalation.processor.ts`

```typescript
// On escalation job: load escalation record, determine next escalation tier
// Notify tier-2 (supervisor → org-admin) if not acknowledged within window
// Update escalation.tier in DB
```

### GAP 1-E: Analytics Processor
**File:** `backend/src/jobs/processors/analytics.processor.ts`

```typescript
// Triggered by analytics queue jobs (can be on-demand or daily cron)
// Aggregate incident_events into response time metrics
// Write to analytics summary tables (or compute on-the-fly — service already does this)
// Low priority — analytics.service.ts already computes on demand from incident tables
```

### GAP 1-F: Offline Sync Processor
**File:** `backend/src/jobs/processors/offline-sync.processor.ts`

```typescript
// On sync job: receive array of queued events with client_event_ids
// For each event: call the appropriate service method
// Deduplication: check client_event_id before creating — if exists, return existing record
// Idempotency is already in emergency-alerts.service.ts (checks client_event_id before insert)
```

---

## GAP 2 — Queue Jobs NOT Fired from Services

**Criticality: CRITICAL** — The processors above are useless if nothing enqueues jobs.

### GAP 2-A: Emergency Alerts Service — wire SOS/shake to enqueue jobs

**File:** `backend/src/emergency-alerts/emergency-alerts.service.ts`

Currently: creates incident in DB + emits one WS event.  
Missing: SMS job, push job, emergency-contact job, SLA timer job.

```typescript
// After this.prisma.$transaction succeeds and incident is persisted:

// 1. SMS job (dual-path — fires even if push fails)
await this.smsQueue.add('emergency-sms', {
  phone: 'MDRRMO_OPS_NUMBER',  // configured number for ops center SMS
  message: `AGAP|${incident.public_reference}|${lat},${lng}|${unixTs}|${type}|C:${hasCoords}`,
  incidentId: incident.id,
});

// 2. Push notification to ops center dispatchers
await this.notificationQueue.add('ops-center-alert', {
  channel: 'PUSH',
  title: `New ${incident.incident_type} Alert`,
  body: `${incident.public_reference} — ${incident.description ?? 'No details'}`,
  data: { incidentId: incident.id, type: 'INCIDENT_CREATED' },
});

// 3. Emergency contact notifications (if reporter has AGAP account)
if (actorId) {
  await this.notificationQueue.add('emergency-contact-notify', {
    userId: actorId,
    channel: 'SMS',
    body: `Emergency alert submitted by your contact. Ref: ${incident.public_reference}`,
  });
}

// 4. SLA timer — delayed job, fires at acknowledge threshold
await this.slaQueue.add(
  'sla-monitor',
  { incidentId: incident.id, slaThresholdMinutes: 2, escalationType: 'ACKNOWLEDGEMENT' },
  { delay: Number(process.env.DEFAULT_SLA_ACKNOWLEDGE_SECONDS ?? 120) * 1000 },
);
```

**Inject queues in constructor:**
```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly realtime: RealtimeService,
  @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
  @InjectQueue(QUEUE_NAMES.ESCALATION) private readonly slaQueue: Queue,
) {}
```

### GAP 2-B: Dispatch Service — notify emergency contacts on dispatch
**File:** `backend/src/dispatch/dispatch.service.ts`

```typescript
// After dispatch is created (status → DISPATCHED):
await this.notificationQueue.add('dispatch-notify', {
  incidentId: incident.id,
  channel: 'PUSH',
  title: 'Responders Dispatched',
  body: `Help is on the way. Ref: ${incident.public_reference}`,
  data: { incidentId: incident.id, type: 'DISPATCH_CREATED' },
});
// Also enqueue emergency contact SMS notification
```

### GAP 2-C: Announcements Service — SMS broadcast on publish
**File:** `backend/src/announcements/announcements.service.ts`

```typescript
// On publish(): load all SMS subscribers from announcement_subscriptions table
// Enqueue one SMS job per subscriber (or batch)
// SMS payload: announcement title + short URL (if any) — must be < 160 chars
```

---

## GAP 3 — ETA Calculation (Stub → Real Routing API)

**Criticality: HIGH** — ETA is labeled as an estimate in the UI; wrong data is worse than "calculating..."

**File:** `backend/src/locations/locations.service.ts` — `getEta()` method

Currently returns `{ eta_seconds: null, is_estimate: true, message: 'ETA calculation requires active dispatch' }`.

**Implementation:**
```typescript
async getEta(incidentId: string) {
  // 1. Get incident location
  const incidentLocation = await this.prisma.incident_locations.findFirst({
    where: { incident_id: incidentId },
    orderBy: { created_at: 'desc' },
  });
  if (!incidentLocation) return { eta_seconds: null, is_estimate: true };

  // 2. Get latest dispatch + resource last known location
  const dispatch = await this.prisma.dispatches.findFirst({
    where: { incident_id: incidentId, status: { in: ['DISPATCHED', 'EN_ROUTE'] } },
    include: { resources: true },
  });
  if (!dispatch) return { eta_seconds: null, is_estimate: true };

  // 3. Call MAP_PROVIDER_ROUTING_URL
  // e.g. OSRM: GET /route/v1/driving/{src_lng},{src_lat};{dst_lng},{dst_lat}?overview=false
  const routingUrl = this.config.get('MAP_PROVIDER_ROUTING_URL');
  // ... HTTP call, parse response, extract duration seconds

  // 4. Emit responder.eta_updated via RealtimeService
  return { eta_seconds: durationSeconds, is_estimate: true, estimated_arrival: new Date(Date.now() + durationSeconds * 1000) };
}
```

**Env vars needed:** `MAP_PROVIDER_ROUTING_URL`, `MAP_PROVIDER_API_KEY`

---

## GAP 4 — Reverse Geocoding (Stub → Real API)

**Criticality: MEDIUM** — Used in MOD-12 to show human-readable address on dispatcher dashboard.

**File:** `backend/src/locations/locations.service.ts` — `geocode()` method

Check if implemented; if it returns `{ address: null }` or similar, wire to `MAP_PROVIDER_GEOCODING_URL`.

```typescript
// OSRM/Nominatim example:
// GET https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json
// OR configured MAP_PROVIDER_GEOCODING_URL
// Parse response → format as "Barangay X, Bocaue, Bulacan"
```

---

## GAP 5 — WebSocket Authentication Guard

**Criticality: HIGH** — Currently any unauthenticated client can connect and join any `incident:*` room.

**File:** `backend/src/realtime/agap.gateway.ts`

```typescript
// Create: backend/src/realtime/ws-jwt.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const token = client.handshake.auth?.token ?? client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) throw new WsException('Unauthorized');
    try {
      const payload = this.jwtService.verify(token);
      client.data.user = payload;
      return true;
    } catch {
      throw new WsException('Invalid token');
    }
  }
}

// In gateway:
// handleConnection: verify token, disconnect unauthenticated clients
// join:incident: verify user is authorized for this incident (own incident or DISPATCHER+)
// join:ops: verify role is DISPATCHER or above
```

---

## GAP 6 — Media/File Upload (Object Storage)

**Criticality: MEDIUM** — `POST /v1/incidents/:id/attachments` exists but needs real file handling.

**File:** `backend/src/media/media.service.ts`

```typescript
// Install: pnpm --filter @agap/backend add @aws-sdk/client-s3 multer @types/multer
// Use S3-compatible storage (MinIO in Docker dev, production bucket in prod)
// Controller: @UseInterceptors(FileInterceptor('file')) + @UploadedFile()
// Service: upload buffer to S3 → save URL + metadata to incident_attachments table
// Max file size: 10MB. Allowed types: image/jpeg, image/png, image/webp, video/mp4
```

**Env vars needed:** `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`

---

## GAP 7 — Rate Limiting on Critical Endpoints

**Criticality: HIGH** — SOS endpoint is unauthenticated and public; must throttle to prevent abuse.

**File:** `backend/src/app.module.ts`

```typescript
// Already in package.json? If not: pnpm --filter @agap/backend add @nestjs/throttler
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// In AppModule imports:
ThrottlerModule.forRoot([
  { name: 'short', ttl: 1000, limit: 3 },   // 3 req/sec
  { name: 'medium', ttl: 60000, limit: 10 }, // 10 req/min
]),

// Apply to auth endpoints and SOS:
// In auth.controller.ts: @UseGuards(ThrottlerGuard) on register, login, forgot-password
// In emergency-alerts.controller.ts: @UseGuards(ThrottlerGuard) on /sos and /shake
// The 3-second SOS cancel window is handled in service logic, not throttler
```

---

## GAP 8 — Location Push → Realtime Emit Missing

**Criticality: HIGH** — `POST /v1/locations/track` saves to DB but does not emit `resource.location_updated` WS event.

**File:** `backend/src/locations/locations.service.ts` — `track()` method

```typescript
// After prisma.location_history.create():
await this.realtime.emit(RESOURCE_EVENTS.LOCATION_UPDATED, {
  incidentId: dto.incidentId,
  userId: userId,
  resourceId: dto.resourceId,
  latitude: dto.latitude,
  longitude: dto.longitude,
  recordedAt: record.recorded_at,
});
// Also enqueue eta-refresh job
await this.etaQueue.add('eta-refresh', { incidentId: dto.incidentId });
```

---

## GAP 9 — Responder Location Push → Realtime Emit

**Criticality: HIGH** — `POST /v1/responders/location` saves location but does NOT emit `responder.location_updated`.

**File:** `backend/src/responders/responders.service.ts` — `pushLocation()` method

Same pattern as GAP 8 — inject RealtimeService and emit after DB write.

---

## GAP 10 — Dispatch Status Changes → Realtime Emit

**Criticality: HIGH** — Dispatchers and citizens need live dispatch status changes.

**File:** `backend/src/dispatch/dispatch.service.ts`

```typescript
// After dispatch status changes (create, cancel, reassign):
await this.realtime.emitToIncident(DISPATCH_EVENTS.CREATED, dispatch.incident_id, dispatch);
await this.realtime.emitToIncident(DISPATCH_EVENTS.UPDATED, dispatch.incident_id, dispatch);
```

---

## Implementation Order (Recommended for Early Testing)

| Priority | Gap | Why First |
|---|---|---|
| 1 | GAP 2-A — Wire SOS to enqueue jobs | Core AGAP promise; testable end-to-end immediately |
| 2 | GAP 1-A — SMS Processor (Textbee.dev) | Dual-path delivery; most critical for Bocaue flood connectivity |
| 3 | GAP 1-B — Push Processor (FCM) | Dispatcher receives SOS alert on ops dashboard |
| 4 | GAP 5 — WebSocket Auth Guard | Security; required before any real user testing |
| 5 | GAP 8 + 9 + 10 — Realtime emits from location/dispatch | Live map on ops dashboard |
| 6 | GAP 1-C — SLA Monitor Processor | Escalation chain works |
| 7 | GAP 3 — ETA Calculation | Responder tracking ETA |
| 8 | GAP 2-B — Dispatch contact notification | User-facing dispatch confirmation |
| 9 | GAP 4 — Geocoding | Address display on dashboard |
| 10 | GAP 7 — Rate Limiting | Pre-production hardening |
| 11 | GAP 6 — Media Upload | Photo evidence (MOD-10) |
| 12 | GAP 2-C — Announcement SMS broadcast | MOD-53 |
| 13 | GAP 1-E — Analytics Processor | Post-incident reporting |
| 14 | GAP 1-F — Offline Sync Processor | Flood-zone degraded connectivity |

---

## Environment Variables Checklist

Before implementing each gap, confirm these are set in `backend/.env`:

```env
# GAP 1-A (SMS)
TEXTBEE_API_KEY=
TEXTBEE_DEVICE_ID=
MDRRMO_OPS_PHONE=+639XXXXXXXXX

# GAP 1-B (Push)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# GAP 3 + 4 (ETA + Geocoding)
MAP_PROVIDER_API_KEY=
MAP_PROVIDER_GEOCODING_URL=
MAP_PROVIDER_ROUTING_URL=

# GAP 6 (Media)
STORAGE_ENDPOINT=
STORAGE_BUCKET=agap-media
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=

# SLA Thresholds (already in .env.example)
DEFAULT_SLA_ACKNOWLEDGE_SECONDS=120
DEFAULT_SLA_DISPATCH_SECONDS=300
DEFAULT_SLA_ON_SCENE_SECONDS=900
```

---

## How to Use This Plan in a Session

When you want to implement a specific gap, say:

> "Implement GAP 1-A — SMS Processor using Semaphore API"  
> "Implement GAP 2-A — wire SOS to enqueue jobs"  
> "Implement GAP 5 — WebSocket auth guard"

The agent will use this document to implement exactly what's described above without re-auditing the codebase from scratch.

---

---

# AGAP BACKEND — SESSION-BY-SESSION IMPLEMENTATION PLAN

> **How to invoke:** At the start of any session, say `"Run SESSION-X from the backend completion plan"`.  
> The agent reads this section and implements everything listed for that session exactly — files, logic, tests.  
> Sessions are ordered by dependency: complete earlier sessions before later ones.

---

## SESSION 1 — Wire SOS/Shake to Job Queues (GAP 2-A)
**Time estimate:** 45 min  
**Prerequisite:** Redis running (`docker compose up -d redis`)  
**Tests:** After implementation, `POST /v1/emergency-alerts/sos` must enqueue 4 BullMQ jobs visible in Redis

### Files to modify:
1. **`backend/src/emergency-alerts/emergency-alerts.module.ts`**
   - Add `BullModule.registerQueue()` for `QUEUE_NAMES.SMS`, `QUEUE_NAMES.NOTIFICATIONS`, `QUEUE_NAMES.ESCALATION`

2. **`backend/src/emergency-alerts/emergency-alerts.service.ts`**
   - Inject `@InjectQueue(QUEUE_NAMES.SMS)`, `@InjectQueue(QUEUE_NAMES.NOTIFICATIONS)`, `@InjectQueue(QUEUE_NAMES.ESCALATION)`
   - In `triggerSos()` and `triggerShake()`, after the `$transaction` commits:
     - Enqueue `emergency-sms` job to SMS queue with payload `AGAP|{ref}|{lat},{lng}|{unix}|{type}|C:{Y/N}`
     - Enqueue `ops-center-alert` push job to NOTIFICATIONS queue
     - If `actorId` exists: enqueue `emergency-contact-notify` job to NOTIFICATIONS queue
     - Enqueue `sla-monitor` DELAYED job to ESCALATION queue (`delay: DEFAULT_SLA_ACKNOWLEDGE_SECONDS * 1000`)
   - All queue.add() calls wrapped in try/catch — queue failure must NOT affect the returned incident

### Verify:
```bash
# After POST /v1/emergency-alerts/sos, check Redis for queued jobs:
docker exec agap-redis redis-cli KEYS "bull:*"
# Should show keys for sms, notifications, escalation queues
```

---

## SESSION 2 — SMS Processor: Textbee.dev API (GAP 1-A)
**Time estimate:** 30 min  
**Prerequisite:** SESSION 1 complete. `TEXTBEE_API_KEY` and `TEXTBEE_DEVICE_ID` set in `backend/.env`  
**Tests:** Trigger SOS → real SMS arrives at the configured ops-center number

### Files to modify:
1. **`backend/src/jobs/processors/sms.processor.ts`**
   - Install `axios` if not present: `pnpm --filter @agap/backend add axios`
   - Implement `process()`:
     ```
     POST https://api.textbee.dev/api/v1/gateway/devices/{TEXTBEE_DEVICE_ID}/send-sms
     headers: { 'x-api-key': TEXTBEE_API_KEY, 'Content-Type': 'application/json' }
     body: { recipients: [job.data.phone], message: job.data.message }
     ```
   - Validate message length ≤ 160 chars BEFORE sending — truncate with suffix `…` if over
   - On HTTP error: `this.logger.error(...)` — DO NOT throw (notification failure must never affect incident)
   - On success: log `SMS delivered to ${job.data.phone}, incidentId=${job.data.incidentId}`

2. **`backend/src/common/config/`** (or wherever config is loaded)
   - Ensure `TEXTBEE_API_KEY` and `TEXTBEE_DEVICE_ID` are exposed via `ConfigService`

### Env vars required:
```env
TEXTBEE_API_KEY=your_key_here
TEXTBEE_DEVICE_ID=your_device_id_from_textbee_dashboard
MDRRMO_OPS_PHONE=+639XXXXXXXXX
```

---

## SESSION 3 — Push Notification Processor: Firebase FCM (GAP 1-B)
**Time estimate:** 45 min  
**Prerequisite:** SESSION 1 complete. Firebase service account credentials in `.env`

### Files to modify:
1. **`backend/src/jobs/processors/notification.processor.ts`**
   - Install: `pnpm --filter @agap/backend add firebase-admin`
   - Initialize `firebase-admin` app once (check `getApps().length === 0` before init)
   - Credentials: `cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') })`
   - For `PUSH` channel:
     - Look up FCM token for `job.data.userId` from `system_configurations` table (key = `fcm_token_{userId}`)
     - Call `admin.messaging().send({ token, notification: { title, body }, data })`
   - For `SMS` channel: re-enqueue to SMS queue (delegate, don't call Semaphore directly)
   - For `IN_APP` channel: call `RealtimeService.emitToIncident()` or `emitToOps()`
   - Entire `process()` body inside `try/catch` — log errors, never propagate

### Env vars required:
```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## SESSION 4 — WebSocket Authentication Guard (GAP 5)
**Time estimate:** 30 min  
**Prerequisite:** None (standalone security fix)

### Files to create/modify:
1. **`backend/src/realtime/ws-jwt.guard.ts`** (NEW)
   - Implement `CanActivate` for WebSocket context
   - Extract token from `client.handshake.auth.token` OR `Authorization` header
   - Call `this.jwtService.verify(token)` — on failure throw `WsException('Unauthorized')`
   - On success: set `client.data.user = payload` (makes user available in message handlers)

2. **`backend/src/realtime/agap.gateway.ts`**
   - In `handleConnection()`: extract and verify JWT — call `client.disconnect()` on failure
   - In `@SubscribeMessage('join:incident')` handler:
     - Get `client.data.user`
     - If role is CITIZEN: verify `incidentId` belongs to this user (query DB)
     - If role is DISPATCHER+: allow
     - Else: emit error and return without joining
   - In `@SubscribeMessage('join:ops')` handler:
     - Verify role is `DISPATCHER`, `SUPERVISOR`, or `SYSTEM_ADMIN` — else reject

3. **`backend/src/realtime/realtime.module.ts`**
   - Ensure `JwtModule` is imported so `JwtService` is injectable in the guard

---

## SESSION 5 — Realtime Emits: Location + Dispatch (GAP 8, 9, 10)
**Time estimate:** 30 min  
**Prerequisite:** SESSION 4 (WS guard) recommended first

### Files to modify:
1. **`backend/src/locations/locations.service.ts`** — `track()` method
   - After `prisma.location_history.create()` succeeds:
     - Call `this.realtime.emitToIncident(RESOURCE_EVENTS.LOCATION_UPDATED, incidentId, payload)`
     - Enqueue `eta-refresh` job to ETA queue (add BullMQ queue injection to constructor)
   - Inject `RealtimeService` in constructor

2. **`backend/src/responders/responders.service.ts`** — `pushLocation()` method
   - After `prisma.location_history.create()` succeeds:
     - Call `this.realtime.emitToIncident(RESPONDER_EVENTS.LOCATION_UPDATED, incidentId, payload)`

3. **`backend/src/dispatch/dispatch.service.ts`** — `create()`, `cancel()`, `reassign()` methods
   - After each DB commit:
     - `create()` → `this.realtime.emitToIncident(DISPATCH_EVENTS.CREATED, incidentId, dispatch)`
     - `cancel()` → `this.realtime.emitToIncident(DISPATCH_EVENTS.CANCELLED, incidentId, dispatch)`
     - `reassign()` → `this.realtime.emitToIncident(DISPATCH_EVENTS.UPDATED, incidentId, dispatch)`
   - Inject `RealtimeService` in constructor

4. **`backend/src/locations/locations.module.ts`** and **`backend/src/responders/responders.module.ts`**
   - Import `RealtimeModule` if not already present

---

## SESSION 6 — SLA Monitor Processor (GAP 1-C)
**Time estimate:** 45 min  
**Prerequisite:** SESSION 1 (queue wiring), SESSION 4 (WS guard)

### Files to modify:
1. **`backend/src/jobs/processors/sla-monitor.processor.ts`**
   - Inject `PrismaService` and `RealtimeService`
   - In `process(job)`:
     1. Load `incident` by `job.data.incidentId`
     2. If incident not found or already in terminal status → return (stale job)
     3. Determine expected status based on `job.data.escalationType`:
        - `ACKNOWLEDGEMENT` → expect `status` to be past `SUBMITTED` 
        - `DISPATCH` → expect past `ACKNOWLEDGED`
        - `RESPONSE` → expect past `DISPATCHED`
     4. If incident has NOT progressed → create `escalation` record in DB:
        ```
        prisma.escalation.create({ data: { incident_id, type: escalationType, triggered_at: now, status: 'OPEN' } })
        ```
     5. Enqueue notification job for all `SUPERVISOR` users in the same organization
     6. Emit `escalation.created` WebSocket event via `RealtimeService.emitToOps()`
     7. Enqueue NEXT SLA tier job if applicable (DISPATCH threshold after ACKNOWLEDGEMENT misses)

2. **`backend/src/jobs/jobs.module.ts`**
   - Import `PrismaModule` and `RealtimeModule` so they're injectable in processors

---

## SESSION 7 — ETA Calculation: Real Routing API (GAP 3)
**Time estimate:** 60 min  
**Prerequisite:** SESSION 5 (location tracking emits)  
**Recommended map provider:** OSRM (free, self-hostable) or Google Maps Distance Matrix API

### Files to modify:
1. **`backend/src/locations/locations.service.ts`** — `getEta()` method
   - Replace stub with:
     1. Load `incident_locations` for `incidentId` (destination)
     2. Load active dispatch → resource → latest `location_history` row (origin)
     3. If either missing → return `{ eta_seconds: null, is_estimate: true }`
     4. Call `MAP_PROVIDER_ROUTING_URL`:
        - OSRM format: `GET {url}/route/v1/driving/{src_lng},{src_lat};{dst_lng},{dst_lat}?overview=false`
        - Parse `routes[0].duration` (seconds)
     5. Emit `RESPONDER_EVENTS.ETA_UPDATED` via RealtimeService
     6. Return `{ eta_seconds, is_estimate: true, estimated_arrival: new Date(now + eta_seconds*1000) }`
   - Wrap HTTP call in try/catch — on failure return `{ eta_seconds: null, is_estimate: true }`

2. **`backend/src/jobs/processors/`** — create `eta.processor.ts` (NEW)
   - Process `eta-refresh` jobs enqueued by SESSION 5
   - Calls `LocationsService.getEta(incidentId)` and emits result

### Env vars required:
```env
MAP_PROVIDER_ROUTING_URL=http://router.project-osrm.org
# OR for Google:
MAP_PROVIDER_ROUTING_URL=https://maps.googleapis.com/maps/api/distancematrix/json
MAP_PROVIDER_API_KEY=
```

---

## SESSION 8 — Reverse Geocoding (GAP 4)
**Time estimate:** 20 min  
**Prerequisite:** None

### Files to modify:
1. **`backend/src/locations/locations.service.ts`** — `geocode()` method
   - Call `MAP_PROVIDER_GEOCODING_URL` (Nominatim or Google):
     - Nominatim: `GET https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&accept-language=en`
     - Parse `address.suburb` or `address.village` → `address.city` → `address.state`
     - Format: `"{suburb}, Bocaue, Bulacan"` or best available
   - On failure: return `{ address: null, raw: null }` — never throw
   - Add `User-Agent` header for Nominatim (required by their ToS)

---

## SESSION 9 — Dispatch Contact Notification (GAP 2-B)
**Time estimate:** 20 min  
**Prerequisite:** SESSION 1, SESSION 3

### Files to modify:
1. **`backend/src/dispatch/dispatch.service.ts`** — `create()` method
   - After dispatch DB record created, enqueue to NOTIFICATIONS queue:
     - **Citizen push**: `{ userId: incident.reporter_user_id, channel: 'PUSH', title: 'Help is on the way', body: '...Ref: {ref}' }`
     - **Emergency contacts SMS**: `{ userId: incident.reporter_user_id, channel: 'EMERGENCY_CONTACTS', body: '...' }`
   - For `EMERGENCY_CONTACTS` channel in `notification.processor.ts`:
     - Load emergency contacts for `userId`
     - Enqueue one `SMS` job per contact

---

## SESSION 10 — Rate Limiting on Public Endpoints (GAP 7)
**Time estimate:** 20 min  
**Prerequisite:** None

### Files to modify:
1. **`backend/src/app.module.ts`**
   - Install if needed: `pnpm --filter @agap/backend add @nestjs/throttler`
   - Add to imports:
     ```typescript
     ThrottlerModule.forRoot([
       { name: 'burst', ttl: 1000, limit: 5 },
       { name: 'sustained', ttl: 60000, limit: 30 },
     ])
     ```

2. **`backend/src/auth/auth.controller.ts`**
   - Add `@UseGuards(ThrottlerGuard)` to: `register`, `login`, `forgotPassword`, `resetPassword`

3. **`backend/src/emergency-alerts/emergency-alerts.controller.ts`**
   - Add `@UseGuards(ThrottlerGuard)` to: `sos`, `shake`
   - Custom throttle: `@Throttle({ burst: { ttl: 1000, limit: 1 }, sustained: { ttl: 60000, limit: 5 } })`

---

## SESSION 11 — Media/File Upload: Object Storage (GAP 6)
**Time estimate:** 60 min  
**Prerequisite:** Object storage available (MinIO via Docker for dev)

### Files to modify:
1. **`backend/src/media/media.service.ts`**
   - Install: `pnpm --filter @agap/backend add @aws-sdk/client-s3 multer @types/multer`
   - Implement `uploadIncidentPhoto(file: Express.Multer.File, incidentId: string, userId: string)`:
     - Validate MIME type: `image/jpeg`, `image/png`, `image/webp`, `video/mp4` only
     - Validate size ≤ 10MB
     - Key: `incidents/{incidentId}/{uuid}.{ext}`
     - Call `S3Client.send(new PutObjectCommand({ Bucket, Key, Body: file.buffer, ContentType }))`
     - Save to `incident_attachments` table: `{ incident_id, url, file_name, mime_type, uploaded_by }`
     - Return attachment record

2. **`backend/src/incidents/incidents.controller.ts`** — `POST /:id/attachments`
   - Add `@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10_485_760 } }))`
   - Add `@UploadedFile() file: Express.Multer.File` parameter
   - Call `mediaService.uploadIncidentPhoto(file, id, user.sub)`

3. **`docker-compose.yml`** — add MinIO service for local dev:
   ```yaml
   minio:
     image: minio/minio
     command: server /data --console-address ":9001"
     ports: ["9000:9000", "9001:9001"]
     environment:
       MINIO_ROOT_USER: agap
       MINIO_ROOT_PASSWORD: agap_secret
   ```

### Env vars required:
```env
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_BUCKET=agap-media
STORAGE_ACCESS_KEY=agap
STORAGE_SECRET_KEY=agap_secret
```

---

## SESSION 12 — Announcements SMS Broadcast (GAP 2-C)
**Time estimate:** 30 min  
**Prerequisite:** SESSION 2 (SMS processor)

### Files to modify:
1. **`backend/src/announcements/announcements.module.ts`**
   - Add `BullModule.registerQueue({ name: QUEUE_NAMES.SMS })`

2. **`backend/src/announcements/announcements.service.ts`** — `publish()` method
   - After setting `status = 'PUBLISHED'` in DB:
     - Load all active subscribers from `announcement_subscriptions` table
     - For each subscriber: build SMS payload ≤ 160 chars:
       `AGAP ALERT: {title}. {body_truncated}. Reply STOP to unsubscribe.`
     - Enqueue one `emergency-sms` job per subscriber to SMS queue
     - Update `announcements.sms_sent_count` = subscriber count
   - Batch in chunks of 100 if subscriber count is large

---

## SESSION 13 — OTP Phone Login (login/phone stub)
**Time estimate:** 45 min  
**Prerequisite:** SESSION 2 (SMS processor for OTP delivery)

### Files to modify:
1. **`backend/src/auth/auth.service.ts`** — `loginPhone()` method
   - Currently returns `{ message: 'Phone login not yet enabled' }`
   - Replace with:
     1. Find user by `phone_number` — if not found return generic message (don't leak account existence)
     2. Generate 6-digit OTP via `generateOtp()`
     3. Save to `user_verifications` with `type: 'PHONE'`, `expires_at: now + 10min`
     4. Enqueue SMS job: `Your AGAP login code is {otp}. Expires in 10 minutes.`
     5. Return `{ message: 'OTP sent via SMS', userId: user.id }`
   - `POST /auth/verify/phone` already verifies OTP → call `login()` after verification to issue tokens

2. **`backend/src/auth/dto/login-phone.dto.ts`**
   - Ensure DTO has `phoneNumber` with PH regex validation (already exists, verify)

---

## SESSION 14 — Offline Sync Processor (GAP 1-F)
**Time estimate:** 45 min  
**Prerequisite:** All core sessions (1–5) complete

### Files to modify:
1. **`backend/src/jobs/processors/offline-sync.processor.ts`**
   - Inject `EmergencyAlertsService`, `IncidentsService`
   - In `process(job)`:
     - `job.data.events` = array of `{ client_event_id, type, payload }`
     - For each event:
       - `type === 'SOS'` → call `emergencyAlertsService.triggerSos(payload)` (dedup handled by `client_event_id`)
       - `type === 'LOCATION_UPDATE'` → call `locationsService.track(payload)`
       - `type === 'STATUS_UPDATE'` → call `incidentsService.updateStatus(payload)`
     - On per-event failure: log and continue — never abort the batch
     - Return `{ processed: n, failed: m }` summary

2. **`backend/src/offline-sync/offline-sync.service.ts`** — `flush()` method
   - Verify it enqueues an offline-sync job after storing events in DB

---

## SESSION 15 — Analytics Aggregation Cron (GAP 1-E)
**Time estimate:** 30 min  
**Prerequisite:** All incident data flowing (sessions 1–9)

### Files to modify:
1. **`backend/src/jobs/processors/analytics.processor.ts`**
   - Install if needed: `pnpm --filter @agap/backend add @nestjs/schedule`
   - Implement `process(job)` for `daily-summary` job type:
     - Aggregate `incident_events` from yesterday → calculate:
       - Avg time `SUBMITTED → ACKNOWLEDGED` per category
       - Avg time `DISPATCHED → ON_SCENE` per category
       - False alert count vs total
     - Upsert into `analytics_snapshots` table (if it exists) or log to audit
   - Low criticality: `analytics.service.ts` already computes on-demand from live tables

2. **`backend/src/jobs/jobs.module.ts`**
   - Register a `@Cron('0 1 * * *')` (1am daily) to enqueue the analytics job

---

## COMPLETION CHECKLIST

Mark each session as you finish it. All 15 sessions = full backend functionality.

| Session | Description | Status |
|---|---|---|
| SESSION 1 | Wire SOS/Shake to Job Queues | ⬜ |
| SESSION 2 | SMS Processor — Textbee.dev | ⬜ |
| SESSION 3 | Push Processor — Firebase FCM | ⬜ |
| SESSION 4 | WebSocket Auth Guard | ⬜ |
| SESSION 5 | Realtime Emits: Location + Dispatch | ⬜ |
| SESSION 6 | SLA Monitor Processor | ⬜ |
| SESSION 7 | ETA Calculation: Routing API | ⬜ |
| SESSION 8 | Reverse Geocoding | ⬜ |
| SESSION 9 | Dispatch Contact Notification | ⬜ |
| SESSION 10 | Rate Limiting on Public Endpoints | ⬜ |
| SESSION 11 | Media/File Upload: Object Storage | ⬜ |
| SESSION 12 | Announcements SMS Broadcast | ⬜ |
| SESSION 13 | OTP Phone Login | ⬜ |
| SESSION 14 | Offline Sync Processor | ⬜ |
| SESSION 15 | Analytics Aggregation Cron | ⬜ |

**After SESSION 1–5:** Core emergency pipeline works end-to-end (SOS → DB → SMS → Push → Live Map).  
**After SESSION 6–9:** Dispatch coordination loop complete (SLA escalation, ETA, contact notifications).  
**After SESSION 10–15:** Production hardening and MOD-17/19/53 feature completion.
