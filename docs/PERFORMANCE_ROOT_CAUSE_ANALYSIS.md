# AGAP Operations Center — Performance Root-Cause Analysis

**Investigation date:** 2026-10-16  
**Scope:** `frontend/` Operations Center routes, their API hooks, Socket.IO synchronization, and the backend services used by those routes  
**Method:** Read-only source inspection, repository/configuration review, targeted ripgrep searches, frontend production-build attempt, frontend/backend TypeScript checks  
**Implementation status:** No application code, configuration, dependency manifest, schema, migration, or environment file was changed. This report is the only file created by this investigation.

## 1. Executive summary

The repository contains a Next.js 14 Operations Center using React 18, TanStack Query, Socket.IO, MapLibre GL, and a NestJS 10 + Prisma 7 + PostgreSQL backend. The Operations Center is client-rendered after the App Router shell, and the main dashboard performs several independent authenticated list queries on mount.

The strongest source-confirmed performance causes are:

1. **Large and sometimes unbounded list responses.** The dashboard asks for 100 incidents and 100 responders. The map asks for 200 incidents, although the backend caps incident pages at 100. Resources and responders have backend `findMany` calls without `take`/`skip`, so their response size grows with the database.
2. **Polling remains active while Socket.IO is connected.** The same operational data is refreshed by intervals and by socket-triggered invalidation. Socket events also invalidate broad list keys, causing full-list refetches for single-record changes.
3. **Map updates render DOM markers and rebuild the responder array.** Every buffered GPS flush replaces the full responder array, and both map implementations render one React-Map-GL `Marker` per incident/responder. The code has a 200 ms buffer, but no clustering or viewport-based reduction.

These are **confirmed source-level bottlenecks or scaling risks**, not measured browser timings. No running website, browser trace, API access log, database query plan, or production telemetry was available during this investigation, so actual LCP/INP/long-task duration, request latency, response bytes, marker counts, and CPU/memory impact remain unverified.

The investigation also found build/type-check blockers that prevent a clean production validation:

- Frontend and backend TypeScript checks fail because `@agap/shared` does not export `isCoordinateInBocaue`.
- The frontend production build compiles, then fails type validation on the same missing export.
- The build reports an ESLint 9/Next 14 invalid-options incompatibility.
- The build warns that `sharp` is not installed for production image optimization.

These validation failures are reported because they affect the ability to measure or ship performance changes; they were not fixed.

## 2. Confirmed project architecture

| Area | Evidence |
|---|---|
| Web framework/rendering | Next.js `^14.2.0`, App Router under [frontend/app](/C:/Users/githu/Music/agap-emergency/frontend/app), client components marked `'use client'`, dynamic SSR-disabled MapLibre route |
| UI/runtime | React `^18.3.0`, Tailwind CSS, Radix UI, Lucide |
| Server state | TanStack Query `^5.56.0` in [frontend/providers/providers.tsx](/C:/Users/githu/Music/agap-emergency/frontend/providers/providers.tsx) |
| Local state | React state/memo/hooks; Zustand is installed but was not part of the traced Operations Center path |
| Realtime | `socket.io-client ^4.8.0`; singleton socket in [frontend/lib/websocket.ts](/C:/Users/githu/Music/agap-emergency/frontend/lib/websocket.ts), cache synchronization in [frontend/providers/socket-provider.tsx](/C:/Users/githu/Music/agap-emergency/frontend/providers/socket-provider.tsx) |
| Mapping | `maplibre-gl ^6.14.0` and `react-map-gl ^8.1.3`; dynamic MapLibre map in [frontend/app/(ops)/operations/map/page.tsx](/C:/Users/githu/Music/agap-emergency/frontend/app/(ops)/operations/map/page.tsx), incident maps in [frontend/components/incidents/IncidentMapView.tsx](/C:/Users/githu/Music/agap-emergency/frontend/components/incidents/IncidentMapView.tsx) and [frontend/components/dispatch/IncidentMap.tsx](/C:/Users/githu/Music/agap-emergency/frontend/components/dispatch/IncidentMap.tsx) |
| Backend | NestJS `^10.4.0`, Express adapter, Socket.IO gateway |
| Database/ORM | PostgreSQL with PostGIS and pg_trgm; Prisma `^7.0.0`; schema in [backend/prisma/schema.prisma](/C:/Users/githu/Music/agap-emergency/backend/prisma/schema.prisma) |
| Cache/jobs | Redis via ioredis and BullMQ are installed/backend-wired; no Redis cache was found in the traced dashboard list reads |
| Authentication | JWT/Passport guards on operations API routes; frontend reads a token with `getToken()` and sends an Authorization header |
| Fonts/assets | `next/font/google` IBM Plex Sans/Mono in [frontend/app/layout.tsx](/C:/Users/githu/Music/agap-emergency/frontend/app/layout.tsx); MapLibre worker copied by [frontend/next.config.mjs](/C:/Users/githu/Music/agap-emergency/frontend/next.config.mjs) |

### Relevant scripts and versions

- Root: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`
- Frontend: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
- Backend: `pnpm start:dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`
- Required runtime: Node `>=20`, pnpm `>=9`
- `reactStrictMode: true` is enabled in [frontend/next.config.mjs](/C:/Users/githu/Music/agap-emergency/frontend/next.config.mjs). This is a development diagnostic factor, not evidence that Strict Mode is the root cause.
- React Query Devtools is rendered unconditionally in [frontend/providers/providers.tsx](/C:/Users/githu/Music/agap-emergency/frontend/providers/providers.tsx). This is a bundle/runtime concern, but bundle size was not measured.

## 3. Affected routes and reproducibility status

| Route | Source path | Reproducibility from source | Main data path |
|---|---|---|---|
| Operations dashboard | `/dashboard` | Confirmed request fan-out; runtime lag unmeasured | incidents, available resources, responders, surge state, published announcements |
| Incident queue | `/operations/incidents` | Confirmed client-side filtering/sorting over fetched page; runtime cost depends on returned row count | `GET /api/v1/incidents?perPage=100` |
| Real-time incident map | `/operations/map` | Confirmed 100-row incident request, responder polling, socket updates, DOM markers | incidents, `/locations/responders`, map style |
| Dispatch workspace | `/operations/dispatch` | Source reviewed through shared dispatch hooks/components; runtime lag unmeasured | dispatch incidents, incident detail, units, responders, polling + socket invalidation |
| Other operations pages | `/operations/*` | Not runtime-profiled; many share the same shell/socket provider and query defaults | route-specific hooks and shared query client |

There is no evidence in the repository that the reported lag occurs in development, production, or both. The code/configuration supports both modes, but no browser session or deployment telemetry was available.

## 4. Investigation methods and limitations

### Performed

- Inspected root, frontend, backend, architecture, setup, and performance audit documentation.
- Inspected package manifests, workspace configuration, Next configuration, frontend route tree, hooks, API fetchers, map components, Socket.IO provider, backend controllers/services, and Prisma indexes.
- Searched for polling, invalidation, socket listeners, map markers, list queries, and missing error/loading boundaries.
- Ran:
  - `pnpm --filter @agap/frontend typecheck`
  - `pnpm --filter @agap/frontend build`
  - `pnpm --filter @agap/backend typecheck`
- Checked repository state before writing this report; the worktree was clean and the report path did not exist.

### Not performed / not claimable

- No browser navigation, DevTools Performance recording, Lighthouse run, Playwright trace, or Web Vitals capture.
- No request waterfall, response-size measurement, server access log, APM trace, database `EXPLAIN`, PostgreSQL `pg_stat_statements`, Redis metrics, CPU sample, memory profile, or heap snapshot.
- No dependency installation, database command, migration, configuration change, or production-data access.
- No claim that any particular endpoint is slow in milliseconds.

## 5. Evidence-backed findings

### F-01 — Operations pages over-fetch incident and responder lists

| Field | Detail |
|---|---|
| Finding ID | F-01 |
| Priority | **P1 — High** |
| Affected routes | `/dashboard`, `/operations/incidents`, `/operations/map`, dispatch-related surfaces |
| Affected code | Dashboard calls at [dashboard/page.tsx:49](/C:/Users/githu/Music/agap-emergency/frontend/app/(ops)/dashboard/page.tsx:49) and [dashboard/page.tsx:51](/C:/Users/githu/Music/agap-emergency/frontend/app/(ops)/dashboard/page.tsx:51); map request construction at [features/map/api.ts:50](/C:/Users/githu/Music/agap-emergency/frontend/features/map/api.ts:50); list query at [incidents.service.ts:206](/C:/Users/githu/Music/agap-emergency/backend/src/incidents/incidents.service.ts:206) |
| Category | Network/API payload size, client rendering, database work |
| Evidence | Dashboard requests `perPage: 100` for incidents and responders. The map constructs `perPage=200`; the backend caps `perPage` at 100 and still returns a full page. The incident queue also requests `perPage:100` and performs filtering/sorting in the browser at [operations/incidents/page.tsx:47](/C:/Users/githu/Music/agap-emergency/frontend/app/(ops)/operations/incidents/page.tsx:47). |
| Impact | Each affected route must transfer and process up to 100 incidents before the UI can represent the full page. Actual bytes and latency are unmeasured. |
| Confidence | **Confirmed** source behavior; **impact magnitude unverified** |
| Likely root cause | UI requests a broad operational page and applies active/category/priority/search filtering client-side instead of asking the server for the small active working set. |
| Recommended fix | Add server-side active/status/category/priority/search filters and request a bounded summary projection. Use pagination or virtualization for the complete history queue. Keep incident integrity and authorization unchanged. |
| Side effects | Server filtering must preserve current status semantics, permissions, ordering, and live insertion behavior; changing list shapes can affect socket cache patching. |
| Verification | Capture request count/bytes and TTFB before/after; verify active/all-status filters, pagination, socket insertion, and dispatch workflows with representative incident counts. |

### F-02 — Resource and responder list endpoints are unbounded

| Field | Detail |
|---|---|
| Finding ID | F-02 |
| Priority | **P1 — High** |
| Affected routes | `/dashboard`, `/operations/fleet`, `/operations/dispatch` |
| Affected code | Resource controller [resources.controller.ts:31](/C:/Users/githu/Music/agap-emergency/backend/src/resources/resources.controller.ts:31) and service [resources.service.ts:22](/C:/Users/githu/Music/agap-emergency/backend/src/resources/resources.service.ts:22); responder controller [responders.controller.ts:24](/C:/Users/githu/Music/agap-emergency/backend/src/responders/responders.controller.ts:24) and service `findAll` at [responders.service.ts:46](/C:/Users/githu/Music/agap-emergency/backend/src/responders/responders.service.ts:46) |
| Category | Backend/API scalability |
| Evidence | `ResourcesService.findAll` calls Prisma `findMany` with no `take`/`skip`. The resource controller accepts filters but no page/per-page parameters. The responder controller always calls `findAll({})`; the service query has no pagination. |
| Impact | Response size and Prisma result processing grow with table cardinality. No runtime size or latency was measured. |
| Confidence | **Confirmed** source behavior; **user-visible impact strongly suspected as data grows** |
| Likely root cause | The API contract does not enforce bounded list results even though callers conceptually use these as dashboard lists. |
| Recommended fix | Add bounded pagination and purpose-specific summaries such as available responders/resources. Select only fields needed by each page. |
| Side effects | Existing clients may rely on arrays; introduce a compatible migration or dedicated endpoints and update all consumers before changing wire shapes. |
| Verification | Seed representative scale, record response bytes/query duration, assert server-side caps, and test dispatch resource selection. |

### F-03 — Polling and socket invalidation are active simultaneously

| Field | Detail |
|---|---|
| Finding ID | F-03 |
| Priority | **P1 — High** |
| Affected routes | Any route using incident/dispatch/resource/responder queries, especially dashboard and dispatch |
| Affected code | Polling in [features/incidents/hooks.ts:25](/C:/Users/githu/Music/agap-emergency/frontend/features/incidents/hooks.ts:25), [features/surge/hooks.ts:19](/C:/Users/githu/Music/agap-emergency/frontend/features/surge/hooks.ts:19), legacy dispatch hooks [hooks/useDispatch.ts:62](/C:/Users/githu/Music/agap-emergency/frontend/hooks/useDispatch.ts:62), and broad event invalidation in [socket-provider.tsx:98](/C:/Users/githu/Music/agap-emergency/frontend/providers/socket-provider.tsx:98) |
| Category | Network duplication, rendering churn, real-time synchronization |
| Evidence | Query hooks define 15–30 second intervals, while SocketProvider invalidates whole query families for `incident.created`, `incident.updated`, assessment, and dispatch events. The provider already patches individual incident status and responder positions in some cases, proving a narrower cache strategy is supported. |
| Impact | Connected clients can issue periodic full-list requests in addition to event-driven refetches. Exact duplicate request count and render duration are unmeasured. |
| Confidence | **Confirmed source behavior; impact strongly suspected** |
| Likely root cause | Polling was retained as a fallback but is not gated by socket health; event handlers use broad invalidation rather than patching the affected list item. |
| Recommended fix | Gate fallback polling on degraded/disconnected socket state; patch affected records from event payloads where complete data is available; refetch once after reconnect to close gaps. |
| Side effects | Socket loss must not leave stale operational data; preserve a conservative fallback interval and visible connection state. |
| Verification | With a browser network recorder, compare request volume in connected, disconnected, reconnecting, and high-event-rate scenarios; assert no missed incident/status updates. |

### F-04 — Live map uses one DOM-backed marker per incident and responder

| Field | Detail |
|---|---|
| Finding ID | F-04 |
| Priority | **P1 — High** at high marker counts; **P2 — Medium** at current small counts |
| Affected route | `/operations/map` and dispatch map surfaces |
| Affected code | Incident/responder markers in [IncidentMapView.tsx:198](/C:/Users/githu/Music/agap-emergency/frontend/components/incidents/IncidentMapView.tsx:198) and [IncidentMapView.tsx:228](/C:/Users/githu/Music/agap-emergency/frontend/components/incidents/IncidentMapView.tsx:228); dispatch map equivalents [IncidentMap.tsx:127](/C:/Users/githu/Music/agap-emergency/frontend/components/dispatch/IncidentMap.tsx:127) and [IncidentMap.tsx:154](/C:/Users/githu/Music/agap-emergency/frontend/components/dispatch/IncidentMap.tsx:154) |
| Category | Map rendering/main thread |
| Evidence | Both implementations map incidents/responders to React-Map-GL `Marker` components. The map data request can return up to 100 incidents, and the responder array is updated from socket events. No clustering, viewport culling, or symbol-layer aggregation is present in the traced components. |
| Impact | Marker DOM reconciliation and React renders increase with visible marker count and update frequency. No frame-rate or long-task measurement is available. |
| Confidence | **Confirmed implementation risk; runtime severity unverified** |
| Likely root cause | DOM-backed markers are used for all operational points rather than a MapLibre source/layer or clustered representation. |
| Recommended fix | Keep the initial minimal change as server-side active filtering and batched cache updates; then benchmark a GeoJSON source/layer and clustering at representative counts before migrating. |
| Side effects | A layer migration must preserve selection, accessibility, priority styling, Bocaue bounds, and incident drawer behavior. |
| Verification | Profile 10/50/100/500 points with GPS updates, measuring FPS, scripting time, layout/paint, and heap growth. |

### F-05 — Responder GPS flush replaces the entire live-responder array

| Field | Detail |
|---|---|
| Finding ID | F-05 |
| Priority | **P2 — Medium** |
| Affected route | `/operations/map`, any live responder consumer |
| Affected code | Buffer flush in [socket-provider.tsx:185](/C:/Users/githu/Music/agap-emergency/frontend/providers/socket-provider.tsx:185) |
| Category | React rendering/state allocation |
| Evidence | The provider correctly buffers updates for 200 ms, but each flush copies the array and uses `.map()` across all existing responders for each changed responder. `setQueryData` returns a new array even when one position changes. |
| Impact | Up to approximately five cache updates per second while GPS events are active; exact event rate and render cost are unmeasured. |
| Confidence | **Confirmed source behavior; impact unverified** |
| Likely root cause | Array-shaped cache state makes per-entity updates O(n) and notifies every array subscriber. |
| Recommended fix | Maintain an entity-indexed cache or reduce updates to changed visible entities; benchmark before changing the public hook shape. |
| Side effects | Consumers and socket payload handling must preserve ordering, metadata, and responder disappearance semantics. |
| Verification | Use React Profiler and a synthetic GPS stream; compare commit count, scripting time, and allocations at realistic responder counts. |

### F-06 — Incident detail endpoint over-fetches historical relations

| Field | Detail |
|---|---|
| Finding ID | F-06 |
| Priority | **P2 — Medium** |
| Affected route | Incident detail drawer/dispatch detail |
| Affected code | [incidents.service.ts:180](/C:/Users/githu/Music/agap-emergency/backend/src/incidents/incidents.service.ts:180) |
| Category | Backend query/payload size |
| Evidence | `findById` includes reporters, patients, attachments, all incident events ordered ascending, locations, dispatches, and assessments. The detail API returns all of these for every detail open. |
| Impact | Payload and relation query work grow with incident history and media. No query duration or payload size was measured. |
| Confidence | **Confirmed source behavior; user-visible impact unverified** |
| Likely root cause | One endpoint serves both summary/detail needs without field/relation selection. |
| Recommended fix | Add a minimal summary/detail contract or explicit include selection; keep sensitive-data authorization unchanged. |
| Side effects | Drawer tabs/timeline/media must request their data without introducing waterfalls or exposing additional data. |
| Verification | Measure response bytes and DB duration for short and long incident histories; verify drawer timeline/media and authorization. |

### F-07 — Production validation is blocked by repository consistency errors

| Field | Detail |
|---|---|
| Finding ID | F-07 |
| Priority | **P1 — High** for release/performance verification; not itself a measured runtime bottleneck |
| Affected routes | Frontend map route and backend location/incident compilation |
| Affected code | `isCoordinateInBocaue` imports at [operations/map/page.tsx:12](/C:/Users/githu/Music/agap-emergency/frontend/app/(ops)/operations/map/page.tsx:12), [incidents.service.ts:15](/C:/Users/githu/Music/agap-emergency/backend/src/incidents/incidents.service.ts:15), and [locations.service.ts:9](/C:/Users/githu/Music/agap-emergency/backend/src/locations/locations.service.ts:9) |
| Category | Build/tooling reliability |
| Evidence | Frontend typecheck failed with the missing shared export plus existing Leaflet/type errors. Backend typecheck failed with the same missing export. Frontend build compiled but failed during type validation; it also reported ESLint invalid options and missing `sharp`. |
| Impact | A clean production bundle and reliable before/after benchmark cannot be established until the baseline validates. |
| Confidence | **Confirmed** |
| Likely root cause | Shared package exports and frontend remnants are out of sync; Next/ESLint versions/configuration are incompatible for the build path. |
| Recommended fix | Treat as a separate baseline-readiness workstream; do not mix it with performance remediation without approval. |
| Side effects | Shared export changes can affect mobile/backend consumers; Leaflet cleanup may affect unused or legacy map code. |
| Verification | Run frontend/backend typecheck, production build, lint, and targeted tests from a clean checkout; record bundle output after successful build. |

### F-08 — React Query Devtools is included unconditionally

| Field | Detail |
|---|---|
| Finding ID | F-08 |
| Priority | **P2 — Medium** |
| Affected routes | All frontend routes |
| Affected code | [providers/providers.tsx:4](/C:/Users/githu/Music/agap-emergency/frontend/providers/providers.tsx:4) and [providers/providers.tsx:42](/C:/Users/githu/Music/agap-emergency/frontend/providers/providers.tsx:42) |
| Category | Bundle/runtime overhead |
| Evidence | The package is imported and rendered without a `NODE_ENV` guard. |
| Impact | Production bundle/runtime overhead is plausible, but the bundle contribution was not measured in this repository state. |
| Confidence | **Confirmed source behavior; size impact unverified** |
| Likely root cause | Development tooling was left in the production component tree. |
| Recommended fix | Load/render Devtools only in development or a separately controlled internal build. |
| Side effects | Developers must retain Devtools in local development; avoid changing query behavior. |
| Verification | Compare production bundle analyzer output and browser transfer sizes with and without the devtools path. |

### F-09 — No App Router error boundary was found

| Field | Detail |
|---|---|
| Finding ID | F-09 |
| Priority | **P2 — Medium** reliability concern |
| Affected routes | Operations shell and all nested routes |
| Affected code | No `error.tsx` matched under [frontend/app](/C:/Users/githu/Music/agap-emergency/frontend/app) |
| Category | Failure recovery, not direct performance |
| Evidence | Repository search found no App Router `error.tsx`. |
| Impact | A map/WebGL or component exception may result in an unrecoverable route failure rather than a local retry. Runtime crash frequency is unknown. |
| Confidence | **Confirmed absence; runtime impact unverified** |
| Likely root cause | Route-level failure UI has not been implemented. |
| Recommended fix | Add scoped error boundaries with retry while preserving auth and emergency workflow state. This is a reliability remediation, not a substitute for fixing the exception. |
| Side effects | Boundary placement can change state reset behavior; test unsaved dispatch actions carefully. |
| Verification | Inject a controlled render error in a test-only path and verify retry/recovery without affecting other routes. |

## 6. Root-cause analysis

The evidence points to a **feedback loop between data volume and synchronization strategy**, rather than one isolated React hook:

1. Pages request broad operational lists (`perPage:100`, map request `perPage=200`) and some backend list APIs are unbounded.
2. The client filters/sorts those lists and renders them, including map marker components.
3. Socket events invalidate broad query families, causing full-list requests for small changes.
4. Polling continues as a fallback even when the socket is healthy, adding another source of requests and cache updates.
5. Responder GPS events are buffered, but each flush still replaces an array consumed by map/UI subscribers.

The database schema does contain relevant incident status/order indexes at [schema.prisma:230](/C:/Users/githu/Music/agap-emergency/backend/prisma/schema.prisma:230) and [schema.prisma:234](/C:/Users/githu/Music/agap-emergency/backend/prisma/schema.prisma:234). Therefore, this inspection does **not** support claiming “missing incident indexes” as a root cause. Query plans and latency metrics are required before making a database-index recommendation.

## 7. Prioritized remediation table

| Rank | Finding | Priority | Evidence strength | Expected benefit | Risk/effort |
|---:|---|---|---|---|---|
| 1 | F-01 bounded/server-side operational queries | P1 | Confirmed | High on slow links and at scale | Medium |
| 2 | F-02 bound resource/responder APIs | P1 | Confirmed | High as registries grow | Medium |
| 3 | F-03 coordinate polling with socket health and narrow invalidations | P1 | Confirmed | High reduction in duplicate requests/renders | Medium |
| 4 | F-07 restore clean type/build baseline | P1 | Confirmed | Enables trustworthy release and measurement | Medium, separate scope |
| 5 | F-04 benchmark/map marker strategy | P1/P2 | Confirmed risk, runtime unverified | Potentially high at marker scale | Medium/high |
| 6 | F-06 split incident detail payload | P2 | Confirmed | Medium for long histories/media | Medium |
| 7 | F-05 optimize responder entity updates | P2 | Confirmed | Medium under GPS load | Medium |
| 8 | F-08 remove production Devtools | P2 | Confirmed, size unmeasured | Low/medium bundle reduction | Low |
| 9 | F-09 add recovery boundaries | P2 | Confirmed absence | Reliability improvement | Low |

## 8. Recommended minimal-change fix plan (approval required)

No fixes were applied. The smallest safe sequence is:

1. **Baseline readiness:** resolve the shared export/type/build issues in a separate approved change; keep any legacy Leaflet cleanup explicitly scoped.
2. **Server-side list bounds:** add compatible query filters and bounded summaries for incidents, resources, and responders. Preserve current authorization and public response identifiers.
3. **Realtime synchronization:** gate polling only when Socket.IO is healthy, preserve a conservative fallback when degraded, and patch/invalidate only affected query records.
4. **Measurement gate:** capture request counts/bytes, Web Vitals, React commits, map FPS, long tasks, and backend query timings before deciding whether marker-layer migration is justified.
5. **Detail payload:** split or parameterize incident detail relations after measuring drawer response size and query latency.
6. **Low-risk hardening:** conditionally load React Query Devtools and add scoped route error boundaries.

Do not combine emergency workflow changes, authentication changes, schema migrations, or a wholesale map-library replacement with the first performance patch.

## 9. Required runtime measurements still missing

Collect these in both development and a production build, using a representative authenticated dispatcher account and representative incident/resource counts:

- Navigation timing, LCP, FCP, CLS, INP, TTFB, JS transfer/decoded sizes, and hydration duration for `/dashboard`, `/operations/incidents`, `/operations/map`, and `/operations/dispatch`.
- Network waterfall with request URL, status, duration, transfer size, decoded body size, initiator, and duplicate request grouping.
- Socket connection/reconnect timeline, event rate by event name, and query invalidations/refetches per event.
- React Profiler commit count and duration during initial load, incident creation/status change, filtering, drawer open, and responder GPS updates.
- Chrome Performance trace for long tasks, scripting, layout, paint, WebGL/map work, and frame rate with 10/50/100/500 markers.
- Heap snapshots before/after 10 minutes of GPS updates and route navigation; inspect detached nodes and listener growth.
- Backend request latency percentiles, response bytes, error/time-out/retry rates, Prisma query durations/counts, and PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` for list/detail queries.
- Resource/responder/incident cardinalities and payload sizes at current and surge-mode scale.
- Production build bundle analysis after the baseline build is made green.

## 10. Verification and regression checklist

### Functional safety

- [ ] Guest and authenticated incident reporting remain available.
- [ ] Reporter and patient separation is unchanged.
- [ ] Incident persistence remains synchronous before background work.
- [ ] Dispatcher authorization, organization scope, and ownership checks remain unchanged.
- [ ] Socket updates never delete/cancel incidents and reconnect refreshes do not lose events.
- [ ] ETA remains labeled as an estimate and dispatch is not blocked by map/notification failures.

### Performance

- [ ] Dashboard initial request count and bytes are recorded before/after.
- [ ] Incident queue server filters/pagination are tested at empty, normal, and surge-scale datasets.
- [ ] Resource/responder responses enforce a server-side bound.
- [ ] Connected and disconnected socket modes have bounded, non-duplicative polling.
- [ ] Map marker/frame/long-task measurements meet agreed thresholds at representative counts.
- [ ] Detail drawer payload and query timings are measured for short and long incident histories.
- [ ] Production bundle excludes development-only Devtools.

### Validation

- [ ] Frontend `typecheck`, `lint`, targeted tests, and production `build` pass.
- [ ] Backend `typecheck`, `lint`, targeted tests, and production `build` pass.
- [ ] Emergency-flow and realtime tests pass.
- [ ] No secrets, credentials, or environment values are included in logs or reports.

## 11. Three most important findings

1. **F-01 — broad incident/responder fetches:** confirmed by dashboard `perPage:100` calls, map `perPage=200` request construction, and client-side incident filtering/sorting. This is the clearest direct source of avoidable transfer and render work, although its real-world latency is not measured.
2. **F-03 — polling plus broad socket invalidations:** confirmed by interval-configured query hooks and SocketProvider invalidations of whole query families. This creates a credible duplicate-request/render loop; request counts must be captured to quantify it.
3. **F-02 — unbounded resources/responders endpoints:** confirmed by backend `findMany` calls with no pagination. It is a scaling root cause that can become a major user-visible bottleneck as operational registries grow, even though current database cardinality and response latency were not available.

This investigation is complete. No remediation has been implemented; approval is required before changing application code or configuration.
