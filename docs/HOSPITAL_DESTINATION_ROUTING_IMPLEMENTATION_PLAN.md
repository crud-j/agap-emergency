# AGAP — Hospital Destination Routing & Live Emergency Transport Visibility

**Implementation plan (planning only — no production code changed)**
**Date:** 2026-10-25 · **Modules:** MOD-38, MOD-39, MOD-40, MOD-43 (with MOD-13, MOD-20, MOD-22, MOD-32, MOD-42, MOD-46, MOD-47, MOD-48)
**Baseline:** `main` @ `c9d03c1` plus the uncommitted working tree present on 2026-10-25.

**Evidence labels used in this document**

| Label | Meaning |
|---|---|
| **[Confirmed]** | Read in source, or observed by running a test or command during this audit |
| **[Inference]** | Reasoned from confirmed code, but not run end to end |
| **[Recommendation]** | Proposed design. Nothing here exists yet |
| **[Unverified]** | Could not be checked in this audit (for example, live database contents) |

---

## 1. Executive Summary

**Verdict: partially implemented.** AGAP already has most of the parts that transport needs. They are not yet joined up into a hospital route.

What already works **[Confirmed]**:
- A `TransportRecord` model (`transport_records`) with start, arrival, destination change and audit, exposed through `POST/PATCH /api/v1/incidents/:id/transport…` (`backend/src/incidents/transport/transport.service.ts`). The mobile responder app calls it through a hospital `DestinationPicker`. 50 related backend tests pass.
- A provider-agnostic routing layer (`MapsService` → OSRM by default) that returns real road geometry, distance and duration (`backend/src/locations/maps/`).
- Live responder GPS → `location_history` → `responder.location_updated` over Socket.io. Citizen, dispatcher and responder maps already draw a road route line from MapLibre GeoJSON.
- Hospitals are `facilities` rows (`facility_type = 'HOSPITAL'`) with a PostGIS `location geography` column.

What is missing or broken **[Confirmed]**:
1. **Hospitals have no usable coordinates.** `Facility.location` is `Unsupported("geography")`. No code writes it, and Prisma never returns it. No DTO or UI accepts coordinates, so no hospital location ever reaches a client.
2. **Every route still points to the scene during transport.** The responder, dispatcher and citizen maps all call `useRouteLine(responder, scene)`, whatever the incident status is.
3. **ETA data defect.** `EtaRefreshProcessor` routes to the *incident scene*, then writes that duration into `transport_records.estimated_arrival_at`. The "Est. arrival" shown for a hospital during transport is really the time to the scene.
4. **Transport outside Bocaue breaks tracking.** `LocationsService.trackResponder` and `getRouteBetween` reject any coordinate outside the Bocaue polygon. A transport to a receiving facility outside the municipality would stop live tracking and routing.
5. **The citizen sees nothing about transport.** The tracking screen treats `TRANSPORTING` as "Responders on scene". `GET /incidents/:id/transport` is closed to citizens, which is correct because it returns patient names. No reporter-safe destination contract exists.
6. **Lifecycle defects in `startTransport`.** It creates a transport record before validating the status transition. On an `ASSISTING` incident this leaves an orphaned record and returns 400. It also allows a transport to start while the unit is still `EN_ROUTE`.
7. **Authorization gap.** `GET /incidents/:id/transport` allows `HOSPITAL_USER` with no organization scope. It returns `incident_patients.patient_name`, so a hospital user could read patient names on incidents that are not theirs.
8. The reference hospital (**DOH — Joni Villanueva General Hospital**) is not in the seed or the GeoJSON. Independent OSM data places it about 7 m from the coordinates provided.

**Recommended architecture.** PostgreSQL stays the single source of truth for hospital coordinates, using new decimal `latitude`/`longitude` columns that stay in sync with the existing `location` geography. The backend owns a **"transport leg"**: where each dispatch is heading now, the scene or a hospital. The existing throttled ETA job computes one route per dispatch toward that leg and broadcasts it to authorized viewers. All three apps render that one contract. Geocoding uses **Nominatim forward search** (already configured as `MAP_GEOCODER_URL`). OpenAI (already configured as `OPENAI_API_KEY`) only normalizes names and builds search queries. It never produces coordinates. **No GeoJSON file changes are required.**

**Highest priority: Phase 1** (§21). Give facilities real coordinates and fix the ETA and transport-start defects. No route to a hospital is possible until a hospital has a coordinate.

---

## 2. Repository Architecture and Relevant Components

**[Confirmed]** pnpm monorepo: `backend/` (NestJS + Prisma + PostGIS + BullMQ/Redis + Socket.io), `frontend/` (Next.js, react-map-gl/MapLibre), `mobile/` (Expo Router, `@maplibre/maplibre-react-native`), `shared/` (enums, event contracts, map types, Bocaue boundary). AI instructions: the root `CLAUDE.md` only. No `AGENTS.md` was found.

| Concern | Actual implementation | Key files |
|---|---|---|
| Hospital registry (MOD-39) | `Facility` model, `facility_type = HOSPITAL`. `/hospitals` CRUD and referrals | `backend/prisma/schema.prisma` (`model Facility`, line 351), `backend/src/hospitals/*`, `backend/src/facilities/*` |
| Receiving coordination (MOD-38) | `facility_referrals` (pre-arrival notes, acknowledge, `patient_arrived_at`) | `backend/src/hospitals/hospitals.service.ts` |
| Transport (MOD-40) | `TransportRecord` (`transport_records`). Start, arrive, update | `backend/src/incidents/transport/transport.service.ts`, `backend/src/incidents/incidents.controller.ts` (`// ---- Transport (MOD-40) ----`) |
| Lifecycle (MOD-15) | `INCIDENT_STATUS_TRANSITIONS`. `ON_SCENE → TRANSPORTING → RESOLVED → CLOSED` | `shared/src/enums/incident-status.enum.ts`, `backend/src/incidents/incident-status/incident-status.service.ts` |
| Responder status (MOD-32) | `PATCH /responders/assignments/:id/status` maps to incident status and writes `IncidentEvent` | `backend/src/responders/responders.service.ts` |
| Maps façade | `MapsService` → `GeocodingProvider` (reverse only), `RoutingProvider`, `TileProvider` | `backend/src/locations/maps/{interfaces,maps.module,maps.service}.ts`, `providers/osrm-routing.provider.ts`, `providers/nominatim-geocoding.provider.ts` |
| Map configuration (env names only) | `MAP_PROVIDER=maplibre`, `MAP_ROUTER=osrm`, `MAP_PROVIDER_ROUTING_URL` = public OSRM demo server, `MAP_GEOCODER_URL` = public Nominatim, `MAP_STYLE_URL` = MapTiler style (key redacted) | `backend/.env` (names and non-secret hosts only were read) |
| Live tracking (MOD-13/43) | `POST /locations/track` and `POST /responders/location` → `location_history` → `responder.location_updated`. Throttled `eta-refresh` BullMQ job → `responder.eta_updated` | `backend/src/locations/locations.service.ts`, `backend/src/jobs/processors/eta-refresh.processor.ts` |
| Realtime (MOD-20) | Socket.io gateway. Rooms `ops:all` (staff) and incident rooms. Participant rule: staff, reporter or crew | `backend/src/realtime/{agap.gateway,realtime.service,incident-participant.service}.ts` |
| Event contracts | `incident.transporting`, `incident.facility_arrival`, `responder.location_updated`, `responder.eta_updated`, … | `shared/src/events/incident.events.ts`, `shared/src/events/responder.events.ts` |
| Responder app | Assignment screen (map, route, status actions, transport card, destination picker), Map tab | `mobile/app/responder/assignment/[id].tsx`, `mobile/app/responder/map.tsx`, `mobile/src/components/responder/DestinationPicker.tsx`, `mobile/src/services/api/transport.api.ts` |
| Citizen app | Tracking screen and post-SOS transmission screen | `mobile/app/tracking/[id].tsx`, `mobile/app/emergency/transmission.tsx`, `mobile/src/hooks/useIncidentTracking.ts` |
| Mobile map | `LiveTrackingMap` (incident pin, responder marker, route `LineString`, camera clamped to Bocaue) | `mobile/src/components/tracking/live-tracking-map.tsx` |
| Dispatcher | Dispatch page (map, route for accepted unit, ETA pill), ops map, incident drawer `TransportPanel` | `frontend/app/(ops)/operations/dispatch/page.tsx`, `frontend/app/(ops)/operations/map/page.tsx`, `frontend/components/incidents/IncidentMapView.tsx`, `frontend/components/incidents/IncidentDetailDrawer.tsx` |
| Dispatcher hospital registry UI | Hospital Coordination page with an "Add Hospital" dialog | `frontend/app/(ops)/hospitals/page.tsx`, `frontend/features/hospitals/api.ts` |
| Route hooks | `useRouteLine(from, to)`: client calls `POST /locations/route` every 20 s, keyed on coordinates rounded to 4 dp | `mobile/src/hooks/useRouteLine.ts`, `frontend/features/map/hooks.ts` |
| GPS | Foreground `watchPositionAsync` (5 s / 15 m), ref-counted, upload errors shown | `mobile/src/hooks/useResponderLocationShare.ts` |
| External navigation | Waze / Google Maps deep links (`NavigateButton`) | `mobile/src/services/navigation/external-nav.ts`, `mobile/src/components/responder/navigate-button.tsx` |
| AI | `openai` SDK `^7.42.0`, used only by `EvidenceAiReviewService`. Disabled when `OPENAI_API_KEY` is unset. Default model from `OPENAI_EVIDENCE_REVIEW_MODEL` | `backend/src/media/evidence-ai-review.service.ts`, `backend/src/config/config.validation.ts` (lines ~190–200) |
| Geofence | `isCoordinateInBocaue` (geoBoundaries ADM3 polygon) | `shared/src/maps/bocaue-boundary.ts` |
| RBAC / org scope | `RolesGuard`, `assertCanManageOrg` | `backend/src/common/guards`, `backend/src/organizations/org-scope.ts` |

---

## 3. Existing Feature Audit

### Table A — Feature audit

| Feature | Status | Evidence / File Path | Identified Gap | Recommended Action |
|---|---|---|---|---|
| Hospital entity/model and persistence | Implemented and verified | `Facility` model (`schema.prisma:351`), `HospitalsService.findAll/create/update`. `backend/test/hospitals/referrals.spec.ts` passes | No coordinate fields readable through Prisma | Add `latitude`/`longitude` + verification fields (§10) |
| Organization-to-hospital association | Partially implemented | `Facility.organization_id` (nullable). Used for hospital-user scope and Org Admin update (`hospitals.service.ts` `update`, `assertHospitalAccess`). Seed links "Bocaue General Hospital" to the hospital org | `CreateHospitalDto` cannot set `organization_id`. Org Admins cannot create | Org Admin of a `HOSPITAL`-type org may *propose* a facility for their own org, pending MDRRMO review (§9.4) |
| Hospital registration and management UI | Partially implemented | `frontend/app/(ops)/hospitals/page.tsx` `CreateHospitalDialog` (System Administrator only, `canCreate` line 287) | No address, province or coordinate fields. No location preview or verification | Add a location step: search → candidates → map pin → confirm (§16) |
| Hospital name search and selection | Partially implemented | Mobile `DestinationPicker` (client-side substring filter). Dispatcher `ChangeTransportDialog` `<Select>` | Picker's distance sort uses `hospital.latitude/longitude`, which the API never returns, so ordering falls back to alphabetical. Receiving status is not shown | Return coordinates and receiving status. Sort server-side by road ETA or straight-line distance |
| Hospital address and coordinate storage | Partially implemented | `facilities.address`, `facilities.location geography`, `last_verified_at` exist (`agap_database.sql` table `facilities`) | Nothing writes `location` (no DTO field, no raw SQL, not in seed). Prisma `Unsupported` columns are never selected. `findNearby` is a placeholder ("PostGIS distance ordering is a later step") | Decimal lat/lng as the Prisma-readable truth, with `location` kept in sync (§10) |
| Hospital geocoding / place resolution | Not implemented | `GeocodingProvider` has only `reverseGeocode` (`maps/interfaces.ts`) | No forward search. No candidate scoring | Add `search()` to the provider, a resolver service and a review workflow (§9) |
| Destination assignment to a transport record | Implemented and verified | `TransportRecord.destination_id`. `startTransport`, `updateTransport` validate active facility. `backend/test/incidents/transport.spec.ts` (24 cases) passes | Does not check `facility_type = HOSPITAL` or receiving status. Destination change emits only a generic `incident.updated` | Add a type check and a receiving-status warning. Add a dedicated `incident.transport_updated` event |
| Responder pickup and transport lifecycle | Partially implemented | Two entry paths: `PATCH /responders/assignments/:id/status {TRANSPORTING}` (writes `IncidentEvent`, notifies), then mobile `startTransport`. Or `POST /incidents/:id/transport` directly | (a) `startTransport` creates the record **before** `validateTransition`. `ASSISTING → TRANSPORTING` is not allowed, so the record is orphaned and the call returns 400. (b) Allows start while `DISPATCHED`/`EN_ROUTE`. (c) Direct path writes no `IncidentEvent` and sends no status notification. (d) Tapping **Cancel** in the picker leaves the incident `TRANSPORTING` with no record | One transactional "begin transport" path (§12) |
| Route calculation responder → hospital | Not implemented | Route infrastructure exists (`POST /locations/route`, `OsrmRoutingProvider`) but no caller passes a hospital destination | No hospital coordinates. Route endpoint is Bocaue-only | Server-side transport-leg routing (§13) |
| Route polyline on responder map | Partially implemented | `assignment/[id].tsx:127` `useRouteLine(myPoint, citizenPoint)`. `LiveTrackingMap` draws `routeGeometry` | During `TRANSPORTING` the line still goes to the scene. `NavigateButton` (`:410`) still targets the scene. No hospital marker | Render leg-aware route and destination marker; navigate to hospital (§15) |
| Route and destination visibility on dispatcher map | Partially implemented | Drawer `TransportPanel` shows destination name, start, ETA, arrival. `dispatch/page.tsx:165` routes accepted unit to the scene | No hospital marker. Route always to scene. The `/operations/map` page draws no route | Leg-aware route plus hospital markers (§16) |
| Route and destination visibility on citizen map | Not implemented | `tracking/[id].tsx:94` routes to scene. `arrived` treats `TRANSPORTING` as "Responders on scene". Transport REST excludes `CITIZEN` | No reporter-safe destination contract | Extend reporter-safe `tracking/:id/latest` (§17) |
| Live responder location sync across clients | Implemented and verified | `trackResponder` and `pushLocation` → `location_history` → `responder.location_updated`. `useIncidentTracking` re-seeds on reconnect. `backend/test/locations/live-tracking.spec.ts` | Foreground only. Rejected outside Bocaue | Allow the service area while a transport is open. Consider a background task (Phase 5) |
| Route recalculation on movement / destination change | Partially implemented | Clients refetch every 20 s, keyed on rounded origin (`useRouteLine`) | Each viewer routes independently (3 viewers = 3× OSRM calls). Destination change is not pushed | Single server route per dispatch, pushed on change (§13–14) |
| ETA, distance, route progress | Partially implemented | `EtaRefreshProcessor` (line 58 routes to scene). `responder.eta_updated` | **Defect:** line 69 writes the scene ETA into `transport_records.estimated_arrival_at`. No progress metric | Route to the leg target. Write the transport ETA only for the hospital leg |
| Hospital arrival confirmation | Implemented and verified | `PATCH /incidents/:id/transport/:tid/arrive` → `incident.facility_arrival`. Tests pass | Mobile "Arrived at hospital" has no confirmation dialog. `facility_referrals.patient_arrived_at` is not synced | Confirmation dialog. Stamp a matching open referral in the same transaction |
| Incident completion and transport history | Partially implemented | Crew `RESOLVED` completes dispatches and frees units. Drawer lists transports. Audit rows written | `RESOLVED` allowed while a transport has no `arrived_at` | Responder `RESOLVED` returns 409 `TRANSPORT_OPEN`. Dispatcher may override |
| Offline behaviour and recovery | Not implemented (for transport actions) | No mobile offline queue (`mobile/src/services/offline` does not exist; `offline_event_queue` table has no consumer). Tracking re-seeds on reconnect | Start, arrive and destination change fail outright when offline | Idempotent retry for transport mutations only (§19) |
| Authorization, audit, patient-data protection | Partially implemented | Crew checks (`assertCrew`), role guards, MOD-40 audit rows | `listTransports`: `HOSPITAL_USER` with no org scope reads `patient_name`. `incident.transporting` sends `patientId` to the reporter's room. Transport audit is `void`, not fail-closed | Scope hospital users. Drop `patientId` from incident-room payloads (§18) |
| GeoJSON hospital / road data | Not implemented (by design) | `frontend/public/assets/geojson/bocaue.geojson` is a single boundary polygon | n/a | No change (§5) |
| Hospital markers on any map | Not implemented | No marker component for facilities in `IncidentMapView.tsx` or `live-tracking-map.tsx` | — | Add a destination marker prop (§15–17) |
| Reference hospital registered | Not implemented | No "Joni Villanueva" string anywhere in seed, SQL or GeoJSON. Seed has a coordinate-less "Bocaue General Hospital" | — | Idempotent seed with fixed UUID and OSM reference (§6) |

---

## 4. Current End-to-End Transport Flow

Traced as the code behaves today **[Confirmed]**:

1. **Dispatch.** The dispatcher assigns a resource and a `dispatches` row is created. The responder opens `mobile/app/responder/assignment/[id].tsx` (route param = **dispatch id**).
2. **Accept → En route → On scene.** `nextAssignmentActions` (`mobile/src/lib/assignment-progress.ts`) drives buttons. `PATCH /responders/assignments/:id/status` moves the *incident* status and writes `IncidentEvent`. Location sharing starts on accept (`shouldShareLocation`). Fixes go to `POST /locations/track`.
3. **Route to scene.** Responder, dispatcher and citizen clients each call `POST /locations/route` (OSRM `overview=full&geometries=geojson`) from the latest responder fix to `incident_locations`. This is correct for the outbound leg.
4. **Transporting.** At `ON_SCENE` the responder taps **Transporting**. This calls `updateAssignmentStatus(TRANSPORTING)`, so the incident becomes `TRANSPORTING`, an `IncidentEvent` row is written, and the reporter and dispatcher are notified. The `DestinationPicker` then opens.
   - Pick a hospital → `POST /incidents/:id/transport {dispatchId, destinationId}` → `TransportRecord` created → `incident.transporting` emitted. The status is already `TRANSPORTING`, so no second transition happens.
   - **Decide later** → record created with `destination_id = null`.
   - **Cancel** → *no record*. The incident stays `TRANSPORTING`. The card shows "Not set" and the "Set destination" button creates the record later.
5. **During transport.**
   - Responder map: route line and Waze/Maps button **still point to the scene**.
   - ETA job: still routes to the **scene**, and writes that ETA into `transport_records.estimated_arrival_at`. The responder card and dispatcher drawer show it as "Est. arrival" at the hospital.
   - Dispatcher: the drawer updates through `incident.transporting` / `incident.facility_arrival` → `invalidateQueries(['incident-transports'])` (`frontend/providers/socket-provider.tsx:166–175`). The map route still points to the scene.
   - Citizen: the status pill shows "Transporting", but the card says "Responders on scene". The route goes to the citizen's own location.
   - If the receiving facility is outside the Bocaue polygon, each GPS upload returns **400** and the crew sees "Your location is not reaching the citizen".
6. **Arrival.** **Arrived at hospital** → `PATCH …/arrive` → `arrived_at` stamped, `incident.facility_arrival` emitted. The incident stays `TRANSPORTING`, which is correct: the lifecycle allows only `TRANSPORTING → RESOLVED`.
7. **Completion.** **Mark Resolved** (with confirmation) → incident `RESOLVED`, dispatches `COMPLETED`, units `AVAILABLE`. The dispatcher later `CLOSED`s it (MOD-45). Location sharing stops, and ops/citizen feeds drop the unit because `ACTIVE_RESPONSE_INCIDENT_STATUSES` excludes `RESOLVED`.

---

## 5. GeoJSON Directory Findings

**[Confirmed]** `frontend/public/assets/geojson/` contains a single file:

| File | Content | Size | Notes |
|---|---|---|---|
| `bocaue.geojson` | `FeatureCollection` with **1 `Polygon`** feature: Bocaue municipal boundary from OSM/Nominatim (`osm_type: relation`, `osm_id: 17638809`, `addresstype: town`). 381 vertices, `[lng, lat]` order | 117,902 bytes | Starts with a UTF-8 BOM. Fine for `fetch().json()` in browsers, but plain `JSON.parse` in Node fails unless the BOM is stripped |

- **Consumers:** `frontend/lib/bocaue-geo.ts` (`BOCAUE_BOUNDARY_SOURCE = '/assets/geojson/bocaue.geojson'`), loaded **dynamically** by URL as a MapLibre `<Source type="geojson">` in `IncidentMapView.tsx:330` and `RiskHeatmapView.tsx:179`. Mobile does not use this file. It uses `shared/src/maps/bocaue-boundary.ts`, a different, simplified geoBoundaries ADM3 polygon.
- **No roads, hospitals or landmarks.** Hospital locations are not hard-coded anywhere. They live (without coordinates) in the `facilities` table.
- **Dynamic overlays already exist.** Both map stacks already draw GeoJSON `LineString` routes built at runtime (`IncidentMapView` source `unit-route`, `LiveTrackingMap` route source) and runtime markers. Destination markers do not exist yet.
- **Not suitable for road routing.** A boundary polygon carries no road network. Road routing comes from OSRM's OSM-derived graph.

**Conclusion: the GeoJSON directory needs no changes.** Hospitals stay database-backed and reach maps through the API as data. Clients build point features or markers at runtime, the same way routes are built today. Registering a hospital therefore never requires editing or rebuilding a static file. Keep `bocaue.geojson` as the boundary overlay. Optionally, as hygiene and not as part of this feature, strip the BOM.

---

## 6. Hospital Coordinate Verification

**Reference destination (provided):** DOH — Joni Villanueva General Hospital, lat `14.79679`, lng `120.94358` (GeoJSON order `[120.94358, 14.79679]`).

| Check | Result |
|---|---|
| Exists in DB seed / SQL / GeoJSON / config | **No** [Confirmed]. Live DB contents [Unverified]: the seed uses fixed-UUID upserts and has no such record |
| Inside `isCoordinateInBocaue` (shared polygon) | **Yes**, `true` [Confirmed, run against `shared/dist`]. Swapped order `(120.94358, 14.79679)` → `false` |
| Independent cross-check: OSM Nominatim forward search | [Confirmed, 2026-10-25] OSM `way 1290448946`, `amenity=hospital`, name "Joni Villanueva General Hospital", display "North Luzon Expressway, Igulot, Bocaue, Bulacan, 3018". Centroid `14.7968505, 120.9435893`, **≈7 m** from the provided point, inside the OSM bounding box `[14.7960667–14.7975189, 120.9428993–120.9442578]` |
| OSRM routability | [Confirmed] Route from the seed Poblacion incident `(14.7969, 120.9268)` → hospital: **2,768 m, 396 s**. Destination snapped 8.2 m onto an unnamed road segment |

**Assessment.** The provided coordinate agrees with OSM to within building-footprint precision. It is suitable as the seeded value with `location_status = VERIFIED`, `location_source = 'manual+osm-crosscheck'` and `location_source_ref = 'osm:way:1290448946'`. Before production, an MDRRMO operator should still confirm the **ambulance entrance** on the ground. The facility fronts NLEX, and an OSRM snap to the nearest road could end a route on the expressway side instead of the ER entrance [Inference]. If that happens, set the stored point to the ER entrance, not the building centroid. The stored coordinate is the routing target.

**Registration without duplicates [Recommendation].**
- Seed with a fixed UUID in the existing `00000000-0000-0000-0002-…` series (next free: `…0002-000000000006`). Use `upsert` keyed on that id, so re-running the seed is idempotent.
- The partial unique index on `(location_source, location_source_ref)` (§10) prevents a second registration of OSM `way 1290448946` through the UI.
- The fictional seed "Bocaue General Hospital" (`…0002-000000000001`) has referrals and a hospital org attached in demo data. Leave it, but keep it `UNVERIFIED` (no coordinates). Do not guess coordinates for it.

**Coordinate order and display consistency [Recommendation].**
- API input and output use **named fields** `latitude`/`longitude`. Never positional arrays.
- Only GeoJSON geometry uses `[lng, lat]`, and it is built in one shared helper (§13.4).
- Validation detects a likely swap: the point is outside the service area but `(lng, lat)` is inside. The API then returns `422 COORDINATES_LIKELY_SWAPPED`.
- All three apps read the same `destination.latitude/longitude` from the same API, so marker and route endpoint cannot disagree.

---

## 7. Current Gaps and Root Causes

| # | Gap | Root cause |
|---|---|---|
| G1 | No hospital coordinates anywhere | `location` is a Prisma `Unsupported("geography")` column, invisible to the ORM. The registry was built without a coordinate input. `findNearby` deferred |
| G2 | Routes point to the scene during transport | Route endpoints are computed in each client from `incident_locations`. There is no concept of the "current leg" |
| G3 | Wrong hospital ETA | `EtaRefreshProcessor` job data carries only the scene target, but the processor writes transport ETA |
| G4 | Tracking and routing fail outside Bocaue | `assertBocaueCoordinate` guards incident intake (correct) and is reused for responder fixes and route endpoints (too strict for transport) |
| G5 | Citizen sees no transport | Only reporter-safe contract is `tracking/:id/latest`, which has no destination. Transport REST includes patient data, so it is correctly staff-only |
| G6 | Orphan transport records / early transport | `startTransport` writes before validating, outside a transaction, with no status precondition |
| G7 | Two divergent ways into `TRANSPORTING` | Responder status endpoint and transport endpoint each own part of the transition |
| G8 | Hospital-user over-read of patient names | `listTransports` role list includes `HOSPITAL_USER` with no `assertHospitalAccess`-style scope |
| G9 | Destination change not pushed | `updateTransport` emits generic `incident.updated {transportUpdated}` only |
| G10 | No geocoding | Only reverse geocoding was needed for SOS intake |
| G11 | Arrival recorded twice in different places | `transport_records.arrived_at` and `facility_referrals.patient_arrived_at` are independent |
| G12 | N× routing load | Each viewer polls `POST /locations/route` every 20 s. Public OSRM demo server has no SLA |

**Adjacent finding (outside this scope, flagged for follow-up) [Confirmed 2026-10-25 against the dev database].** `incident_locations.point` is NULL in all 8 rows (the seeded incidents), even though every row has `latitude`/`longitude`. No migration, trigger or application code writes it. `ResourceMatchingService` (`backend/src/dispatch/resource-matching/resource-matching.service.ts`) assumes the opposite. Its comment at line ~147 says `point` is "set by the DB whenever lat/lon are written". It treats lat/lng presence as proof that `point` exists, then filters with `ST_DWithin(r.base_location, il.point, …)`. A NULL `point` makes `ST_DWithin` NULL, so the query returns no rows and `if (candidateDistances.size === 0) return []` gives **no unit recommendations for any incident that has a location** [Inference from code + data; not run end to end]. Fix it separately: build the point from `latitude`/`longitude` in the query, or add a generated column. The same "geography column nobody writes" pattern is why §10 makes decimal columns the source of truth and derives geography from them.

---

## 8. Recommended Architecture

```
            ┌────────────── PostgreSQL (truth) ──────────────┐
            │ facilities.latitude/longitude (+ location geog) │
            │ transport_records (destination, start, arrive)  │
            │ location_history (responder fixes)              │
            └───────────────▲───────────────┬─────────────────┘
                            │               │
 responder GPS ─► POST /locations/track ────┘   enqueue eta-refresh (throttled 15 s / dispatch)
                                                  │
                                    TransportLegService.resolve(dispatchId)
                                      ├─ open transport + verified destination → leg TO_FACILITY
                                      └─ otherwise                             → leg TO_SCENE
                                                  │
                                    MapsService.route(fix, leg.target)  (OSRM)
                                                  │
                         Redis  route:dispatch:{id}  (TTL 120 s)  +  transport_records.estimated_arrival_at (TO_FACILITY only)
                                                  │
                     emit responder.route_updated  ──►  ops:all  +  incident room (reporter-safe payload)
                                                  │
       REST seed: GET /locations/tracking/:incidentId/latest  (adds leg, destination, route)
                                                  │
           Responder app        Dispatcher dashboard        Citizen tracking
         (route + hospital    (route + hospital marker +   (route + hospital marker,
          marker + Waze)        leg chip "To hospital")      no patient data)
```

Principles:
- **One authoritative leg and route per dispatch**, computed on the server and reused by every viewer. Clients stop computing routes for tracking. `POST /locations/route` stays for ad-hoc previews such as the picker.
- **Reuse, don't replace.** `MapsService`, `OsrmRoutingProvider`, the `eta-refresh` job, `useIncidentTracking`, `LiveTrackingMap`, `IncidentMapView`, the `TransportRecord` model and the participant rule are all extended. None is rewritten.
- **The scene geofence stays strict.** A separate configurable **service area** applies only to facility coordinates and to responder fixes while a transport is open.
- **Fail soft** (Reliability Rules). Routing, geocoding and AI failures never block transport start, arrival or dispatch. The UI shows "Route unavailable — ETA unknown (estimate)" and the external-navigation fallback.

---

## 9. Hospital Registration and AI-Assisted Geocoding

### 9.1 Existing integration (confirmed)
- Env var **`OPENAI_API_KEY`** (declared optional in `config.validation.ts`). The default model is configured through `OPENAI_EVIDENCE_REVIEW_MODEL`. The secret value was not read into this document.
- Usage pattern: `EvidenceAiReviewService` constructs an `OpenAI` client from `ConfigService` and returns `null` when the key is unset. Reuse that pattern.
- Geocoder: `MAP_GEOCODER_URL` (public Nominatim), User-Agent already set in `NominatimGeocodingProvider`.

### 9.2 Responsibility split
| Step | Component | Deterministic? |
|---|---|---|
| 1. Input validation (name 2–255 chars, optional address/municipality/province, optional lat/lng) | DTO + class-validator | Yes |
| 2. Name normalization: strip "Inc.", punctuation, "DOH —"; expand known acronyms; up to 3 search queries | **`HospitalNameAssistService` (OpenAI, optional)**, zod-validated JSON output. Without a key: deterministic normalizer | AI optional |
| 3. Candidate retrieval | `GeocodingProvider.search()` → Nominatim `/search` (`countrycodes=ph`, `viewbox` = service area, `bounded=1`, `addressdetails=1`, `namedetails=1`, `limit=5`) | Yes |
| 4. Scoring | `scoreHospitalCandidate()` (pure function, unit-tested) | Yes |
| 5. Optional tie-break | AI may **select a candidate id** from the provider list with a rationale. It may not emit numbers. Any coordinate-like field in AI output is discarded | AI optional |
| 6. Confirmation | Authorized user confirms on a map. Required unless the auto-select criteria hold | Human |
| 7. Persist | `PATCH /hospitals/:id/location` with source, ref and confidence. Audit row | Yes |

**Hard rule:** coordinates come only from (a) a geocoding provider result or (b) an authorized human placing or typing them. The LLM never produces latitude or longitude.

### 9.3 Scoring and auto-select criteria [Recommendation]
`score = 0.55·nameSimilarity + 0.20·categoryMatch + 0.15·adminAreaMatch + 0.10·providerImportance`

- `nameSimilarity`: token-set Jaccard / trigram on normalized names, 0–1.
- `categoryMatch`: 1 if `amenity=hospital` or `healthcare=hospital`, 0.5 for `clinic`, else 0.
- `adminAreaMatch`: municipality and province agree with the input, or default to Bulacan.

**Auto-select** (pre-selected, saved as `VERIFIED` on the user's single confirm) **only if all** of these hold:
- top score ≥ 0.85
- `categoryMatch = 1`
- inside the service area
- no second candidate with score ≥ 0.70 farther than 150 m from the top candidate

Otherwise the result is `NEEDS_CONFIRMATION`: the user must pick a candidate or drop a pin, and the saved status is `VERIFIED` with `location_source = 'manual'`. With no results, or provider down, the result is manual entry only. Tune the thresholds against a labelled set of real Bulacan facilities (test fixtures) before production.

### 9.4 Ownership and permissions [Recommendation]
- Hospitals remain **shared, municipal-directory entities** (`facilities`), optionally linked to one owning organization (`organization_id`). This matches the current code. No join table is needed: no requirement for many-to-many ownership was found.
- **System Administrator:** create, edit and verify any hospital (current create permission retained).
- **Org Administrator of an org with `organization_type = HOSPITAL`:** may create a hospital **for their own org only**. It is saved as `location_status = PENDING_REVIEW` and is **not selectable** as a transport destination until verified. They may edit their own org's facility (existing behaviour). A location edit resets the status to `PENDING_REVIEW`.
- **Supervisor (MDRRMO):** verify or reject a location, and deactivate a facility.
- **Dispatcher / Responder:** read only. Select destination.

### 9.5 Privacy, cost and terms
- Only the hospital name and address typed by staff are sent to OpenAI and Nominatim. These are public facility data. **Never** send incident, patient or reporter data.
- Nominatim public policy: at most 1 request/s, valid User-Agent, results cached, no autocomplete. Search runs only on an explicit "Find location" click. Add a per-user throttle (`@nestjs/throttler` is already used in the app) plus a 24 h in-Redis cache keyed on the normalized query. For production volume, self-host Nominatim (the env var already supports this).
- OpenAI cost: at most 2 small calls per registration. Negligible. Disabled entirely when the key is unset.

---

## 10. Database and Migration Plan

> **Correction (2026-10-25, applied in Prompt 01) [Confirmed].** The generated column below was not used (prompts Correction C1). `location` stays a plain `geography` column filled by trigger `trg_facilities_sync_location` from `latitude`/`longitude`; code never writes it. The real SQL is `backend/prisma/migrations/20261025120000_facility_coordinates/migration.sql`. CHECK names carry a `_chk` suffix there.

**Smallest change:** extend `facilities`. No new tables.

Proposed migration `backend/prisma/migrations/<timestamp>_facility_coordinates/migration.sql` **[Recommendation]**:

```sql
CREATE TYPE "facility_location_status" AS ENUM ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED');

ALTER TABLE "facilities"
  ADD COLUMN "latitude"                DECIMAL(10,7),
  ADD COLUMN "longitude"               DECIMAL(10,7),
  ADD COLUMN "location_status"         "facility_location_status" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "location_source"         VARCHAR(50),     -- 'nominatim' | 'manual' | 'manual+osm-crosscheck'
  ADD COLUMN "location_source_ref"     VARCHAR(100),    -- e.g. 'osm:way:1290448946'
  ADD COLUMN "location_confidence"     DECIMAL(3,2),
  ADD COLUMN "location_verified_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "facilities_lat_range"  CHECK ("latitude"  BETWEEN -90  AND 90),
  ADD CONSTRAINT "facilities_lng_range"  CHECK ("longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "facilities_latlng_pair" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "facilities_verified_has_point"
      CHECK ("location_status" <> 'VERIFIED' OR "latitude" IS NOT NULL);
-- last_verified_at already exists and is reused.

-- Keep the existing geography column derived from the decimals (single source of truth).
-- Preferred: replace with a STORED generated column (location is unwritten today, so no data is lost).
ALTER TABLE "facilities" DROP COLUMN "location";
ALTER TABLE "facilities" ADD COLUMN "location" geography(Point,4326)
  GENERATED ALWAYS AS (
    CASE WHEN "latitude" IS NULL THEN NULL
         ELSE ST_SetSRID(ST_MakePoint("longitude"::float8, "latitude"::float8), 4326)::geography END
  ) STORED;
CREATE INDEX "idx_facilities_location" ON "facilities" USING GIST ("location");

-- Duplicate prevention
CREATE UNIQUE INDEX "uq_facilities_location_source_ref"
  ON "facilities" ("location_source", "location_source_ref") WHERE "location_source_ref" IS NOT NULL;
CREATE UNIQUE INDEX "uq_facilities_active_hospital_name"
  ON "facilities" (lower("name"), lower(coalesce("municipality", '')))
  WHERE "facility_type" = 'HOSPITAL' AND "is_active";
```

Prisma `Facility` gains `latitude Decimal? @db.Decimal(10,7)`, `longitude`, `location_status facility_location_status @default(UNVERIFIED)`, `location_source`, `location_source_ref`, `location_confidence`, `location_verified_by_id`. `location` stays `Unsupported("geography")?`.

**Checks before applying (Phase 1 gate):**
1. Run `SELECT count(*) FROM facilities WHERE location IS NOT NULL;` against each environment. The drop is only safe if the result is 0 (expected, but [Unverified] for live DBs). If any rows exist, backfill `latitude/longitude` from `ST_Y/ST_X(location::geometry)` first.
2. Confirm `prisma migrate dev` produces no drift for the generated column. If it does, fall back to a plain `location` column written with `$executeRaw` inside the same transaction as the decimal update.
3. Run the duplicate-name check before creating the unique index: `SELECT lower(name), lower(coalesce(municipality,'')), count(*) FROM facilities WHERE facility_type='HOSPITAL' AND is_active GROUP BY 1,2 HAVING count(*)>1;` If it finds rows, resolve them manually first.

**Backfill:** none automatic. Existing hospitals stay `UNVERIFIED` until an operator sets a location. Seed adds Joni Villanueva General Hospital as `VERIFIED` (§6).

**Rollback:** a down script drops the new indexes, constraints, columns and enum, and restores `location geography` as a plain nullable column. The data loss is limited to the new fields. Take a `pg_dump -t facilities` before applying.

**Audit:** every location set, verify, reject or deactivate writes `AuditLog` (`entityType: 'facility'`, `moduleId: 'MOD-39'`) with old and new lat/lng and status, using `audit.log` (immutable per the existing trigger migration).

**Transport records:** one small addition (2026-10-26, Prompt 08B, prompts C17): `reporter_patient_confirmed_at` + `reporter_patient_confirmed_by_id` (FK users, paired CHECK) for the §17 reporter rule. Otherwise no schema change. `destination_id`, `transport_started_at`, `estimated_arrival_at`, `arrived_at`, `destination_changed` and `change_reason` already cover the domain. Destination-change history lives in the audit log (`oldValues`/`newValues` are already written by `updateTransport`).

---

## 11. Backend API Contracts

> **Correction (2026-10-25, found while implementing Phase 1) [Confirmed].** The backend uses URI versioning with no global `api` prefix (`backend/src/main.ts`), so it serves `/v1/...`. Read every `/api/v1/...` below as `/v1/...`. Client base URLs are unaffected.

### Table D — API contracts

**Existing (unchanged path, extended response) — `GET /api/v1/hospitals`** (JWT, any role). The response adds coordinates and status. `PENDING_REVIEW` and `REJECTED` are excluded unless `?includeUnreviewed=true` (admin roles).
```json
[{
  "id": "00000000-0000-0000-0002-000000000006",
  "name": "DOH — Joni Villanueva General Hospital",
  "facility_type": "HOSPITAL",
  "address": "North Luzon Expressway, Igulot, Bocaue, Bulacan",
  "municipality": "Bocaue", "province": "Bulacan",
  "receiving_status": "OPEN", "is_active": true,
  "latitude": 14.79679, "longitude": 120.94358,
  "location_status": "VERIFIED", "location_source": "manual+osm-crosscheck",
  "last_verified_at": "2026-10-25T07:00:00.000Z"
}]
```
Decimals are serialized as JSON numbers, converted in the service. Never send them as strings.

**Proposed — `GET /api/v1/hospitals/nearby?lat=&lng=&limit=10`.** This replaces the placeholder. PostGIS `ST_Distance` ordering over `VERIFIED` hospitals. Returns `distanceMeters` (straight-line, labelled as such). Road ETA for the picker is optional and runs through `POST /locations/route`.

**Proposed — `POST /api/v1/hospitals/resolve-location`** (SYSTEM_ADMINISTRATOR, ORG_ADMINISTRATOR, SUPERVISOR. Throttled 10/min/user.)
```json
// request
{ "name": "Dr. Yanga's Hospital, Inc.", "address": null, "municipality": "Bocaue", "province": "Bulacan" }
// 200 response
{
  "normalizedName": "Dr. Yanga's Hospital",
  "aiAssisted": true,
  "result": "NEEDS_CONFIRMATION",            // AUTO_SELECTABLE | NEEDS_CONFIRMATION | NO_RESULTS | PROVIDER_UNAVAILABLE
  "candidates": [{
    "candidateId": "c1",
    "name": "…", "address": "…", "municipality": "Bocaue", "province": "Bulacan",
    "latitude": 14.0, "longitude": 120.0,     // from provider only
    "source": "nominatim", "sourceRef": "osm:way:…", "category": "amenity=hospital",
    "score": 0.78, "reasons": ["name 0.81", "category hospital", "municipality match"]
  }],
  "selectedCandidateId": null
}
```
The values above are illustrative placeholders, not looked-up data. Errors: `422 VALIDATION_FAILED`. `503` is never returned: provider failure comes back as `200 { result: "PROVIDER_UNAVAILABLE", candidates: [] }`, so the UI switches to manual entry.

**Existing, extended — `POST /api/v1/hospitals`** accepts optional `address`, `province`, `organizationId` (Org Admin: must equal their own org) and `location: { latitude, longitude, source, sourceRef?, confidence? }`.

**Proposed — `PATCH /api/v1/hospitals/:id/location`** (SYSTEM_ADMINISTRATOR. ORG_ADMINISTRATOR own org → `PENDING_REVIEW`. SUPERVISOR.)
```json
{ "latitude": 14.79679, "longitude": 120.94358, "source": "manual", "sourceRef": null, "reason": "Moved pin to ER entrance" }
```
Errors:
- `422 COORDINATES_OUT_OF_SERVICE_AREA`
- `422 COORDINATES_LIKELY_SWAPPED` (body includes `suggested: { latitude: 14.79679, longitude: 120.94358 }`)
- `409 DUPLICATE_FACILITY` (body includes `existingFacilityId`, `existingName`)
- `403`

Changing the coordinates of a facility that is the destination of an **open** transport emits `incident.transport_updated` for each affected incident (§14).

**Proposed — `POST /api/v1/hospitals/:id/location/verify`** (SUPERVISOR, SYSTEM_ADMINISTRATOR) `{ "decision": "VERIFIED" | "REJECTED", "note": "…" }`.

**Existing, behaviour fixed — `POST /api/v1/incidents/:id/transport`.**
- Precondition: incident `ON_SCENE` or `TRANSPORTING`. Otherwise `409 TRANSPORT_NOT_ALLOWED_IN_STATUS`.
- Runs in one transaction: create the record, transition `ON_SCENE → TRANSPORTING` with `IncidentEvent` and timestamps, and audit.
- The destination must be `facility_type = HOSPITAL`, `is_active`, and not `PENDING_REVIEW`/`REJECTED`. `receiving_status ∈ {CLOSED, AT_CAPACITY}` → returns `201` with `warnings: ["FACILITY_AT_CAPACITY"]`, never blocking.
- Accepts an optional `clientRequestId` (UUID) for idempotent retry (§19).

**Existing, extended — `GET /api/v1/incidents/:id/transport`** (staff, crew, hospital user *scoped to their own facility's transports*). Response `facilities` adds `latitude`, `longitude`, `location_status`, `receiving_status`.

**Existing, extended (reporter-safe) — `GET /api/v1/locations/tracking/:incidentId/latest`.** Each unit adds:
```json
{
  "dispatchId": "…", "callSign": "AMB-01", "unitName": "…", "resourceType": "AMBULANCE",
  "position": { "lat": 14.7969, "lng": 120.9268, "heading": 90, "speedKmh": 32, "updatedAt": "…" },
  "eta": { "seconds": 396, "isEstimate": true, "calculatedAt": "…" },
  "leg": "TO_FACILITY",                                  // TO_SCENE | TO_FACILITY | AT_FACILITY
  "destination": {                                       // null on TO_SCENE (scene is already known to the client)
    "kind": "FACILITY", "name": "DOH — Joni Villanueva General Hospital",
    "latitude": 14.79679, "longitude": 120.94358, "locationVerified": true
  },
  "route": { "geometry": [[120.9268,14.7969], "…", [120.94358,14.79679]], "distanceMeters": 2768,
             "durationSeconds": 396, "isEstimate": true, "calculatedAt": "…", "stale": false }
}
```
This carries no `patientId`, patient name, assessment, triage or responder name. Authorization is unchanged (`IncidentParticipantService.assertParticipant`).

**Existing, changed — `POST /api/v1/locations/route`.** Endpoints are validated against the **service area**, not Bocaue. Unchanged otherwise.

**Existing, changed — `POST /api/v1/locations/track` and `POST /api/v1/responders/location`.** Fixes outside Bocaue but inside the service area are accepted **only while this crew's dispatch has an open transport**. Otherwise the current 400 stays.

**Existing — `PATCH /api/v1/responders/assignments/:id/status`.**
- `TRANSPORTING`: unchanged contract. Server-side it now also ensures an open `TransportRecord` exists (destination null if none), so "Cancel" can no longer leave an incident in `TRANSPORTING` with no record.
- `RESOLVED` with an open transport (no `arrived_at`): returns `409 TRANSPORT_OPEN` for responders.

---

## 12. Transport Lifecycle and State Transitions

**No new incident statuses.** The existing lifecycle already models transport correctly [Confirmed: `INCIDENT_STATUS_TRANSITIONS`]:

```
EN_ROUTE ─► ON_SCENE ─► TRANSPORTING ─► RESOLVED ─► CLOSED
                    └─► ASSISTING ────┘
```

| Concept | Where it lives | Notes |
|---|---|---|
| Patient picked up / transport started | Incident `TRANSPORTING` + `transport_records.transport_started_at` | Created together in one transaction |
| Destination selected / changed | `transport_records.destination_id` (+ `destination_changed`, `change_reason`, audit) | Crew before arrival. Dispatcher/Supervisor any time |
| Leg (derived, not stored) | `TransportLegService` | `TO_SCENE` if no open transport. `TO_FACILITY` if open transport with a routable destination. `AT_FACILITY` once `arrived_at` is set and the incident is not yet resolved |
| Arrival | `transport_records.arrived_at` (+ matching open `facility_referrals.patient_arrived_at`) | The incident **stays `TRANSPORTING`**. The lifecycle has no "arrived at hospital" status and none is needed |
| Handover completed | `transport_records.handover_completed_at` (exists, unused) | Optional: set when the crew taps "Handover complete". Can come before `RESOLVED` |
| Completion | Incident `RESOLVED` (crew), `CLOSED` (dispatcher) | Existing behaviour: dispatches `COMPLETED`, units `AVAILABLE`. `patient_disposition = TRANSPORTED_TO_HOSPITAL` set at closure (MOD-45) |

**Multiple patients / multiple units.** A transport belongs to a dispatch, with one open transport per dispatch (existing rule). Each unit has its own leg. A patient (`patient_id`) is optional. Unknown patient never blocks transport (Rule 3).

> **Correction (2026-10-25) [Confirmed].** `IncidentStatusService` only validates transitions. The status write (status, timestamp column, `IncidentEvent` row) was duplicated inline in `IncidentsService.updateStatus` and `ResponderService.updateStatus`, and `incidents` has no `transporting_at` column. Phase 1 (Prompt 04) adds one transaction-aware `IncidentStatusService.recordTransition` used by both, and `beginTransport` reuses it for step 5. Destination checks share one `assertSelectableDestination` helper in the hospitals module.

**Single entry path [Recommendation].** Both `PATCH /responders/assignments/:id/status {TRANSPORTING}` and `POST /incidents/:id/transport` call one internal `TransportService.beginTransport(tx, …)`. It does:
1. Lock the incident row.
2. Assert the status is `ON_SCENE` (transition) or `TRANSPORTING` (additional unit/patient).
3. Assert crew, if the actor is a responder.
4. Upsert the open record for the dispatch.
5. Transition with `IncidentEvent`.
6. Audit.

After commit it emits `incident.status_changed` (if the status moved), `incident.transporting`, and enqueues an immediate `eta-refresh` for the dispatch, so the hospital route appears within seconds. `ASSISTING → TRANSPORTING` stays disallowed. Remove `ASSISTING` from the `transitionable` list in `transport.service.ts:83`, because the lifecycle forbids it.

**Destination change during transport.**
1. Validate the facility (active, hospital, not pending review).
2. Update the record and audit old and new values.
3. Emit `incident.transport_updated`.
4. Invalidate `route:dispatch:{id}` and enqueue an immediate `eta-refresh`.

Clients swap marker and route on the event, or on their next seed.

**Hospital deactivated during an active transport.** Deactivation is allowed: it never cancels a transport (Reliability Rules). Open transports to that facility emit `incident.transport_updated { destinationWarning: "FACILITY_DEACTIVATED" }`. The responder and dispatcher see a banner prompting a destination change. The route stays drawn to the stored coordinates until the destination is changed.

---

## 13. Road Routing and Route Geometry

### 13.1 Engine choice
| Option | Fit | Verdict |
|---|---|---|
| **OSRM (current default)** | Already integrated (`OsrmRoutingProvider`), returns GeoJSON geometry, distance and duration. Confirmed working to the reference hospital | **Keep** |
| Public `router.project-osrm.org` | No SLA, fair-use only, not for production. Free-flow speeds (no live traffic) | **Development only** |
| **Self-hosted OSRM** (Geofabrik `philippines-latest.osm.pbf`, `car` profile, Docker under `infrastructure/`) | Zero per-call cost. Works when external internet is degraded during typhoons if hosted on-prem. `MAP_PROVIDER_ROUTING_URL` already points at it | **Recommended for production (Phase 5)** |
| Mapbox `driving-traffic` (`MapboxRoutingProvider`, exists) | Traffic-aware. Needs `MAP_API_KEY` (a Mapbox token is not assumed to exist), paid per request, and sends coordinates to a commercial vendor | Optional, opt-in only |

OSRM respects OSM access tags (one-ways, `access=no`). It does **not** know about temporary closures or flooding [Confirmed limitation of the engine]. Flood-aware routing (MOD-51 risk areas) is out of scope. Mitigations:
- the dispatcher can change the destination
- the responder can always use Waze or Google Maps, which have live traffic and closures
- every ETA shows "estimate"

**Turn-by-turn:** AGAP will **not** build in-app voice navigation. OSRM can return `steps`, but no maneuver UI exists. The existing `NavigateButton` hands off to Waze or Google Maps for voice turn-by-turn and will target the hospital during `TO_FACILITY`.

### 13.2 Server-side route per dispatch [Recommendation]

> **Correction (2026-10-26).** The job does not store `leg`/`targetLat`/`targetLng`; it works out the leg when it runs and gains only an optional `reason` (prompts Correction C14). "Open transport" everywhere means `arrived_at IS NULL` **and** incident status `TRANSPORTING`, defined once in `openTransportWhere()` (C16).
- `EtaRefreshJobData` adds `leg` and `targetLat/targetLng`. The processor resolves the leg **at run time** through `TransportLegService`, so a destination change wins over a stale job. It routes from the freshest crew fix (existing behaviour), then:
  - writes `transport_records.estimated_arrival_at` **only when `leg = TO_FACILITY`** (fixes G3)
  - caches `{ leg, destination, geometry, distanceMeters, durationSeconds, calculatedAt, fromFix }` at `route:dispatch:{dispatchId}` (Redis, TTL 120 s)
  - emits `responder.route_updated` (§14) and, for backward compatibility, `responder.eta_updated`
- **Throttle unchanged** (`ETA_REFRESH_THROTTLE_MS = 15 000`, BullMQ dedup id `eta-{dispatchId}`). OSRM load becomes about 4 calls per minute per moving unit, independent of the number of viewers (fixes G12).
- **Immediate refresh triggers:** transport start, destination change, facility coordinate change, arrival (clears the route). Each is enqueued with a distinct job id so dedup does not swallow it.
- **Geometry size:** keep `overview=full` for accuracy. Optionally apply Douglas–Peucker simplification to ≤ 300 points before broadcast (a few KB). Use the same simplified geometry in REST and WS, so clients agree.
- **Failure:** keep the last good route with `stale: true` for up to 120 s, then `route: null`. ETA becomes `null`. Never throw (existing contract).

### 13.3 Service area
New shared constant `FACILITY_SERVICE_AREA_BOUNDS` (proposed `shared/src/maps/service-area.ts`). It defaults to the Bulacan province extent, **generated from the same geoBoundaries source** as `BOCAUE_BOUNDARY` (ADM2), not hand-typed. It can be overridden through config for referral corridors (e.g. into Metro Manila). It is used for facility coordinates, route endpoints, and responder fixes while a transport is open.

### 13.4 Coordinate-order helper
One shared function `toLngLat({latitude, longitude}) → [lng, lat]`, used by every GeoJSON builder. Unit-test it against the reference hospital so order regressions fail CI.

---

## 14. Real-Time Event and Payload Contracts

All events use the existing envelope from `RealtimeGateway.emit`. Rooms: `ops:all` (staff) and the incident room (participants: staff, reporter, crew).

| Event | Status | Rooms | Payload |
|---|---|---|---|
| `responder.location_updated` | **Existing**, unchanged | ops + incident | `ResponderLocationUpdatedPayload` |
| `responder.eta_updated` | **Existing**, kept for compatibility | ops + incident | `{ incidentId, dispatchId, etaSeconds, isEstimate, calculatedAt }`. Now leg-aware |
| `incident.transporting` | **Existing**, payload trimmed | ops: full · incident: status only · confirmed reporter's `user:` room: destination | Incident-room copy is `{ incidentId, transportId, dispatchId, transportStartedAt }`: no `patientId`, `destinationId`, `destinationName` or `destination` (C18). Ops copy keeps everything and adds `destination` |
| `incident.facility_arrival` | **Existing** | ops: full · incident: without `destinationId` · confirmed reporter's `user:` room | Add `dispatchId` |
| `incident.transport_updated` | **Proposed** | ops + crew/confirmed-reporter `user:` rooms. **Never the incident room** | `{ incidentId, dispatchId, transportId, destination: {id?, name, latitude, longitude, locationVerified} \| null, destinationWarning?: "FACILITY_DEACTIVATED" \| "FACILITY_AT_CAPACITY", changedAt }`. User-room copies omit `id` and `change_reason` |
| `responder.route_updated` | **Proposed** | ops + incident | `{ incidentId, dispatchId, leg, destination \| null, route: { geometry: [lng,lat][], distanceMeters, durationSeconds, isEstimate: true, calculatedAt, stale } \| null }` |

Add these to `shared/src/events/incident.events.ts` (`INCIDENT_EVENTS.TRANSPORT_UPDATED`) and `shared/src/events/responder.events.ts` (`ROUTE_UPDATED`), with typed payload interfaces.

**Authorization.** No new rooms. The incident room is already gated by `IncidentParticipantService` on join. Payloads in incident rooms carry no patient identifiers.

**Client handling.**
- `useIncidentTracking` (mobile): patches the `['incident-tracking-latest', id]` cache from `responder.route_updated` and `incident.transport_updated`, the same way it already handles location and ETA.
- Frontend `socket-provider.tsx`: patches a per-incident units cache and invalidates `['incident-transports', id]` (already done for `transporting`/`facility_arrival`).

**Fallback when realtime is unavailable.**
- Both clients already re-seed from REST on reconnect: `refetch()` on `connect` in `useIncidentTracking`, `refetchOnReconnect`.
- Add a 15 s REST poll of `tracking/:id/latest` **only while the socket is disconnected**.
- Hide a route or destination whose `calculatedAt` is more than 120 s old, or show it dimmed and labelled "last known". This avoids showing a stale destination after a missed `transport_updated`.

---

## 15. Responder Mobile UI Changes

Files: `mobile/app/responder/assignment/[id].tsx`, `mobile/app/responder/map.tsx`, `mobile/src/components/responder/DestinationPicker.tsx`, `mobile/src/components/tracking/live-tracking-map.tsx`, `mobile/src/services/api/transport.api.ts`, `mobile/src/lib/assignment-progress.ts`.

1. **Leg-aware route.**
   - The route target is the hospital when an open own transport has a destination with coordinates. Otherwise it is the scene.
   - Prefer the server route from `tracking/:id/latest` / `responder.route_updated`. While waiting, fall back to the existing `useRouteLine(myPoint, target)`.
   - Fit the camera to the responder plus the target only (not the scene) during `TO_FACILITY`.
2. **Destination marker.** Add a `destination?: { lat, lng, label } | null` prop to `LiveTrackingMap` with a hospital icon. During `TO_FACILITY`, keep the scene pin dimmed. `maxBounds` is Bocaue-clamped today: when the destination or route lies outside, widen the bounds to the service area.
3. **NavigateButton** targets the hospital during `TO_FACILITY` ("Navigate to {hospital} (Waze / Maps)"). If the facility has no verified coordinates, open Google Maps with a name query and show "Hospital location not verified".
4. **ETA chip:** "{km} • ~{min} est. to {hospital}". Always labelled as an estimate.
5. **DestinationPicker.**
   - Server-sorted list from `/hospitals/nearby` (fall back to `/hospitals`).
   - Show distance (labelled "straight-line"), a receiving-status badge (OPEN / ER only / At capacity / Closed) and a "Location not verified" badge.
   - Pending or rejected facilities are not listed.
   - "Decide later" stays.
   - **Cancel** no longer leaves an incident without a record: the server now creates the record on `TRANSPORTING`.
6. **Arrived at hospital:** add a confirmation dialog, then show "Arrived {time} — complete handover, then Mark Resolved". `nextAssignmentActions` makes **Arrived at hospital** the primary action while a transport is open, and **Mark Resolved** after arrival.
7. **Connectivity indicators:**
   - existing upload-error strip
   - "Route unavailable — using last known" when `stale`
   - "Offline — will retry" for queued transport mutations (§19)

---

## 16. Dispatcher Dashboard UI Changes

Files: `frontend/app/(ops)/operations/dispatch/page.tsx`, `frontend/components/incidents/IncidentMapView.tsx`, `frontend/features/map/{hooks,live-tracking}.ts`, `frontend/app/(ops)/operations/map/page.tsx`, `frontend/components/incidents/IncidentDetailDrawer.tsx`, `frontend/providers/socket-provider.tsx`, `frontend/app/(ops)/hospitals/page.tsx`, `frontend/features/hospitals/api.ts`, proposed `frontend/components/map/HospitalMarker.tsx`.

1. **Route.** Replace `useRouteLine(tracked.position, scene)` with the unit's server `route` (from `useIncidentUnits` / `tracking/:id/latest`). Keep the client hook only as a fallback.
2. **Leg distinction.**
   - ETA pill and unit popup show a chip: **"To scene"** (existing colour) or **"To hospital · {name}"** (distinct colour and dashed route).
   - Ops map list rows show the leg.
   - `IncidentMapView` gets a `routeStyle: 'TO_SCENE' | 'TO_FACILITY'` prop.
3. **Hospital markers.** `IncidentMapView` gets a `facilities` prop.
   - Show the destination hospital of the selected incident (always).
   - Optionally show a toggleable layer of all `VERIFIED` hospitals from `GET /hospitals`, cached 5 min, built as a runtime GeoJSON point source, not a static file.
4. **Live updates.** Patch caches on `responder.route_updated` and `incident.transport_updated`, and show a toast "Destination changed: A → B". Map updates happen without reload.
5. **Drawer TransportPanel.**
   - Show the ETA as "estimate" with source "routed".
   - Show `destination_changed` / `change_reason` history.
   - Show the deactivated / at-capacity warning.
   - `ChangeTransportDialog` lists only selectable hospitals and shows receiving status.
6. **Hospital Coordination page.**
   - Add Address and Province fields.
   - Add a **Location** step: "Find location" → candidate list plus a map preview (MapLibre, existing style) → pick or drag the pin → confirm.
   - Status badge (Unverified / Pending review / Verified).
   - Supervisor "Verify / Reject" action.
   - Enable create for Org Administrators of hospital orgs (own org only).

---

## 17. Citizen Tracking UI Changes

Files: `mobile/app/tracking/[id].tsx`, `mobile/src/hooks/useIncidentTracking.ts`, `mobile/src/services/api/locations.api.ts`, `mobile/src/components/tracking/live-tracking-map.tsx`. `mobile/app/emergency/transmission.tsx` needs no change: it redirects signed-in users to `/tracking/:id` after 2.5 s and shows the scene leg only.

1. `useIncidentTracking` returns `leg`, `destination` and `routeGeometry` from the seed and from events.
2. During `TRANSPORTING`, replace the "Responders on scene" card with **"Being taken to {hospital}"** plus "~{min} (estimate)". Draw the ambulance, the route to the hospital and the hospital marker. The citizen's own scene pin stays.
3. After `AT_FACILITY`, show "Arrived at {hospital}". On `RESOLVED`/`CLOSED`, show the existing "Response complete" card. The unit drops off the feed (existing behaviour).
4. **Reporter vs patient.** The reporter view never shows patient name, age, sex, assessment, triage, pre-arrival notes or referral details. It shows only:
   - the unit's call sign
   - the destination **facility** (public directory data)
   - route and ETA
5. Guests have no token and therefore no tracking (existing). Unchanged.

**Destination visibility rule (revised 2026-10-25 — replaces the earlier "show to all registered reporters" default):**
- A hospital's name and location are public. The fact that *a specific person* was taken there is health information about that person. The Philippine Data Privacy Act (RA 10173) treats health information as sensitive personal information. Have the LGU's Data Protection Officer confirm this rule.
> **Revised again 2026-10-26 (prompts Correction C17).** The earlier version of this rule used `incident_patients.is_reporter`. That flag is only what the reporter ticked on the SOS form; nobody confirms it, and it was checked per incident, so a reporter-patient could see another patient's hospital. An abuser who reports "I'm hurt" about their victim and ticks "it's me" would learn where the victim was taken. The rule below replaces it.

- **Default for every reporter: status only.** "The patient is being taken to a hospital." From the start of `TO_FACILITY`, **also stop sending that reporter the unit's live position and route.** A moving ambulance and its route line reveal the destination even without the name. This covers registered bystanders, barangay staff, unknown patients, and reporters who *claimed* to be the patient.
- **Single exception: crew-confirmed reporter-patient, per transport.** The crew on a transport (or a dispatcher/supervisor) records that the person being carried is the registered reporter: `transport_records.reporter_patient_confirmed_at` / `_by_id`, audited (Prompt 08B). Only then does that reporter receive the hospital name, marker, route and ETA, and only for that transport. The reporter's own claim is shown to the crew as a hint and never unlocks anything.
- **Guests (no account).** A guest has no token and no tracking screen, so they receive nothing during transport whether they are the bystander or the patient. A guest who is the patient is told the destination by the crew in person. Any future guest channel (SMS status, etc.) carries status only.
- This rule applies to every channel that reaches a reporter: REST, WebSocket, push and SMS.

| Reporter | During transport |
|---|---|
| Guest, bystander or patient | Nothing new (no tracking) |
| Registered bystander | Status only |
| Registered, claimed to be the patient, not confirmed | Status only |
| Registered, crew-confirmed patient on that transport | Hospital, marker, route, ETA estimate for that transport |
| Family / others | MDRRMO hotline or dispatcher, after an identity check |
- **Server-side enforcement.** For every reporter who is not crew-confirmed, `tracking/:id/latest` omits `destination`, `route` and `position` once the leg is `TO_FACILITY`/`AT_FACILITY`. A client-only filter is not enough.
  - Decided (prompts C6/C18): on the hospital leg, `responder.location_updated`, `route_updated`, `eta_updated` and `incident.transport_updated` go only to `ops:all`, the crew's `user:` rooms and the confirmed reporter's `user:` room, never to the shared incident room. Incident-room copies of `incident.transporting` and `incident.facility_arrival` are status-only (no `patientId`, `destinationId`, `destinationName` or `destination`).
- Family members who need the destination contact the MDRRMO hotline or dispatcher, who can verify who they are first. Optional later: let a dispatcher share the destination with a specific reporter, with an audit record.

---

## 18. Security, Privacy, and Authorization

| Control | Requirement |
|---|---|
| Identity / role / org / ownership | Unchanged order (CLAUDE.md security model). Transport mutations keep `assertCrew`. Facility writes use `assertCanManageOrg` for Org Admins |
| **Fix G8** | `listTransports`: for `HOSPITAL_USER`, return only transports whose `destination_id` belongs to a facility of the user's org (reuse `memberOrgIds`). Otherwise 403. Add a test |
| Incident-room payloads | No `patientId`, patient name or medical data. Proposed events follow the existing "call sign only, never responder name/phone" rule |
| Reporter-safe REST | Only `tracking/:id/latest` is extended. `GET /incidents/:id/transport` stays staff, crew and scoped-hospital only |
| Secrets | `OPENAI_API_KEY` and `MAP_API_KEY` stay server-side. No new client-exposed keys. `map-config` keeps returning non-secret config only. Never log query strings that contain keys (the MapTiler style URL contains one) |
| Logging | Do not log full route geometry or patient fields. Coordinates are logged at most at dispatch level (existing practice) |
| Audit | Facility location set, verify, reject and deactivate. Transport start, destination change and arrival (existing). Consider moving transport audit from `void audit.log` to `logInTransaction` inside the new `beginTransport` transaction (fail-closed, matching `updateMyAvailability`) |
| Rate limiting | `resolve-location` throttled per user. Nominatim at most 1 request/s globally (simple limiter or BullMQ limiter) |
| AI data minimization | Only staff-typed facility name and address reach OpenAI |

---

## 19. Offline and Failure Recovery

AGAP deliberately does **not** queue SOS submissions on mobile (`transmission.tsx`: "Never hold an emergency for later delivery"). For **responder transport actions**, a narrow retry is appropriate [Recommendation]:

- `startTransport`, `updateTransportDestination` and `recordArrival` send a client-generated `clientRequestId`. The backend stores it in audit `newValues` and dedups by (`dispatch_id`, `clientRequestId`) within 24 h, using Redis or a lookup of the open record. Retries are then idempotent (Rule 12).
- The mobile app keeps an in-memory, Secure-Store-persisted outbox of **at most 3 pending transport mutations per dispatch**, flushed on reconnect (`useNetworkStatus`) in order. The UI shows "Saved on this phone — sending when online".
- **Arrival timestamp:** the server records `arrived_at = now()` today. For offline arrival, accept an optional `occurredAt` that is no more than 30 min in the past and not in the future. Audit both `occurredAt` and the server receipt time.
- **Authoritative refresh:** after any reconnect, both apps re-seed `tracking/:id/latest` and `transport` from REST before trusting cached destination or route (§14).
- **GPS unavailable / permission denied:** transport start and arrival still work (Reliability Rules). The route is hidden, the destination marker stays, and the existing "Location permission denied" warning is shown. The dispatcher sees "No position for {callSign}" with the last fix age (existing `formatAge`).

| Failure | Behaviour |
|---|---|
| Routing provider down | Last good route `stale` ≤ 120 s, then none. ETA `null`. Waze/Maps still available |
| Geocoder down / no results | Manual coordinate entry with map pin. Saved `VERIFIED` by an authorized user with `source = manual` |
| Socket down | 15 s REST poll. Connectivity dot (existing) |
| Destination changed while a client was offline | Re-seed on reconnect replaces it. A route older than 120 s is hidden |
| Facility deactivated mid-transport | Warning event. Transport continues |

---

## 20. Testing and Acceptance Criteria

**Baseline verified during this audit [Confirmed]:**
```
cd backend && npx jest --config ./test/jest.config.ts \
  test/incidents/transport.spec.ts test/locations/eta-refresh.spec.ts \
  test/hospitals/referrals.spec.ts test/locations/location-bounds.spec.ts
→ Test Suites: 4 passed · Tests: 50 passed
```

**New and updated tests [Recommendation]:**

| Area | Test (file) |
|---|---|
| Coordinates | `toLngLat` order. Swapped-coordinate detection. Range/pair DB constraints (`backend/test/hospitals/hospital-location.spec.ts`, proposed) |
| Scoring | Auto-select vs needs-confirmation vs no-results. Two same-name candidates more than 150 m apart require confirmation. AI output with coordinates is ignored. AI disabled path (`backend/test/hospitals/location-resolution.spec.ts`, proposed) |
| Duplicates | Same OSM ref → 409. Same name + municipality → 409. Same name, different municipality → allowed |
| Permissions | Org Admin creates for own org → `PENDING_REVIEW`. Other org → 403. Pending facility not selectable. Supervisor verify |
| Transport lifecycle | `startTransport` on `EN_ROUTE` → 409. On `ASSISTING` → 409 **and no record created**. Transactional rollback. `TRANSPORTING` status creates record. `RESOLVED` with open transport → 409 (responder). Dispatcher override (update `backend/test/incidents/transport.spec.ts`, `tests/backend/responders.service.spec.ts`) |
| Leg + ETA | Processor routes to hospital when a transport is open. Writes `estimated_arrival_at` only on `TO_FACILITY`. Destination change mid-job uses the new target. Arrival clears the route (update `backend/test/locations/eta-refresh.spec.ts`, add `backend/test/incidents/transport-leg.spec.ts`) |
| Geofence | Fix outside Bocaue accepted only with an open transport and inside the service area (update `backend/test/locations/location-bounds.spec.ts`) |
| Privacy | Incident-room `incident.transporting` has no `patientId`. `tracking/latest` has no patient fields. Hospital user cannot list other facilities' transports |
| Realtime | `responder.route_updated` emitted to ops + incident. Reconnect re-seed replaces stale destination (`frontend/__tests__/live-tracking.spec.ts`, `mobile/src/lib/__tests__/incident-tracking.test.ts`) |
| Mobile logic | `nextAssignmentActions` arrival-before-resolve. Leg-aware target selection (pure functions, Jest) |
| Migration | Apply → seed twice (idempotent) → rollback script on a scratch database |

**Commands per phase:**
```
pnpm --filter ./shared build && pnpm --filter ./shared typecheck
cd backend  && pnpm test && pnpm typecheck && pnpm lint
cd frontend && pnpm test && pnpm typecheck && pnpm lint
cd mobile   && pnpm test && pnpm typecheck && pnpm lint
cd backend  && pnpm prisma migrate dev   # scratch DB only; never against shared/prod
pnpm test:e2e                            # emergency-flow E2E (CLAUDE.md: required after dependency changes)
```

### Scenarios (acceptance)
- **A — Responder transport:**
  1. Assign → accept → en route → on scene → **Transporting**: record exists even if the picker is cancelled.
  2. Choose Joni Villanueva General Hospital → hospital marker and road route appear within 20 s.
  3. Navigate opens Waze to `14.79679,120.94358`.
  4. Fixes stream; the route shortens.
  5. **Arrived at hospital** (confirm) → `arrived_at` set and the matching referral stamped. Status stays `TRANSPORTING`.
  6. **Mark Resolved** → `RESOLVED`. Units available.
- **B — Dispatcher:** opens the incident → sees the unit, the "To hospital" chip, the dashed route and the hospital marker. A destination change in the drawer updates marker and route without reload. A unit going to the scene is visibly different.
- **C — Citizen:**
  - Reporter the crew confirmed as the patient: sees the ambulance and scene leg, then "Being taken to {hospital}" with route and ETA estimate, then "Arrived", then "Response complete".
  - Bystander reporter, and a reporter who claimed to be the patient but was not confirmed: sees the scene leg, then only "The patient is being taken to a hospital". After that, no destination, position or route is sent.
  - In both cases no patient data appears in any payload (inspect WS frames).
- **D — Org-created hospital:**
  1. A System Administrator enters "DOH — Joni Villanueva General Hospital" → resolver returns the OSM candidate as `AUTO_SELECTABLE` (or the user confirms it).
  2. Save → `VERIFIED` → selectable in the picker → markers appear on all three maps with no GeoJSON edit.
  3. Repeat as an Org Admin → `PENDING_REVIEW` and not selectable until a Supervisor verifies.
- **E — Failure:** run each row of §19 plus:
  - out-of-range coordinates → 422
  - swapped coordinates → 422 with suggestion
  - duplicate → 409
  - unauthorized transport read or change → 403
  - migration rollback restores the schema
  - arrival twice → 400 (existing)
  - resolve before arrival → 409

---

## 21. Phase-Gated Implementation Roadmap

### Table C — Roadmap

**Phase 1 — Destination coordinates and correctness fixes (highest priority)**
- **Objective:** hospitals have validated coordinates. Existing transport data stops being wrong.
- **Prerequisites:** this plan approved. `location IS NOT NULL` count and duplicate-name check run on each environment (§10).
- **Files:**
  - `backend/prisma/schema.prisma`, new migration, `backend/prisma/seed/seed.ts`
  - `backend/src/hospitals/{hospitals.service,hospitals.controller}.ts`, `dto/create-hospital.dto.ts`, new `dto/set-location.dto.ts`
  - `backend/src/incidents/transport/transport.service.ts`, `backend/src/jobs/processors/eta-refresh.processor.ts`
  - `backend/src/incidents/incidents.controller.ts` (G8 scope)
  - `shared/src/maps/service-area.ts` (new), `frontend/app/(ops)/hospitals/page.tsx`, `frontend/features/hospitals/api.ts`
- **Work:**
  - Migration and Prisma fields. Serialize decimals as numbers.
  - Manual set/verify location endpoints with validation and audit.
  - Seed the reference hospital.
  - `findNearby` with PostGIS.
  - Hospital UI coordinate fields with a map pin.
  - ETA processor stops writing scene ETA into transport records (interim: skip the write when a transport is open, until Phase 2 routes to the hospital).
  - `startTransport` precondition, transaction and `ASSISTING` removal.
  - Scope `listTransports` for hospital users.
- **Tests:** coordinate, duplicate, permission, lifecycle and privacy rows of §20. Full backend suite.
- **Acceptance:** `GET /hospitals` returns `latitude/longitude` for the seeded hospital. Orphan-record bug is covered by a failing-then-passing test. No scene ETA in `transport_records`.
- **Risks / rollback:** generated-column drift (fallback: plain column with `$executeRaw`). Rollback with the down script and table dump.

**Phase 2 — Server-authoritative transport leg and route (backend + shared)**
- **Objective:** one leg and route per dispatch, pushed to every authorized viewer.
- **Prerequisites:** Phase 1 merged.
- **Files:**
  - `backend/src/incidents/transport/transport-leg.service.ts` (new), `backend/src/locations/locations.service.ts`, `eta-refresh.processor.ts`
  - `backend/src/realtime/realtime.service.ts`, `backend/src/responders/responders.service.ts`
  - `shared/src/events/{incident,responder}.events.ts`, `shared/src/maps/map.types.ts`
- **Work:**
  - Leg resolver. Processor routes to the leg target and caches the route.
  - `responder.route_updated` and `incident.transport_updated`.
  - `tracking/:id/latest` returns leg, destination and route.
  - Service-area fixes during transport.
  - Single `beginTransport`. `RESOLVED` guard. Referral arrival sync.
  - Reporter-safe `incident.transporting`.
- **Tests:** leg + ETA, geofence, privacy and realtime rows.
- **Acceptance:** with `curl` / Socket.io test client, a transport to the seeded hospital yields route events whose last coordinate is about `[120.9436, 14.7968]`.
- **Risks / rollback:** event additions are additive. Clients ignore unknown events. Disable through `TRANSPORT_ROUTING_ENABLED=false` (proposed flag), which restores current behaviour.

**Phase 3 — Client rendering (responder, dispatcher, citizen)**
- **Objective:** Scenarios A–C pass on devices.
- **Prerequisites:** Phase 2 deployed to staging, including the non-patient-reporter redaction (§17). The LGU Data Protection Officer has confirmed the §17 rule.
- **Files:** §15–17 lists.
- **Work:** destination marker props, leg-aware route and camera, NavigateButton target, picker improvements, dispatcher chip and markers, citizen transport card, event handlers.
- **Tests:** frontend and mobile Jest. Manual device run on an Android dev build (MapLibre is not available in Expo Go). Checklist §E.
- **Acceptance:** Scenarios A, B, C.
- **Risks / rollback:** client fallback to the current `useRouteLine` when the server route is absent, so a backend rollback degrades gracefully.

**Phase 4 — AI-assisted hospital location resolution**
- **Objective:** Scenario D.
- **Prerequisites:** Phase 1 (location endpoints). Nominatim usage policy reviewed.
- **Files:**
  - `backend/src/locations/maps/{interfaces,maps.service}.ts`, `providers/nominatim-geocoding.provider.ts`
  - new `backend/src/hospitals/location-resolution/{hospital-location-resolver.service,hospital-name-assist.service,candidate-scoring}.ts`
  - `backend/src/config/config.validation.ts`, `.env.example`, `frontend/app/(ops)/hospitals/page.tsx`
- **Work:** `search()`, scoring, OpenAI normalizer (zod schema, key optional), `resolve-location` endpoint with throttle and cache, review UI, Org Admin create and Supervisor verify.
- **Tests:** scoring and permission rows with recorded provider fixtures (no live calls in CI).
- **Acceptance:** reference hospital is auto-selectable. An ambiguous name requires confirmation. AI disabled → still works.
- **Risks / rollback:** feature hidden behind the UI button. Manual entry always available.

**Phase 5 — Production hardening**
- **Objective:** reliability under typhoon conditions and real load.
- **Files:** `infrastructure/` (OSRM container, Philippines extract refresh job), `mobile/src/hooks/useResponderLocationShare.ts` (optional background location via `expo-task-manager`, a new dependency that needs review), transport outbox (§19), E2E suite.
- **Acceptance:** OSRM self-hosted p95 < 300 ms. E2E transport flow green. Offline arrival replay idempotent.
- **Risks:** background location raises battery and store-policy concerns, so it is optional. OSM data quality for barangay roads needs local verification.

---

## 22. Files to Create, Modify, Reuse, or Leave Unchanged

### Table B — Proposed file changes

| File Path | Action | Purpose | Dependencies | Verification |
|---|---|---|---|---|
| `backend/prisma/schema.prisma` | Modify | Facility lat/lng + location status fields | — | `prisma validate`, migrate on scratch DB |
| `backend/prisma/migrations/<ts>_facility_coordinates/migration.sql` | **Create (proposed)** | §10 SQL | schema | Apply / rollback on scratch DB |
| `backend/prisma/seed/seed.ts` | Modify | Seed Joni Villanueva General Hospital (fixed UUID, VERIFIED) | migration | Seed twice → one row |
| `backend/src/hospitals/hospitals.service.ts` | Modify | Coordinates in responses, `findNearby` PostGIS, location set/verify, duplicate checks, Org Admin create | migration | `referrals.spec.ts` + new specs |
| `backend/src/hospitals/hospitals.controller.ts` | Modify | New routes, role changes | service | Route-role tests |
| `backend/src/hospitals/dto/create-hospital.dto.ts` | Modify | address, province, organizationId, location | — | DTO validation tests |
| `backend/src/hospitals/dto/set-location.dto.ts`, `resolve-location.dto.ts` | **Create (proposed)** | Location DTOs | — | DTO tests |
| `backend/src/hospitals/location-resolution/*.ts` | **Create (proposed)** | Resolver, AI assist, scoring | MapsService, OpenAI SDK (existing) | `location-resolution.spec.ts` |
| `backend/src/locations/maps/interfaces.ts`, `maps.service.ts`, `providers/nominatim-geocoding.provider.ts` | Modify | Forward `search()` | — | Provider tests with fixtures |
| `backend/src/locations/maps/providers/osrm-routing.provider.ts` | Reuse (optional small change) | Optional simplification | — | `tests/backend/maps.provider.spec.ts` |
| `backend/src/locations/locations.service.ts` | Modify | Service-area routing, transport-aware fix acceptance, leg/route in `getLatestUnitPositions` | leg service | `live-tracking.spec.ts`, `location-bounds.spec.ts` |
| `backend/src/jobs/processors/eta-refresh.processor.ts` | Modify | Leg-aware routing, cache, ETA write fix, events | leg service | `eta-refresh.spec.ts` |
| `backend/src/incidents/transport/transport.service.ts` | Modify | `beginTransport` transaction, preconditions, coordinates in list, hospital-user scope, transport_updated, referral sync, idempotency | — | `transport.spec.ts` |
| `backend/src/incidents/transport/transport-leg.service.ts` | **Create (proposed)** | Resolve TO_SCENE / TO_FACILITY / AT_FACILITY | — | `transport-leg.spec.ts` |
| `backend/src/incidents/incidents.controller.ts` | Modify | Pass actor to `listTransports` for scope | service | Role tests |
| `backend/src/responders/responders.service.ts` | Modify | TRANSPORTING → `beginTransport`. RESOLVED guard | transport service | `tests/backend/responders.service.spec.ts` |
| `backend/src/realtime/realtime.service.ts` | Modify | Emitters for proposed events, reporter-safe transporting copy | shared events | Realtime unit tests |
| `backend/src/config/config.validation.ts`, `.env.example` | Modify | `OPENAI_GEOCODE_ASSIST_MODEL`, service-area override, `TRANSPORT_ROUTING_ENABLED` (all proposed names) | — | Config validation test |
| `shared/src/events/incident.events.ts`, `shared/src/events/responder.events.ts` | Modify | `TRANSPORT_UPDATED`, `ROUTE_UPDATED` + payload types | — | `pnpm --filter ./shared build` |
| `shared/src/maps/map.types.ts` | Modify | `TransportLeg`, `RouteSnapshot`, `toLngLat` | — | typecheck |
| `shared/src/maps/service-area.ts` | **Create (proposed)** | Service-area bounds + `isCoordinateInServiceArea` | geoBoundaries ADM2 | Unit test with reference hospital |
| `mobile/app/responder/assignment/[id].tsx` | Modify | Leg-aware route/target, NavigateButton, arrival confirm | hooks | Device run, Jest |
| `mobile/app/responder/map.tsx` | Modify | Leg-aware route on Map tab | hooks | Device run |
| `mobile/src/components/responder/DestinationPicker.tsx` | Modify | Server sort, statuses, verified badge | API | Jest |
| `mobile/src/components/tracking/live-tracking-map.tsx` | Modify | `destination` marker prop, bounds widening | — | Device run |
| `mobile/src/hooks/useIncidentTracking.ts` | Modify | leg/destination/route + new events + disconnected poll | shared events | `incident-tracking.test.ts` |
| `mobile/src/hooks/useRouteLine.ts` | Reuse | Fallback only | — | — |
| `mobile/src/services/api/transport.api.ts`, `locations.api.ts` | Modify | Types (coordinates, leg, route), `clientRequestId` | — | typecheck |
| `mobile/src/lib/assignment-progress.ts` | Modify | Arrival-before-resolve action | — | Jest |
| `mobile/app/tracking/[id].tsx` | Modify | Transport card, destination marker | hook | Device run |
| `mobile/app/emergency/transmission.tsx` | Leave unchanged | Scene leg only. Redirects to tracking | — | Regression run |
| `frontend/app/(ops)/operations/dispatch/page.tsx` | Modify | Server route, leg chip | hooks | `live-tracking.spec.ts` |
| `frontend/components/incidents/IncidentMapView.tsx` | Modify | `facilities` + `routeStyle` props | HospitalMarker | Jest + manual |
| `frontend/components/map/HospitalMarker.tsx` | **Create (proposed)** | Hospital marker | — | Visual check |
| `frontend/features/map/hooks.ts`, `live-tracking.ts` | Modify | Units cache with leg/route | — | Jest |
| `frontend/app/(ops)/operations/map/page.tsx` | Modify | Route + hospital layer | — | Manual |
| `frontend/components/incidents/IncidentDetailDrawer.tsx` | Modify | Transport warnings, history, selectable list | — | Manual |
| `frontend/providers/socket-provider.tsx` | Modify | Handle proposed events | shared | Jest |
| `frontend/app/(ops)/hospitals/page.tsx`, `frontend/features/hospitals/{api,hooks}.ts` | Modify | Location step, verify UI, Org Admin create | API | Manual + Jest |
| `frontend/public/assets/geojson/bocaue.geojson` | Leave unchanged | Boundary overlay only | — | — |
| `frontend/lib/bocaue-geo.ts`, `shared/src/maps/bocaue-boundary.ts` | Leave unchanged | Incident geofence stays strict | — | `bocaue-boundary.spec.ts` |
| `backend/src/locations/maps/providers/mapbox-*.ts` | Leave unchanged | Optional vendor | — | — |

---

## 23. Dependencies, Risks, and Cost Considerations

**New dependencies:** none required for Phases 1–4. Reuse `axios`, `openai`, `zod`, BullMQ, Redis and PostGIS. Phase 5 optional: `expo-task-manager` for background location (review needed). An OSRM Docker image goes in infrastructure, not in package manifests.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Public OSRM/Nominatim throttled or unavailable in production | High | Routes/ETA missing | Self-host (Phase 5). Cache. Fail-soft UI. Waze handoff |
| OSM road data gaps on barangay roads / flood closures not modelled | Medium | Misleading route | "Estimate" labels. Dispatcher override. External nav. Future MOD-51 avoidance |
| Hospital point snaps to NLEX rather than ER entrance | Medium | Route ends on wrong side | Store the ER entrance point. Field verification (§6) |
| Wrong geocode accepted | Low (with rules) | Ambulance misdirected | Strict auto-select criteria, human confirmation, verification status, audit |
| Generated-column Prisma drift | Medium | Migration friction | Fallback to plain column + raw write |
| Bystander privacy expectations | Medium | Policy complaint | §17 decision + config flag |
| Foreground-only GPS during long transports | Medium | Tracking gaps if app backgrounded | Banner "Keep AGAP open during transport". Optional background task (Phase 5) |
| Adjacent: `incident_locations.point` unpopulated (confirmed NULL on dev DB) | High | Proximity-based unit recommendations likely empty | Separate ticket: compute the point from lat/lng in `fetchCandidates` or add a generated column |

**Cost:** OSRM self-hosted has compute cost only (a Philippines extract needs a few GB RAM for preprocessing). Nominatim public is free within policy; self-hosting is heavier (tens of GB disk). OpenAI: at most 2 small calls per hospital registration, negligible. Mapbox (optional) is paid per request. Avoid it unless traffic-aware ETA becomes a requirement.

---

## 24. Definition of Done

- [ ] Hospitals store validated `latitude/longitude` with status, source, ref and verifier. `location` geography is derived. Constraints and indexes exist. Migration has a tested rollback.
- [ ] Joni Villanueva General Hospital is seeded idempotently as `VERIFIED` (OSM ref recorded) and field-checked for the ER entrance before production.
- [ ] Transport cannot start before `ON_SCENE`. No orphan records. One transactional path. `RESOLVED` requires arrival (responder).
- [ ] The ETA job routes to the current leg target. `estimated_arrival_at` reflects the hospital only.
- [ ] Responder, dispatcher and citizen maps show the same hospital marker and the same server route during transport, update live, and recover after reconnect.
- [ ] Transport outside Bocaue (within the service area) keeps tracking and routing working.
- [ ] Destination change and facility deactivation propagate to all authorized viewers within one throttle window.
- [ ] No patient identifiers in incident-room payloads or the reporter REST view. Hospital-user transport reads are org-scoped.
- [ ] AI never produces coordinates. Ambiguous matches require confirmation. Everything works with `OPENAI_API_KEY` unset.
- [ ] No GeoJSON file edits are needed to show a new hospital.
- [ ] All §20 tests pass. `pnpm test`, `pnpm typecheck`, `pnpm lint` green. Emergency-flow E2E run.

### Table E — End-to-end acceptance checklist

**Setup**
- [ ] Scratch DB migrated and seeded. `GET /api/v1/hospitals` lists "DOH — Joni Villanueva General Hospital" with `latitude 14.79679`, `longitude 120.94358`, `location_status VERIFIED`.
- [ ] Re-running the seed does not create a second row.

**Responder (Android dev build)**
- [ ] Accept → Mark En Route → route to scene drawn, "To scene" ETA labelled estimate.
- [ ] Mark On Scene → Transporting → picker lists hospitals sorted by distance with receiving status.
- [ ] Cancel the picker → the transport card shows "Destination not set" and the dispatcher drawer shows the transport record.
- [ ] Select Joni Villanueva → hospital marker plus road route within 20 s. The last route vertex is about `[120.9436, 14.7968]`.
- [ ] Navigate opens Waze/Maps to the hospital, not the scene.
- [ ] Drive or simulate fixes → the route shortens. ETA updates. `transport_records.estimated_arrival_at` changes.
- [ ] Arrived at hospital → confirm dialog → arrival time shown. Mark Resolved becomes available. Resolving before arrival is refused.

**Dispatcher (web)**
- [ ] Selected incident shows unit, dashed "To hospital" route and hospital marker. A unit en route to another scene shows "To scene".
- [ ] Change destination in the drawer → marker, route and toast update without reload. The responder app updates too.
- [ ] Deactivate the hospital → warning on dispatcher and responder. Transport continues.

**Citizen (registered reporter)**
- [ ] Reporter the crew confirmed as the patient (responder switch on the transport card): tracking shows the ambulance approaching the scene, then "Being taken to DOH — Joni Villanueva General Hospital" with route and estimate.
- [ ] Reporter who ticked "I am the patient" but was **not** confirmed: same as a bystander.
- [ ] Bystander reporter: after transport starts, only "The patient is being taken to a hospital". No hospital name, unit position or route appears in the UI, the `tracking/latest` response, or WebSocket frames.
- [ ] WS frames and `tracking/latest` contain no patient name, ID or medical data.
- [ ] After Resolved, "Response complete" shows and the unit disappears.

**Hospital registration**
- [ ] System Administrator: "Find location" for the reference hospital → OSM candidate auto-selectable → saved VERIFIED → appears on all three maps.
- [ ] Ambiguous name → candidates require explicit choice. Geocoder unavailable → manual pin works.
- [ ] Swapped coordinates → 422 with suggestion. Duplicate OSM ref → 409.
- [ ] Org Admin (hospital org) create → PENDING_REVIEW, not selectable. Supervisor verifies → selectable.

**Failure**
- [ ] Airplane mode on responder during transport → "will retry" indicator. Reconnect → mutations replay once (no duplicates).
- [ ] Stop OSRM → route goes stale, then disappears. ETA shows unknown. Transport and arrival still work.
- [ ] Kill the socket on dispatcher → polling keeps positions fresh. Reconnect → state re-seeded.
- [ ] Hospital user from another organization → 403 on `GET /incidents/:id/transport`.
- [ ] Migration rollback on scratch DB restores the previous schema.

---

*Prepared from repository inspection on 2026-10-25. No production source, schema, migration or UI file was modified. Network checks made: one Nominatim forward search and one OSRM route request, both to the public endpoints already configured in `backend/.env`.*
