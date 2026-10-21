# Plan: Barangay Alert & Callback Automation

> **Status (2026-10-22):** Phases 0–2 done. Phases 3–4 built and mostly live-verified; the dispatcher-side checks are pending (see each phase). Phase 5 built (SMS replies, polling), live check pending. Phase 6 built (directory admin), API live-verified. Running as a **school demo on our own phones**; see [Demo setup](#demo-setup-school-demo-2026-10-22).
> **How to use:** build one phase at a time, in order. Each phase ends with a **Done when** checklist that must pass before the next phase starts.
> **Modules:** MOD-17 (SMS gateway), MOD-34 (multi-agency coordination), MOD-21/23 (ops dashboard), MOD-41 (escalation), MOD-46 (audit).

## Context

Today, when a citizen or bystander reports an emergency, only the MDRRMO Operations Center learns about it. If the local barangay (BDRRMC/BPSO) should help, the dispatcher has to:
1. work out the barangay by hand,
2. look up its hotline,
3. phone it and read out the location,
4. wait for the barangay to phone back.

`incident_locations.barangay` exists but is never filled. Nothing in AGAP knows barangay contacts, and AGAP can only *send* SMS (`backend/src/jobs/processors/sms.processor.ts` calls Textbee `send-sms` only).

The external proposal (`proposed-automation-implementation.md`) auto-*assigns* incidents to barangays and holds MDRRMO back for 3 minutes. We are **not** doing that: it breaks Rule 8 (no autonomous dispatch) and risks delay on critical calls.

**Intended outcome:**
- AGAP automatically works out the barangay and **texts it the moment a report is submitted**, as information only.
- MDRRMO triage carries on in parallel.
- The dispatcher gets one-tap calling with logged outcomes, plus a follow-up reminder when the barangay goes quiet (Option A).
- Optionally, the barangay can reply `OTW/DONE/NEED <code>` by SMS (Option B, behind a flag).
- **The dispatcher always confirms closure.** No barangay accounts are needed.

**Decisions confirmed:**
- Barangay is decided by **polygons, with an "approximate" flag**.
- SMS goes to the **primary + backup** numbers.
- Option B is **built behind a flag**.

### Demo setup (school demo, 2026-10-22)

This is a school demo first. **No real barangay or MDRRMO number is texted**: we have no permission yet to use the published numbers, so every text goes to our own phones.

| Role | Phone | Where it is set |
|---|---|---|
| Textbee gateway: sends every text and receives replies. Also stands in for the MDRRMO ops number. | 0975-524-7821 | `TEXTBEE_DEVICE_ID`; `MDRRMO_OPS_PHONE=+639755247821` |
| Barangay: every barangay, e.g. Batia | 0969-478-4013 | `BARANGAY_SMS_TEST_OVERRIDE_PHONE=+639694784013`; Batia's `barangay_contacts` row; `bocaue-barangay-hotlines.json` |

With `NODE_ENV=development`, every barangay text goes to the override phone, whichever barangay the case is in. With no override set, no barangay text is sent at all. A placeholder `MDRRMO_OPS_PHONE` (blank or all zeros, e.g. `+639000000000`) is treated as unset: no ops SMS is queued, and the "Call MDRRMO" line is left out of barangay texts (`configuredOpsPhone`).

**Demo flow**
1. A citizen sends an SOS or a guided report from inside Batia (use 14.83221, 120.94920).
2. The barangay phone gets **two texts**:
   - the alert, e.g. `AGAP 3526 MEDICAL Brgy Batia 14.83221,120.94920 INC-2026-000023. Code 3526-ANWQ. Call MDRRMO +639755247821`
   - the coordinates alone, ready to paste into Google Maps.
3. The barangay opens the saved `<PUBLIC_APP_URL>/b` page (the Cloudflare tunnel address) and types the code. It then sees the case, the map, directions and the status buttons. Each tap appears live in the dispatcher's **Barangay** tab.
4. The barangay can also **reply by SMS** from its normal messaging app to 0975-524-7821. Today the reply reaches the Textbee phone, but AGAP does not read it yet. **Phase 5 makes AGAP read it.**

**Demo notes**
- **No web address in the SMS.** Carriers drop texts that contain one, so the barangay must already have the `/b` page saved.
- **The tunnel address changes on every `pnpm tunnel`.** Keep one tunnel open for the whole demo, and restart the backend whenever `PUBLIC_APP_URL` changes.

**Before real use:**
- Restore Batia's real numbers.
- Confirm every number with MDRRMO, using [barangay-contact-confirmation.md](../automation/barangay-contact-confirmation.md).
- Set the real `MDRRMO_OPS_PHONE`.
- Run with `NODE_ENV=production`, where demo contacts are refused.

### Data findings that shape the plan

- **The polygons in the repo are not good enough, but better ones are free.** `mobile/src/assets/geo/bocaue-barangays.json` holds 19 very coarse shapes (5–18 vertices each) that cover only **57%** of the municipality and spill **5.4 km²** outside it. **OpenStreetMap has all 19 barangay boundaries** (admin level 10) that cover **94%** with no overlaps. Phase 1 uses OSM (see the Phase 0 findings). Spelling: OSM and the hotline poster use `Bundukan`/`Tambubong` or `Bunducan`/`Tambubong` inconsistently; match by normalized name and use OSM's spelling as the official one.
- **The hotline JSON coordinates are unreliable.** Only 1 of 33 evacuation points falls inside its own barangay's polygon (checked with a point-in-polygon script). Treat those coordinates as **unverified** and never use them for routing.
- **`geo_regions` cannot hold the barangay shapes yet.** `boundary` is `geometry(Polygon, 4326)` (migration `20261013120000_add_geo_regions`), so MultiPolygons won't fit. The only row is the rectangular `bocaue-municipality`, which `backend/src/auth/auth.service.ts` reads by `name='Bocaue' AND region_type='municipality'`. That query must keep working.
- **Hotline numbers need normalizing.** `769-2412` has no area code. `(044) 07924300` is malformed. Landlines can't receive SMS. No number says whose phone it is.
- **Guided reports don't send any SMS.** `IncidentsService.create` queues no SMS; only `EmergencyAlertsService.createFromSos` does. Barangay notification must hook into **both** paths.

### Design guardrails (apply to every phase)

- **No new incident statuses and no `BARANGAY_RESPONDER` role.** Barangay involvement lives on a separate `incident_barangay_notices` row, not in the incident lifecycle.
- **Notification runs after commit and is best-effort.** It is called with `void …` and wrapped in try/catch, the same pattern as `notifyIncidentCreated`, so an SMS or realtime failure can never fail or delay an incident.
- **Barangay SMS never carries reporter or patient data**, and stays under 160 characters.
- **Barangay replies never change incident status.** The dispatcher confirms.
- **Delayed work goes through BullMQ delayed jobs, not `@Cron`.** This follows the `sla-monitor.processor.ts` pattern and avoids double-firing across instances.

### Phase overview

| Phase | Delivers | Depends on |
|---|---|---|
| 0 | Pre-work: Textbee inbound check, confirmed numbers, polygon check | — |
| 1 | Clean directory data, DB migration, seed | 0 |
| 2 | Automatic barangay tagging and dispatcher panel (no SMS) | 1 |
| 3 | Automatic alert SMS to the barangay | 2 |
| 4 | Option A: callback logging, outcomes, follow-up reminder, confirm handled | 3 |
| 5 | Option B: SMS reply codes (behind a flag) | 4, and the Phase 0 Textbee check |
| 6 | Barangay directory admin UI | 1 (can run in parallel with 3–5) |

---

## Phase 0: Pre-work (no code)

1. **Check Textbee inbound support.** Confirm in Textbee's API docs or dashboard whether received SMS can be pushed (webhook) or listed (polling endpoint). Record the payload shape. This decides the Phase 5 receiver.
2. **Confirm numbers with MDRRMO.** Get each barangay's primary and backup *mobile* numbers. Until then, the seed marks the first mobile number as primary and the second as backup, with `verified_at = null`.
3. **Sanity-check the polygons.** Plot them over a real map. **Done 2026-10-20: the repo's polygons failed and OSM's passed** (see findings). Official PSA/NAMRIA boundaries can replace OSM later through a new data migration, with no code change.

**Done when:**
- [x] The Textbee inbound mode is known (webhook / poll / none). **Both exist; see findings.**
- [ ] An MDRRMO-confirmed number list exists, or the defaults are accepted. **Sheet ready: [barangay-contact-confirmation.md](../automation/barangay-contact-confirmation.md).**
- [x] The polygons look correct on a map. **Use OSM boundaries, not the mobile asset.** Check it yourself: open [barangay-polygon-map.html](../automation/barangay-polygon-map.html) in a browser.
- [x] **Receive SMS is switched on** in the Textbee app. Verified 2026-10-20 15:11 UTC: `receiveSMSEnabled: true`, fresh heartbeat. The polling endpoint answers `200` and shows 0 received messages. **Round-trip test PASSED 2026-10-21:** `AGAP TEST 1` texted from `+639757072301` to the Textbee SIM was received on the phone at 09:33:29 UTC and appeared in `GET /gateway/messages?direction=received` at 09:33:35 UTC (about 6 s later), with `sender: "+639757072301"` in E.164, `status: "received"`. Notes for Phase 5: the `sender` field is the plain E.164 number for a person's phone (carrier senders are short names such as `TM` or `8080`), and one earlier message had a bogus 1999 `receivedAt`, so use `createdAt` as a fallback.

### Phase 0 findings (2026-10-20)

**1. Can Textbee receive SMS? Yes, but it is switched off on our device.**
- A read-only `GET /gateway/devices` with our key returned one device (`samsung SM-G991W`, app 2.9.0, heartbeat current) with **`receiveSMSEnabled: false`**.
- **Action (you, on the phone):** Textbee app → Settings → SMS → turn on **Receive SMS** ("Forward incoming SMS to backend"), grant the SMS permission, and exclude the app from battery optimization. Then re-run the device check; it must show `true`.

**2. Two ways to get replies, both documented by Textbee** ([Receiving SMS](https://textbee.dev/docs/receiving-sms), [webhook guide](https://textbee.dev/blog/receive-sms-webhook-android-gateway)):

| | Webhook (push) | Polling |
|---|---|---|
| How | Dashboard → Webhooks → URL + signing secret (≥ 20 chars) → event `MESSAGE_RECEIVED` | `GET https://api.textbee.dev/api/v1/gateway/messages?direction=received&order=asc&limit=50&cursor=…&from=<ISO>` with `x-api-key` |
| Needs | A **public HTTPS URL** (not localhost; use a tunnel in dev) | Nothing public. Works from a laptop or a server behind NAT |
| Latency | Seconds | Our poll interval (15 s) |
| Dedup key | `idempotencyKey` (stable across retries) | message `_id` |
| Caveat | At-least-once delivery, up to 10 retries on 5xx, 3 on 4xx. No webhook if the phone uploads the SMS more than 48 h late | Returns those late messages too |

- **Webhook body:** `smsId, message, deviceId, webhookSubscriptionId, webhookEvent, idempotencyKey, sender, receivedAt`.
- **Signature:** header `X-Signature`, HMAC-SHA256 hex, keyed by the signing secret. The exact signed bytes are not documented (the vendor's Node and Python examples differ). **Verify over the raw request body, and test with a real delivery before relying on it.**
- **Poll response:** `{ data: [{ _id, message, sender, receivedAt, direction, status, device }], meta: { limit, nextCursor, hasMore } }`.

**Decision for Phase 5:** build **polling first** (works without a public URL, which suits the current dev setup) and add the webhook receiver when there is a stable public HTTPS endpoint. Both feed the same `handleInbound`, so nothing else changes.

**Corrections to Phase 5 below:**
- The webhook authenticates by verifying `X-Signature`, not a custom `x-agap-webhook-secret` header. The env var `TEXTBEE_WEBHOOK_SECRET` is the signing secret.
- The dedup key is the Textbee `idempotencyKey` (webhook) or message `_id` (poll). Store either as `provider_message_id`.
- The poller must remember its last `receivedAt` and pass it as `from`, and page with `cursor` while `hasMore`.

**Still open:** Textbee's own docs do not say whether the phone must be online and charged for receipt. A dead or offline phone means no inbound SMS and no outbound alerts, so the dashboard needs a "SMS gateway offline" indicator driven by `lastHeartbeatAt`.

**3. Phone numbers: format check of the 53 listed numbers**

| | Count |
|---|---|
| Valid mobile (`09xx…`), SMS-capable | 47 |
| Valid landline (`044…`), call only | 4: Caingin, Poblacion, Sulucan, Tambubong |
| **Invalid, need correction** | **2: Bagumbayan `769-2412` (no area code, probably `044-769-2412`) and Biñang 1st `(044) 07924300` (extra `0`; probably `044-792-4300`)** |

- **All 19 barangays have at least two SMS-capable mobile numbers**, so primary + backup works everywhere.
- No number is shared between barangays.
- `MDRRMO_OPS_PHONE` in `backend/.env` is set and in `+639…` form.
- **Not verifiable by code:** whether any number is actually staffed, and whose phone it is. That needs MDRRMO. Use [barangay-contact-confirmation.md](../automation/barangay-contact-confirmation.md): each BDRRMC ticks the working numbers, names one Primary and one Backup, and writes who answers.
- **Source:** the numbers come from a Facebook poster, "Designated Evacuation Areas with Hotline Numbers, Municipality of Bocaue", posted **29 August 2026**. It is a public post, not an MDRRMO-verified directory. Until the sheet is filled in, keep `BARANGAY_ALERTS_ENABLED=false`, or use `BARANGAY_SMS_TEST_OVERRIDE_PHONE`, so no barangay phone is texted unconfirmed.
- **Demo override (temporary):** Batia's contact is set to a demo number for the instructor demo: first `0975-707-2301`, and **since 2026-10-21 `0969-478-4013`** (see [Demo setup](#demo-setup-school-demo-2026-10-22)). The poster's four real Batia numbers are kept in `original_contact_numbers` in the JSON, with `demo_override: true`. Restore them before real use. The Phase 1 seed must **fail loudly if `demo_override` is set when `NODE_ENV=production`**.

**4. Polygons: compared by plotting on a real map** ([barangay-polygon-map.html](../automation/barangay-polygon-map.html); open it in a browser, layers can be toggled)

| Measure (sampled over the municipality, 26.6 km²) | Repo mobile asset | OpenStreetMap |
|---|---|---|
| Municipality covered by a barangay | **57%** | **94%** |
| Polygon area outside the municipal boundary | 5.4 km² | 1.5 km² |
| Overlap between barangays | 0.06 km² (e.g. Bolacan/Igulot) | none |
| Poster evacuation points inside the right barangay | 1 of 33 | 9 of 33 |

- **The repo's polygons are crude**: they leave 43% of the municipality in no barangay (so most incidents would fall back to "nearest, approximate"), and some, such as Duhat and Bolacan, reach into Santa Maria and Marilao. **Do not use them for routing.** The mobile map still draws them; replacing them is a separate follow-up.
- **OSM's 19 barangay boundaries fit well** (their total area, 26.4 km², matches the municipality's 26.6 km²). The ~6% gap is mostly water and fishponds, where the 300 m nearest-barangay fallback in Phase 2 applies.
- **The poster's coordinates are still mostly wrong** (only 9 of 33 fall in the right barangay even with good boundaries). That confirms they are not to be used for routing; they are display-only hints.

**5. Poster vs. our JSON** (read from a low-resolution screenshot; please double-check on the original post)

| Barangay | Difference |
|---|---|
| Bambang | Poster has a third number, `0970-947-2599`, missing from our JSON |
| Bunlo | Poster's third number reads `0961-505-9159`; our JSON has `0994-512-1331` |
| Sulucan | Our JSON has an extra `(044) 913-6980` that is not on the poster |
| Biñang 2nd | Poster's evacuation area is "Dr. Yanga's College Elida Campus"; our JSON says "Brgy. Hall and Senior Citizens Office" |
| Wakas | Poster lists "Barangay Hall" and "Dr. Yanga's College Inc." (Oro Villas / Mc Arthur Highway); our JSON says "DYCI & German Espiritu Liner (Garahe)" |
| Taal | Poster appears to list a second area, "Multi Purpose Bldg., M.E. Nicolas St."; our JSON has only the Barangay Hall |
| Biñang 1st | `(044) 07924300` is printed that way on the poster too, so it is a poster typo, not ours |

Resolve these before the contacts are seeded (the numbers matter most; evacuation names matter less for this feature).

---

## Phase 1: Data foundation

**Directory file:**
- Rename `docs/automation/bocaue-barangay's-hotlines.json` to `docs/automation/bocaue-barangay-hotlines.json`. The apostrophe breaks shells and imports.
- Restructure each entry:
  - `barangay_id` (`BATIA`, `BINANG_1ST`, `BUNDUKAN`, `TAMBOBONG`, …)
  - official `name` matching the polygon `NAME`
  - `contacts[]`: `{ raw, e164, kind: MOBILE|LANDLINE, can_sms, role: PRIMARY|BACKUP|OTHER, label, verified_at, source }`
  - `evacuation_areas[]` with `coordinates_verified: false`

**Shared utility:** `shared/src/utils/phone.ts` exports `normalizePhPhone()`:
- `09xx…` → `+639xx…`
- `044…` landline → `+6344…`
- anything else is flagged `INVALID`, which covers `769-2412` and `(044) 07924300`.

**Migration** `backend/prisma/migrations/<timestamp>_barangay_coordination/migration.sql`. Follow the hand-written SQL style of `20261013120000_add_geo_regions`.
1. **Widen `geo_regions.boundary`:**
   `ALTER COLUMN boundary TYPE geometry(MultiPolygon,4326) USING ST_Multi(boundary);`
2. **Insert 19 rows into `geo_regions`:** `id` = `barangay_id`, `region_type='barangay'`, boundary via `ST_GeomFromGeoJSON`. Generate the SQL once with `scripts/db/generate-barangay-regions.ts`, which reads a committed copy of the **OpenStreetMap** boundaries (saved as `docs/automation/bocaue-barangay-boundaries.osm.geojson`; fetch recipe in the script header), and commit the output. Production then gets the shapes through `migrate deploy`, not the seed. **OSM data is ODbL: credit "© OpenStreetMap contributors" in the file header and in docs.** Validate each shape with `ST_IsValid` and `ST_MakeValid` in the migration.
3. **New table `barangay_contacts`:**
   - columns: `id, barangay_id → geo_regions.id, phone_e164, phone_raw, kind, can_sms, role, label, is_active, verified_at, source, created_at, updated_at`
   - unique `(barangay_id, phone_e164)`
4. **New table `incident_barangay_notices`:**
   - identity and matching: `id, incident_id (FK, cascade), barangay_id (FK), match_method (POLYGON|NEAREST|MANUAL), is_approximate`
   - short code: `short_code` (4 digits). A partial unique index on `short_code WHERE closed_at IS NULL` lets codes be reused after closure.
   - SMS tracking: `sms_status (PENDING|SENT|PARTIAL|FAILED|SKIPPED|DISABLED), sms_sent_at`
   - reply tracking: `last_report (ON_THE_WAY|HANDLED|NEEDS_BACKUP|NO_ANSWER), last_report_source (SMS_REPLY|PHONE_CALL), last_report_at, last_report_by_user_id`
   - follow-up and lifecycle: `followup_due_at, followup_sent_at, closed_at, created_at`
   - unique `(incident_id, barangay_id)`
5. **New append-only table `barangay_sms_inbound`:**
   - columns: `id, provider_message_id (unique), from_phone_e164, body, received_at, parsed_command, parsed_code, notice_id?, outcome (APPLIED|DUPLICATE|UNKNOWN_SENDER|UNKNOWN_CODE|NOT_NOTIFIED|UNPARSED|DISABLED)`
   - Created now so Phase 5 needs no second migration.

**Schema and seed:**
- **`backend/prisma/schema.prisma`:** add the three models, relations on `geo_regions` (contacts, notices) and on `Incident` (`barangay_notices`).
- **`backend/prisma/seed/seed.ts`:** upsert `barangay_contacts` from the cleaned JSON.

**Done when:**
- [x] Migration applied and seed succeeds (applied with `prisma migrate deploy`, which never resets the DB; `migrate diff` between `schema.prisma` and the DB is empty).
- [x] `geo_regions` has 20 rows: 19 valid barangay MultiPolygons + the municipality (checked in the live DB).
- [x] The geo-fence query in `auth.service.ts` still accepts inside points (Poblacion) and rejects outside ones (Manila).
- [x] `normalizePhPhone` unit tests pass.

### Phase 1 status: DONE (2026-10-20)

**What was built**

| Area | Files |
|---|---|
| Phone utility | `shared/src/utils/phone.ts` (+ `utils/index.ts`, exported from `shared/src/index.ts`) |
| Directory data | `docs/automation/bocaue-barangay-hotlines.json` (restructured; old apostrophe-named file removed) |
| Boundaries | `docs/automation/bocaue-barangay-boundaries.osm.geojson` (OSM, ODbL attribution inside the file) |
| Generator | `scripts/db/generate-barangay-regions.cjs` |
| Migration | `backend/prisma/migrations/20261021000000_barangay_coordination/migration.sql` |
| Schema | `backend/prisma/schema.prisma`: 3 models, 7 enums, relations on `geo_regions`, `Incident`, `User` |
| Seed | `backend/prisma/seed/barangay-directory.ts`, called from `seed.ts`; also runnable alone: `cd backend && npx ts-node prisma/seed/barangay-directory.ts` |
| Tests | `backend/test/barangay-coordination/{phone,directory-data,directory-seed}.spec.ts` (71 tests) |

**Results:** the full backend suite passes (30 suites, 391 tests); `tsc --noEmit` is clean for `shared` and `backend`. In the dev DB: 48 contacts seeded (19 PRIMARY, 18 BACKUP), all 19 barangay boundaries valid with 0 km² of overlap, and every barangay's interior point resolves to exactly itself.

**Differences from the plan above (all deliberate)**
- The generator is `.cjs`, not `.ts`: it needs no `ts-node` setup and runs with plain `node`.
- The directory JSON is an object `{ _meta, barangays[] }` (not a bare array) so the source, post date and "unverified" flag travel with the data. Stored fields match the plan; extras are `is_demo`, `issue` (why a number is INVALID), `poster_name` and, for the demo barangay, `original_contacts`.
- **Added `barangay_contacts.is_demo`** so the demo number is visible in the database and production alerting can refuse it (Phase 3 must check it).
- **CHECK constraints** beyond the plan: E.164 format; `can_sms` only for MOBILE; PRIMARY/BACKUP must be SMS-capable; `short_code` is 4 digits; `last_report` and `last_report_at` are set together.
- **Partial unique indexes:** one active PRIMARY and one active BACKUP per barangay, and an open-notice-only `short_code`. They exist in the migration only (Prisma cannot model them); `migrate diff` does not flag them.
- `barangay_sms_inbound` has `from_phone` (as received) **and** `from_phone_e164` (null when the sender is not a PH number), instead of only the E.164 column.
- 7 Postgres enums are prefixed `barangay_` to avoid clashes with existing enum names.
- The migration ends with assertions (19 barangays, all valid, municipality row intact) that abort it otherwise.

**Seed rules (as implemented and tested)**
- INVALID numbers (`769-2412`, `(044) 07924300`) are kept in the file but never inserted.
- Re-seeding never overwrites an administrator's role, label, `is_active` or `verified_at`; it only creates new rows and refreshes provenance fields.
- A number this seed created earlier that is no longer in the file is deactivated, so restoring Batia's real numbers retires the demo number automatically.
- A demo contact in the file blocks the seed when `NODE_ENV=production` (verified against the real file).
- A stale number is never reactivated by re-seeding. If you switch Batia back to the demo number after restoring the real ones, reactivate it by hand.

**Carry-overs for later phases**
- `@agap/shared` is consumed from `dist` at runtime, so run `pnpm --filter @agap/shared build` before any backend code (Phase 2+) imports `normalizePhPhone`. Phase 1 backend code does not import it, so nothing needed rebuilding.
- The `municipality` row in `geo_regions` is still the rough rectangle (about 76 km², real Bocaue is about 26.6 km²). The registration geo-fence in `auth.service.ts` therefore accepts points in neighbouring towns, unlike incident reports, which use the precise outline in `shared/src/maps/bocaue-boundary.ts`. Not part of this feature; worth a separate fix.
- The two 044 poster typos and the three poster-vs-JSON number differences (Phase 0, item 5) are still unresolved and affect Bagumbayan, Biñang 1st, Bambang, Bunlo and Sulucan.

---

## Phase 2: Automatic barangay tagging (no SMS yet)

**New module `backend/src/barangay-coordination/`**, registered in `app.module.ts`.

**`barangay-directory.service.ts`:**
- **`resolve(lat,lng)`** using raw SQL:
  1. `ST_Covers(boundary, point)` on `region_type='barangay'`.
  2. If nothing matches, take the nearest polygon within 300 m with `match_method=NEAREST` and `is_approximate=true`.
  3. If the point is within 75 m of a border (geography `ST_Distance` to `ST_Boundary`), set `is_approximate=true`.
  4. A `0,0` location (`source='MANUAL'`) gives `null`.
- **`listContacts(barangayId)`** and **`getAlertTargets(barangayId)`**. The latter returns active, SMS-capable PRIMARY and BACKUP contacts.

**`barangay-notify.service.ts`:** `notifyForIncident(incidentId)`, Phase 2 scope:
1. Resolve the barangay.
2. Write the name to `incident_locations.barangay`.
3. Upsert the notice with a free short code and `sms_status=DISABLED`.
4. Emit realtime.

**Hook points, after commit:**
- `IncidentsService.create` (`backend/src/incidents/incidents.service.ts`, after `notifyIncidentCreated`)
- `EmergencyAlertsService.createFromSos` (`backend/src/emergency-alerts/emergency-alerts.service.ts`, after the queue block)

**Other backend changes:**
- `IncidentsService.updateStatus` sets `closed_at` on open notices when the incident reaches `RESOLVED` or a terminal status. This frees the short code.
- `findById` includes `barangay_notices` (with barangay name). `findAll` adds the barangay name and `last_report` for the queue chip.

**Shared and realtime:**
- `shared/src/events/barangay.events.ts`: `BARANGAY_EVENTS.NOTICE_UPDATED = 'barangay.notice_updated'`, with payload `{ incidentId, barangayId, barangayName, isApproximate, smsStatus, lastReport, lastReportAt, followupDue }`. Register it in `websocket-event.types.ts` and `events/index.ts`.
- New `RealtimeService.barangayNoticeUpdated()` emits to `ops:all` only, never to the citizen's incident room.

**Controller** (`barangay-coordination.controller.ts`, Dispatcher/Supervisor, `JwtAuthGuard` + `RolesGuard`):
- `GET /incidents/:id/barangay`: notice and contacts.
- `PATCH /incidents/:id/barangay`: manual correction → `MANUAL`. This is audited.

**Frontend:**
- **New `frontend/components/incidents/BarangayPanel.tsx`.** Shows the barangay name, an **"Approximate — confirm"** chip with a correction dropdown, and contact rows as `tel:` links. It is rendered in `TriageDetail` (`frontend/app/(ops)/operations/triage/page.tsx`) and `frontend/components/incidents/IncidentDetailDrawer.tsx`.
- **New `frontend/hooks/useBarangay.ts`**, following the pattern of `hooks/useIncidents.ts`.
- **Live updates:** subscribe to `barangay.notice_updated` through `lib/websocket.ts` and invalidate `['incident', id]` and `['incidents']`.
- **Triage queue rows:** a barangay chip.

**Done when:**
- [x] An incident at an interior Batia point shows "Brgy Batia" (verified live against the dev DB).
- [x] A border point shows "Approximate" (verified live).
- [x] A manual-address incident shows "Unknown — set barangay" (no notice is created; verified live).
- [x] Incident creation still succeeds with the barangay module throwing (`notifyForIncident` never throws; unit-tested with a failing directory).

### Phase 2 status: DONE (2026-10-20)

**Built:** `backend/src/barangay-coordination/` (directory service, notify service, controller, module), `BARANGAY_EVENTS` in `shared/src/events/barangay.events.ts`, `RealtimeService.barangayNoticeUpdated` (ops room only), hooks in `IncidentsService.create` and `EmergencyAlertsService.createFromSos`, notice closing in `updateStatus`/`markFalseAlert`/`markDuplicate`/`mergeDuplicate`, `barangay_notices` in `findById`/`findAll`, `BarangayPanel` in the triage page and the incident drawer, `hooks/useBarangay.ts`, a queue chip, and the socket subscription. Tests: `backend/test/barangay-coordination/barangay-notify.spec.ts`.

**Differences from the plan (deliberate)**
- `IncidentsService` and `EmergencyAlertsService` take `BarangayNotifyService` as an `@Optional()` last constructor argument, so existing positional-construction tests keep working. The hook is `void`-called (fire and forget).
- Extra endpoint `GET /barangays` feeds the correction dropdown.
- `GET /incidents/:id` returns `barangay_notices` to staff only. Citizens and crews never receive it.
- Notices are also closed when an incident is marked false alert or duplicate. The separate cancel flow in `false-alerts` does not close them yet; **Phase 3 must close notices there too** (or an open short code stays reserved until the incident closes).
- A manual correction after an SMS has gone out (Phase 3+) only re-points the notice; it does not text the new barangay. Decide that behaviour in Phase 3.
- The correction endpoint is limited to Dispatcher and Supervisor, as planned (System Administrator is not included).

---

## Phase 3: Automatic alert SMS to the barangay

**`barangay-notify.service.ts`:** when `BARANGAY_ALERTS_ENABLED=true`, enqueue one SMS job per alert target (primary + backup).
- Text: `AGAP 4821 ROAD_ACCIDENT Brgy Batia 14.83221,120.94920 INC-2026-001234. Call MDRRMO <MDRRMO_OPS_PHONE>`.
- Assert length < 160.
- If the barangay has no targets, set `sms_status=SKIPPED`.

**`sms.processor.ts`:** extend `SmsJobData` with `noticeId?` and `critical?`.
- `critical` jobs rethrow on failure so BullMQ retries: enqueue with `attempts: 4`, exponential backoff.
- On success or final failure, update `sms_status` (`SENT`/`PARTIAL`/`FAILED`) and emit realtime.
- Non-critical jobs (OTP) keep today's swallow behavior.

**Dev safety:** if `BARANGAY_SMS_TEST_OVERRIDE_PHONE` is set, every barangay SMS goes to that number instead. Required in non-production.

**Controller:** `POST /incidents/:id/barangay/resend`.

**`BarangayPanel`:** shows the SMS status, with **Resend** on failure.

**Config** (`backend/src/config/config.validation.ts` + `.env.example`):
- `BARANGAY_ALERTS_ENABLED`, default `false`. Turned on only after MDRRMO verifies the numbers.
- `BARANGAY_SMS_TEST_OVERRIDE_PHONE`

**Done when:**
- [ ] With the override phone set, the guided report and the SOS each deliver one text per target. **SOS: PASS live 2026-10-21. Guided report: not yet run live.**
- [x] With a bad Textbee key, the status shows `FAILED` after retries and the incident is unaffected. **PASS live 2026-10-21** (see Phase 4 live results).

The guided-report run is the only open check. `node scripts/dev/test-barangay-sms.js` covers the SOS path end to end.

### Phase 3 status: BUILT, live check pending (2026-10-21)

**Built**

| Area | Files |
|---|---|
| Alert text + sending | `backend/src/barangay-coordination/barangay-notify.service.ts`: `buildBarangayAlertSms`, `sendAlert`/`queueAlert`, `resend`, `recordSmsResult`, `isNoticeOpen` |
| Retries | `backend/src/jobs/processors/sms.processor.ts`: `SmsJobData.noticeId` / `critical`; critical jobs rethrow and write the result back |
| Endpoint | `POST /incidents/:id/barangay/resend` (Dispatcher/Supervisor, audited as MOD-17; 404 if no notice, 409 if refused) |
| Cancel paths | `FalseAlertsService.cancel` / `markFalseAlert` and the SOS grace-window `EmergencyAlertsService.cancel` now close notices (Phase 2 carry-over) |
| Config | `BARANGAY_ALERTS_ENABLED`, `BARANGAY_SMS_TEST_OVERRIDE_PHONE` in `config.validation.ts` and `.env.example` |
| UI | `BarangayPanel`: SMS status chip (sent time when SENT) and **Resend** on FAILED/PARTIAL; `useResendBarangayAlert` |
| Tests | `backend/test/barangay-coordination/barangay-alert-sms.spec.ts` (28 tests). Full backend suite: 32 suites, 433 tests pass |

**How the status is worked out.** Each target's final result is merged into `sms_status` by one atomic SQL `CASE`. Success turns PENDING into SENT and FAILED into PARTIAL. Failure turns PENDING into FAILED and SENT into PARTIAL. The result is right whatever order the two texts finish in, so no new migration or per-target table was needed. This was checked against the dev Postgres for all 8 orderings, inside rolled-back transactions. While a backup number is still retrying, the chip can briefly show the first result.

**Differences from the plan (deliberate)**
- The text adds ` (approx)` after the barangay name when the match is approximate, and `no GPS` replaces the coordinates when there are none. If the call-back line would push the text to 160 characters, it is dropped first. For all 19 barangays and all categories it fits with room to spare (tested).
- Retry backoff is 5 s → 10 s → 20 s, over 4 attempts. A missing `TEXTBEE_API_KEY`/`TEXTBEE_DEVICE_ID` fails at once (`UnrecoverableError`) and records FAILED, since retrying cannot fix it.
- "Required in non-production" is enforced twice. The backend refuses to boot with `BARANGAY_ALERTS_ENABLED=true` outside production unless the override is a valid PH mobile. As a runtime guard, the notice also stays `DISABLED` without one.
- In production, `is_demo` contacts are never texted (Phase 1 carry-over).
- **Manual correction (Phase 2 open question):** if the dispatcher changes the barangay, the new barangay is texted. If they only confirm the same one, nothing is re-sent. The previously texted barangay gets no "disregard" message. That is left for later.
- A queued text whose incident was cancelled first (for example, inside the 15 s SOS grace window) is skipped and recorded as `SKIPPED`.
- Resend is allowed (server-side) from FAILED, PARTIAL, SKIPPED or DISABLED once alerts are on. The panel offers it only for FAILED and PARTIAL.

**Live findings (2026-10-21)**
- **Outbound Textbee works.** A manual send through the API to `+639757072301` was `delivered` at 08:50. An earlier send at 08:10 failed because the SIM had **no load**.
- **Textbee needs carrier load.** It sends from the phone's SIM, at normal carrier rates. With no load, the API still accepts the send ("Handed to phone") and the device reports `failed` about 2 minutes later ("SMS failed on device … code 0"). Use an unlimited-text promo, and keep the SIM loaded: when it runs out, **every** alert path fails, including the MDRRMO SOS SMS.
- **Delivery-status gap: FIXED in code 2026-10-21 (not yet live-tested).** `SmsProcessor` now takes the `smsBatchId` from the send response and queues a delayed `barangay-sms-delivery-check` job (every 15 s, up to 24 polls ≈ 6 min) that reads `GET /gateway/messages?smsBatchId=…`. `delivered` → SENT, `failed` → FAILED, window ends on `sent` → SENT, still pending → FAILED (so Resend is offered). If the response carries no batch id, it falls back to the old behaviour (SENT on accept). Tests in `barangay-alert-sms.spec.ts`. **Verify live:** run the live check with the SIM loaded (expect SENT after ~5–10 s), then with no load (expect FAILED after ~2 min). Original description of the gap: `recordSmsResult('SENT')` fired when Textbee *accepted* the request, not when the text was delivered, so a device failure (no load, no signal, carrier block) showed **Barangay texted**. Original proposal: after a successful send, poll `GET /gateway/messages?direction=sent` (or the message by id) for a few minutes with a delayed BullMQ job, and record SENT only on `delivered`, or FAILED on `failed`. The send response's message id is the key.
- The Phase 0 inbound round-trip (text the Textbee phone, then see it in `direction=received`) is still not done. `receiveSMSEnabled: true` was confirmed.

**To run the live check**
1. In `backend/.env`, set `BARANGAY_ALERTS_ENABLED=true` and `BARANGAY_SMS_TEST_OVERRIDE_PHONE=<your test mobile>`, then restart the backend (Redis must be running).
2. Submit a guided report and an SOS at a point inside Batia. Expect two texts per report on the override phone, and the panel going from **Texting barangay…** to **Barangay texted HH:MM**.
3. Set `TEXTBEE_API_KEY` to a wrong value and restart. A new report should show **Text to barangay failed** about 35 s later (after 4 attempts), and the incident should be unchanged. **Resend** then works once the key is restored.

---

## Phase 4: Option A, dispatcher callback automation

**`barangay-callback.service.ts`:**
- **`logCallAttempt(incidentId, contactId, actor)`:** writes an `IncidentEvent` (from = to current status, with notes; the same pattern as `DispatchService.submitTriage` in `backend/src/dispatch/dispatch.service.ts`) and an audit log.
- **`recordOutcome(incidentId, outcome, notes, actor)`:** outcome is one of `ON_THE_WAY | HANDLED | NEEDS_BACKUP | NO_ANSWER`. It updates the notice and timeline and emits realtime. `NEEDS_BACKUP` also creates an `Escalation` (`LEVEL_1_SUPERVISOR`, "Barangay requested backup") and calls `realtime.notifyEscalation`.
- **`confirmHandled(incidentId, actor, notes)`:** requires status `ASSESSED`. It calls the existing `IncidentsService.createResolution` (outcome `HANDLED_BY_BARANGAY`), then `IncidentsService.updateStatus(→ REFERRED)`. Both transitions are already allowed in `shared/src/enums/incident-status.enum.ts`. The dispatcher then closes with the existing `POST :id/close`. If MDRRMO has already dispatched, `HANDLED` is information only and closure follows the normal responder path.

**Controller:**
- `POST /incidents/:id/barangay/call-attempts`
- `POST /incidents/:id/barangay/outcome`
- `POST /incidents/:id/barangay/confirm-handled`

**Follow-up job:**
- Add `QUEUE_NAMES.BARANGAY_FOLLOWUP = 'barangay-followup'` in `shared/src/constants` and register it in `backend/src/jobs/jobs.module.ts`.
- New `barangay-followup.processor.ts`, scheduled by the notify service with `delay = BARANGAY_FOLLOWUP_MINUTES` (default 20). If the notice is open, has no report, and the incident isn't terminal:
  - send one reminder SMS to the targets
  - set `followup_sent_at`
  - emit realtime.
- Supervisor escalation stays with the existing `sla-monitor.processor.ts`.

**`BarangayPanel`:**
- Clicking a `tel:` link first calls `call-attempts`. Outcome buttons appear after a call.
- A **"Barangay has not reported back"** banner.
- A **Confirm handled** button, enabled only at `ASSESSED`; otherwise a hint explains the next step.

**Config:** `BARANGAY_FOLLOWUP_MINUTES`.

**Done when:**
- [x] With `BARANGAY_FOLLOWUP_MINUTES=1`, the reminder SMS and the banner appear. **Reminder SMS: PASS live 2026-10-21** (banner not yet seen by a logged-in dispatcher).
- [ ] A call attempt shows up in the incident timeline and the audit log. *(built; live check pending)*
- [ ] ASSESSED → Confirm handled → REFERRED → Close works end to end. *(built; live check pending)*

### Phase 4 status: BUILT, live check pending (2026-10-21)

Backend 33 suites / 455 tests pass; `tsc` clean for backend and frontend. Nothing committed.

**Deviations from the plan above**
- **No new queue or processor.** The reminder is a delayed `barangay-followup` job on the existing SMS queue, routed by job name in `SmsProcessor` (same approach as the delivery check). This avoids touching the committed `shared` build output for `QUEUE_NAMES`.
- **Separate module.** `BarangayCallbackModule` ([barangay-callback.module.ts](../../backend/src/barangay-coordination/barangay-callback.module.ts)) holds the three endpoints, because `IncidentsModule` already imports `BarangayCoordinationModule` and the callback service needs `IncidentsService`.
- **Reminder guards.** `sendFollowup` is a no-op when the notice is closed, already reported, already reminded, the incident is terminal, or `followup_due_at` is in the future (a Resend moves the due time, which makes the earlier job stale). The reminder never rewrites `sms_status`.
- **`followupDue` in the realtime event** now means "reminder time passed and no report", regardless of whether the reminder went out. The panel banner uses the same rule.
- **`confirmHandled` rollback.** If `updateStatus(REFERRED)` fails after the resolution row is created, the resolution is deleted so a retry is not blocked by the one-resolution-per-incident constraint.
- **Escalation.** `NEEDS_BACKUP` creates a `LEVEL_1_SUPERVISOR` escalation and emits `notifyEscalation` with type `BARANGAY_BACKUP_REQUESTED`. No supervisor push is sent (the SLA processor does that for its own escalations); add it if wanted.
- Outcome notes are accepted by the API (`notes`, 500 chars) but the panel does not expose a notes field yet.

**Barangay status page: code typed on `/b` (2026-10-21; replaced the SMS link)**
- **Why there is no link:** PH carriers silently drop person-to-person SMS that contain any web address, even a bare `maps.google.com`, yet Textbee still reports them `delivered`. This was proven on 0969-478-4013. **Never put a web address in a barangay SMS**; a comment in `fitSegment` and a test enforce this.
- **The alert is now two texts:**
  - `AGAP 3526 MEDICAL Brgy Batia 14.83221,120.94920 INC-…. Code 3526-ANWQ. Call MDRRMO …`
  - the coordinates alone (job `barangay-coordinates-sms`).
- **If the alert would reach 160 chars,** parts are dropped in this order: the MDRRMO call-back first, then the code. The alert and the coordinates are never cut.
- **The code** is the notice's 4-digit short code plus 4 HMAC letters (no I, L or O), from `BarangayLinkService.accessCodeFor`. No new table. Codes are reused after closure, so the letters pick the right notice. A forged or malformed code gets the same 404 as any wrong code. Key: `BARANGAY_LINK_SECRET`, else derived from `JWT_SECRET`. Old 16-character link tokens still resolve.
- **The barangay** saves `<PUBLIC_APP_URL>/b` once ([frontend/app/b/page.tsx](../../frontend/app/b/page.tsx)), types the code, and is taken to the status page.
- **What the barangay sees:** the status page `frontend/app/b/[token]/page.tsx` (no login; `/b` and `/b/` are public in `middleware.ts`): case + category, **exact location** (address, landmark, coordinates, accuracy radius, *Open map* and *Directions* buttons), and five buttons: **We have seen it** (`SEEN`), **We are acting on it** (`ON_THE_WAY`), **We are on scene** (`ON_SCENE`), **Completed** (`HANDLED`, tap twice) and **We need backup** (`NEEDS_BACKUP`, tap twice, escalates to a supervisor). The barangay sees "Sent to MDRRMO: … · time". A closed case shows "closed" and hides the location. No reporter or patient data is on the page.
- Dispatcher side: every tap is a timeline **Note** ("Brgy Batia via link: barangay is on scene."), an audit row (source `LINK`), a realtime update, and a green status line in `BarangayPanel` ("Barangay: is on scene · 14:05 · via SMS link"). A *Completed* report suggests **Confirm handled** but never changes the incident status by itself.
- Endpoints (public, throttled): `GET /v1/public/barangay/:token`, `POST /v1/public/barangay/:token/report {status}`. Migration `20261021120000_barangay_link_reports` adds enum values `SEEN`, `ON_SCENE` and source `LINK`.
- **Live-verified (link version, before the code change):** the real SMS carried the link and was delivered; GET/POST with the real token recorded SEEN → ON_THE_WAY → ON_SCENE (a repeated tap added nothing); forged tokens → 404; DB rows: source `LINK`, 3 timeline notes, 3 audit rows. 
- **To use from a phone:** the link must be reachable from the phone, so `http://localhost:3001` only works on the same PC. Set `PUBLIC_APP_URL` to one public address of the *web app*: a domain, or a Cloudflare tunnel (`cloudflared tunnel --url http://localhost:3001` gives `https://….trycloudflare.com`). The page calls the backend through the web app's own origin (`next.config.mjs` forwards only `/v1/public/barangay/*`, allowed past the login middleware), so no second tunnel, CORS change or `NEXT_PUBLIC_API_URL` is needed. Restart the web app after pulling this change (rewrites load at startup). A quick tunnel's address is random and changes every run; use a named tunnel on a fixed domain for real use.
- The page shows an inline OpenStreetMap view with a pin (plus *Open map* / *Directions*), so the location is visible without leaving the page.
- Not done: no confirmation/“closed” SMS back to the barangay (the page confirms each tap on screen); no per-official attribution (one shared link per case).

**Drawer workflow fixes (2026-10-21, after a walkthrough of `IncidentDetailDrawer`)**
- `REFERRED` had no action in the drawer footer, so "Confirm handled → REFERRED → Close" dead-ended in the UI. It now offers **Close Incident** (direct close; the resolution already exists).
- Note-only timeline events (from = to status: barangay calls, triage changes) were drawn as status chips. They now render as **Note**.
- Each barangay number has a **Called** button next to the dial link (desk phones, or desktops where `tel:` does nothing). Both log the attempt, show the outcome buttons and refresh the timeline.
- The disabled **Confirm handled** hint now names the exact footer button to press for the current status.
- Not changed: the dispatch console's side panel (`IncidentDetailPanel`) has no barangay panel; only the drawer and the triage page do.

**Files:** `barangay-callback.{service,controller,module}.ts`, `dto/barangay-callback.dto.ts`, additions to `barangay-notify.service.ts` (`sendFollowup`, `scheduleFollowup`, `emitUpdated`, `resolveTargets`), `sms.processor.ts`, `config.validation.ts`, `.env.example`; frontend `useBarangay.ts`, `BarangayPanel.tsx` (now takes `incidentStatus`). Tests: `barangay-callback.spec.ts`.

**Live results (2026-10-21, real Textbee, override phone `09757072301`, `BARANGAY_FOLLOWUP_MINUTES=1`)**
- **Phase 3 + delivery confirmation: PASS.** An SOS at 14.83221,120.9492 (inside Batia) tagged the incident `Batia`, queued one alert (this seed has 1 target), Textbee accepted it, the notice stayed `PENDING`, then became `SENT` only after Textbee reported `delivered`.
- **Phase 4 reminder: PASS.** Exactly 1 min after the alert, `followup_sent_at` was set and the `REMINDER` text was delivered; `sms_status` was untouched.
- **Bad key: PASS.** With `TEXTBEE_API_KEY=bad…` (process env only): 4 attempts (401 each), then `sms_status=FAILED`; the incident was created normally. (`followup_sent_at` is also set in that case: it records that the reminder was *queued*, not delivered.)
- A point outside every barangay (14.79,120.97) correctly gets no notice and no barangay text.
- **Not run live:** the dispatcher endpoints (call-attempts, outcome, confirm-handled) need a dispatcher login; they are covered by unit tests only. The no-load failure path is also untested live (it needs a drained SIM).
- The routes are served at `/v1/…` (no `/api` prefix).

**To run the live check:** with alerts on and the override phone set, add `BARANGAY_FOLLOWUP_MINUTES=1`, restart, submit a report, and wait ~1 min with no reply: expect one reminder text and the amber banner. Then tap a number (timeline entry + audit row), pick an outcome, and for an ASSESSED incident use **Confirm handled**, then Close.

---

## Phase 5: Option B, SMS replies (behind a flag)

**Status: BUILT (polling), live check pending (2026-10-22).** Turned on in the demo `backend/.env` (`BARANGAY_SMS_REPLIES_ENABLED=true`, `BARANGAY_SMS_INBOUND_MODE=poll`). The webhook receiver is not built. See [Phase 5 status](#phase-5-status-built-live-check-pending-2026-10-22) below for what was built and how it differs from this plan.

**Why it is still needed next to the `/b` page:** SMS works with no mobile data at all, and that is the state flood-zone barangays will be in during a typhoon. In the demo, the barangay phone (0969-478-4013) replies from its normal messaging app to the Textbee number (0975-524-7821). The `/b` page and SMS replies record **the same statuses** through the same report path, so the dispatcher sees one status line whichever channel was used.

**Shared parser:** `shared/src/utils/barangay-reply.ts` exports `parseBarangayReply(body)` → `{ status, code } | null`.
- Case-insensitive, tolerant of extra spaces and punctuation, and accepts the words in either order (`DONE 3526` or `3526 DONE`).
- The code is the 4-digit short code. The full `3526-ANWQ` from the alert is also accepted.

| Reply | Also accepted | Status recorded (same as `/b`) |
|---|---|---|
| `SEEN` | `NAKITA` | `SEEN` |
| `OTW` | `PAPUNTA`, `OMW` | `ON_THE_WAY` |
| `ONSCENE` | `NANDITO`, `ON SCENE` | `ON_SCENE` |
| `DONE` | `TAPOS` | `HANDLED` |
| `NEED` | `TULONG`, `BACKUP` | `NEEDS_BACKUP` (escalates to a supervisor, as on `/b`) |

*Change from the original plan:* it had only OTW/DONE/NEED. `SEEN` and `ONSCENE` were added to match the `/b` buttons.

**`barangay-reply.service.ts`:** `handleInbound(msg)` stores every message in `barangay_sms_inbound`, applied or not, and runs these checks in order. The first failing check sets `outcome`.

| # | Check | Outcome on failure |
|---|---|---|
| 1 | Feature flag `BARANGAY_SMS_REPLIES_ENABLED` | `DISABLED` |
| 2 | Idempotency on `provider_message_id` | `DUPLICATE` |
| 3 | Sender is an active number in `barangay_contacts` | `UNKNOWN_SENDER` |
| 4 | The body parses | `UNPARSED` |
| 5 | An open notice has that code | `UNKNOWN_CODE` |
| 6 | That notice belongs to the sender's barangay | `NOT_NOTIFIED` |
| — | All checks pass → recorded with source `SMS_REPLY` | `APPLIED` |

- **Demo rule:** outside production, a reply from `BARANGAY_SMS_TEST_OVERRIDE_PHONE` counts as coming from the barangay the code belongs to. Every barangay's alert goes to that one phone, so check 6 would otherwise refuse replies on cases outside Batia. In production this rule is off.
- **A reply never changes incident status.** `DONE` only shows "Barangay reports done → Confirm handled" to the dispatcher.
- **Reply texts:**
  - For `APPLIED`, an acknowledgement, e.g. `AGAP 3526: received "on the way". Salamat.`
  - For `UNPARSED` from a known number, one help text, e.g. `AGAP: reply OTW 3526, DONE 3526 or NEED 3526`.
  - Both are limited to one per notice per minute.
  - **No reply to unknown senders** (no texting strangers, and no reply loops with carrier short codes such as `TM` or `8080`).

**Receivers.** Both feed `handleInbound`. **Build polling first**, as decided in Phase 0.
- **Poller (`BARANGAY_SMS_INBOUND_MODE=poll`, default):**
  - a repeatable job every 15 s on the existing SMS queue, routed by job name (as in Phase 4; no new queue);
  - calls `GET /gateway/messages?direction=received&order=asc&limit=50&from=<last receivedAt>`, paging with `cursor` while `hasMore`;
  - keeps `from` in Redis, and uses `createdAt` when `receivedAt` is bogus (one message had a 1999 date);
  - stores the message `_id` as `provider_message_id`.
- **Webhook (later, once there is a stable public HTTPS address; a quick tunnel is not one):**
  - `POST /v1/sms/inbound` (the routes have no `/api` prefix), `@Public()`, throttled;
  - checks the `X-Signature` header: HMAC-SHA256 hex of the **raw** body, keyed by `TEXTBEE_WEBHOOK_SECRET`, compared in constant time;
  - stores `idempotencyKey` as `provider_message_id`;
  - test with a real delivery, because the signed bytes are not documented.

**Alert SMS text.** When replies are on, add ` Reply OTW/DONE/NEED 3526`.
- `fitSegment` drop order becomes: the MDRRMO call-back first, then the reply hint, then the code. The alert and the coordinates are never cut.
- A test must keep every barangay × category × `(approx)` combination under 160 characters, and must still assert that no web address appears.

**Barangay tab (`BarangayPanel`):**
- the SMS reply in the status line ("Barangay: is on the way · 14:05 · via SMS reply");
- a "Barangay reports done → Confirm handled" banner;
- a small log of inbound messages and their outcomes, so a dispatcher can see an `UNPARSED` reply and phone the barangay.

**Config** (`config.validation.ts` + `.env.example`):
- `BARANGAY_SMS_REPLIES_ENABLED`, default `false`
- `BARANGAY_SMS_INBOUND_MODE`: `poll` (default) or `webhook`
- `TEXTBEE_WEBHOOK_SECRET`: webhook mode only, at least 20 chars

**Done when:**
- [ ] A test message shaped like the Phase 0 poll response, `DONE 3526` from a registered number, updates the Barangay tab live, and the incident status is unchanged.
- [ ] The same message again is recorded as `DUPLICATE`, and nothing is applied twice.
- [ ] An unknown number is recorded as `UNKNOWN_SENDER`, and no text is sent back.
- [ ] A code belonging to another barangay is recorded as `NOT_NOTIFIED` (production rules).
- [ ] An unreadable reply from a known number is recorded as `UNPARSED`, and one help text is sent.
- [ ] With the flag off, messages are stored as `DISABLED`, and nothing is applied.
- [ ] **Live:** `OTW 3526` texted from 0969-478-4013 to 0975-524-7821 shows in the Barangay tab within about 20 s, and the acknowledgement text arrives.

The first six boxes are covered by unit tests (`backend/test/barangay-coordination/barangay-reply.spec.ts`) but have not been run against the live stack. The last needs the two phones.

### Phase 5 status: BUILT, live check pending (2026-10-22)

**Built**

| Area | Files |
|---|---|
| Parser | `backend/src/barangay-coordination/barangay-reply.parser.ts` (`parseBarangayReply`) |
| Reply handling | `barangay-reply.service.ts` (`handleInbound`, `replyText`) |
| Receiver (poll) | `barangay-sms-poller.ts` (`BarangaySmsPoller`, `BarangaySmsPollProcessor`, `toInbound`) on its own queue `barangay-sms-inbound` |
| Recording | `BarangayCallbackService.reportBySms`: the same path as a `/b` tap (`applyBarangayReport`), with source `SMS_REPLY` |
| Alert/reminder text | `fitSegment` adds `Reply OTW/DONE/NEED <code>.` when replies are on |
| Panel | `GET /incidents/:id/barangay` returns `smsReplies` (last 10 on this case); `BarangayPanel` shows them under the status ("SMS from the barangay") |
| Config | `BARANGAY_SMS_REPLIES_ENABLED`, `BARANGAY_SMS_INBOUND_MODE` in `config.validation.ts` and `.env.example` |
| Tests | `barangay-reply.spec.ts` (57 tests). Full backend suite: 35 suites, 545 tests pass; `tsc` clean for backend and frontend |

**Differences from the plan (deliberate)**
- **The parser is in the backend**, not `shared/`: only the backend uses it, and `shared` is consumed from its committed `dist`, which would need a rebuild.
- **The poll runs on its own queue** (`barangay-sms-inbound`, one worker), not the SMS queue. That way a slow Textbee read can never delay an alert send. The schedule is a BullMQ job scheduler (`upsertJobScheduler`, every 15 s), so restarts and extra instances never double it. It is removed at boot when replies are off.
- **Where the poll resumes comes from the database:** 2 min before the newest stored row, capped at 48 h, or 10 min back on the very first run. No Redis key is needed, and a restart neither loses nor repeats a reply.
- **A reply is applied *before* its row is stored.** If applying fails (database down), nothing is stored and the next poll retries the message. Re-applying the same status is a no-op, so a race is harmless. `DUPLICATE` is never stored as a row, because `provider_message_id` is unique; it is the result returned for a message already seen.
- **Messages for another Textbee device are skipped**, by checking `device._id` against `TEXTBEE_DEVICE_ID`.
- **Rate limit:** one automatic reply per sender per minute, kept in memory, which is enough for one instance. `UNKNOWN_CODE` and `NOT_NOTIFIED` also get a short reply when the sender is known, so the barangay knows to check the code.
- **The reply hint uses only the 4-digit code** (easier to type). The full `3526-ANWQ` is also accepted, and wrong letters are refused as `UNKNOWN_CODE`.
- **Carrier texts** (`TM`, `8080` promos) reach the same inbox. They are stored as `UNKNOWN_SENDER` and never answered.

**To run the live check**
1. Restart the backend (it reads `.env` only at start). With replies on, it logs `Polling Textbee for barangay SMS replies every 15 s`.
2. Run `node scripts/dev/test-barangay-sms.js`. The alert on 0969-478-4013 should now end with `Reply OTW/DONE/NEED <code>.`
3. From 0969-478-4013, text `OTW <code>` to 0975-524-7821. Within about 20 s, expect:
   - the Barangay tab shows **Acting on it · via SMS reply** and the message under "SMS from the barangay";
   - the timeline gets a Note;
   - 0969-478-4013 receives `AGAP <code>: received "on the way". Salamat.`
4. Text `DONE <code>`, then something unreadable. Expect a `HANDLED` status, then one help text. The incident status never changes.

---

## Phase 6: Barangay directory admin

**Status: BUILT, API live-verified; the screen not yet clicked through (2026-10-22).** See [Phase 6 status](#phase-6-status-built-2026-10-22) below.

**Backend:** `GET/POST/PATCH /barangays/contacts` (Org/System Administrator, audited).

**Frontend:** a "Barangay Directory" tab on `frontend/app/(ops)/administration/page.tsx` to list and edit contacts, set primary/backup, and mark contacts verified.

**Done when:**
- [ ] MDRRMO can update a number without a redeploy, and the change applies to the next alert. **API: PASS live 2026-10-22.** Alert targets are read from the table on every alert, so no restart is needed. Still to do: an administrator changes a number on the screen, then a test SOS goes to the new number.

### Phase 6 status: BUILT (2026-10-22)

**Built**

| Area | Files |
|---|---|
| Service | `backend/src/barangay-coordination/barangay-contacts.service.ts` (`listAll`, `create`, `update`) |
| Endpoints | `barangay-contacts.controller.ts`: `GET /v1/barangays/contacts`, `POST /v1/barangays/contacts`, `PATCH /v1/barangays/contacts/:id`. Org/System Administrator only; audited as MOD-34 |
| DTOs | `dto/barangay-contact.dto.ts` |
| Screen | **Barangay Directory** tab on `frontend/app/(ops)/administration/page.tsx` → `frontend/components/admin/BarangayDirectoryTab.tsx`; hooks in `frontend/features/admin/barangay-contacts.ts` |
| Tests | `backend/test/barangay-coordination/barangay-contacts.spec.ts` (19 tests, against an in-memory table that enforces the real CHECKs and partial unique indexes). Full backend suite: 36 suites, 564 tests pass; `tsc` clean for backend and frontend |

**How it behaves**
- **One primary and one backup per barangay.** Giving a number a taken slot moves the current holder into that number's old slot:
  - backup → primary swaps the two;
  - a new or "Other" number taking a slot moves the holder to "Other".
  
  Inside the transaction, the moving number is parked on "Other" first, so neither partial unique index is ever violated.
- **Numbers are never deleted, only deactivated.** A deactivated number drops to "Other" and comes back as "Other", so it never clashes with a newer primary. Inactive numbers are listed separately.
- **Number checks:**
  - numbers are normalized with `normalizePhPhone`; an invalid number such as `769-2412` is refused;
  - a landline can only be "Other", because it cannot receive SMS;
  - a duplicate is refused, with "reactivate it instead" when the old copy is inactive.
- **Seed safety:** added numbers carry `source = 'admin'`. The directory seed only deactivates numbers it created itself (`SEEDED_SOURCES`), so re-seeding never removes them.
- **The screen:**
  - every barangay is flagged **No primary**, **No backup** or **Unverified**;
  - each number has role, label, **Mark verified** (sets `verified_at`), **Not a demo number** (clears `is_demo`) and **Deactivate / Reactivate**;
  - saving also refreshes the dispatchers' Barangay panels.
- **Who can use it:** the page itself is still limited to System Administrators. The API also accepts Org Administrators, as planned, but they have no screen for it until the page's role check is widened.

**Live check (2026-10-22, running backend + dev DB, script reverted itself):**
- `GET` returned 19 barangays.
- A dispatcher got 403.
- An invalid number and a landline as primary got 400.
- `POST` added `+639170000001` with `source = 'admin'`; the same number again was refused.
- Promoting it to backup, then primary, swapped it with Batia's demo primary against the real indexes.
- Verified and the label were saved.
- 8 audit rows were written, including both automatic moves.
- Batia was then restored (demo number primary) and the test row deleted. Its audit rows remain, since the audit log is immutable.

---

## Out of scope (follow-ups)

- MDRRMO ops SMS for guided (non-SOS) reports. This is an existing gap, separate from this work.
- Barangay responder accounts and auto-routing. Auto-routing needs an MDRRMO policy decision.

## Verification (every phase)

- `pnpm typecheck && pnpm lint && pnpm test`.
- **Unit tests in `backend/test/barangay-coordination/`:**
  - `resolve()`: one interior point per barangay, a border point, an outside point, and `0,0`
  - SMS length < 160
  - every reply-handling outcome
- **Regression:** the emergency-flow E2E suite (required by CLAUDE.md) and `backend/test/incidents/incident-creation.spec` must pass, and incident creation must succeed when Redis or Textbee is down.
