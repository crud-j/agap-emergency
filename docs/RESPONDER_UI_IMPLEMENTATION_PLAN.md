# AGAP Responder UI Implementation Plan

## 1. Executive summary

This is an implementation blueprint for three bounded capabilities in the existing
shared Expo Router application:

1. A responder-only Home/Missions/Map/Profile shell.
2. A responder Home dashboard.
3. Persistent personal duty availability, distinct from assignment, incident, and
   resource status.

The plan preserves the Citizen experience and the existing responder assignment,
assessment, chat, ICS, handover, GPS, and offline-assessment workflows. It does not
implement transport destination selection, hospital coordination, resource requests,
notification-history redesign, or a second mobile application.

The document distinguishes repository facts from proposed changes. All current-state
claims below are static source inspection findings. No tests, builds, migrations, or
live API calls were executed for this planning task.

## 2. Repository baseline and verified findings

### Existing architecture

- [`mobile/app/_layout.tsx`](../mobile/app/_layout.tsx) owns the root Expo Router
  `Stack`, one TanStack Query `QueryClient` (`retry: 1`, `staleTime: 30_000`), the
  authentication guard, accessibility loading, network synchronization, and the
  global `OfflineBanner`.
- Expo Router is `~57.0.24`; there are no existing route-group or responder tab
  layouts.
- [`mobile/src/lib/role-routing.ts`](../mobile/src/lib/role-routing.ts) sends
  `RESPONDER` to `/responder/assignments` and all other roles to `/home`.
- [`mobile/src/components/ui/bottom-nav.tsx`](../mobile/src/components/ui/bottom-nav.tsx)
  is Citizen navigation: Home, Incidents, First Aid, Announcements, Profile.
  It must remain unchanged for this feature.
- [`mobile/src/stores/auth.store.ts`](../mobile/src/stores/auth.store.ts) persists
  the authenticated user and tokens in Secure Store and provides logout.

### Existing responder workflow

- [`mobile/app/responder/assignments.tsx`](../mobile/app/responder/assignments.tsx)
  calls `GET /v1/responders/me/assignments`, uses query key
  `['responder-assignments']`, polls every 15 seconds, and provides loading, retry,
  empty, refresh, and assignment-card states.
- [`mobile/app/responder/assignment/[id].tsx`](../mobile/app/responder/assignment/[id].tsx)
  calls the assignment-detail API, accepts assignments, updates En Route/On Scene/
  Transporting/Assisting status, renders map and route information, shares location,
  opens external navigation, and embeds ICS and handover sections. It navigates to
  assessment and shared incident chat.
- [`mobile/app/responder/assessment/[id].tsx`](../mobile/app/responder/assessment/[id].tsx)
  provides the optional-field on-scene assessment form. Failed submissions are
  queued by [`mobile/src/services/offline/assessment-queue.service.ts`](../mobile/src/services/offline/assessment-queue.service.ts).
- Existing paths that must not move:
  `/responder/assignments`, `/responder/assignment/:id`,
  `/responder/assessment/:incidentId`, and `/incident/chat/:incidentId`.
- Existing navigation call sites are in role routing, assignment list, assignment
  detail, and [`mobile/app/tracking/[id].tsx`](../mobile/app/tracking/[id].tsx).

### Existing API and authorization

- [`backend/src/responders/responders.controller.ts`](../backend/src/responders/responders.controller.ts)
  exposes:
  `GET /v1/responders/me/assignments`,
  `GET /v1/responders/assignments/:id`,
  `POST /v1/responders/assignments/:id/accept`,
  `POST /v1/responders/assignments/:id/decline`,
  `PATCH /v1/responders/assignments/:id/status`, and
  `POST /v1/responders/location`.
- Assignment list, mutations, and location require `JwtAuthGuard`, `RolesGuard`, and
  `@Roles(UserRole.RESPONDER)`.
- Assignment detail currently has only `JwtAuthGuard`; [`RespondersService.getAssignment`](../backend/src/responders/responders.service.ts)
  does not call its private `assertCrewMember`. This is an object-level authorization
  defect that must be fixed before exposing deep links.
- `acceptAssignment`, `declineAssignment`, and `updateStatus` do call
  `assertCrewMember(dispatchId, userId)`, which checks `dispatch_crew.user_id`.
- [`mobile/src/services/api/responders.api.ts`](../mobile/src/services/api/responders.api.ts)
  currently has list/detail/accept/status methods but no decline or availability
  methods. Its `authFetch` throws `Error("HTTP <status>")` with a best-effort JSON
  message; new API errors must preserve this convention or introduce a typed,
  backward-compatible error.
- Assessment, chat, ICS, and handover authorization is implemented in their own
  incident modules; retain and test those existing predicates rather than assuming
  responder role alone is sufficient.

### Status semantics

The source of truth is [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma):

| Field/type | Current meaning | Use for duty? |
|---|---|---|
| `User.status` / `user_status` | Account lifecycle: `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED` | No |
| `dispatches.status` / `dispatch_status` | Dispatch assignment: `PENDING`, `SENT`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `COMPLETED` | No |
| `Incident.status` | Emergency lifecycle | No |
| `resources.status` / `resource_status` | Unit/fleet lifecycle: available, dispatched, en route, on scene, transporting, returning, out of service, offline, reserved | No |
| `ResponderStatus` | Shared realtime status: `AVAILABLE`, `BUSY`, `EN_ROUTE`, `ON_SCENE`, `OFF_DUTY`, `UNAVAILABLE` | No, without semantic split |

[`backend/src/responders/responders.service.ts`](../backend/src/responders/responders.service.ts)
uses `ResponderStatus` only to emit assignment-derived realtime transitions
`BUSY → EN_ROUTE → ON_SCENE`; it does not persist those values. `TRANSPORTING`
and `ASSISTING` update the incident and do not update responder status. The existing
`responder.availability_changed` event name has no payload mapping.

There is no responder profile entity. `User` has organization memberships, while
`dispatch_crew` links a user to an assignment. Therefore the availability record
will relate one-to-one to `User.id`, not to a resource or inferred assignment.

### Existing map, GPS, network, and realtime behavior

- [`mobile/src/components/tracking/live-tracking-map.tsx`](../mobile/src/components/tracking/live-tracking-map.tsx)
  uses MapLibre and renders incident/responder markers and route geometry.
- [`mobile/src/hooks/useResponderLocationShare.ts`](../mobile/src/hooks/useResponderLocationShare.ts)
  requests foreground permission, watches high-accuracy GPS every 5 seconds/15 meters,
  updates local position, and best-effort posts location. It swallows push failures.
- [`mobile/src/hooks/useRouteLine.ts`](../mobile/src/hooks/useRouteLine.ts) queries
  `/v1/locations/route`, refreshes every 20 seconds, and returns nullable geometry,
  distance, and duration.
- [`mobile/src/hooks/useNetworkStatus.ts`](../mobile/src/hooks/useNetworkStatus.ts)
  derives online state from NetInfo and exposes `idle/syncing/synced` queue state.
- [`mobile/src/components/tracking/native-map-available.ts`](../mobile/src/components/tracking/native-map-available.ts)
  guards native MapLibre availability.
- Realtime consumers must follow the actual existing socket client/hook when
  implementation starts; no `mobile/src/events` directory was found. Database
  persistence must not depend on socket delivery.

## 3. Assumptions and approvals

The following are proposed decisions, not current behavior:

1. **Initial state:** new and backfilled responders start `OFF_DUTY`. This is the
   conservative default: an approved account is not proof of operational readiness.
   Product must approve this before migration.
2. **Personal states:** `AVAILABLE`, `OFF_DUTY`, `UNAVAILABLE`. `BUSY`, `EN_ROUTE`,
   and `ON_SCENE` remain operational/realtime states and are never written to the
   personal availability field.
3. **Active assignment policy:** a responder cannot switch to `OFF_DUTY` or
   `UNAVAILABLE` while any non-terminal dispatch linked through `dispatch_crew` is
   `PENDING`, `SENT`, or `ACCEPTED`. Reassignment/cancellation is a dispatcher
   workflow, not a mobile override.
4. **Offline policy:** duty changes require an online request and server acknowledgment.
   Do not queue them. Existing assessment queue behavior remains unchanged.
5. **Profile data:** organization/team/unit/vehicle is shown only when supplied by an
   explicit backend relation. It is never inferred from assignment history.
6. **Realtime scope:** availability events are deferred from the first release.
   The current gateway has only `ops:all`, `incident:{id}`, and `user:{id}` rooms,
   and the mobile client has no availability consumer. REST remains authoritative.

If product rejects any assumption, update the contract and tests before coding.

## 4. Architecture and route tree

### Proposed route tree

Create a layout under the existing responder directory; do not migrate routes:

```text
mobile/app/
├── _layout.tsx                         KEEP: providers/auth/global overlay
└── responder/
    ├── _layout.tsx                     CREATE: responder Stack + shell nav
    ├── home.tsx                        CREATE: Home tab
    ├── assignments.tsx                 MODIFY: Missions tab
    ├── map.tsx                         CREATE: Map tab
    ├── profile.tsx                     CREATE: Profile tab
    ├── assignment/[id].tsx             KEEP: nested operational detail
    └── assessment/[id].tsx             KEEP: nested operational assessment
```

The shell is a Stack plus a responder navigation component rather than a nested
Expo Router Tabs migration. `responder/_layout.tsx` displays navigation only when
the active child is `home`, `assignments`, `map`, or `profile`; it hides the shell
for assignment and assessment. This preserves full-screen workflows and
`router.back()` history. The shared `/incident/chat/:id` route remains outside the
responder tree.

After compatibility tests pass, change `homeRouteForRole(RESPONDER)` to
`/responder/home`. Until then `/responder/assignments` remains the safe landing
compatibility route. Citizen `/home` and Citizen bottom navigation are unchanged.

Unauthenticated deep links are redirected by the root guard to `/auth/login`.
Authenticated non-responders entering `/responder/*` are redirected to their own
role landing route. Expired sessions follow the existing logout/session handling.
Unknown routes use the existing Expo Router fallback; do not add a parallel guard.

## 5. Proposed data model and migration

### Prisma contract

Add to `backend/prisma/schema.prisma`. The Prisma identifiers are intentionally
distinct; the database enum and table also have distinct PostgreSQL names:

```prisma
enum ResponderAvailabilityStatus {
  AVAILABLE
  OFF_DUTY
  UNAVAILABLE
  @@map("responder_availability_status")
}

model ResponderAvailability {
  user_id       String                    @id @db.Uuid
  status        ResponderAvailabilityStatus @default(OFF_DUTY)
  changed_at    DateTime                  @default(now()) @db.Timestamptz(6)
  changed_by_id String                    @db.Uuid
  source        String                    @default("SELF_SERVICE") @db.VarChar(40)
  created_at    DateTime                  @default(now()) @db.Timestamptz(6)
  updated_at    DateTime                  @updatedAt @db.Timestamptz(6)
  user          User                      @relation("responderAvailabilityUser", fields: [user_id], references: [id], onDelete: Cascade, onUpdate: NoAction)
  changed_by    User                      @relation("responderAvailabilityChangedBy", fields: [changed_by_id], references: [id], onDelete: NoAction, onUpdate: NoAction)

  @@index([status], map: "idx_responder_availability_status")
  @@map("responder_availability")
}
```

Add the two named `User` relation fields on `User`:
`responder_availability_user ResponderAvailability? @relation("responderAvailabilityUser")`
and `responder_availability_changes ResponderAvailability[] @relation("responderAvailabilityChangedBy")`.
`changed_by_id` is retained for auditability even for self-service. The model is
one-to-one by primary key and does not represent fleet/resource readiness.
The primary `user` relation cascades only if the row is otherwise deletable;
`changed_by` uses `NoAction`, so a user referenced as the change actor cannot be
silently deleted. Account deactivation remains the supported lifecycle operation.

The existing `AuditLog` model and [`backend/src/audit/audit.service.ts`](../backend/src/audit/audit.service.ts)
must record each accepted change with `action = STATUS_CHANGE`,
`entity_type = "RESPONDER_AVAILABILITY"`, `entity_id = user_id`, `actor_id`,
`actor_role`, `old_values`, `new_values`, and `module_id = "MOD-05"`.
`AuditService.log` is currently insert-only and best-effort because it catches
failures. For this security/operational state, extend the existing service with a
transaction-scoped method that accepts the Prisma interactive transaction client,
writes `auditLog.create` without swallowing errors, and is called in the same
interactive transaction as the availability write. A failed audit insert rolls back
the availability change and returns `500`; it is not reported as a successful state
change. Keep the existing best-effort `log` behavior for unrelated legacy callers.
Do not create a second audit framework.

### Migration and rollout

Use the repository naming convention `YYYYMMDDHHMMSS_add_responder_availability`.

1. Add `ResponderAvailabilityStatus`, `ResponderAvailability`, and the two User
   relations; deploy the additive migration creating PostgreSQL types
   `"responder_availability_status"` and `"responder_availability"` with no name
   collision.
2. Backfill every existing `User` with `role = RESPONDER` using `OFF_DUTY`,
   `changed_by_id = user.id`, `source = "BACKFILL"`. Use an idempotent
   `INSERT ... ON CONFLICT (user_id) DO NOTHING`; never overwrite a row created by
   a concurrently deployed backend.
3. Verify one row per active responder and no non-responder rows.
4. Deploy backend read endpoints; treat a missing row as a server error after
   backfill, not as `AVAILABLE`.
5. Deploy mobile screens and then switch responder landing to `/responder/home`.
6. Keep availability event publication disabled in the first release. Revisit it
   only after an organization-scoped room, gateway authorization predicate, shared
   payload, and mobile cache-invalidation consumer are designed and tested.

Old mobile clients continue using assignment endpoints and do not write the new
field. Rollback is application rollback first; retain the additive table. Do not
drop data or roll back a deployed migration without a reviewed database procedure.
Validation commands for implementation/deployment are
`pnpm --filter @agap/backend exec prisma validate`,
`pnpm --filter @agap/backend db:generate`, and the manifest's
`pnpm --filter @agap/backend db:migrate:prod` script (which runs
`prisma migrate deploy`), followed by the targeted backend tests. Do not use
`migrate reset` for this feature. None of these commands were run here.

## 6. Availability state machine

| Current | Requested | Allowed | Preconditions and effects |
|---|---|---:|---|
| `OFF_DUTY` | `AVAILABLE` | Yes | Authenticated responder; transaction writes row and same-transaction audit. |
| `OFF_DUTY` | `UNAVAILABLE` | No with active work | `409 ACTIVE_ASSIGNMENT` if any `PENDING/SENT/ACCEPTED` dispatch has crew membership. |
| `AVAILABLE` | `OFF_DUTY` | No with active work | `409 ACTIVE_ASSIGNMENT` if any `PENDING/SENT/ACCEPTED` dispatch has crew membership. |
| `AVAILABLE` | `UNAVAILABLE` | No with active work | Same active-assignment check. |
| `UNAVAILABLE` | `AVAILABLE` | Yes | Authenticated responder; writes row and audit. |
| `UNAVAILABLE` | `OFF_DUTY` | No with active work | Same active-assignment check. |
| any | same state | Yes/no-op | Return current representation; no duplicate audit event. |

Use Prisma's interactive `$transaction` and PostgreSQL row locks through a
parameterized `SELECT ... FOR UPDATE` (Prisma has no portable row-lock option).
Every operation that changes responder duty or assignment eligibility locks
`ResponderAvailability.user_id` first, then the dispatch row, and re-checks all
conditions after the locks are acquired. Lock multiple responder rows in sorted
UUID order to avoid deadlocks.

Availability update: lock the responder row, query
`dispatch_crew` joined to `dispatches` for `PENDING/SENT/ACCEPTED`, reject the
unsafe transition with `409 ACTIVE_ASSIGNMENT`, update the row, and insert the
AuditLog through the transaction-scoped audit method. Assignment acceptance:
lock the same responder row, re-read availability, lock the dispatch row, re-check
crew membership and dispatch status, reject `OFF_DUTY`/`UNAVAILABLE` with
`409 RESPONDER_NOT_AVAILABLE`, then update to `ACCEPTED`. The availability write
and acceptance cannot both succeed against contradictory state.

Dispatch creation with `initialCrewIds` and `addCrew` currently create crew rows
without checking personal availability; `reassign` calls the same create path.
Before implementation, both paths must lock all target availability rows in sorted
order and require `AVAILABLE`, or return `409 RESPONDER_NOT_AVAILABLE`. If a
target has no backfilled row, fail closed with `500 AVAILABILITY_RECORD_MISSING`
until backfill is repaired. This is a required correction because otherwise
assignment creation bypasses the acceptance check.

Assignment completion/cancellation removes the active-assignment conflict; it does
not automatically change personal availability. Decline and reassignment do not
implicitly set duty state. `resource_status` and `ResponderStatus` remain separate.

## 7. Exact backend API contracts

Use the existing unwrapped JSON response convention.

### `GET /v1/responders/me`

Guards: `JwtAuthGuard`, `RolesGuard`, `@Roles(RESPONDER)`. Self-only.

Response `200`:

```json
{
  "user": {
    "id": "uuid",
    "full_name": "string",
    "role": "RESPONDER",
    "organizations": [
      { "id": "uuid", "name": "string", "position": "string|null" }
    ]
  },
  "availability": {
    "status": "AVAILABLE|OFF_DUTY|UNAVAILABLE",
    "changedAt": "ISO-8601",
    "source": "SELF_SERVICE|BACKFILL|ADMIN"
  },
  "activeAssignmentCount": 0
}
```

`organizations` is always an array of active `organization_memberships`, ordered by
organization name then membership ID. It is `[]` for zero memberships, has one
object for one membership, and contains every active membership for multiple
memberships; the API never silently collapses multiple memberships to `null`.
Only the existing `Organization.id`, `Organization.name`, and membership
`position` are returned. Team, unit, vehicle, and operational-area fields are
omitted because no authorized user-to-unit relation exists in the current schema.
`availability` is required after backfill. `activeAssignmentCount` counts
dispatches where the caller is in `dispatch_crew` and status is `PENDING`, `SENT`, or
`ACCEPTED`. No pagination is needed.

Errors: `401` missing/expired JWT, `403` non-responder,
`500 AVAILABILITY_RECORD_MISSING` when backfill integrity is broken, and `500` for
other unexpected failures. Query key:
`['responder-me']`.

### `GET /v1/responders/me/assignments`

Existing endpoint retained. It remains self-only and role-protected. Its response
is the current array of `dispatches` with incident locations and resource data.
The shared hook consumes its existing shape; do not add a second Home endpoint.
The backend must continue excluding `COMPLETED` and `CANCELLED`.

### `PATCH /v1/responders/me/availability`

Guards: `JwtAuthGuard`, `RolesGuard`, `@Roles(RESPONDER)`. Self-only.

Request DTO:

```json
{ "status": "AVAILABLE|OFF_DUTY|UNAVAILABLE" }
```

Use `@IsEnum(ResponderAvailability)` and reject extra/unknown values through the
repository's validation-pipe configuration. Here `ResponderAvailability` is the
shared TypeScript API enum; `ResponderAvailabilityStatus` is the distinct Prisma
enum mapped to PostgreSQL `responder_availability_status`. Empty or malformed
bodies return `400`.

Response `200`:

```json
{
  "status": "AVAILABLE|OFF_DUTY|UNAVAILABLE",
  "changedAt": "ISO-8601",
  "source": "SELF_SERVICE"
}
```

Errors: `401` unauthenticated, `403` wrong role, `400` invalid enum, `409`
active assignment (`ACTIVE_ASSIGNMENT`), `500 AVAILABILITY_RECORD_MISSING` when
backfill integrity is broken, `429` only if the existing throttler is applied to
this mutation, and `500` for other unexpected failures. The
`RESPONDER_NOT_AVAILABLE` error belongs to assignment acceptance, not this
availability-update endpoint. Successful changes invalidate `['responder-me']`.
No realtime event is emitted in the first release. Refetching
`GET /v1/responders/me` is the consistency mechanism. A future event must not be
added until the gateway has an organization-scoped room and authorization check.

### Assignment acceptance conflict

`POST /v1/responders/assignments/:id/accept` retains its responder-role and
crew-membership guards. In addition to `401`, `403`, `404`, and invalid dispatch
transition errors, it returns `409 RESPONDER_NOT_AVAILABLE` when the locked
availability row is `OFF_DUTY` or `UNAVAILABLE`, and
`500 AVAILABILITY_RECORD_MISSING` when the required backfill row is absent.

### Required backend changes

- Add DTOs under [`backend/src/responders/dto/`](../backend/src/responders/dto/).
- Add `getMySummary` and `updateMyAvailability` to
  [`RespondersService`](../backend/src/responders/responders.service.ts).
- Add `@Get('me')` and `@Patch('me/availability')` before parameterized routes.
- Add `RolesGuard` to assignment detail and call `assertCrewMember` for reads.
- Validate `TrackLocationDto.incidentId` against the responder's active crew
  membership before writing `location_history`; this is required object-level
  authorization, not part of the availability feature alone.
- Inject the existing audit service and add a transaction-scoped, fail-closed write
  method; do not write a new audit subsystem.
- Update `dispatch.service.ts` `create`/`addCrew` paths (and the existing `reassign`
  path through `create`) to use the same availability-row lock protocol.

## 8. Authorization and security rules

| Operation | Required predicate |
|---|---|
| Restored session | Valid access token; root guard sends responder to responder landing. |
| Assignment list | JWT role `RESPONDER`; query joins `dispatch_crew.user_id = req.user.id`. |
| Assignment detail | JWT role `RESPONDER` and `dispatch_crew.user_id = req.user.id`; otherwise `403`/non-disclosing `404` per existing policy. |
| Accept/decline/status | JWT role plus `assertCrewMember`; active dispatch transition validation. |
| Assessment | Preserve incident-module authorization and require assignment/crew relation for responder writes. |
| Chat/ICS/handover | Preserve existing incident-specific authorization; do not infer access from role only. |
| Location write | JWT role, active crew membership for the incident/dispatch, valid coordinates. |
| Availability | JWT role and `user_id` from token only; never accept target user ID. |
| Profile/logout | Self data only; use auth store logout and token invalidation behavior. |

Responders must not read another crew's assignment or incident-derived location.
Stale/reassigned assignment reads must fail the same object-level predicate. A
non-responder deep link redirects locally, but backend authorization remains
mandatory. Realtime subscriptions must be organization/incident scoped by the
existing gateway; event delivery is not authorization.

## 9. Shared mobile data and query contracts

Create [`mobile/src/hooks/useResponderAssignments.ts`](../mobile/src/hooks/useResponderAssignments.ts)
with:

```ts
useResponderAssignments(): {
  assignments: Assignment[];
  activeAssignments: Assignment[];
  acceptedAwaitingProgressAssignments: Assignment[];
  pendingOffers: Assignment[];
  unclassifiedAssignments: Assignment[];
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  isStale: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}
```

Use query key `['responder-assignments']`, `getMyAssignments(token)`, `enabled:
Boolean(token)`, `refetchInterval: 15_000` while focused/online, and the root
client's 30-second stale time. Preserve cached data on transient errors and expose
offline/stale state rather than rendering a false empty queue.

`activeAssignments`, `acceptedAwaitingProgressAssignments`, and `pendingOffers`
are the shared predicates defined in the screen contract. `unclassifiedAssignments`
contains every assignment that cannot be safely classified; it is never filtered
out of the full `assignments` result. Assignment mutations invalidate both
`['responder-assignment', id]` and `['responder-assignments']` after accept, decline,
status change, completion, or reassignment. Home, Map, and Missions use this hook;
no second store or duplicate assignment request is permitted.

Add shared `ResponderAvailability` to
[`shared/src/enums/`](../shared/src/enums/) and export it from
[`shared/src/index.ts`](../shared/src/index.ts). This first release does not add
an availability event or payload because the current gateway has no organization
room and the mobile socket has no availability consumer. Do not alter
`ResponderStatusChangedPayload`.

## 10. Screen-by-screen UI contract

### Shared assignment-state predicates

Use one pure derivation helper in Home, Map, and Missions. It must return the
full assignment collection plus disjoint classified collections:

```ts
type AssignmentState =
  | 'PENDING_OFFER'
  | 'ACTIVE'
  | 'ACCEPTED_AWAITING_PROGRESS'
  | 'TERMINAL'
  | 'UNKNOWN';

type AssignmentDerivation = {
  assignments: Assignment[];
  activeAssignments: Assignment[];
  acceptedAwaitingProgressAssignments: Assignment[];
  pendingOffers: Assignment[];
  terminalAssignments: Assignment[];
  unclassifiedAssignments: Assignment[];
};
```

An assignment is `UNKNOWN` when its dispatch status is missing or unrecognized,
when a known status requires an incident status that is missing or unrecognized,
or when a required `created_at` or `updated_at` timestamp is missing or invalid.
The helper must preserve the original assignment in `unclassifiedAssignments` and
must never silently discard it or reinterpret it as terminal/no-work.

- **Pending offer:** dispatch status `PENDING` or `SENT`, regardless of incident
  status. It is actionable work but not an active/in-progress mission.
- **Active/in-progress mission:** dispatch status `ACCEPTED` and incident status
  `DISPATCHED`, `EN_ROUTE`, `ON_SCENE`, `TRANSPORTING`, or `ASSISTING`. The
  current responder service leaves dispatch status `ACCEPTED` while the responder
  reports operational progress, so incident status is required.
- **Accepted awaiting progress:** dispatch status `ACCEPTED` with incident status
  `ACKNOWLEDGED`, `ASSESSED`, or `DISPATCH_PENDING`. This is assigned work, not
  an active movement mission and not a pending offer. Home shows a distinct
  “accepted — awaiting dispatch progress” card, Missions labels it as accepted,
  and Map shows the assignment destination without starting live incident sharing
  until the active/in-progress predicate becomes true.
- **Historical/terminal:** dispatch status `REJECTED`, `CANCELLED`, or `COMPLETED`,
  or incident status `RESOLVED`, `CLOSED`, `CANCELLED`, `FALSE_ALERT`, `DUPLICATE`,
  `UNABLE_TO_RESPOND`, or `REFERRED`.

When multiple active or accepted-awaiting-progress assignments exist, choose the
greatest `updated_at`, then greatest `created_at`, then lexicographically greatest
dispatch ID. The assignment API type must expose `updated_at` for this deterministic
rule. If any assignment is unclassified, the derivation result must retain it and
set the aggregate state to unresolved for purposes of no-work decisions. Home must
show “mission state unavailable” and must not show “standing by” whenever an
unclassified assignment is present. Map must show an
explicit “mission state unavailable”/“assignment state unknown” fallback rather
than “no active mission.” Missions must keep the assignment visible with a clear
“unknown state” label. Home, Map, and Missions use this same derivation helper.

### Home — `/responder/home`

Order sections as: identity, availability control, active mission, assignment
summary, readiness, and last-updated/retry affordance.

- Identity uses `GET /v1/responders/me`; do not invent unit data.
- Availability shows server-confirmed status. The control is disabled while
  mutation is pending/offline and shows `409` conflict text without changing the
  displayed state.
- Active mission uses the shared active/in-progress predicate. `PENDING`/`SENT`
  offers appear in the assignment summary, not the active mission card. Show
  “accepted — awaiting dispatch progress” for an accepted-awaiting-progress
  assignment. Show “mission state unavailable” whenever
  `unclassifiedAssignments` is non-empty.
  Show “standing by” only when there is no active mission, no
  accepted-awaiting-progress assignment, no pending offer, and no unclassified
  assignment.
- Assignment count comes from the shared assignment query, not a new endpoint.
- GPS readiness distinguishes permission denied, no fix, local fix, and sharing.
- Network uses `useNetworkStatus`; stale cached assignments show their timestamp.
- Initial loading uses skeletons; query failure has retry; offline has explicit
  cached/stale copy; no data is not an error.
- CTAs navigate to `/responder/assignments`, `/responder/assignment/:id`, or
  `/responder/map`.

### Missions — `/responder/assignments`

Keep existing cards, polling, refresh, empty, retry, accept/status actions, and
navigation. Replace its direct query with `useResponderAssignments`; preserve API
response field names and current assignment detail route.

### Map — `/responder/map`

Reuse `LiveTrackingMap`, `useResponderLocationShare`, `useRouteLine`, map config,
and the native availability guard. The Map tab does not promise live tracking when
there is no active assignment or no successful location watch.

- Active mission or accepted-awaiting-progress assignment + valid destination:
  render the same derived assignment state as Home, assignment marker, local responder
  position if available, and route geometry when returned.
- Any `unclassifiedAssignments`: render an explicit unknown-state fallback with
  available safe location data and a retry/refetch affordance; never render
  “no active mission” solely because classification failed. Do not start incident
  sharing from an unclassified assignment.
- Stale/unavailable destination or route: render markers/available data and a
  clear stale/no-route message.
- No active, accepted-awaiting-progress, or pending assignment and no
  unclassified assignment: render no-active-mission state; do not start incident
  sharing. For accepted-awaiting-progress, show the destination and waiting state
  but do not start incident sharing.
- Permission denied/GPS disabled: distinguish permission action from no-fix state.
- Offline: show cached assignment/map state; do not claim current position.
- MapLibre unavailable: render a textual assignment/location fallback.
- Location push failures remain non-blocking but visible as sharing degraded.

The local GPS fix is not the same as the last server location, remote responder
position, or incident destination; label these separately.

### Profile — `/responder/profile`

Show identity, confirmed availability, organization membership when explicitly
returned, permission/readiness links, support, and logout. Do not show citizen
medical profile or emergency contacts. Duty controls reuse the Home mutation and
invalidate `['responder-me']`.

### Nested operational screens

Assignment detail, assessment, chat, ICS, and embedded handover remain functionally
unchanged. Regression tests must prove shell visibility is off on nested screens,
deep links still load, `router.back()` returns to the prior shell/detail route, and
assessment offline queueing still works.

## 11. GPS, network, offline, and realtime semantics

- GPS ready means foreground permission is granted and a current local watch fix
  exists. It does not mean the backend received the last push.
- `useResponderLocationShare` currently has no explicit age field; add a local
  `lastFixAt` only if the UI needs a timestamp. Treat a fix older than 30 seconds
  as stale for display, without changing backend semantics.
- Backend location timestamps are server/database `recorded_at`; local GPS callbacks
  are device time only.
- Offline assignment data may be rendered from TanStack cache with an explicit stale
  label. Accept/status/duty mutations require online connectivity and server
  acknowledgment.
- A timeout after a duty request is ambiguous. Refetch `GET /me` before offering
  retry; do not optimistically flip state or queue a duplicate mutation.
- Existing assignment-derived realtime emission remains after database commit.
  Availability has no first-release event; clients refetch REST state. If a future
  event is added, delivery failure must log and never roll back persistence.
- Preserve the assessment queue and its `notifySyncing/notifySynced` integration.

## 12. File-by-file implementation matrix

| Phase | File | Action | Responsibility | Dependencies | Tests/completion |
|---|---|---|---|---|---|
| 0 | `backend/prisma/schema.prisma` | MODIFY | Add enum/model/User relations | Product approval | Prisma validate; one-to-one relation compiles |
| 0 | `backend/prisma/migrations/20261011000000_add_responder_availability` | CREATE | Additive `responder_availability_status` enum/table and idempotent responder backfill | Schema | SQL review; deploy dry run |
| 0 | `shared/src/enums/responder-availability.enum.ts` | CREATE | Personal-duty enum | Contract | Shared typecheck |
| 0 | `shared/src/index.ts` | MODIFY | Export enum/event types | Shared enum | Import test |
| 0 | `backend/src/responders/dto/update-availability.dto.ts` | CREATE | Enum validation | Shared enum | DTO invalid/valid tests |
| 1 | `backend/src/responders/responders.controller.ts` | MODIFY | Exact self endpoints and detail guard | Service/DTO | Controller auth/status tests |
| 1 | `backend/src/responders/responders.service.ts` | MODIFY | Summary, transition transaction, crew reads, shared availability lock | Prisma/audit | Unit and concurrency tests |
| 1 | `backend/src/dispatch/dispatch.service.ts` | MODIFY | Lock/check availability in `create`/`addCrew`; reassign inherits create guard | Availability protocol | Dispatch bypass/race tests |
| 1 | `backend/src/audit/audit.service.ts` | MODIFY | Add transaction-scoped fail-closed audit method; preserve legacy best-effort method | Existing AuditLog | Commit/rollback audit tests |
| 1 | `shared/src/events/responder.events.ts` | KEEP UNCHANGED | Existing assignment-derived event contracts; availability deferred | Realtime decision | No new event promise |
| 1 | `shared/src/events/websocket-event.types.ts` | KEEP UNCHANGED | Existing payload map; no availability payload in release 1 | Realtime decision | Typecheck |
| 1 | `mobile/src/services/api/responders.api.ts` | MODIFY | Summary/availability/decline methods | Backend | API mock tests |
| 1 | `mobile/src/hooks/useResponderAssignments.ts` | CREATE | Shared assignment query | Existing API/root client | Cache/poll/invalidation tests |
| 1 | `mobile/src/hooks/useResponderSummary.ts` | CREATE | Summary query/mutation | API/query client | Mutation conflict/timeout tests |
| 2 | `mobile/app/responder/_layout.tsx` | CREATE | Responder shell and nested visibility | Expo Router 57 | Route selection tests |
| 2 | `mobile/src/components/responder/responder-nav.tsx` | CREATE | Four-tab shell | Tokens/icons | Active-tab tests |
| 2 | `mobile/app/responder/home.tsx` | CREATE | Dashboard states/CTAs | Shared hooks | Screen-state tests |
| 2 | `mobile/app/responder/map.tsx` | CREATE | Map/readiness states | Existing map/GPS hooks | GPS/offline/map tests |
| 2 | `mobile/app/responder/profile.tsx` | CREATE | Identity/duty/logout | Summary/auth store | Profile/logout tests |
| 2 | `mobile/app/responder/assignments.tsx` | MODIFY | Consume shared hook only | Query hook | Existing workflow regression |
| 2 | `mobile/src/lib/role-routing.ts` | MODIFY | Final responder landing `/responder/home` | Home route | Citizen/responder routing tests |
| 2 | `mobile/app/_layout.tsx` | KEEP UNCHANGED | Preserve root guard/providers; change only if route tests prove necessary | Route shell | Session/deep-link tests |
| 2 | `mobile/app/responder/assignment/[id].tsx` | KEEP | Preserve mission detail | Layout hiding nav | Back/deep-link regression |
| 2 | `mobile/app/responder/assessment/[id].tsx` | KEEP | Preserve offline assessment | Layout hiding nav | Queue regression |
| 2 | `mobile/src/hooks/useResponderLocationShare.ts` | KEEP | Reuse current best-effort sharing | Map tab | Permission/error tests |
| 2 | `mobile/src/components/tracking/live-tracking-map.tsx` | KEEP | Reuse MapLibre rendering | Map tab | Map fallback tests |
| 3 | `backend/test/responders/responders.spec.ts` | CREATE | Availability/auth/race tests | Backend contracts | All responder cases pass |
| 3 | `mobile/src/**/__tests__/*` | CREATE | Hook/navigation/screen tests | Jest Expo | Targeted mobile suite passes |
| 3 | Citizen routes/components | KEEP UNCHANGED | Regression boundary | Shell isolation | Citizen navigation tests |

No file is removed. The migration file is created only during implementation, not
this planning task.

## 13. Dependency graph and execution phases

1. **Contracts and migration:** approve states/default, add shared enum, Prisma
   model/relations, idempotent migration/backfill, and fail-closed audit contract.
2. **Backend safety:** implement summary/availability endpoints, the shared
   availability-row lock protocol in availability update, acceptance, dispatch
   creation, and `addCrew`, assignment-detail crew authorization, location
   incident authorization, and backend tests.
3. **Mobile data:** implement API methods, summary hook, shared assignment hook,
   invalidation, and hook tests.
4. **Navigation shell:** add responder layout/nav/screens without moving operational
   routes; add route and session tests.
5. **UI states:** implement Home, Map, Profile, then switch responder landing.
6. **Validation/rollout:** run typecheck/lint/targeted tests, validate migration,
   perform manual deep-link/offline/GPS QA, and deploy additive backend before mobile.

## 14. Exact validation and test plan

Existing commands from package manifests:

```text
pnpm --filter @agap/backend typecheck
pnpm --filter @agap/backend lint
pnpm --filter @agap/backend test -- responders
pnpm --filter @agap/backend test:e2e
pnpm --filter @agap/mobile typecheck
pnpm --filter @agap/mobile lint
pnpm --filter @agap/mobile test -- --runInBand
pnpm typecheck
pnpm lint
```

The backend has Jest tests under `backend/test`, including audit, assessment,
handover, realtime, dispatch, and incident suites. Mobile has Jest via `jest-expo`
but no existing mobile test files were found. Add tests in repository-compatible
locations rather than claiming existing coverage.

Required automated scenarios:

- availability DTO enum validation and all transition rows;
- active-assignment conflict for every transition into `OFF_DUTY` or
  `UNAVAILABLE`, including `OFF_DUTY → UNAVAILABLE`, when a `PENDING`, `SENT`,
  or `ACCEPTED` dispatch is linked;
- same-state availability requests are idempotent and create no audit row;
- assignment acceptance returns `RESPONDER_NOT_AVAILABLE` for
  `OFF_DUTY`/`UNAVAILABLE`;
- completed/cancelled assignments no longer block off duty;
- concurrent acceptance versus availability update;
- concurrent dispatch creation/add-crew versus availability update;
- unavailable responders cannot be added through initial crew, `addCrew`, or
  `reassign`; missing availability rows fail closed;
- audit old/new values and actor;
- responder-only summary/update; unauthenticated/non-responder rejection;
- cross-user assignment detail, status, assessment, location, and chat access;
- stale/reassigned assignment access;
- shared assignment hook key, 15-second polling, cache reuse, stale/error data,
  and mutation invalidation;
- responder/Citizen route landing and shell selection;
- nested route shell hiding and `router.back()` history;
- Home loading/empty/stale/offline/error/conflict states;
- Home/Map/Missions consistency for active, accepted-awaiting-progress, pending
  offer, terminal, and unknown mission states;
- assignment with missing incident status is classified as `UNKNOWN`, remains in
  `unclassifiedAssignments`, remains visible in Missions, and produces Home
  “mission state unavailable” plus Map’s explicit unknown-state fallback;
- assignment with missing or invalid required `created_at`/`updated_at` is
  classified as `UNKNOWN` rather than terminal/no-work;
- assignment with an unrecognized dispatch or incident status is classified as
  `UNKNOWN` and is not silently discarded;
- Map permission denied, no fix, stale fix, offline, missing route, and MapLibre
  unavailable states;
- Profile logout/session expiry;
- duty timeout followed by summary refetch;
- persistence success for assignment events when realtime delivery fails; no
  availability event is expected in release 1;
- Citizen navigation regression and assessment offline queue regression.

Manual QA must cover Android/iOS deep links, logout, expired token, online-to-offline
transition, permission denial, GPS disabled, active assignment duty conflict, and
server restart/reconnect. No test result is pre-claimed.

## 15. Acceptance criteria

- Citizen login still lands at `/home` and Citizen bottom navigation is unchanged.
- Responder login lands at `/responder/home` only after compatibility tests pass.
- Four responder tabs work without moving existing mission/assessment/chat paths.
- Assignment and assessment screens hide responder tabs and preserve back behavior.
- Home never displays `AVAILABLE` unless confirmed by `GET /v1/responders/me`.
- No linked `PENDING`, `SENT`, or `ACCEPTED` assignment can be hidden by an
  availability conflict; every transition into `OFF_DUTY` or `UNAVAILABLE`,
  including `OFF_DUTY → UNAVAILABLE`, is rejected with `409 ACTIVE_ASSIGNMENT`.
- Same-state availability requests are idempotent and do not create audit entries.
- Home, Map, and Missions distinguish active/in-progress missions, accepted-
  awaiting-progress assignments, pending offers, terminal assignments, and
  unknown/unclassified data using one shared derivation helper. Missing incident
  status, missing required timestamps, and unrecognized status values produce an
  explicit unknown category. Home shows “mission state unavailable” rather than
  “standing by” whenever unresolved assignment data is present; Map shows an
  explicit unknown-state fallback rather than “no active mission”; Missions keeps
  every unclassified assignment visible with an “unknown state” label.
- Duty state is persisted independently of `User.status`, `dispatches.status`,
  `Incident.status`, and `resources.status`.
- Every accepted duty change commits only when its immutable audit row commits in
  the same transaction; an audit failure returns `500` and leaves duty unchanged.
- Cross-responder assignment/detail/location access is rejected.
- Home, Missions, and Map share one assignment query/cache.
- Offline, stale, permission, no-fix, and map-unavailable states are explicit.
- Assessment offline queue behavior is unchanged.
- Existing assignment realtime failure cannot undo a committed change; availability
  has no first-release realtime event.
- Backend/mobile typecheck, lint, targeted tests, and migration validation pass in
  the implementation environment.

## 16. Rollout, rollback, and risks

Deploy backend schema and endpoints first, with backfill verified, then mobile API
support, then shell screens, then the responder landing switch. Keep the additive
table during rollback. Feature-flag the landing switch if the existing release
process supports flags; otherwise retain `/responder/assignments` as a server-safe
fallback.

Key risks and mitigations:

- **False readiness:** conservative `OFF_DUTY` default and server-confirmed state.
- **Race with dispatch:** transaction/row lock plus active-assignment checks.
- **Assignment bypass:** `DispatchService.create` and `addCrew` currently do not
  check duty state; both are explicit prerequisite changes using the same lock
  order, and `reassign` must pass through that guarded create path.
- **Unauthorized deep links:** role and crew checks on every relevant backend read.
- **Route regression:** no route migration; explicit deep-link/back tests.
- **Duplicate requests:** one root QueryClient and one assignment query key.
- **Connectivity loss:** cached/stale labels; no offline duty mutation.
- **Realtime loss:** availability has no first-release event; existing assignment
  events remain best-effort after commit.
- **Map/GPS ambiguity:** separate local fix, last-known, remote position, and
  destination states.

## 17. Remaining blockers and readiness

The plan is **READY WITH EXPLICIT APPROVALS**. Before implementation, product/operations
must approve the conservative `OFF_DUTY` default, the three personal states, the
active-assignment conflict policy, and the online-only duty mutation policy.
Availability events are explicitly deferred, not an approval blocker. Engineering
must implement and test the shared availability-row lock protocol in
`RespondersService` and `DispatchService`, add the transaction-scoped fail-closed
audit method, confirm the exact existing incident-module authorization predicates,
and confirm the deployment process for the additive Prisma migration. Missing
availability rows after backfill are a release-blocking integrity error and must
fail closed, never default to `AVAILABLE`. No application source, dependency,
configuration, schema, or migration file was changed by this planning task; only
this Markdown document is intended to change.
