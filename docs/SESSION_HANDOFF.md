# AGAP Session Handoff

**Date:** 2026-10-14 (October 14, 2026)  
**Repo:** `agap-emergency` (local path: `C:\Users\githu\Music\agap-emergency`)  
**Branch:** `main` — **nothing has been committed this session** — all changes are unstaged working-tree modifications.

---

## What we did this session

### 1. Removed MOD-19: Offline Sync (both packages)

**Why:** Emergency reports queued offline could be submitted after the reporter has died. The risk of stale emergency data reaching dispatch outweighs any benefit of guaranteed delivery.

**What was deleted:**
- `backend/src/offline-sync/` — entire module (controller, service, module, 4 DTOs)
- `backend/src/jobs/processors/offline-sync.processor.ts`
- `mobile/src/services/offline/offline-queue.service.ts`
- `mobile/src/services/offline/assessment-queue.service.ts`
- `mobile/src/hooks/useNetworkSync.ts`
- `tests/backend/offline-sync.service.spec.ts`
- `tests/backend/offline-sync.processor.spec.ts`

**What changed instead of silent storage:**
- `mobile/app/emergency/transmission.tsx` — failed SOS send now goes directly to the "Transmission Failed" screen (retry + call 911) instead of showing a "saved, will send later" screen. Error text: "Could not reach the MDRRMO Operations Center. Check your connection and try again."
- `mobile/app/responder/assessment/[id].tsx` — failed assessment POST shows "Not submitted — check connection and try again" inline banner. Form values are kept so the responder can resubmit.
- `mobile/src/hooks/useNetworkStatus.ts` — stripped down to pure connectivity (`isOnline` only). Removed `SyncState`, `notifySyncing`, `notifySynced`. Other screens that just need `isOnline` (responder home, availability control, incident detail) still work.
- `mobile/src/components/ui/OfflineBanner.tsx` — retained as connectivity indicator but now reads "No internet — reports cannot be sent. Call 911 for emergencies" instead of promising deferred delivery.
- `shared/src/constants/` — removed `MAX_OFFLINE_RETRY_ATTEMPTS`, `OFFLINE_RETRY_BASE_DELAY_MS`, `OFFLINE_RETRY_MAX_DELAY_MS` from `incident.constants.ts/js/d.ts` and `OFFLINE_SYNC` from `queue.constants.ts/js/d.ts`.
- `tests/package.json` — removed `test:offline-sync` script.
- `tests/backend/helpers/prisma.mock.ts` — removed `offline_event_queue` mock entry.
- `backend/src/app.module.ts` — removed `OfflineSyncModule` import.
- `backend/src/jobs/jobs.module.ts` — removed `OfflineSyncProcessor` and its BullMQ queue registration.
- `backend/src/main.ts` — removed `offline-sync` Swagger tag.

**Left in place (intentional):**
- `offline_event_queue` database table still exists in `schema.prisma` and migrations. Dropping it needs a destructive migration. Nothing reads it anymore.
- `CLAUDE.md`, `README.md`, `docs/` and `tests/http/sos-flow.http` still reference MOD-19. Documentation cleanup not done.

**Pre-existing mobile type errors (NOT introduced by us):**
- `mobile/app/_layout.tsx:53` — TS2367 comparison overlap (was there before, confirmed by git stash test)
- `mobile/app/auth/registration.tsx:328` — invalid Ionicons icon name
- `mobile/src/components/tracking/live-tracking-map.tsx:365` — `StyleSheet.absoluteFillObject` should be `absoluteFill`

---

### 2. Mayor's Office Announcement System — MOD-53 (backend + frontend + mobile)

Full structured announcement format implementing `docs/automation/bocaue_mayor_announcement_format.md`.

#### 2a. Database migration: `20261014141406_announcement_mayor_format`

**Applied** to `127.0.0.1:5432/AGAP` (local Postgres, not the Docker DB at `postgres:5432/agap_db`).

New columns added to `announcements` table:
- `template_key VARCHAR(50)` — which of the 7 templates was used
- `template_data JSONB` — the raw field values filled by the operator (so drafts can be re-opened)
- `language announcement_language` — `FIL`, `EN`, or `FIL_EN` (default `FIL`)
- `summary VARCHAR(400)` — 1–2 sentence overview (used for push/SMS, never the body)
- `action_required TEXT` — newline-delimited resident instructions
- `effective_start_at TIMESTAMPTZ`, `effective_end_at TIMESTAMPTZ`
- `issuing_office VARCHAR(200)`
- `source_reference VARCHAR(500)`
- `contact_info VARCHAR(300)`
- `image_alt_text VARCHAR(300)`
- `approved_by_id UUID → users.id` (FK added)
- `approved_at TIMESTAMPTZ`
- `cancelled_at TIMESTAMPTZ`
- `correction_note TEXT`

New enum values:
- `announcement_category`: `WEATHER_ADVISORY`, `PUBLIC_ADVISORY`, `MUNICIPAL_SERVICE` added
- `announcement_status`: `CANCELLED` added
- New enum `announcement_language`: `FIL`, `EN`, `FIL_EN`

New index: `idx_announcements_status_scheduled ON (status, scheduled_at)` for the cron job.

The Docker backend (`agap_backend`, port 3002) runs on a **different database** (`postgres:5432/agap_db`) and has **not** had this migration applied. If you switch to Docker, run `pnpm prisma migrate deploy` inside the container.

#### 2b. Backend changes

**`backend/src/announcements/dto/create-announcement.dto.ts`** — Full rewrite. All enum fields use `@IsEnum` against Prisma-generated enums (server-side validation, not raw strings). New fields mirror the format doc data model. `templateData` accepts `@IsObject()`.

**`backend/src/announcements/dto/update-announcement.dto.ts`** — New file. `PartialType(CreateAnnouncementDto)` so PATCH validation works correctly (the old `Partial<Dto>` bypassed class-validator).

**`backend/src/announcements/announcements.service.ts`** — Major rewrite. Key changes:
- `toPublic()` — strips internal fields from the citizen-facing response (`image_storage_key`, `publisher_id`, `approved_by_id`, `template_data` etc.). Adds `has_image: boolean`.
- `assertPublishable()` — blocks publish unless `issuing_office` is set, and `source_reference` is set for all safety/factual categories (FLOOD, WEATHER, EVACUATION, CLASS_SUSPENSION, ROAD_CLOSURE, FIRE_ADVISORY, INDUSTRIAL_HAZARD, RESCUE_UPDATE, POST_DISASTER_UPDATE).
- `publish()` — uses `updateMany` with status IN guard so concurrent publishes are safe. Records `approved_by_id` + `approved_at`.
- `schedule()` — validates future date, also runs `assertPublishable()`.
- `unschedule()` — returns a SCHEDULED announcement to DRAFT, clears approval fields.
- `cancel()` — withdraws PUBLISHED or SCHEDULED with a correction note. Record stays visible.
- `releaseDueScheduled()` — `@Cron(EVERY_MINUTE)` — the scheduler that was missing. Releases SCHEDULED → PUBLISHED within 1 minute of `scheduled_at`.
- `findPublicById()` — new method; only exposes PUBLISHED, CANCELLED, ARCHIVED, SUPERSEDED.
- `getImageKey()` — returns storage key with a `publicOnly` flag for the two image endpoints.
- Barangay filter extended: municipality-wide notices now also appear in barangay-specific queries.

**`backend/src/announcements/announcements.controller.ts`** — Rewrite. New routes:
- `GET /publisher/all` — publisher list (unchanged)
- `GET /publisher/:id` — publisher detail (includes drafts)
- `GET /publisher/:id/image` — authenticated image stream (drafts included)
- `GET /:id` — public detail (drafts return 404)
- `GET /:id/image` — public image stream; `@SkipThrottle()` on both image endpoints
- `POST /:id/unschedule` — return scheduled → draft
- `POST /:id/cancel` — cancel with correction note (body: `{ correctionNote }`)
- Image endpoints set `Cross-Origin-Resource-Policy: cross-origin` (Helmet defaults `same-origin` which breaks cross-origin image loading in the console).

**`backend/src/media/media.service.ts`** — two additions:
- `uploadAnnouncementImage()` now blocks if status ≠ DRAFT, and deletes the old S3 object when an image is replaced.
- New `getAnnouncementImage(key)` — streams an object back from S3 (used by the two image endpoints).

**⚠️ `backend/.env` — storage credentials changed:**
- `STORAGE_ACCESS_KEY=S3RVER` and `STORAGE_SECRET_KEY=S3RVER`
- The docker-compose s3rver container requires these values. The old values (4-char key) were rejected with 403. File is git-ignored so this only affects your local run.

#### 2c. Frontend changes (ops console)

**`frontend/features/announcements/templates.ts`** — New file (600+ lines). The automation engine:
- 7 templates: `RIVER_LEVEL`, `RAINFALL`, `FLOOD`, `EVACUATION`, `CLASS_SUSPENSION`, `ROAD_CLOSURE`, `GENERAL`
- Each template has: field schema (type, required, showIf), default severity, default action checklist, `suggestSeverity()`, `effective()`, and `build(values, lang, commonInput) → LangBlock`
- `generate(template, values, mode, common) → GeneratedAnnouncement` — assembles title, summary, full body in Filipino, English, or bilingual following the format doc templates exactly
- `readiness(template, values, common, severity) → ReadinessItem[]` — mirrors the server-side gate so the operator sees blocking issues before clicking publish
- Bocaue barangay list (all 19), flood-prone set, ISSUERS presets, SAFETY_ACTIONS checklist
- `manilaInputToIso` / `isoToManilaInput` — datetime-local inputs always treated as Asia/Manila time
- The generator was smoke-tested against: river level at critical (Filipino), PAGASA Orange rainfall (English), class suspension Kinder+Elem+JHS public+private (Bilingual)

**`frontend/features/announcements/labels.ts`** — New file. Shared display metadata for category labels, severity (with icons), status, language, and `fmtManila()` date formatter (always Asia/Manila regardless of browser zone).

**`frontend/features/announcements/api.ts`** — Rewrite. All new structured fields added to types. New functions: `unscheduleAnnouncement`, `cancelAnnouncement`, `fetchAnnouncement` (now hits publisher route), `fetchAnnouncementImageBlob` (returns Blob via authenticated publisher endpoint, never the storage host).

**`frontend/features/announcements/hooks.ts`** — Rewrite. New hooks: `useAnnouncementImage` (manages Blob → ObjectURL lifecycle), `useUnscheduleAnnouncement`, `useCancelAnnouncement`. Common `useInvalidate` helper to avoid repetition.

**`frontend/components/announcements/AnnouncementPreview.tsx`** — New file. Three-tab preview (Feed card / Full notice / Push notification) rendered in a 360 px phone-width container to match what citizens see. Push tab shows character length vs. the format doc's editorial targets (35–60 / 80–140). Used in both the compose page and the detail drawer. No gradients.

**`frontend/app/(ops)/announcements/page.tsx`** — Full rewrite. Columns now show the severity bar + icon, category label, area and the date type relevant to current status. Row click opens a `DrawerContent` with `AnnouncementPreview` and all metadata. Actions from the drawer: Publish (with confirm step), Schedule, Back to Draft, Cancel (with correction note dialog), Archive. Flash messages when redirected after save or publish. `CANCELLED` tab added.

**`frontend/app/(ops)/announcements/compose/page.tsx`** — New file. The composer:
- Template picker (7 tiles)
- Dynamic field form (generated from template field schema; `showIf` hides fields until conditions are met)
- Area section: municipality-wide checkbox + 19 individual barangay chips + flood-prone shortcut
- Issuer presets (Mayor, Mayor+MDRRMO, MDRRMO, Other)
- Language selector
- Source/contact fields
- Image attachment (draft-only; replaced images delete the old S3 object)
- Generated text review with "Edit by hand" escape hatch
- Live `AnnouncementPreview` and readiness checklist on the right
- Approval confirmation dialog before publish
- Edit mode: if `?id=<uuid>` in the URL, loads the draft and populates all fields from `template_data`

**Frontend typechecks clean:** `npx tsc --noEmit` exits 0 from `frontend/`.

#### 2d. Mobile changes

**`mobile/src/services/api/announcements.api.ts`** — Rewrite. `image_url` replaced by `has_image: boolean`. New `announcementImageUrl()` and `announcementImageSource()` helpers that point at `/v1/announcements/:id/image?v=<updated_at>`. `announcementImageSource()` injects the ngrok bypass header automatically — without it a tunnelled backend returns an HTML warning page, and the image silently fails.

**`mobile/app/announcements/index.tsx`** — Updated feed:
- `LinearGradient` removed from the critical-announcement banner (solid `#9F1D2C`).
- Cards now show `summary` text before the image.
- Images load from the API endpoint via `announcementImageSource`, with `onError` fallback.
- Card footer shows affected area + issuing office instead of the `scope` enum.
- Category filter chips updated: added Weather, Advisory.
- Empty state message updated.

**`mobile/app/announcements/[id].tsx`** — Full rewrite:
- Cancellation notice shown at the top (prominent, marked with alert role).
- Severity badge shows label + priority tier (Critical·Urgent, Warning·Important, etc.).
- Summary shown as a lead paragraph above the full notice.
- Key details card: area, effective period, published date.
- Required-action card (from `action_required` field) shown only when not cancelled.
- Image loaded via `announcementImageSource` with `onError` fallback (shows "image could not be loaded" text).
- Full notice rendered by `NoticeBody` which bold-renders all-caps section headings.
- Issuing office / source / contact in a footer card.
- Dates always in Asia/Manila timezone regardless of phone locale.
- Share message uses `summary` (short) rather than the full body.

**`mobile/app/home/index.tsx`** — Removed `LinearGradient` from the `SurgeBanner` (critical announcement on home screen). Now solid `backgroundColor: '#9F1D2C'`.

**Mobile typechecks:** 3 pre-existing errors remain (all pre-date this session); no new errors introduced.

---

## Current state: what still needs doing

### Immediate — required before the new backend features are usable

1. **Rebuild and restart the local backend** (the binary on :3000 is the old build):
   ```bash
   cd backend
   pnpm build          # or npx nest build
   node dist/main      # or pnpm start:prod
   ```
   Alternatively restart via PM2 / the dev watcher.

2. **Reload Metro** for mobile changes (JS-only — no EAS rebuild needed):
   ```bash
   cd mobile && npx expo start
   # Press r to reload in the Metro terminal
   ```

3. **Apply the migration to the Docker database** if you use Docker for development:
   ```bash
   docker exec -it agap_backend sh
   npx prisma migrate deploy
   ```

### Known issues / deferred work

| # | Issue | Notes |
|---|---|---|
| 1 | `offline_event_queue` table still in schema | Harmless — nothing reads it. Drop when convenient with a migration. |
| 2 | `CLAUDE.md` + `README.md` + `tests/http/sos-flow.http` still mention MOD-19 | Documentation only. |
| 3 | Docker backend DB not migrated | Only matters if you use `docker compose up` for dev. |
| 4 | No separate approver role | Format doc §10 recommends separating author from final approver. Currently the publisher approves their own notice. A new role + approval-request flow is the next step. |
| 5 | No `CHANGES_REQUESTED` / `FOR_REVIEW` statuses | Format doc §11 lists them. Schema and service only have the statuses that were actually useful for the current UI. |
| 6 | SMS body uses `summary` not the old `body.slice(0,130)` | New behaviour. Verify the SMS payload is still ≤ 160 chars in production. |
| 7 | 3 pre-existing mobile type errors | `_layout.tsx` comparison, `registration.tsx` icon name, `live-tracking-map.tsx` StyleSheet property. None are in announcement code. |
| 8 | `backend/.env` credentials are git-ignored | The `STORAGE_ACCESS_KEY=S3RVER / STORAGE_SECRET_KEY=S3RVER` fix only lives locally. If anyone else clones or the container is rebuilt from `.env.example`, uploads will fail. Update `.env.example` if you share the setup. |

---

## Key files changed this session

```
backend/
  prisma/schema.prisma                          ← new columns + enums
  prisma/migrations/20261014141406_*/           ← new migration (applied)
  src/announcements/announcements.service.ts    ← full rewrite
  src/announcements/announcements.controller.ts ← full rewrite
  src/announcements/dto/create-announcement.dto.ts
  src/announcements/dto/update-announcement.dto.ts  ← new
  src/media/media.service.ts                    ← image stream + replace logic
  src/app.module.ts                             ← OfflineSyncModule removed
  src/jobs/jobs.module.ts                       ← OfflineSyncProcessor removed
  src/main.ts                                   ← offline-sync swagger tag removed
  .env                                          ← STORAGE creds fixed (git-ignored)

frontend/
  features/announcements/templates.ts           ← new (automation engine)
  features/announcements/labels.ts              ← new (display metadata)
  features/announcements/api.ts                 ← rewrite
  features/announcements/hooks.ts               ← rewrite
  components/announcements/AnnouncementPreview.tsx  ← new
  app/(ops)/announcements/page.tsx              ← full rewrite
  app/(ops)/announcements/compose/page.tsx      ← new

mobile/
  src/services/api/announcements.api.ts         ← rewrite (has_image, API image URLs)
  src/hooks/useNetworkStatus.ts                 ← stripped to isOnline only
  src/components/ui/OfflineBanner.tsx           ← no sync states
  app/announcements/index.tsx                   ← no gradient, API images
  app/announcements/[id].tsx                    ← full rewrite (new fields)
  app/emergency/transmission.tsx                ← no offline queue
  app/responder/assessment/[id].tsx             ← no offline queue
  app/home/index.tsx                            ← SurgeBanner no gradient

shared/
  src/constants/queue.constants.ts/js/d.ts      ← OFFLINE_SYNC removed
  src/constants/incident.constants.ts/js/d.ts   ← OFFLINE_RETRY_* removed

tests/
  backend/offline-sync.service.spec.ts          ← deleted
  backend/offline-sync.processor.spec.ts        ← deleted
  backend/helpers/prisma.mock.ts                ← offline_event_queue mock removed
  package.json                                  ← test:offline-sync script removed
```

---

## Environment reference

| Service | Address | Notes |
|---|---|---|
| Backend (local binary) | `http://localhost:3000` | Still running old build until you rebuild |
| Backend (Docker) | `http://localhost:3002` | Different DB, migration not applied |
| Postgres (local) | `127.0.0.1:5432/AGAP` | Migration applied |
| Postgres (Docker) | `127.0.0.1:5461/agap_db` | Migration NOT applied |
| MinIO / s3rver | `http://localhost:9000` | Bucket `agap-media` |
| Redis (local) | `localhost:6382` | |
| ngrok tunnel | `https://benevolent-semirhythmically-tova.ngrok-free.dev` | Mobile `.env` and `.env.local` |
| Start ngrok | `ngrok http 3000 --domain=benevolent-semirhythmically-tova.ngrok-free.dev` | |

---

## Suggested next conversation starters

- "Commit everything from the last session."
- "The backend is rebuilt and running — let's test the compose flow in the browser."
- "Add the FOR_REVIEW / CHANGES_REQUESTED statuses so a second person can approve before publishing."
- "Build the `INDUSTRIAL_HAZARD` template for Bundukan / Biñang fireworks incidents."
- "The Docker backend DB needs the migration — help me apply it inside the container."
- "Fix the 3 pre-existing mobile TypeScript errors."
