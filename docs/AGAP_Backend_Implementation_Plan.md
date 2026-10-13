# AGAP — Complete Backend Implementation Plan
## NestJS + Prisma + Swagger UI — All 53 Modules

**Baseline:** AGAP Complete Master Enterprise Architecture v2.0  
**Backend:** `backend/` — NestJS modular monolith, Node.js LTS  
**Database:** PostgreSQL + PostGIS via Prisma ORM  
**Jobs:** Redis + BullMQ  
**Realtime:** Socket.io (WebSocket)  
**API Docs:** Swagger UI at `http://localhost:3000/api/docs`

---

## Codebase Status (as of review)

### Already Complete — Do Not Rebuild
| File | Status |
|---|---|
| `backend/prisma/schema.prisma` | ✅ Full — all 50+ entities, PostGIS, indexes |
| `backend/src/main.ts` | ✅ Full — Swagger, Helmet, CORS, versioning, ValidationPipe, IoAdapter |
| `backend/src/auth/guards/jwt-auth.guard.ts` | ✅ Done |
| `backend/src/auth/guards/optional-jwt-auth.guard.ts` | ✅ Done |
| `backend/src/common/guards/roles.guard.ts` | ✅ Done |
| `backend/src/common/decorators/roles.decorator.ts` | ✅ Done |
| `backend/src/incidents/incidents.controller.ts` | ✅ 4 endpoints: POST, GET list, GET :id, PATCH :id/status |
| `backend/src/incidents/incidents.service.ts` | ✅ create, findAll, findById, updateStatus |
| `backend/src/auth/auth.controller.ts` | ⚠️ Only POST /auth/login — needs 7 more endpoints |
| `backend/src/realtime/agap.gateway.ts` | ⚠️ Basic — needs WS auth guard + full event emissions |
| `backend/src/jobs/processors/*.ts` (6 files) | ⚠️ Stubs only — all need full logic |
| All other controllers | ❌ Empty shells — full implementation needed |

### Swagger Config in `main.ts` — already adds tags:
`incidents`, `dispatch`, `responders`, `hospitals`, `announcements`, `auth`, `users`, `analytics`

**Add these missing tags** in `main.ts` DocumentBuilder:
```typescript
.addTag('alerts', 'Emergency alert triggering')
.addTag('locations', 'GPS and tracking')
.addTag('resources', 'Fleet and resource management')
.addTag('organizations', 'Organizations and registry')
.addTag('contacts', 'Emergency contacts')
.addTag('medical', 'Medical profiles')
.addTag('notifications', 'Push and SMS notifications')
.addTag('escalations', 'SLA and escalations')
.addTag('audit', 'Immutable audit trail')
.addTag('reports', 'Response analytics and reporting')
.addTag('administration', 'System administration')
.addTag('health', 'System health checks')
```

---

## Swagger/OpenAPI Decorator Strategy

Every controller file must follow this pattern:

```typescript
@ApiTags('tag-name')                        // group in Swagger UI
@Controller({ path: 'route', version: '1' })
export class XController {

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER)
  @ApiBearerAuth()                           // shows padlock in Swagger UI
  @ApiOperation({ summary: 'One-line description' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiQuery({ name: 'status', enum: IncidentStatus, required: false })
  @ApiResponse({ status: 200, description: 'Success', type: ResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(...) { ... }
}
```

Every DTO must have `@ApiProperty()` or `@ApiPropertyOptional()` on every field:

```typescript
export class CreateIncidentDto {
  @ApiProperty({ enum: IncidentType })
  @IsEnum(IncidentType)
  incident_type: IncidentType;

  @ApiPropertyOptional({ description: 'Latitude (-90 to 90)' })
  @IsOptional()
  @IsNumber()
  latitude?: number;
}
```

---

## Environment Variables (all required before first run)

```env
# Application
NODE_ENV=development
BACKEND_PORT=3000
BACKEND_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3001,exp://localhost:8081

# Database
DATABASE_URL=postgresql://agap:agap@localhost:5432/agap

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Firebase Cloud Messaging (MOD-16, MOD-18)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Semaphore SMS (MOD-17, MOD-53)
SEMAPHORE_API_KEY=
SEMAPHORE_SENDER_ID=AGAP

# Map provider (MOD-12, MOD-43)
MAP_PROVIDER_API_KEY=
MAP_PROVIDER_GEOCODING_URL=
MAP_PROVIDER_ROUTING_URL=

# Object storage — incident photos (MOD-10)
STORAGE_ENDPOINT=
STORAGE_BUCKET=agap-media
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=

# Bocaue operational constants
BOCAUE_RIVER_CRITICAL_LEVEL_METERS=11.50
DEFAULT_SLA_ACKNOWLEDGE_SECONDS=120
DEFAULT_SLA_DISPATCH_SECONDS=300
DEFAULT_SLA_ON_SCENE_SECONDS=900
DUPLICATE_DETECTION_RADIUS_METERS=200
DUPLICATE_DETECTION_WINDOW_MINUTES=5
SOS_CANCEL_WINDOW_SECONDS=3
```

---

## PHASE 0 — Foundation Wiring
**Goal:** Everything that every other module depends on. Verify these exist and work.

### 0-A. Prisma schema migration
```bash
cd backend
pnpm prisma migrate dev --name initial
pnpm prisma generate
```

### 0-B. Add `@Public()` decorator
Create `backend/src/common/decorators/public.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```
Update `JwtAuthGuard` to skip if `IS_PUBLIC_KEY` metadata is set.

### 0-C. Add `ThrottlerModule`
Install: `pnpm add @nestjs/throttler`
Add to `app.module.ts` imports with default 60-req / 60-sec limit.
Apply `ThrottlerGuard` to `POST /alerts/sos` and all auth endpoints.

### 0-D. Add `@nestjs/config` globally
Verify `ConfigModule.forRoot({ isGlobal: true })` is in `app.module.ts`.

### 0-E. Add BullMQ queues to `app.module.ts`
```typescript
BullModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    connection: { url: config.get('REDIS_URL') }
  }),
  inject: [ConfigService],
}),
```

---

## PHASE 1 — Identity, Auth, and Permissions
**Modules:** MOD-01, MOD-02, MOD-03, MOD-04, MOD-05, MOD-47, MOD-48

### 1-A. Auth Module — `POST /api/v1/auth/*`
**File:** `backend/src/auth/auth.controller.ts`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/v1/auth/register` | None | — | Register citizen account with phone/email |
| POST | `/api/v1/auth/register/guest` | None | — | Create guest session (no credentials) |
| POST | `/api/v1/auth/login` | Local Strategy | — | ✅ Already exists |
| POST | `/api/v1/auth/login/phone` | None | — | OTP-based phone login |
| POST | `/api/v1/auth/refresh` | None | — | Exchange refresh token for new access token |
| POST | `/api/v1/auth/logout` | JWT | Any | Invalidate refresh token |
| POST | `/api/v1/auth/verify/email` | None | — | Verify email with OTP code |
| POST | `/api/v1/auth/verify/phone` | None | — | Verify phone with OTP code |
| POST | `/api/v1/auth/forgot-password` | None | — | Request password reset email/SMS |
| POST | `/api/v1/auth/reset-password` | None | — | Reset password with token |
| POST | `/api/v1/auth/change-password` | JWT | Any | Change password (authenticated) |

**DTOs needed:** `RegisterDto`, `LoginPhoneDto`, `RefreshTokenDto`, `VerifyOtpDto`, `ForgotPasswordDto`, `ResetPasswordDto`, `ChangePasswordDto`

**Prisma entities used:** `users`, `user_sessions`, `user_verifications`

**Audit events emitted:** `USER_REGISTERED`, `USER_LOGIN`, `USER_LOGOUT`, `PASSWORD_RESET`

---

### 1-B. Users Module — `GET|PATCH /api/v1/users/*`
**File:** `backend/src/users/users.controller.ts`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/users/me` | JWT | Any | Get own full profile |
| PATCH | `/api/v1/users/me` | JWT | Any | Update own profile (name, barangay, language) |
| DELETE | `/api/v1/users/me` | JWT | Any | Request account deletion (soft delete) |
| GET | `/api/v1/users/me/readiness` | JWT | Any | MOD-05: Permission status (GPS, notifications, motion) |
| GET | `/api/v1/users/:id` | JWT | DISPATCHER+ | Get any user profile (ops center) |
| GET | `/api/v1/users` | JWT | SYSADMIN | List all users with filters |

**DTOs:** `UpdateProfileDto`, `ReadinessStatusDto`

**Prisma entities:** `users`

---

### 1-C. Emergency Contacts — `GET|POST|PATCH|DELETE /api/v1/contacts/*`
**Module:** MOD-02, `backend/src/emergency-contacts/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/contacts` | JWT | Any | List own emergency contacts |
| POST | `/api/v1/contacts` | JWT | Any | Add emergency contact |
| PATCH | `/api/v1/contacts/:id` | JWT | Any | Update contact |
| DELETE | `/api/v1/contacts/:id` | JWT | Any | Remove contact |
| PATCH | `/api/v1/contacts/:id/priority` | JWT | Any | Reorder contact priority |

**DTOs:** `CreateContactDto`, `UpdateContactDto`, `ReorderContactDto`

**Prisma entities:** `emergency_contacts`

**Trigger rule:** When incident is dispatched, `NotificationsService.notifyEmergencyContacts()` reads this table.

---

### 1-D. Medical Profiles — `GET|POST|PATCH /api/v1/medical-profiles/*`
**Module:** MOD-03, `backend/src/medical-profiles/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/medical-profiles/me` | JWT | CITIZEN | Get own medical profile |
| POST | `/api/v1/medical-profiles/me` | JWT | CITIZEN | Create medical profile (requires consent) |
| PATCH | `/api/v1/medical-profiles/me` | JWT | CITIZEN | Update medical profile |
| DELETE | `/api/v1/medical-profiles/me` | JWT | CITIZEN | Delete medical profile + revoke consent |
| GET | `/api/v1/medical-profiles/:userId` | JWT | RESPONDER, DISPATCHER | Access patient profile during active incident |
| POST | `/api/v1/consent` | JWT | CITIZEN | Grant medical data consent |
| DELETE | `/api/v1/consent` | JWT | CITIZEN | Revoke medical data consent |

**DTOs:** `CreateMedicalProfileDto`, `UpdateMedicalProfileDto`, `ConsentDto`

**Prisma entities:** `medical_profiles`, `consent_records`, `sensitive_data_access_log`

**Critical rule:** `GET /medical-profiles/:userId` must:
1. Verify a `ConsentRecord` exists for this user
2. Verify caller has an active dispatch assignment to an incident involving this user
3. Write a `sensitive_data_access_log` row
4. Emit `AuditLog` event `MEDICAL_PROFILE_ACCESSED`

---

### 1-E. Permissions Module — `GET /api/v1/permissions/*`
**Module:** MOD-47, `backend/src/permissions/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/permissions` | JWT | SYSADMIN | List all permissions |
| GET | `/api/v1/permissions/roles/:role` | JWT | ORG_ADMIN+ | Get permissions for a role |
| POST | `/api/v1/permissions/roles/:role` | JWT | SYSADMIN | Grant permission to role |
| DELETE | `/api/v1/permissions/roles/:role/:permission` | JWT | SYSADMIN | Revoke permission from role |

**Prisma entities:** `permissions`, `role_permissions`

---

## PHASE 2 — Emergency Alert Core
**Modules:** MOD-06, MOD-07, MOD-08, MOD-09, MOD-10, MOD-11, MOD-12, MOD-13, MOD-14, MOD-15, MOD-16, MOD-17, MOD-18, MOD-19, MOD-20

### 2-A. Emergency Alerts (SOS) — `POST /api/v1/alerts/*`
**Module:** MOD-06, MOD-07, MOD-08, `backend/src/emergency-alerts/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/v1/alerts/sos` | **None** | Guest OK | MOD-06: One-button SOS — creates incident, fires dual-path |
| POST | `/api/v1/alerts/shake` | **None** | Guest OK | MOD-07: Shake-to-alert trigger (same pipeline as SOS) |
| POST | `/api/v1/alerts/:id/cancel` | Optional JWT | Own | MOD-08: Cancel within 3-second window |
| GET | `/api/v1/alerts/:id/status` | Optional JWT | Own | MOD-14: Poll incident status (non-WS fallback) |

**`POST /api/v1/alerts/sos` — SOS DTO:**
```typescript
class SosAlertDto {
  @ApiPropertyOptional() client_event_id?: string;    // idempotency key
  @ApiPropertyOptional() latitude?: number;
  @ApiPropertyOptional() longitude?: number;
  @ApiPropertyOptional() accuracy_meters?: number;
  @ApiProperty({ enum: IncidentType }) incident_type: IncidentType;
  @ApiPropertyOptional({ enum: ConditionStatus }) condition?: ConditionStatus;
  @ApiPropertyOptional({ enum: BreathingStatus }) breathing_status?: BreathingStatus;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() reporter_name?: string;       // for guest
  @ApiPropertyOptional() reporter_phone?: string;      // for guest
  @ApiPropertyOptional() patient_is_reporter?: boolean;
  @ApiPropertyOptional() patient_name?: string;
  @ApiPropertyOptional() patient_is_unknown?: boolean;
}
```

**Service sequence (strictly in this order):**
1. Check `client_event_id` deduplication — if match found, return existing incident (HTTP 200 with `duplicate: true`)
2. Create `Incident` row in PostgreSQL — status: `SUBMITTED`
3. Create `IncidentReporter` row
4. Create `IncidentPatient` row
5. Create `IncidentLocation` row (if GPS provided)
6. Emit `incident.created` WebSocket event
7. **Enqueue BullMQ jobs** (after persistence): SMS job, push notification job, emergency contact job, SLA timer job
8. Return incident to client immediately — do not await background jobs

**SMS payload format** (must be < 160 chars):
```
AGAP|{ref}|{lat},{lng}|{unix_ts}|{type}|C:{Y/N}
```

**BullMQ jobs triggered:**
- `sms` queue: `emergency-sms` job → Semaphore API
- `push` queue: `ops-center-alert` job → FCM to all online dispatchers
- `contacts` queue: `emergency-contact-notify` job → SMS to registered contacts
- `sla` queue: `sla-monitor` job (delayed, fires at acknowledge threshold)

---

### 2-B. Incidents (additional endpoints) — extends existing controller
**Module:** MOD-09, MOD-10, MOD-14, MOD-15

Add to `incidents.controller.ts`:

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/v1/incidents` | Optional JWT | Guest OK | ✅ Exists — full incident form (MOD-09) |
| GET | `/api/v1/incidents` | JWT | DISPATCHER+ | ✅ Exists — ops center list |
| GET | `/api/v1/incidents/:id` | JWT | Any scoped | ✅ Exists — incident detail |
| PATCH | `/api/v1/incidents/:id/status` | JWT | DISPATCHER+ | ✅ Exists — status transition |
| POST | `/api/v1/incidents/:id/attachments` | JWT | Own/DISPATCHER | MOD-10: Upload incident photo (multipart/form-data) |
| GET | `/api/v1/incidents/:id/attachments` | JWT | Scoped | List incident attachments |
| GET | `/api/v1/incidents/:id/events` | JWT | Scoped | Get full incident event log / timeline |
| GET | `/api/v1/incidents/:id/timeline` | JWT | Scoped | MOD-22: Formatted timeline for citizen status screen |
| POST | `/api/v1/incidents/:id/false-alert` | JWT | DISPATCHER+ | MOD-08: Classify as false alert |
| POST | `/api/v1/incidents/:id/duplicate` | JWT | DISPATCHER+ | MOD-26: Mark as duplicate of another incident |
| PATCH | `/api/v1/incidents/:id/acknowledge` | JWT | DISPATCHER+ | Acknowledge alert (MOD-21) |
| PATCH | `/api/v1/incidents/:id/assess` | JWT | DISPATCHER+ | Triage/validate (MOD-25) |
| POST | `/api/v1/incidents/:id/resolution` | JWT | DISPATCHER+ | MOD-45: Resolve incident with outcome |
| POST | `/api/v1/incidents/:id/close` | JWT | DISPATCHER+ | MOD-45: Formal closure |
| GET | `/api/v1/incidents/:id/resolution` | JWT | Scoped | Get resolution record |
| POST | `/api/v1/incidents/:id/feedback` | JWT | CITIZEN own | MOD-45: Submit post-incident feedback rating |

**Prisma entities:** `incidents`, `incident_events`, `incident_attachments`, `false_alerts`, `incident_resolutions`, `feedback_ratings`

**WebSocket events emitted:**
- `incident.created` — on SOS/submission
- `incident.status_changed` — on every status transition
- `incident.escalated` — on escalation
- `incident.closed` — on closure

---

### 2-C. Locations and GPS — `GET|POST /api/v1/locations/*` and `/api/v1/tracking/*`
**Module:** MOD-11, MOD-12, MOD-13, `backend/src/locations/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/v1/locations/capture` | Optional JWT | Guest OK | MOD-11: Capture GPS for incident creation |
| POST | `/api/v1/locations/geocode` | JWT | Any | MOD-12: Reverse geocode lat/lng → address |
| POST | `/api/v1/locations/track` | JWT | RESPONDER | MOD-13: Push responder location update |
| GET | `/api/v1/tracking/:incidentId` | JWT | DISPATCHER+ | Live tracking for incident |
| GET | `/api/v1/tracking/:incidentId/eta` | JWT | Scoped | MOD-43: Current ETA for incident |
| GET | `/api/v1/tracking/:incidentId/responders` | JWT | DISPATCHER+ | All responder positions for incident |
| GET | `/api/v1/tracking/history/:resourceId` | JWT | DISPATCHER+ | Location history for a resource |

**WebSocket events emitted:**
- `resource.location_updated` — on each `POST /locations/track`
- `responder.eta_updated` — after ETA refresh job completes

**BullMQ jobs triggered:**
- `eta` queue: `eta-refresh` job on each location push

---

### 2-D. Offline Sync — `POST /api/v1/offline/*`
**Module:** MOD-19, `backend/src/offline-sync/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/v1/offline/sync` | Optional JWT | Guest OK | Flush queued offline events on reconnect |
| GET | `/api/v1/offline/status` | JWT | Any | Check if queued events are pending |

**Service logic for `POST /offline/sync`:**
1. Accept array of `OfflineEventDto` each with a `client_event_id`
2. For each event: check idempotency key → if already processed, skip silently
3. Process each unprocessed event through the same pipeline as live SOS
4. Return summary: `{ processed: N, duplicates: M, errors: [] }`

**DTOs:** `OfflineEventDto`, `SyncBatchDto`

---

### 2-E. Notifications — `GET|POST /api/v1/notifications/*`
**Module:** MOD-16, MOD-17, MOD-18, `backend/src/notifications/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/notifications` | JWT | Any | Get own notification history (paginated) |
| PATCH | `/api/v1/notifications/:id/read` | JWT | Any | Mark notification as read |
| PATCH | `/api/v1/notifications/read-all` | JWT | Any | Mark all as read |
| POST | `/api/v1/notifications/register-token` | JWT | Any | Register FCM device token |
| DELETE | `/api/v1/notifications/register-token` | JWT | Any | Unregister FCM device token |
| GET | `/api/v1/notifications/unread-count` | JWT | Any | Get unread count for badge |

**Prisma entities:** `notifications`, `notification_deliveries`

**Reliability rule:** Any failure in `sms.processor.ts` or `notification.processor.ts` must be caught, logged to `notification_deliveries` with status `FAILED`, and must never propagate to the incident record.

---

### 2-F. Realtime WebSocket Gateway — updates to `agap.gateway.ts`
**Module:** MOD-20

Current state: basic rooms, no authentication. Required changes:

1. Add `WsJwtAuthGuard` — verify Bearer token from WS handshake `auth.token`
2. Scope subscriptions by role:
   - `CITIZEN`: join room `incident:{incidentId}` (own incident only)
   - `DISPATCHER/SUPERVISOR`: join room `org:{orgId}:ops` (all org incidents)
   - `RESPONDER`: join room `incident:{incidentId}` (assigned incident)
   - `HOSPITAL_USER`: join room `hospital:{hospitalId}`
3. Add typed emit methods to `realtime.service.ts`:
   - `emitIncidentCreated(incident)` → `incident.created`
   - `emitStatusChanged(incidentId, status, timestamp)` → `incident.status_changed`
   - `emitResourceLocation(resourceId, lat, lng)` → `resource.location_updated`
   - `emitEtaUpdated(incidentId, eta)` → `responder.eta_updated`
   - `emitEscalation(escalation)` → `escalation.created`
   - `emitAnnouncementPublished(announcement)` → `announcement.published`

---

## PHASE 3 — Operations Center
**Modules:** MOD-21, MOD-22, MOD-23, MOD-24, MOD-25, MOD-26, MOD-27, MOD-28, MOD-29, MOD-30, MOD-31, MOD-32

### 3-A. Organizations and Resource Registry — `GET|POST|PATCH /api/v1/organizations/*`
**Module:** MOD-27, `backend/src/organizations/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/organizations` | JWT | DISPATCHER+ | List all organizations |
| GET | `/api/v1/organizations/:id` | JWT | DISPATCHER+ | Get organization detail |
| POST | `/api/v1/organizations` | JWT | SYSADMIN | Create organization |
| PATCH | `/api/v1/organizations/:id` | JWT | ORG_ADMIN, SYSADMIN | Update organization |
| GET | `/api/v1/organizations/:id/members` | JWT | ORG_ADMIN+ | List members |
| POST | `/api/v1/organizations/:id/members` | JWT | ORG_ADMIN+ | Add member |
| DELETE | `/api/v1/organizations/:id/members/:userId` | JWT | ORG_ADMIN+ | Remove member |

**Prisma entities:** `organizations`, `organization_memberships`

---

### 3-B. Resources — `GET|POST|PATCH /api/v1/resources/*`
**Module:** MOD-27, MOD-28, MOD-29, MOD-30, `backend/src/resources/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/resources` | JWT | DISPATCHER+ | List resources (filter: status, type, orgId) |
| GET | `/api/v1/resources/available` | JWT | DISPATCHER+ | MOD-28: Only AVAILABLE resources |
| GET | `/api/v1/resources/:id` | JWT | DISPATCHER+ | Resource detail with crew |
| POST | `/api/v1/resources` | JWT | ORG_ADMIN+ | Register new resource |
| PATCH | `/api/v1/resources/:id` | JWT | ORG_ADMIN+ | Update resource |
| PATCH | `/api/v1/resources/:id/status` | JWT | DISPATCHER, RESPONDER | Update resource operational status |
| POST | `/api/v1/resources/:id/capabilities` | JWT | ORG_ADMIN+ | MOD-29: Add capability |
| DELETE | `/api/v1/resources/:id/capabilities/:cap` | JWT | ORG_ADMIN+ | Remove capability |
| GET | `/api/v1/resources/recommend/:incidentId` | JWT | DISPATCHER+ | MOD-30: Get ranked resource recommendations |
| POST | `/api/v1/resources/request` | JWT | DISPATCHER+ | MOD-35: Request resource from another org |
| PATCH | `/api/v1/resources/request/:id/respond` | JWT | ORG_ADMIN+ | Accept/decline resource request |

**`GET /resources/recommend/:incidentId` response:**
```json
{
  "incidentId": "...",
  "required_capability": "BASIC_LIFE_SUPPORT",
  "recommendations": [
    {
      "resource_id": "...",
      "vehicle_name": "Ambulance 1",
      "distance_meters": 1200,
      "eta_seconds": 180,
      "status": "AVAILABLE",
      "match_score": 0.95
    }
  ]
}
```

**Prisma entities:** `resources`, `resource_capabilities`, `resource_status_log`, `resource_requests`

**WebSocket event:** `resource.status_changed` on status update

---

### 3-C. Fleet — `GET|POST|PATCH /api/v1/fleet/*`
**Module:** MOD-28, `backend/src/fleet/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/fleet` | JWT | DISPATCHER+ | List all vehicles with live status |
| GET | `/api/v1/fleet/:id` | JWT | DISPATCHER+ | Vehicle detail |
| POST | `/api/v1/fleet` | JWT | ORG_ADMIN+ | Register vehicle |
| PATCH | `/api/v1/fleet/:id` | JWT | ORG_ADMIN+ | Update vehicle |
| PATCH | `/api/v1/fleet/:id/activate` | JWT | ORG_ADMIN+ | Set vehicle active |
| PATCH | `/api/v1/fleet/:id/deactivate` | JWT | ORG_ADMIN+ | Set vehicle out-of-service |

**Prisma entities:** `vehicles`

---

### 3-D. Responders — `GET|PATCH /api/v1/responders/*`
**Module:** MOD-32, `backend/src/responders/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/responders` | JWT | DISPATCHER+ | List responders (filter: available, orgId) |
| GET | `/api/v1/responders/me/assignments` | JWT | RESPONDER | MOD-32: Get own current assignment |
| GET | `/api/v1/responders/assignments/:id` | JWT | RESPONDER, DISPATCHER+ | Assignment detail with incident info |
| POST | `/api/v1/responders/assignments/:id/accept` | JWT | RESPONDER | Accept dispatch assignment |
| POST | `/api/v1/responders/assignments/:id/decline` | JWT | RESPONDER | Decline with reason |
| PATCH | `/api/v1/responders/assignments/:id/status` | JWT | RESPONDER | Update status (EN_ROUTE, ON_SCENE, etc.) |
| POST | `/api/v1/responders/location` | JWT | RESPONDER | Push GPS location (fires ETA job + WS event) |

**Prisma entities:** `dispatches`, `dispatch_crew`, `location_history`

**WebSocket events emitted:**
- `responder.status_changed` on status update
- `responder.location_updated` on location push
- `responder.eta_updated` after ETA job

---

### 3-E. Dispatch — `GET|POST /api/v1/dispatch/*`
**Module:** MOD-24, MOD-25, MOD-31, `backend/src/dispatch/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/dispatch` | JWT | DISPATCHER+ | List all dispatches (filter: incidentId, status) |
| GET | `/api/v1/dispatch/:id` | JWT | DISPATCHER+, RESPONDER | Dispatch detail |
| POST | `/api/v1/dispatch` | JWT | DISPATCHER, SUPERVISOR | MOD-31: Authorize dispatch |
| PATCH | `/api/v1/dispatch/:id/cancel` | JWT | DISPATCHER, SUPERVISOR | Cancel dispatch |
| PATCH | `/api/v1/dispatch/:id/reassign` | JWT | DISPATCHER, SUPERVISOR | Reassign to different resource |
| POST | `/api/v1/dispatch/:id/crew` | JWT | DISPATCHER+ | Add crew member |
| DELETE | `/api/v1/dispatch/:id/crew/:userId` | JWT | DISPATCHER+ | Remove crew member |
| GET | `/api/v1/dispatch/priority/:incidentId` | JWT | DISPATCHER+ | MOD-24: Priority recommendation for incident |
| POST | `/api/v1/dispatch/triage/:incidentId` | JWT | DISPATCHER+ | MOD-25: Submit triage/assessment |
| POST | `/api/v1/dispatch/duplicates/:incidentId/merge` | JWT | DISPATCHER+ | MOD-26: Merge into master incident |

**`POST /api/v1/dispatch` — CreateDispatchDto:**
```typescript
class CreateDispatchDto {
  @ApiProperty() incident_id: string;
  @ApiProperty() resource_id: string;
  @ApiPropertyOptional() priority_override?: IncidentPriority;
  @ApiPropertyOptional() dispatcher_notes?: string;
  @ApiPropertyOptional() initial_crew_ids?: string[];
}
```

**Service sequence for dispatch creation:**
1. Verify incident status allows dispatch (`ASSESSED` or `DISPATCH_PENDING`)
2. Verify resource is `AVAILABLE`
3. Verify caller role is DISPATCHER or SUPERVISOR (system never dispatches autonomously)
4. Create `dispatches` row with `status: PENDING`
5. Update resource status to `DISPATCHED`
6. Update incident status to `DISPATCHED`
7. Emit `dispatch.created` WebSocket event
8. Enqueue `push` job to notify responder crew

**WebSocket events emitted:** `dispatch.created`, `dispatch.updated`, `dispatch.cancelled`

---

### 3-F. Escalations — `GET|POST /api/v1/escalations/*`
**Module:** MOD-41, `backend/src/dispatch/escalation/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/escalations` | JWT | SUPERVISOR+ | List escalations (filter: incidentId, level) |
| GET | `/api/v1/escalations/:id` | JWT | SUPERVISOR+ | Escalation detail |
| POST | `/api/v1/escalations/:id/acknowledge` | JWT | SUPERVISOR+ | Acknowledge escalation |
| POST | `/api/v1/escalations/:id/resolve` | JWT | SUPERVISOR+ | Mark escalation resolved |

**SLA timer processor** (`jobs/processors/sla-monitor.processor.ts`):
```
Every 30 seconds: scan incidents with status SUBMITTED/ACKNOWLEDGED/DISPATCHED
  For each incident:
    if (now - submitted_at > SLA_ACKNOWLEDGE) AND no acknowledgement → Level 1 escalation
    if (now - dispatched_at > SLA_DISPATCH) AND no responder en route → Level 2 escalation
    if (now - en_route_at > SLA_ON_SCENE) AND not on scene → Level 3 escalation
  For each new escalation:
    INSERT into escalations table
    emit escalation.created WebSocket event
    enqueue push notification to supervisor
    write AuditLog event
```

---

## PHASE 4 — Field Response and Coordination
**Modules:** MOD-33, MOD-34, MOD-35, MOD-36, MOD-37, MOD-38, MOD-39, MOD-40, MOD-42, MOD-43, MOD-44, MOD-45

### 4-A. Incident Messages (Secure Communication) — `/api/v1/incidents/:id/messages`
**Module:** MOD-33

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/incidents/:id/messages` | JWT | DISPATCHER+, RESPONDER assigned | Get thread |
| POST | `/api/v1/incidents/:id/messages` | JWT | DISPATCHER+, RESPONDER assigned | Send message |
| PATCH | `/api/v1/incidents/:id/messages/:msgId/read` | JWT | Scoped | Mark read |

**Prisma entities:** `incident_messages`, `message_reads`

---

### 4-B. Multi-Agency Coordination — `/api/v1/incidents/:id/agencies`
**Module:** MOD-34

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/incidents/:id/agencies` | JWT | DISPATCHER+ | List participating agencies |
| POST | `/api/v1/incidents/:id/agencies` | JWT | SUPERVISOR+ | Invite agency to incident |
| DELETE | `/api/v1/incidents/:id/agencies/:orgId` | JWT | SUPERVISOR+ | Remove agency participant |

---

### 4-C. ICS (Incident Command Structure) — `/api/v1/incidents/:id/ics`
**Module:** MOD-36

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/v1/incidents/:id/ics/activate` | JWT | SUPERVISOR+ | Activate ICS mode |
| GET | `/api/v1/incidents/:id/ics` | JWT | DISPATCHER+ | Get ICS structure |
| PATCH | `/api/v1/incidents/:id/ics` | JWT | SUPERVISOR+ | Update ICS structure |
| POST | `/api/v1/incidents/:id/ics/deactivate` | JWT | SUPERVISOR+ | Deactivate ICS |
| POST | `/api/v1/incidents/:id/ics/positions` | JWT | SUPERVISOR+ | Assign ICS position to user |
| DELETE | `/api/v1/incidents/:id/ics/positions/:posId` | JWT | SUPERVISOR+ | Relieve from position |

**Prisma entities:** `ics_assignments`

---

### 4-D. On-Scene Assessment — `/api/v1/incidents/:id/assessments`
**Module:** MOD-37

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/v1/incidents/:id/assessments` | JWT | RESPONDER | Submit on-scene assessment |
| GET | `/api/v1/incidents/:id/assessments` | JWT | DISPATCHER+, RESPONDER | List assessments |
| GET | `/api/v1/incidents/:id/assessments/:aId` | JWT | Scoped | Get single assessment |
| PATCH | `/api/v1/incidents/:id/assessments/:aId` | JWT | RESPONDER | Update assessment |

**Prisma entities:** `on_scene_assessments`

---

### 4-E. Hospitals and Facilities — `GET|POST /api/v1/hospitals/*` + `/api/v1/facilities/*`
**Module:** MOD-38, MOD-39

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/hospitals` | JWT | DISPATCHER+, RESPONDER | List hospitals |
| GET | `/api/v1/hospitals/nearby` | JWT | DISPATCHER+, RESPONDER | Nearest hospitals to GPS point |
| GET | `/api/v1/hospitals/:id` | JWT | Scoped | Hospital detail + capabilities |
| POST | `/api/v1/hospitals` | JWT | SYSADMIN | Register hospital |
| PATCH | `/api/v1/hospitals/:id` | JWT | ORG_ADMIN+ | Update hospital |
| POST | `/api/v1/hospitals/:id/referrals` | JWT | RESPONDER, DISPATCHER | MOD-38: Create pre-arrival referral |
| GET | `/api/v1/hospitals/:id/referrals` | JWT | HOSPITAL_USER, DISPATCHER+ | List incoming referrals |
| GET | `/api/v1/hospitals/referrals/:refId` | JWT | Scoped | Referral detail |
| PATCH | `/api/v1/hospitals/referrals/:refId/acknowledge` | JWT | HOSPITAL_USER | Acknowledge pre-arrival |
| PATCH | `/api/v1/hospitals/referrals/:refId/arrived` | JWT | HOSPITAL_USER, RESPONDER | Mark patient arrived |
| GET | `/api/v1/facilities` | JWT | DISPATCHER+ | List evacuation centers |
| GET | `/api/v1/facilities/:id` | JWT | DISPATCHER+ | Facility detail |
| POST | `/api/v1/facilities` | JWT | SYSADMIN | Register facility |
| PATCH | `/api/v1/facilities/:id/status` | JWT | DISPATCHER+ | Update capacity/status |

**Prisma entities:** `facilities`, `facility_capabilities`, `facility_referrals`

---

### 4-F. Transport Tracking — `/api/v1/dispatch/:id/transport`
**Module:** MOD-40

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/v1/dispatch/:id/transport` | JWT | RESPONDER | Start transport to facility |
| GET | `/api/v1/dispatch/:id/transport` | JWT | Scoped | Get transport record |
| PATCH | `/api/v1/dispatch/:id/transport/destination` | JWT | RESPONDER, DISPATCHER | Change destination facility |
| POST | `/api/v1/dispatch/:id/transport/arrived` | JWT | RESPONDER | Mark arrived at facility |
| POST | `/api/v1/dispatch/:id/transport/handover` | JWT | RESPONDER | Complete patient handover |

---

### 4-G. Incident Handover — `/api/v1/incidents/:id/handover`
**Module:** MOD-44

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | `/api/v1/incidents/:id/handover` | JWT | DISPATCHER, SUPERVISOR | Initiate handover to new dispatcher |
| GET | `/api/v1/incidents/:id/handover` | JWT | DISPATCHER+ | Get handover record |
| PATCH | `/api/v1/incidents/:id/handover/acknowledge` | JWT | DISPATCHER+ | New dispatcher acknowledges |

**Prisma entities:** `incident_handovers`

---

### 4-H. User-Facing Status — `GET /api/v1/incidents/:id/status`
**Module:** MOD-42

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/incidents/:id/status` | Optional JWT | Own (guest by token) | MOD-42: Simplified status for citizen status screen |

Response shape:
```json
{
  "incident_reference": "INC-2026-001234",
  "status": "EN_ROUTE",
  "status_label": "Help is on the way",
  "eta_seconds": 240,
  "eta_is_estimate": true,
  "responder_name": "Unit 2 - Ambulance",
  "progress_steps": [
    { "label": "Alert Received", "completed": true, "timestamp": "..." },
    { "label": "Help Dispatched", "completed": true, "timestamp": "..." },
    { "label": "En Route", "completed": true, "timestamp": "..." },
    { "label": "Arrived", "completed": false, "timestamp": null }
  ]
}
```

---

## PHASE 5 — Governance, Analytics, Surge, and Broadcast
**Modules:** MOD-46, MOD-47, MOD-48, MOD-49, MOD-50, MOD-51, MOD-52, MOD-53

### 5-A. Audit Trail — `GET /api/v1/audit/*`
**Module:** MOD-46, `backend/src/audit/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/audit` | JWT | SUPERVISOR+ | List audit logs (filter: actorId, action, entityType) |
| GET | `/api/v1/audit/:id` | JWT | SUPERVISOR+ | Single audit log entry |
| GET | `/api/v1/audit/incidents/:incidentId` | JWT | DISPATCHER+ | All audit events for incident |

**Critical rule:** `AuditService.log()` is INSERT-only. There must be no `update()` or `delete()` methods on this service. Audit logs are immutable.

**AuditLog event types to define in `shared/src/enums/audit-action.ts`:**
```
USER_REGISTERED, USER_LOGIN, USER_LOGOUT, PASSWORD_RESET
INCIDENT_CREATED, INCIDENT_STATUS_CHANGED, INCIDENT_CLOSED
DISPATCH_AUTHORIZED, DISPATCH_CANCELLED
MEDICAL_PROFILE_ACCESSED, CONSENT_GRANTED, CONSENT_REVOKED
ESCALATION_CREATED, ESCALATION_ACKNOWLEDGED
ANNOUNCEMENT_PUBLISHED
ADMIN_USER_ROLE_CHANGED, ADMIN_USER_DEACTIVATED
```

---

### 5-B. Privacy — `GET /api/v1/privacy/*`
**Module:** MOD-48, `backend/src/privacy/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/privacy/access-log` | JWT | CITIZEN own | List who accessed own sensitive data |
| GET | `/api/v1/privacy/export` | JWT | CITIZEN own | Export all own personal data (GDPR-style) |

---

### 5-C. Administration — `GET|POST|PATCH /api/v1/admin/*`
**Module:** MOD-49, `backend/src/administration/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/admin/users` | JWT | SYSADMIN | List all users with role filter |
| PATCH | `/api/v1/admin/users/:id/role` | JWT | SYSADMIN | Change user role |
| PATCH | `/api/v1/admin/users/:id/activate` | JWT | SYSADMIN | Activate account |
| PATCH | `/api/v1/admin/users/:id/deactivate` | JWT | SYSADMIN | Deactivate account |
| DELETE | `/api/v1/admin/users/:id` | JWT | SYSADMIN | Hard delete user |
| GET | `/api/v1/admin/config` | JWT | SYSADMIN | List system configurations |
| PUT | `/api/v1/admin/config/:key` | JWT | SYSADMIN | Upsert configuration value |
| GET | `/api/v1/admin/health` | JWT | SYSADMIN | System health report |
| GET | `/api/v1/health` | **None** | — | MOD-49: Public health check (DB, Redis, queues) |

---

### 5-D. Analytics and Reporting — `GET /api/v1/analytics/*` and `/api/v1/reports/*`
**Module:** MOD-50, `backend/src/analytics/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/analytics/response-times` | JWT | SUPERVISOR+ | Avg response time metrics (by type, date range) |
| GET | `/api/v1/analytics/volume` | JWT | SUPERVISOR+ | Incident volume by category / barangay / time |
| GET | `/api/v1/analytics/sla-compliance` | JWT | SUPERVISOR+ | SLA breach analysis |
| GET | `/api/v1/analytics/false-alert-rate` | JWT | SUPERVISOR+ | False alert trends |
| GET | `/api/v1/analytics/resource-utilization` | JWT | SUPERVISOR+ | Resource deployment frequency |
| GET | `/api/v1/reports/incidents/:id/timeline` | JWT | DISPATCHER+ | Auto-compiled per-incident timeline |
| GET | `/api/v1/reports/daily` | JWT | SUPERVISOR+ | Daily summary report |

---

### 5-E. Risk Intelligence — `GET|POST /api/v1/risk/*`
**Module:** MOD-51, `backend/src/risk-intelligence/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/risk/heatmap` | JWT | DISPATCHER+ | Incident density heatmap (PostGIS clusters) |
| GET | `/api/v1/risk/flood-zones` | JWT | DISPATCHER+ | Bocaue flood zone overlay with current status |
| GET | `/api/v1/risk/areas` | JWT | DISPATCHER+ | List defined risk areas |
| POST | `/api/v1/risk/areas` | JWT | SYSADMIN | Create risk area |
| PATCH | `/api/v1/risk/areas/:id` | JWT | SYSADMIN | Update risk area |
| DELETE | `/api/v1/risk/areas/:id` | JWT | SYSADMIN | Remove risk area |
| GET | `/api/v1/risk/patterns` | JWT | SUPERVISOR+ | Seasonal trend analysis |

**Prisma entities:** `risk_areas` (with PostGIS geometry column)

---

### 5-F. Disaster Surge Mode — `GET|POST /api/v1/surge/*`
**Module:** MOD-52, `backend/src/disaster-mode/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/surge/status` | JWT | DISPATCHER+ | Current surge mode status |
| POST | `/api/v1/surge/activate` | JWT | SUPERVISOR+ | Activate disaster/surge mode |
| POST | `/api/v1/surge/deactivate` | JWT | SUPERVISOR+ | Deactivate surge mode |
| POST | `/api/v1/surge/incidents` | JWT | SUPERVISOR+ | Link incident to surge event |
| POST | `/api/v1/surge/triage` | JWT | RESPONDER | Submit START triage tag |
| GET | `/api/v1/surge/triage` | JWT | DISPATCHER+ | List all triage tags for surge |
| PATCH | `/api/v1/surge/triage/:tagId` | JWT | RESPONDER | Update triage tag |
| GET | `/api/v1/surge/resources` | JWT | DISPATCHER+ | All available resources across all orgs |
| POST | `/api/v1/surge/broadcast` | JWT | SUPERVISOR+ | Send surge broadcast to all responders |

**Triage tag values (START protocol):** `IMMEDIATE (RED)`, `DELAYED (YELLOW)`, `MINOR (GREEN)`, `DECEASED (BLACK)`

**WebSocket events emitted:** `surge.activated`, `surge.deactivated`

**Prisma entities:** `surge_events`, `surge_incidents`, `triage_tags`

---

### 5-G. Announcements (MOD-53) — `GET|POST|PATCH /api/v1/announcements/*`
**Module:** MOD-53, `backend/src/announcements/`

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | `/api/v1/announcements` | **None** | Public | MOD-53: Public feed (no login required) |
| GET | `/api/v1/announcements/:id` | **None** | Public | Single announcement detail |
| POST | `/api/v1/announcements` | JWT | ANNOUNCEMENTS_PUBLISHER+ | Create draft announcement |
| PATCH | `/api/v1/announcements/:id` | JWT | PUBLISHER+ | Update draft |
| POST | `/api/v1/announcements/:id/publish` | JWT | PUBLISHER+ | Publish immediately → fires SMS + push jobs |
| POST | `/api/v1/announcements/:id/schedule` | JWT | PUBLISHER+ | Schedule for future datetime |
| POST | `/api/v1/announcements/:id/archive` | JWT | PUBLISHER+ | Archive announcement |
| POST | `/api/v1/announcements/:id/supersede` | JWT | PUBLISHER+ | Supersede with a new announcement |
| GET | `/api/v1/announcements/:id/delivery` | JWT | PUBLISHER+ | Delivery stats (sent, delivered, failed) |
| POST | `/api/v1/announcements/subscribe` | **None** | Public | MOD-53: Subscribe phone to SMS announcements |
| POST | `/api/v1/announcements/unsubscribe` | **None** | Public | Opt-out (or reply STOP via SMS) |

**`POST /announcements` — CreateAnnouncementDto:**
```typescript
class CreateAnnouncementDto {
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiProperty({ enum: AnnouncementCategory }) category: AnnouncementCategory;
  @ApiProperty({ enum: AnnouncementSeverity }) severity: AnnouncementSeverity;
  @ApiProperty({ enum: ['MUNICIPALITY_WIDE', 'BARANGAY_SPECIFIC'] }) scope_type: string;
  @ApiPropertyOptional({ type: [String] }) target_barangays?: string[];
  @ApiPropertyOptional() scheduled_at?: Date;
}
```

**BullMQ jobs triggered on publish:**
- `announcements` queue: `announcement-sms-broadcast` job → Semaphore batch SMS to all `sms_subscribers` in scope
- `announcements` queue: `announcement-push-broadcast` job → FCM to all registered users in scope

**WebSocket event emitted:** `announcement.published`

**Critical rule:** MOD-53 is one-way broadcast only. This controller must never trigger dispatch or incident creation.

**Prisma entities:** `announcements`, `sms_subscribers`, `announcement_deliveries`

---

## BullMQ Processors — Full Implementation Requirements

**File:** `backend/src/jobs/processors/`

### `sms.processor.ts`
Handles queues: `sms` (emergency SMS), announcements SMS batch
```
- Call Semaphore API: POST /messages
- On success: update notification_deliveries.status = DELIVERED
- On failure: log to notification_deliveries.status = FAILED
               retry up to 3 times with exponential backoff
               NEVER throw — never cancel incident on failure
```

### `notification.processor.ts`
Handles: `push` queue (FCM)
```
- Call Firebase Admin SDK: messaging().send()
- On failure: log, retry, NEVER propagate to incident
```

### `sla-monitor.processor.ts`
Handles: repeating job every 30 seconds
```
- Query incidents WHERE status IN [SUBMITTED, ACKNOWLEDGED, DISPATCHED, EN_ROUTE]
  AND NOT closed
- For each: compare timestamps against system_configurations thresholds
- Create Escalation rows for any breach
- Emit escalation.created via RealtimeService
- Enqueue push notification to supervisor
```

### `eta-refresh.processor.ts`
Handles: `eta` queue on each responder location update
```
- Accept: { dispatch_id, responder_lat, responder_lng, incident_lat, incident_lng }
- Call map routing API
- Update dispatches.estimated_arrival_at
- Emit responder.eta_updated via RealtimeService with { eta_seconds, is_estimate: true }
```

### `offline-sync.processor.ts`
Handles: `offline` queue on reconnect
```
- Accept: OfflineEventDto[]
- For each event: check idempotency key in offline_event_queue
- If already processed: mark status=DUPLICATE, skip
- If new: process through same pipeline as live SOS
- Return sync result
```

### `analytics.processor.ts`
Handles: `analytics` queue on incident close
```
- Compute all timing metrics for incident_metrics table
- Upsert incident_metrics row
```

### `escalation.processor.ts`
Handles: escalation notification delivery
```
- Accept: { escalation_id, level, incident_id }
- Push notification to relevant supervisors by level
- Level 1 → DISPATCHER supervisor
- Level 2 → SUPERVISOR
- Level 3 → SYSADMIN + SUPERVISOR
```

---

## Seed Data Required

**File:** `backend/prisma/seed/`

```typescript
// 1. roles.seed.ts — seed permissions table
const permissions = ['incident.create', 'incident.acknowledge', 'incident.close',
  'dispatch.create', 'dispatch.cancel', 'resource.manage', 'announcement.publish', ...]

// 2. organizations.seed.ts — seed Bocaue MDRRMO and BFP
{ name: 'Bocaue MDRRMO', type: 'MDRRMO', municipality: 'Bocaue' }
{ name: 'Bocaue BFP', type: 'BFP', municipality: 'Bocaue' }

// 3. resources.seed.ts — sample fleet
{ name: 'Ambulance 1', type: 'AMBULANCE', status: 'AVAILABLE' }
{ name: 'Rescue Boat 1', type: 'RESCUE_BOAT', status: 'AVAILABLE' }
{ name: 'BFP Truck 1', type: 'FIRE_TRUCK', status: 'AVAILABLE' }

// 4. hospitals.seed.ts — nearby facilities
{ name: 'Our Lady of Loreto Hospital', barangay: 'Turo', municipality: 'Bocaue' }
{ name: 'Bocaue District Hospital', municipality: 'Bocaue' }

// 5. system-config.seed.ts — operational constants
{ key: 'SOS_CANCEL_WINDOW_SECONDS', value: '3' }
{ key: 'DEFAULT_SLA_ACKNOWLEDGE_SECONDS', value: '120' }
{ key: 'DEFAULT_SLA_DISPATCH_SECONDS', value: '300' }
{ key: 'DEFAULT_SLA_ON_SCENE_SECONDS', value: '900' }
{ key: 'DUPLICATE_DETECTION_RADIUS_METERS', value: '200' }
{ key: 'BOCAUE_RIVER_CRITICAL_LEVEL_METERS', value: '11.50' }
```

---

## Implementation Checklist (numbered, in sequence)

### Foundation
- [ ] 1. Add `@Public()` decorator at `backend/src/common/decorators/public.decorator.ts`; update `JwtAuthGuard` to respect it
- [ ] 2. Install and configure `@nestjs/throttler`; apply to auth endpoints and SOS endpoint
- [ ] 3. Add missing Swagger tags to `main.ts` DocumentBuilder
- [ ] 4. Run `pnpm prisma migrate dev --name initial` — confirm schema applies cleanly
- [ ] 5. Run `pnpm prisma generate` — confirm Prisma client generated
- [ ] 6. Run `pnpm prisma db seed` — confirm seed data loads (after writing seed files)
- [ ] 7. Add BullMQ `forRootAsync` to `app.module.ts`

### Auth Module
- [ ] 8. Write `RegisterDto`, `LoginPhoneDto`, `RefreshTokenDto`, `VerifyOtpDto`, `ForgotPasswordDto`, `ResetPasswordDto`, `ChangePasswordDto` with `@ApiProperty()`
- [ ] 9. Implement `AuthService.register()` — hash password, create user, send verification OTP
- [ ] 10. Implement `AuthService.registerGuest()` — create is_guest user, return short-lived token
- [ ] 11. Implement `AuthService.refreshToken()` — validate refresh token, rotate
- [ ] 12. Implement `AuthService.logout()` — invalidate session
- [ ] 13. Implement `AuthService.verifyPhone()` + `AuthService.verifyEmail()` — OTP check
- [ ] 14. Implement `AuthService.forgotPassword()` + `resetPassword()` — token-based reset
- [ ] 15. Add all 10 auth endpoints to `auth.controller.ts` with full Swagger decorators

### Users, Contacts, Medical
- [ ] 16. Implement `UsersService.findMe()`, `updateMe()`, `deleteMe()`, `getReadiness()`
- [ ] 17. Implement `UsersService.findById()`, `findAll()` (admin)
- [ ] 18. Add all 6 users endpoints to `users.controller.ts`
- [ ] 19. Implement full `EmergencyContactsService` (CRUD + reorder)
- [ ] 20. Add all 5 contacts endpoints to `emergency-contacts.controller.ts`
- [ ] 21. Implement `ConsentService.grantConsent()`, `revokeConsent()`, `checkConsent()`
- [ ] 22. Implement `MedicalProfilesService.create()`, `findMine()`, `update()`, `delete()`, `findForResponder()` (with consent check + access log)
- [ ] 23. Add all 7 medical profile endpoints to `medical-profiles.controller.ts`

### Emergency Alert Core
- [ ] 24. Write `SosAlertDto` with full `@ApiProperty()` annotations
- [ ] 25. Implement idempotency check in `EmergencyAlertsService` using `client_event_id`
- [ ] 26. Implement `EmergencyAlertsService.createFromSos()` — strict sequence: persist → WebSocket → enqueue jobs
- [ ] 27. Implement `EmergencyAlertsService.cancel()` — enforce 3-second window
- [ ] 28. Add `POST /alerts/sos`, `POST /alerts/shake`, `POST /alerts/:id/cancel`, `GET /alerts/:id/status` to controller with `@Public()` / `OptionalJwtAuthGuard`
- [ ] 29. Add incident attachment endpoints to `incidents.controller.ts` (upload photo via multipart)
- [ ] 30. Add incident events/timeline endpoints to `incidents.controller.ts`
- [ ] 31. Implement `FalseAlertsService.classify()` and add `POST /incidents/:id/false-alert`
- [ ] 32. Add `POST /incidents/:id/acknowledge`, `POST /incidents/:id/assess` to incidents controller
- [ ] 33. Add resolution + closure + feedback endpoints to incidents controller

### Locations and GPS
- [ ] 34. Implement `LocationsService.capture()` — accept GPS, persist to `incident_locations`
- [ ] 35. Implement `LocationsService.reverseGeocode()` — call map provider API
- [ ] 36. Implement `LocationsService.trackResponder()` — persist to `location_history`, emit WS, enqueue ETA job
- [ ] 37. Add all 7 location/tracking endpoints to `locations.controller.ts`

### Offline Sync
- [ ] 38. Implement `OfflineSyncService.syncBatch()` — idempotency check per event, batch process
- [ ] 39. Add `POST /offline/sync`, `GET /offline/status` to `offline-sync.controller.ts`

### Notifications
- [ ] 40. Implement `NotificationsService.findAll()`, `markRead()`, `markAllRead()`, `registerToken()`, `unregisterToken()`, `getUnreadCount()`
- [ ] 41. Add all 6 notification endpoints to `notifications.controller.ts`
- [ ] 42. Fully implement `sms.processor.ts` — Semaphore integration, retry, failure logging
- [ ] 43. Fully implement `notification.processor.ts` — FCM integration, retry, failure logging

### Realtime WebSocket
- [ ] 44. Create `WsJwtAuthGuard` at `backend/src/realtime/ws-jwt-auth.guard.ts`
- [ ] 45. Update `agap.gateway.ts` to authenticate WS connections using the guard
- [ ] 46. Implement role-scoped room joins in gateway
- [ ] 47. Add all typed emit methods to `realtime.service.ts`

### Organizations and Resources
- [ ] 48. Implement full `OrganizationsService` (CRUD + member management)
- [ ] 49. Add all 7 organizations endpoints to controller
- [ ] 50. Implement `ResourcesService` — CRUD, status update, capability management
- [ ] 51. Implement `ResourceMatchingService.recommend()` — PostGIS distance + capability scoring
- [ ] 52. Add all 11 resources endpoints including recommendation endpoint
- [ ] 53. Implement full `FleetService` (vehicles CRUD)
- [ ] 54. Add all 6 fleet endpoints to controller
- [ ] 55. Implement full `RespondersService` — assignments, accept/decline, status, location push
- [ ] 56. Add all 7 responders endpoints to controller

### Dispatch
- [ ] 57. Implement `PriorityService.recommend()` — score incident → return priority recommendation
- [ ] 58. Implement `TriageService.submitTriage()` — validate assessment data, compute capability needs
- [ ] 59. Implement `DuplicateDetectionService` — PostGIS radius + time window query
- [ ] 60. Implement `AssignmentService.createDispatch()` — validate resource, update both resource + incident, enforce human authorization rule
- [ ] 61. Implement `DispatchService` orchestrating all sub-services
- [ ] 62. Add all 10 dispatch endpoints to `dispatch.controller.ts`

### Escalations and SLA
- [ ] 63. Implement `EscalationService` — acknowledge, resolve, list
- [ ] 64. Add escalation controller with 4 endpoints
- [ ] 65. Fully implement `sla-monitor.processor.ts` — scheduled job, threshold checks, create escalations, emit WS, notify supervisor

### Field Response
- [ ] 66. Implement incident messages service + controller (3 endpoints)
- [ ] 67. Implement multi-agency coordination endpoints (3)
- [ ] 68. Implement ICS service + controller (6 endpoints)
- [ ] 69. Implement on-scene assessment service + controller (4 endpoints)
- [ ] 70. Implement full `FacilitiesService` — CRUD, capabilities, receiving, nearby (PostGIS), referrals
- [ ] 71. Add all facility and hospital endpoints to controllers
- [ ] 72. Implement transport tracking service + add endpoints
- [ ] 73. Implement incident handover service + controller
- [ ] 74. Implement `IncidentClosureService.resolve()`, `close()`, `getFeedback()` + `submitFeedback()`
- [ ] 75. Implement `MOD-42` user-facing status endpoint with progress steps shape

### ETA Jobs
- [ ] 76. Fully implement `eta-refresh.processor.ts` — map routing API call, update DB, emit WS

### Governance
- [ ] 77. Implement `AuditService.log()` (INSERT-only) + read endpoints — verify no update/delete methods exist
- [ ] 78. Add all 3 audit endpoints to controller
- [ ] 79. Wire `AuditService.log()` into: auth, incidents, dispatch, medical-profiles, administration, announcements
- [ ] 80. Implement `PrivacyService` — access log, data export
- [ ] 81. Add 2 privacy endpoints to controller
- [ ] 82. Implement full `AdministrationService` + 10 admin endpoints
- [ ] 83. Add `GET /api/v1/health` public endpoint

### Analytics and Intelligence
- [ ] 84. Implement `AnalyticsService` — 7 aggregate query methods
- [ ] 85. Add all 7 analytics endpoints to controller
- [ ] 86. Fully implement `analytics.processor.ts` — compute incident_metrics on close
- [ ] 87. Implement `RiskIntelligenceService` — PostGIS heatmap, flood zone, risk areas CRUD
- [ ] 88. Add all 7 risk intelligence endpoints

### Surge Mode
- [ ] 89. Implement full `DisasterModeService` — activate/deactivate, link incidents, START triage, broadcast
- [ ] 90. Add all 9 surge endpoints
- [ ] 91. Emit `surge.activated` / `surge.deactivated` WS events via RealtimeService

### Announcements (MOD-53)
- [ ] 92. Write `CreateAnnouncementDto`, `SmsSubscribeDto` with full `@ApiProperty()`
- [ ] 93. Implement full `AnnouncementsService` — draft, publish, schedule, archive, supersede, subscribe/unsubscribe, delivery stats
- [ ] 94. Add all 11 announcement endpoints — mark public ones with `@Public()`
- [ ] 95. Add announcement SMS broadcast path to `sms.processor.ts`
- [ ] 96. Create `announcement-push.processor.ts` for FCM announcement broadcast
- [ ] 97. Emit `announcement.published` WS event via RealtimeService

### Jobs Wiring
- [ ] 98. Register all BullMQ queues in `jobs.module.ts`: `sms`, `push`, `contacts`, `sla`, `eta`, `offline`, `analytics`, `audit`, `announcements`
- [ ] 99. Register all processors in `jobs.module.ts`
- [ ] 100. Verify `JobsModule` is imported in `app.module.ts`

### Seed Data
- [ ] 101. Write `roles.seed.ts` — permissions catalog
- [ ] 102. Write `role-permissions.seed.ts` — map roles to permissions
- [ ] 103. Write `organizations.seed.ts` — Bocaue MDRRMO + BFP
- [ ] 104. Write `resources.seed.ts` — sample ambulances, rescue boats, fire trucks
- [ ] 105. Write `hospitals.seed.ts` — nearby hospitals and evacuation centers
- [ ] 106. Write `system-config.seed.ts` — all operational constants
- [ ] 107. Orchestrate all seeds in `prisma/seed.ts`
- [ ] 108. Run `pnpm prisma db seed` — confirm all data loads

### Final Verification
- [ ] 109. `pnpm prisma migrate dev` — clean migration
- [ ] 110. `pnpm build` — no TypeScript errors
- [ ] 111. `pnpm test` — all unit tests pass
- [ ] 112. Start server: `pnpm start:dev`
- [ ] 113. Open `http://localhost:3000/api/docs` — verify all tags, all endpoints, all Swagger schemas visible
- [ ] 114. Test SOS flow: `POST /api/v1/alerts/sos` (no auth) → verify incident created in DB → verify WS event
- [ ] 115. Test dispatch flow: acknowledge → assess → dispatch → responder accept → en route → ETA → arrive → close
- [ ] 116. Test MOD-53: `GET /api/v1/announcements` (no auth) → `POST /api/v1/announcements/subscribe` (no auth)
- [ ] 117. Verify audit logs written for all key actions
- [ ] 118. Verify notification failure does not affect incident (kill SMS mock, confirm incident survives)
- [ ] 119. Test idempotency: send same `client_event_id` twice → confirm only one incident created

---

## Swagger UI Expected Result

When complete, `http://localhost:3000/api/docs` should show these tag groups:

| Tag | Endpoint Count | Key endpoints |
|---|---|---|
| auth | 11 | register, login, refresh, logout, verify |
| alerts | 4 | SOS (no auth), shake (no auth), cancel, status |
| incidents | 16+ | create, list, detail, status, attachments, timeline, assess, close |
| locations | 7 | capture, geocode, track, tracking, ETA |
| dispatch | 10 | create dispatch, cancel, reassign, triage, recommend, priority |
| responders | 7 | list, assignments, accept, decline, status, location |
| resources | 11 | list, available, recommend, create, capabilities |
| fleet | 6 | list vehicles, CRUD |
| organizations | 7 | list, CRUD, members |
| hospitals | 11 | list, nearby, referrals, receiving |
| notifications | 6 | list, read, register token |
| escalations | 4 | list, acknowledge, resolve |
| announcements | 11 | public feed (no auth), subscribe (no auth), create, publish, stats |
| analytics | 7 | response times, volume, SLA, false alerts |
| audit | 3 | list, detail, by incident |
| administration | 10 | users, roles, config, health |
| health | 1 | public health check |

**Total endpoints: ~130**

---

*Plan baseline: AGAP Complete Master Enterprise Architecture v2.0 — 53 modules*  
*Generated for: Bocaue MDRRMO / LGU Operations Center implementation*
