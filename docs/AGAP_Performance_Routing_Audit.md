# AGAP — Performance, Routing & Real-Time Audit

**Date:** 2026-10-16  
**Scope:** `frontend/` · `backend/` · `mobile/`  
**Prepared by:** Claude Code audit (automated + manual file review)

---

## Executive Summary

The AGAP frontend is slow at initial load primarily because of three problems: **oversized data fetches** (up to 500 records in one request), **backend endpoints that ignore pagination parameters**, and **redundant refetches caused by broad WebSocket cache invalidations + simultaneous polling**. The real-time layer is architecturally sound (Socket.io + TanStack Query cache patching) but needs surgical tightening. Three documented REST routes do not exist in the backend. There are zero error boundaries in the frontend, meaning any runtime crash produces a white screen.

**Findings:** 18 issues  
**Critical:** 7 | **High:** 5 | **Medium:** 3 | **Low:** 3

---

## 1. Critical Issues

### C-1 — Oversized data fetches on initial page load

| | |
|---|---|
| **Location** | `frontend/app/(ops)/dashboard/page.tsx:49,51` · `operations/fleet/page.tsx:306,309` · `operations/incidents/page.tsx:47` |
| **Current behavior** | Dashboard requests `perPage:100` for incidents **and** responders on every mount. Fleet requests `perPage:500` for resources + `perPage:200` for responders. Incidents queue requests `perPage:100` and then filters entirely client-side. |
| **Impact** | Each page load downloads 100–500 records before showing anything. On a 5 Mbps field connection this is the primary cause of perceived slowness. |
| **Fix** | Add `activeOnly=true` and `status[]` multi-value filter to `GET /incidents` so the server returns only the 10–20 records that actually need action. Reduce dashboard to `perPage:20`. Add server-side pagination to fleet (infinite scroll or page controls) instead of fetching everything. |

---

### C-2 — Resources backend ignores `perPage` — returns ALL records

| | |
|---|---|
| **Location** | `backend/src/resources/resources.controller.ts:36–37` · `resources.service.ts:22,29` |
| **Current behavior** | The controller accepts `status`, `type`, `orgId` query params but **no** `page` or `perPage`. The service calls `findMany` with no `take`/`skip`. Frontend sends `perPage:500` — backend ignores it and returns every resource record. |
| **Impact** | Fleet page always transfers the full resources table. As the resource registry grows this becomes progressively worse. |
| **Fix** | Add `@Query('page') page?: number` and `@Query('perPage') perPage?: number` to the controller. In the service, apply `take: Math.min(perPage ?? 50, 200)` and `skip: (page - 1) * take`. |

---

### C-3 — Responders backend has no pagination

| | |
|---|---|
| **Location** | `backend/src/responders/responders.controller.ts:33` · `responders.service.ts:45` |
| **Current behavior** | `GET /responders` controller calls `findAll({})` with no query params. `findAll(_filters)` ignores its argument entirely — no `take`, no `skip`. Returns every responder row every time. |
| **Impact** | Every page that shows responders (dashboard, fleet, dispatch) downloads the full responders table. |
| **Fix** | Same pattern as C-2: accept and honour `page`/`perPage`; cap at 100. For the dispatch panel crew selector, add a dedicated `?available=true` filter that returns only `availability_status = AVAILABLE` responders. |

---

### C-4 — `ReactQueryDevtools` ships to production

| | |
|---|---|
| **Location** | `frontend/providers/providers.tsx:4,42` |
| **Current behavior** | `ReactQueryDevtools` is imported unconditionally and rendered on every page load in every environment. |
| **Impact** | Adds ~100 KB+ to the production JS bundle. Visible devtools panel is a data-exposure risk (query keys show internal IDs). |
| **Fix** | Wrap in an environment check: `{process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}` or use a conditional dynamic import. |

---

### C-5 — WebSocket cache invalidations are too broad

| | |
|---|---|
| **Location** | `frontend/providers/socket-provider.tsx:99–145` |
| **Current behavior** | `incident.created` fires 3 full list invalidations (`['incidents']`, `['dispatch-incidents']`, `['incident-locations']`). `incident.updated` / `assessment_updated` invalidates the entire `['incidents']` list for a single-item change. `dispatch.created` fires 5 invalidations at once. |
| **Impact** | Every new incident or dispatch triggers at least 3 parallel refetch requests, each downloading up to 100 records. Under moderate incident load this causes a constant background churn of large requests. |
| **Fix** | For `incident.created`: use `setQueryData` to prepend the new incident to the cached list (same optimistic-update pattern already used for `incident.status_changed` at line 64). For `incident.updated`/`assessment_updated`: patch only the matching item in the list instead of invalidating the whole array. |

---

### C-6 — Zero `error.tsx` error boundaries

| | |
|---|---|
| **Location** | `frontend/app/` — entire tree |
| **Current behavior** | No `error.tsx` file exists anywhere in the frontend. Next.js App Router requires `error.tsx` to catch component-level errors; without one, any uncaught exception (network error, shape mismatch, WebGL crash on the map) propagates to a white screen with no recovery path. |
| **Impact** | Any runtime crash on the dispatch page or map means the dispatcher sees a blank screen and has no retry button. In an emergency this is a reliability failure. |
| **Fix** | Add `frontend/app/(ops)/error.tsx` immediately. High-risk routes should have their own: `operations/dispatch/error.tsx`, `operations/map/error.tsx`. Each should render a human-readable error + Retry button that calls `reset()`. |

---

### C-7 — Polling and WebSocket both active simultaneously

| | |
|---|---|
| **Location** | `frontend/hooks/useDispatch.ts:61` · `frontend/hooks/useIncidents.ts` |
| **Current behavior** | Both hooks configure `refetchInterval` (20 s and 15 s respectively) as a WebSocket fallback. However, these intervals fire unconditionally — even when the socket is connected and already keeping the cache fresh via `socket-provider.tsx`. |
| **Impact** | When the WebSocket is connected every dispatch or incident hook refetches its full dataset on a 15–20 s timer **in addition to** every socket event. This doubles the API load and causes duplicate React renders. |
| **Fix** | Gate the interval on the WS connection state: `refetchInterval: wsState === 'connected' ? false : 20_000`. Pass `wsState` from `useWsState()` as an option to the hook, or expose a shared "ws degraded" signal from the socket provider. |

---

## 2. High Issues

### H-1 — `GET /api/v1/alerts` does not exist

| | |
|---|---|
| **Location** | `backend/src/emergency-alerts/emergency-alerts.controller.ts:21` · `CLAUDE.md` REST API Routes section |
| **Current behavior** | CLAUDE.md documents `/api/v1/alerts` as a REST route. The controller is registered with `@Controller({ path: 'emergency-alerts' })`, making the actual path `/api/v1/emergency-alerts`. |
| **Impact** | Any client code (mobile offline sync, external integrations) that calls `/api/v1/alerts` will receive `404 Not Found`. |
| **Fix** | Either update CLAUDE.md to reflect the real path `/api/v1/emergency-alerts`, or add a route alias: `@Controller([{ path: 'emergency-alerts', version: '1' }, { path: 'alerts', version: '1' }])`. |

---

### H-2 — `GET /api/v1/tracking` has no controller

| | |
|---|---|
| **Location** | `backend/src/` — no `tracking.controller.ts` found · `CLAUDE.md` REST API Routes |
| **Current behavior** | CLAUDE.md lists `/api/v1/tracking` as a REST endpoint. The locations controller uses path `locations`, not `tracking`. No separate tracking controller exists. |
| **Impact** | Mobile responder location-tracking posts and map polling against `/tracking` will 404. |
| **Fix** | If live-tracking endpoints exist under `/locations` then update CLAUDE.md. If tracking is a distinct concept (MOD-13/MOD-43), create `backend/src/locations/tracking.controller.ts` with its own versioned route. |

---

### H-3 — `GET /api/v1/reports` has no controller

| | |
|---|---|
| **Location** | `backend/src/` — no `reports.controller.ts` found · `CLAUDE.md` REST API Routes |
| **Current behavior** | CLAUDE.md lists `/api/v1/reports` but no controller implements it. |
| **Impact** | Any frontend analytics export or PDF-generation call to this route will 404. |
| **Fix** | Stub a minimal `ReportsController` (MOD-50) that returns `501 Not Implemented` with a message, so callers get a meaningful response instead of a 404. Update CLAUDE.md to reflect current state. |

---

### H-4 — Kitchen-sink debug page exposed in production

| | |
|---|---|
| **Location** | `frontend/app/(ops)/ops/kitchen-sink/page.tsx` |
| **Current behavior** | A UI component test page accessible at `/ops/kitchen-sink`. It is protected only by the `(ops)` layout auth, meaning any logged-in dispatcher/responder can access it. |
| **Impact** | Exposes internal component states and demo data to all authenticated users. Not a security emergency but unprofessional and potentially confusing. |
| **Fix** | Add a top-level guard: `if (process.env.NODE_ENV !== 'development') notFound();`. Or move the file to `__tests__/` and render it only in Storybook/Jest. |

---

### H-5 — `findById` on incidents includes 7 nested relations

| | |
|---|---|
| **Location** | `backend/src/incidents/incidents.service.ts:172–183` |
| **Current behavior** | `GET /incidents/:id` includes: `incident_reporters`, `incident_patients`, `incident_attachments`, `incident_events` (all, ordered), `incident_locations`, `dispatches`, `on_scene_assessments`. This runs 7 sub-queries per single incident detail fetch. |
| **Impact** | The dispatch panel calls `useIncident(id)` on every row click. For active incidents with many events and attachments this query can be slow, and the payload is large. |
| **Fix** | Accept an optional `?include=` query param (comma-separated field names). The dispatch view only needs `incident_locations`, `dispatches`, and basic fields — it should not load all attachments and events. The full detail view (drawer) can request everything. Alternatively: add a `findSummary(id)` with a minimal include set, separate from `findById`. |

---

## 3. Medium Issues

### M-1 — Responder GPS updates rebuild the full list array on every flush

| | |
|---|---|
| **Location** | `frontend/providers/socket-provider.tsx:185–203` |
| **Current behavior** | The 200 ms GPS flush iterates the entire `['live-responders']` array with `.map()` and creates a new array even when only one responder moved. With 10+ active responders this runs 5 times per second. |
| **Impact** | Continuous unnecessary array allocations; each flush causes a React re-render of every component subscribed to `['live-responders']` (map markers, fleet panel). |
| **Fix** | Keep an internal `Map<string, LiveResponderPosition>` as the cache value. Update only the changed key. Convert to an array only in a selector (`useSelector`) or in the component that needs an array for rendering. |

---

### M-2 — `incident.created` should prepend, not invalidate

| | |
|---|---|
| **Location** | `frontend/providers/socket-provider.tsx:98–107` |
| **Current behavior** | On `incident.created` the provider calls `qc.invalidateQueries` on three query keys, triggering three HTTP round-trips even though the server just emitted the new incident data. |
| **Impact** | The new incident does not appear instantly — it waits for the refetch to complete. Under high incident load (surge/mass-casualty) this creates a lag on the most time-critical view. |
| **Fix** | The `incident.created` WebSocket payload contains `incidentId`, `type`, `priority`, `status`, `location`, and `reportedAt`. Use `setQueryData` to prepend a minimal list item to `['incidents']` and `['dispatch-incidents']` immediately. Invalidate `['incident-locations']` only (for the map). |

---

### M-3 — WebSocket reconnect needs stale-data UI feedback

| | |
|---|---|
| **Location** | `frontend/lib/websocket.ts` · `frontend/components/layout/ConnectionIndicator.tsx` |
| **Current behavior** | Socket.io is configured with exponential backoff (`reconnectionDelay:2000`, `reconnectionDelayMax:30000`). The `ConnectionIndicator` shows the connection state. However, the cache is not invalidated after a successful reconnect, so stale data can silently persist during a disconnect window. |
| **Impact** | A dispatcher who loses connectivity for 60 s reconnects with outdated incident statuses until the 15/20 s polling interval fires. In a fast-moving incident this is a safety issue. |
| **Fix** | In `socket-provider.tsx`, add a `socket.on('connect', ...)` handler that calls `qc.invalidateQueries()` (all) when reconnecting after a disconnect. This forces a full refresh exactly once on reconnect, not continuously. |

---

## 4. Low Issues

### L-1 — `next.config.mjs` missing production hardening

| | |
|---|---|
| **Location** | `frontend/next.config.mjs` |
| **Missing** | `poweredByHeader: false` (leaks framework identity to scanners), `compress: true` (Gzip/Brotli at the Next.js level, important if not handled by a reverse proxy), `images.remotePatterns` (the modern replacement for the deprecated `images.domains: []`), `output: 'standalone'` (cuts Docker image size by ~60%). |
| **Fix** | Add all four to `nextConfig`. |

---

### L-2 — Missing per-page `loading.tsx` skeletons for high-traffic routes

| | |
|---|---|
| **Location** | `frontend/app/(ops)/operations/` |
| **Current behavior** | The shared `(ops)/loading.tsx` shows a KPI-tile skeleton. It is the correct fallback for most pages. But for the fleet grid and incidents queue the KPI skeleton is misleading — users see placeholder stat cards where a table or card grid should appear. `operations/dispatch/loading.tsx` and `operations/map/loading.tsx` already have purpose-built skeletons. |
| **Fix** | Add custom `loading.tsx` for: `operations/fleet/loading.tsx` (card grid skeleton), `operations/incidents/loading.tsx` (table row skeleton), `operations/risk/loading.tsx` (map placeholder). Leave the rest to the shared skeleton — it is adequate. |

---

### L-3 — `UnitCard` creates one mutation hook per card

| | |
|---|---|
| **Location** | `frontend/app/(ops)/operations/fleet/page.tsx:121` |
| **Current behavior** | `useUpdateResourceStatus()` is called inside `UnitCard`, which is rendered for every resource. With `perPage:500` that instantiates 500 separate mutation hook objects. |
| **Impact** | Minor memory overhead; each hook registers its own loading/error state. Not a visible slowness cause at current scale but worth fixing as the registry grows. |
| **Fix** | Lift the mutation to `FleetPage` and pass `onStatusChange: (id, status) => void` as a prop to `UnitCard`. |

---

## 5. Mobile — Minor Items

### MOB-1 — `_layout.tsx` has separate `useEffect` calls that could be combined

| | |
|---|---|
| **Location** | `mobile/app/_layout.tsx:83–110` |
| **Current behavior** | Two `useEffect` hooks fire sequentially on mount for loading auth store and accessibility store. Each triggers a render cycle. |
| **Fix** | Merge into a single `useEffect` that runs both `loadFromStorage()` calls in parallel with `Promise.all`. |

---

### MOB-2 — No try-catch on FCM token registration

| | |
|---|---|
| **Location** | `mobile/app/_layout.tsx:52` |
| **Current behavior** | `await registerFcmToken(...)` is called inside an async IIFE. If this throws (e.g. Firebase unreachable) the error is unhandled. |
| **Fix** | Wrap in `try { await registerFcmToken(...) } catch (e) { logger.warn(...) }`. Per the Reliability Rules, a failed push-notification registration must never block or crash the app. |

---

## 6. Fix Roadmap

Priority order based on impact/effort ratio. Items marked **Quick Win** can be done in under 1 hour each.

| # | Issue | Severity | Effort | Impact | Quick Win |
|---|---|---|---|---|---|
| 1 | Add `error.tsx` at `(ops)/error.tsx` | Critical | 30 min | Eliminates white-screen crashes | ✓ |
| 2 | Remove `ReactQueryDevtools` from production | Critical | 5 min | ~100 KB bundle reduction | ✓ |
| 3 | Gate polling on WS state (`refetchInterval` fix) | Critical | 30 min | Eliminates duplicate API calls | ✓ |
| 4 | Add `poweredByHeader: false` + `compress: true` to `next.config.mjs` | Low | 5 min | Security + network | ✓ |
| 5 | Update CLAUDE.md routes (`/alerts` → `/emergency-alerts`, remove `/tracking` and `/reports` until implemented) | High | 15 min | Prevents future 404s in new code | ✓ |
| 6 | Add kitchen-sink `notFound()` guard in non-dev | High | 5 min | Removes debug surface | ✓ |
| 7 | Add pagination to `GET /responders` (backend) | Critical | 1 h | Caps responder list payload |  |
| 8 | Add pagination to `GET /resources` (backend) | Critical | 1 h | Caps resource list payload |  |
| 9 | Add `activeOnly` / `status[]` filter to `GET /incidents` (backend) | Critical | 2 h | Dramatically reduces dashboard payload |  |
| 10 | Reduce dashboard queries to `perPage:20` (frontend) | Critical | 30 min | Faster FCP on dashboard | ✓ |
| 11 | Use `setQueryData` prepend for `incident.created` WS event | Critical | 1 h | Instant new-incident display |  |
| 12 | Patch single item for `incident.updated` / `assessment_updated` | Critical | 1 h | Eliminates full-list refetch on update |  |
| 13 | Invalidate all queries on socket reconnect | Medium | 30 min | Eliminates stale-data after disconnect | ✓ |
| 14 | Add `findSummary(id)` with minimal includes to incidents service | High | 2 h | Faster dispatch panel detail load |  |
| 15 | Use `Map` cache for GPS location updates in socket-provider | Medium | 1 h | Reduces map re-render frequency |  |
| 16 | Add `operations/fleet/loading.tsx` and `operations/incidents/loading.tsx` | Low | 30 min | Better perceived load on nav | ✓ |
| 17 | Lift `useUpdateResourceStatus` out of `UnitCard` | Low | 20 min | Minor memory saving | ✓ |
| 18 | Stub `GET /api/v1/reports` returning 501 | High | 20 min | Prevents silent 404 in analytics | ✓ |

---

## 7. Quick Wins Summary (≤ 1 hour each, can be batched in one PR)

1. Remove `ReactQueryDevtools` from production — `providers/providers.tsx:4,42`
2. Add `(ops)/error.tsx` with retry button
3. Add `poweredByHeader: false`, `compress: true`, `output: 'standalone'` to `next.config.mjs`
4. Gate `refetchInterval` on `useWsState()` in `useDispatch.ts` and `useIncidents.ts`
5. Guard kitchen-sink page with `process.env.NODE_ENV !== 'development'`
6. Reduce dashboard `perPage` from 100 → 20 for incidents and responders
7. Add socket `connect` handler → `qc.invalidateQueries()` in `socket-provider.tsx`
8. Stub `GET /api/v1/reports` with 501
9. Update CLAUDE.md REST route table to reflect actual paths

These 9 items together require approximately **3–4 hours** of focused work and will produce a measurable improvement in initial load time, bundle size, and operational reliability.
