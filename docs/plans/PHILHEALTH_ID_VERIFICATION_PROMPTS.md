# AGAP — PhilHealth ID Verification: Implementation Prompts

**Companion to:** [PHILHEALTH_ID_VERIFICATION_PLAN.md](PHILHEALTH_ID_VERIFICATION_PLAN.md) (the "plan")
**Prepared:** 2026-11-05 · **Baseline:** `main` @ `7f0cc42` plus uncommitted dispatch-unit work
**Made for:** GitHub Copilot Chat in **Agent mode** or Claude Code. Works with any coding agent that can read files and run terminal commands.

This file has four parts:

- **Part A — Context briefing.** What the agent must know before touching code.
- **Part B — Decisions.** Already made. The agent follows them and does not reopen them.
- **Part C — Working protocol.** The steps every prompt follows: preflight, implement, self-check, verify, record, stop.
- **Part D — The prompts.** One per phase, plus a review prompt.

---

## How to use

1. **One prompt per new chat.** Start a new chat before each prompt. Long chats make the agent forget the rules.
2. **Copilot:** switch Copilot Chat to **Agent** mode and type these before the prompt so it reads them in full:
   `#file:docs/plans/PHILHEALTH_ID_VERIFICATION_PROMPTS.md #file:docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md #file:CLAUDE.md`
   **Claude Code:** paste the prompt as is. It reads `CLAUDE.md` automatically and the prompt names the other two files.
3. Paste the prompt's fenced block unchanged.
4. When the agent asks to run commands: **allow** tests, typecheck, `pnpm build` in `shared`, `pnpm prisma migrate deploy`,
   `pnpm prisma generate`, and `pnpm add` for the packages Part C lists. **Deny** `migrate dev`, `migrate reset`, `git commit`,
   `git push`, `git checkout .`, `git reset`, `rm -rf`, and anything that opens `backend/.env`.
5. When it reports and stops, read the report. Then run **Prompt R** for that phase in a new chat before the next phase.
6. If a chat dies halfway, start a new chat with the **same** prompt. Part C step A makes the agent find what exists and finish it.
7. You commit. The agent never commits.

| Order | Prompt | Gate before starting | Who does what |
|---|---|---|---|
| 1 | Prompt 0: Spike | none | Agent installs and builds; **you** scan sample cards on a phone and run the OCR script |
| 2 | Prompt R (Phase 0) | Prompt 0 reported **and** you filled in the plan's Phase 0 layout notes | |
| 3 | Prompt 1: Shared rules | Phase 0 reviewed | Agent |
| 4 | Prompt R (Phase 1) | | |
| 5 | Prompt 2: Backend | Phase 1 reviewed | Agent |
| 6 | Prompt R (Phase 2) | | |
| 7 | Prompt 3: Mobile | Phase 2 reviewed | Agent; **you** test on a real phone |
| 8 | Prompt R (Phase 3) | | |
| 9 | Prompt 4: Admin review | Phase 3 reviewed | Agent |
| 10 | Prompt R (Phase 4) | | |
| 11 | Prompt 5: Labels and seed | Phase 4 reviewed | Agent |
| 12 | Prompt 6: Docs and defense readiness | Phase 5 reviewed | Agent; **you** rehearse the demo |

Phases must run in order. Each depends on the one before.

---

# Part A — Context briefing

## A1. The system

AGAP is an emergency alert and dispatch system for the Bocaue MDRRMO (Bocaue, Bulacan). It is a **pnpm monorepo**:

| Package | Stack | Notes |
|---|---|---|
| `backend/` | NestJS, Prisma → PostgreSQL + PostGIS, Redis + BullMQ | One API server. Routes `/api/v1/...` |
| `frontend/` | Next.js + React, Tailwind, TanStack Query | Operations Center and admin web |
| `mobile/` | Expo + React Native, Expo Router | Citizen and responder app. **Expo dev build** (`expo-dev-client`, native `android/` folder); Expo Go cannot run the new native modules |
| `shared/` | TypeScript | Used by all three. **Backend and frontend read the compiled `shared/dist`**: after editing `shared/src`, run `cd shared; pnpm build` and restart running dev servers |

## A2. What we are building

Before a citizen account is created, the citizen scans the front of their **PhilHealth ID** with the phone's built-in document
scanner. The server reads the card with its own OCR. The citizen then types Last / First / Middle / Suffix, and the name must match
the card. Unclear cases can be sent to MDRRMO staff for review. Full detail: the plan, §3–§8.

## A3. Rules that override convenience

From `CLAUDE.md` and the plan §1:

- **Guest emergency reporting is never blocked** (rule 14). The "Report an emergency" button stays on every ID step. Nothing in
  this work touches `registerGuest` or the SOS flow.
- **An account under review can still sign in and send an SOS.**
- **The "ID verified / not verified" label is information only.** It never changes priority, recommendations or dispatch (rule 8). It applies to the reporter, never the patient.
- **Never log, return or send** the full PhilHealth number, OCR text, names read from the card, or the image. No PII in log
  lines, audit details, WebSocket payloads, notifications or SMS. The API returns only `pinLast4`.
- **The server decides.** Text read on the phone is a UX hint. Never verify from phone text alone.
- **Image retention (plan §5.2a):** delete the image right after a matched registration, when a review is decided, or 30 minutes after an unclaimed scan. A failed delete never fails the request; the job retries.
- **Seal with AES-256-GCM** using `backend/src/common/crypto/secret-box.ts` and a separate key (`ID_DOCUMENT_ENCRYPTION_KEY`).

## A4. Existing code to reuse (do not rewrite)

| Need | Use |
|---|---|
| Encryption | `backend/src/common/crypto/secret-box.ts` (`seal`, `open`, `parseEncryptionKey`); key-service pattern in `backend/src/medical-profiles/medical-crypto.service.ts` |
| Object storage with local-disk fallback | `backend/src/media/media.service.ts` |
| Multipart uploads | `FileInterceptor` usage in `backend/src/incidents/incidents.controller.ts` and `backend/src/announcements/announcements.controller.ts` (multer is already installed) |
| Throttling | `@Throttle(...)` as on `POST /auth/register` in `backend/src/auth/auth.controller.ts` |
| Geo-fence | `AuthService.checkGeoFence()` |
| Audit | `AuditService.log()` in `backend/src/audit/audit.service.ts` |
| Roles | `@Roles(...)` + `backend/src/common/guards/roles.guard.ts` |
| Background jobs | `backend/src/jobs/jobs.module.ts` (`QUEUE_NAMES`, `BullModule.registerQueue`) and `backend/src/jobs/processors/*.processor.ts` |
| Consent | `consent_records` model and `backend/src/consent/consent.service.ts` |
| SMS / push | existing SMS queue (`smsQueue.add('otp-sms', …)` pattern in `auth.service.ts`) and notifications module |
| Mobile strings | `mobile/src/i18n/translations.ts` (`registration` block exists for `en` and `fil`) |
| Mobile registration | `mobile/app/auth/registration.tsx` (`LocationStep` state machine, `registerSchema`, `handleRegister`) |

## A5. House rules for this repo

- **Never open `backend/.env`.** Add new variables to `.env.example` with placeholders only.
- **Never start a second backend.** It shares Redis, BullMQ and the Textbee SMS poller with the user's running one on :3000.
- **Never create incidents on the live backend** (they send real SMS).
- Read-only DB checks via `node -e` with `pg` from `backend/` are fine.
- Don't run `next build` while `pnpm dev` is up.
- Backend tests: `cd backend; npx jest --config ./test/jest.config.ts <path>`. `auth-phase3.spec.ts` can time out under full-suite load but passes alone. `pnpm lint` is broken (ESLint 9 mismatch); don't chase it.
- `frontend/tsconfig.tsbuildinfo` changes on every typecheck; restore it with `git checkout -- frontend/tsconfig.tsbuildinfo`.
- Metro on Windows serves stale routes after edits: restart with `npx expo start -c`.
- **Sample ID images are personal data.** They live outside the repo (for example `C:\Users\Zionne\agap-id-samples\`), are never committed, never pasted into chat, and their text is never written to any file in the repo.

---

# Part B — Decisions (already made, do not reopen)

| # | Decision |
|---|---|
| D1 | Every citizen account goes through the scan. No legacy banner or grandfathering. Seeded demo citizens are pre-verified. |
| D2 | Image kept only while needed (plan §5.2a). There is no retention-days setting. |
| D3 | Server OCR is local `tesseract.js` with bundled English data. No cloud OCR. |
| Q1 | Reviewers: System Administrator, and Org Administrators of the MDRRMO organization only. |
| Q2 | Minors: no special handling in this plan. |
| Q3 | Phones without Google Play services: fallback `expo-camera` capture; review if it still fails. |

---

# Part C — Working protocol (every prompt follows this)

### A. Preflight (no edits yet)
1. Read `CLAUDE.md`, Part A of this file, the plan in full, and every file the prompt lists under "Read first".
2. Read the plan's **Progress log**. If this phase already has a dated section, this is a **resume**: continue from it.
3. Run `git status --short` and keep the output. Never revert, reformat or "clean up" files you didn't change in this phase.
4. **Inventory before writing.** List everything the phase adds: files, functions, migrations, columns, enum values, routes,
   env vars, audit action names, translation keys, tests. Search the repo for each and mark it **exists / partial / missing**.
   Extend what exists. **Never create a second copy.** Never edit a migration that is already applied (`pnpm prisma migrate status`).
5. Run the test suites of the packages this phase touches once and record the counts (the baseline).
6. If a file or symbol isn't where this file or the plan says, follow the code and note the difference for the report.

### B. Implement
- Follow the prompt's numbered steps in order.
- **One source per concept:** name matching, PIN parsing and PhilHealth detection live only in `shared/src/validation/philhealth-id.ts`. Never re-implement them in mobile or backend.
- Match the surrounding code: naming, comment density, DTOs with class-validator, `try/catch` + `this.logger.warn`, `@Roles(...)`.
- **Dependencies:** only these may be added, each pinned to an exact version (no `^`, no `latest`):
  `react-native-document-scanner-plugin` and `@react-native-ml-kit/text-recognition` (mobile); `tesseract.js` plus its English
  language data (backend). Anything else: stop and ask.
- Migrations: write SQL by hand in `backend/prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` with a timestamp later than
  every existing folder. Update `schema.prisma` to match **without reformatting other lines**. Then
  `pnpm prisma migrate deploy; pnpm prisma generate`.
- Stay inside the phase. Problems you notice elsewhere go in the report, not the code.

### C. Self-check before verifying
- Search for every name you added. Each route, enum value, env var, audit action and translation key is defined exactly once.
- **Privacy grep** over every file you changed: no full PIN, OCR text, card name or image in any `logger.*`, `console.*`, audit
  `details`, response body (except `nameOnId` and `pinLast4` from the scan endpoint), notification or SMS text.
- The guest "Report an emergency" path and `registerGuest` are untouched (`git diff` shows no change to them).
- No existing test was deleted, skipped or loosened.

### D. Verify
1. If `shared/src` changed: `cd shared; pnpm build; cd ..`.
2. `pnpm typecheck` (or `npx tsc --noEmit -p .`) in every touched package.
3. Run the touched packages' Jest suites. After a migration also run `pnpm test:e2e:db` then `pnpm test:e2e` in `backend/`.
4. `pnpm prisma migrate status` → up to date.
5. Fix every failure you caused and re-run until green. Never weaken a test to make it pass.
6. `git checkout -- frontend/tsconfig.tsbuildinfo` if the frontend typecheck touched it.

### E. Record
- Tick only the plan's checklist boxes (§10) that are now true.
- Fill in the plan's **Progress log** row for this phase and add a `### Phase N — <date>` section: files added/changed,
  migrations (applied or not), dependencies and exact versions, inventory result, deviations and why, what needs a person or a phone.
- **Don't commit.**

### F. Report, then STOP
Reply with: (1) what was built, per step; (2) test counts before → after, per package; (3) deviations and inventory findings;
(4) what needs a person or a phone. Then stop. Don't start the next phase.

---

# Part D — The prompts

## Prompt 0 — Spike: native scanner, on-device reading, server OCR

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/PHILHEALTH_ID_VERIFICATION_PROMPTS.md, then docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md
(§4.1, §4.3, §5.4, §6 and Phase 0 in §9). Follow Part C (A → F) exactly.

Goal: prove the tools work before any feature code. No registration changes in this phase.

Read first: mobile/package.json, mobile/app.json, backend/package.json, backend/src/media/media.service.ts.

1. Mobile: add react-native-document-scanner-plugin and @react-native-ml-kit/text-recognition with
   exact versions compatible with Expo SDK 57. Add their config plugins to mobile/app.json if
   they ship one. Update NSCameraUsageDescription to also cover "scanning your PhilHealth ID to
   verify your account". Check whether the scanner exposes an option to turn off gallery import
   and a 1-page limit; record the exact option names, or "not available", in the Progress log.
2. Mobile: create a dev-only screen mobile/app/dev/id-scan-spike.tsx that renders nothing unless
   __DEV__. It opens the scanner (1 page), runs text recognition, and shows on screen only:
   whether a 12-digit PIN pattern was found (yes/no), the number of text lines, and the image
   size in pixels. It must NOT display or log the recognised text. If the scanner fails to open,
   show the error message so we learn what happens on phones without Google Play services.
3. Backend: add tesseract.js and bundle English language data locally (for example a tessdata
   folder under backend/assets/, or the official language-data package) so nothing is downloaded
   at runtime. Set langPath (and turn off caching to a remote location) accordingly.
4. Backend: create backend/scripts/ocr-spike.ts. It takes a folder path argument (outside the
   repo), runs tesseract.js on every .jpg/.png in it, and prints to the terminal only, per file:
   the raw OCR text and the time taken. It writes nothing to disk. Add a header comment: "Sample
   ID images are personal data. Keep them outside the repo. Never commit the output."
5. Do not run either tool on real cards yourself. Write the exact commands the user must run in
   the report: rebuilding the dev client (npx expo run:android), opening the spike screen, and
   running the script (npx ts-node --transpile-only scripts/ocr-spike.ts <folder>).
6. In the plan's Progress log, add a "### Phase 0 — <date>" section with a "Layout notes (filled in
   by the user)" sub-list containing these empty items for the user to complete WITHOUT real names
   or numbers: heading text found on the card; name line format (e.g. LAST, FIRST MIDDLE); where the
   PIN appears and its grouping; cards read correctly by phone (n/10); by server (n/10);
   scanner on a phone without Google Play services (works / fails with: ...).

Verify per Part C D (mobile typecheck, backend typecheck). Report per Part C F, then STOP.
```

## Prompt 1 — Shared matching rules

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/PHILHEALTH_ID_VERIFICATION_PROMPTS.md, then docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md
in full, including the Phase 0 layout notes in the Progress log. Follow Part C (A → F) exactly.

If the Phase 0 layout notes are still empty, STOP and say so.

Read first: shared/src/validation/index.ts, shared/src/validation/incident.validation.ts,
shared/src/index.ts, backend/test/dispatch/units-needed.spec.ts (test style).

1. Create shared/src/validation/philhealth-id.ts with exactly the API in plan §6: IdName,
   normalizeNamePart, parsePhilHealthPin, looksLikePhilHealthId, parsePhilHealthName, matchIdName.
   Also export composeFullName(name: IdName): string ("First Middle Last Suffix", single spaces).
   Implement normalisation and match rules exactly as §6 describes. Use the Phase 0 layout notes
   for the heading keywords and the name-line format; make parsePhilHealthName tolerant of OCR
   noise (extra spaces, stray punctuation, line breaks between last and first name).
   Write a small local edit-distance helper inside this file; no new dependency.
2. Export it from shared/src/validation/index.ts.
3. Create backend/test/identity-verification/philhealth-id.spec.ts covering every case listed
   at the end of §6, plus: PIN with dashes, with spaces, with 11 or 13 digits (null);
   looksLikePhilHealthId false for text of a driver's licence or school ID (made-up text);
   composeFullName with and without middle and suffix. Use invented names only.
4. cd shared; pnpm build. Run the new spec and the full backend suite.

Report per Part C F, then STOP.
```

## Prompt 2 — Backend: data model, scan endpoint, registration, cleanup job

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/PHILHEALTH_ID_VERIFICATION_PROMPTS.md, then docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md
§1, §5 (all of it, including §5.2a), §6 and §10. Follow Part C (A → F) exactly.

Read first: backend/prisma/schema.prisma (User, consent_records, user_verifications),
backend/src/auth/auth.service.ts (register, checkGeoFence), backend/src/auth/auth.controller.ts,
backend/src/auth/dto/register.dto.ts, backend/src/common/crypto/secret-box.ts,
backend/src/medical-profiles/medical-crypto.service.ts, backend/src/media/media.service.ts,
backend/src/incidents/incidents.controller.ts (FileInterceptor usage), backend/src/jobs/jobs.module.ts
and one processor in backend/src/jobs/processors/, backend/src/audit/audit.service.ts,
backend/src/app.module.ts, .env.example.

1. Migration + schema: the two enums, identity_verifications, User.identity_verified_at, and the
   partial unique index from §5.1. Apply with migrate deploy + generate.
2. Env: add ID_VERIFICATION_REQUIRED, ID_DOCUMENT_ENCRYPTION_KEY, ID_PIN_PEPPER to .env.example
   with placeholders and a one-line comment each (how to generate a 32-byte base64 key). When
   ID_VERIFICATION_REQUIRED is true and a key or the pepper is missing, the app refuses to start
   with a clear message, following how MEDICAL_ENCRYPTION_KEY is handled.
3. backend/src/identity-verification/ module per §5.3:
   - id-document-crypto.service.ts: seal/open the name JSON with secret-box (aad = verification id);
     seal/open image Buffers with AES-256-GCM in the same v1 format family (add a Buffer variant
     next to the string one in secret-box.ts rather than a second crypto file); pinHmac(pin).
   - philhealth-ocr.service.ts: tesseract.js with the bundled data from Phase 0. One worker
     created lazily and reused; a timeout so a stuck read returns UNREADABLE, never hangs the request.
   - identity-verification.controller.ts: POST /api/v1/auth/id-verification exactly as §5.3
     (public, throttled, JPEG/PNG ≤ 2 MB, consentGiven required, geo-fence check, 422
     NOT_PHILHEALTH_ID / UNREADABLE, 409 ID_ALREADY_REGISTERED). Store the sealed image through
     media.service's storage under the id-documents/ prefix (reuse its client and local fallback;
     do not create a second S3 client). Return { token, nameOnId, pinLast4 } only. The token is
     32 random bytes base64url; store only its SHA-256.
   Error codes are returned as a stable `code` field in the error body so the app can branch on them.
4. Registration (auth.service.ts register + RegisterDto) per §5.3 "POST /auth/register changes":
   new fields, flag behaviour, one transaction, matcher from @agap/shared, full_name built with
   composeFullName, consent record, audit IDENTITY_VERIFICATION_CLAIMED (user id + outcome only),
   then image deletion after commit on a match (§5.2a). The existing geo-fence, duplicate
   phone/email and OTP behaviour must not change.
5. Job: processors/identity-verification.processor.ts on a 10-minute repeat, registered the same
   way as the other repeatable jobs: expire unclaimed rows and delete their images; sweep any
   remaining image of a decided row (§5.3). Deletion failures are logged without PII and retried
   on the next run.
6. Tests (backend/test/identity-verification/): scan endpoint (not PhilHealth, unreadable, too
   large, wrong type, no consent, outside Bocaue, duplicate PIN, success returns only pinLast4);
   register (match → verified + image deleted; mismatch → 400 and nothing created; mismatch +
   requestReview → PENDING_REVIEW, image kept; expired or reused token → ID_SCAN_EXPIRED; flag off →
   old behaviour unchanged; storage delete throws → registration still succeeds); crypto round-trip
   and wrong-aad failure; job expiry and sweep. Mock tesseract in unit tests; one test may run the
   real OCR on a synthetic generated image if that's cheap, otherwise skip it.
7. Existing e2e fixtures that call /auth/register must keep passing: set ID_VERIFICATION_REQUIRED
   =false in the test environment config, not by editing the tests' assertions.

Report per Part C F, then STOP.
```

## Prompt 3 — Mobile: scan step, split name fields, live match

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/PHILHEALTH_ID_VERIFICATION_PROMPTS.md, then docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md
§1, §3, §4, §6 and §10, and the Phase 0 and Phase 2 sections of its Progress log.
Follow Part C (A → F) exactly.

Read first: mobile/app/auth/registration.tsx (whole file), mobile/src/services/api/auth.api.ts,
mobile/src/i18n/translations.ts (registration blocks), mobile/app/dev/id-scan-spike.tsx,
mobile/app/auth/verify-otp.tsx, one test in mobile/src/lib/__tests__/ (test style).

1. mobile/src/services/id-scan/philhealth-scan.ts: open the document scanner (1 page, gallery
   import off if Phase 0 found the option), run on-device text recognition, use
   looksLikePhilHealthId/parsePhilHealthPin from @agap/shared for an instant local check, upload
   with submitIdScan(), delete the cached image file afterwards in a finally block. If the scanner
   cannot open (no Google Play services), return a typed result telling the UI to show the
   fallback camera.
2. Fallback: mobile/src/components/registration/IdCameraFallback.tsx using expo-camera with a
   card-shaped frame and a capture button (plan §4.3). Same downstream flow.
3. auth.api.ts: submitIdScan(image, { clientText, attemptNumber, latitude, longitude,
   consentGiven }) as multipart; register() gains lastName, firstName, middleName, suffix,
   idVerificationToken, requestReview. Map the server's error `code` values to typed errors.
4. mobile/src/components/registration/PhilHealthIdStep.tsx: intro + consent checkbox (plain
   language: what is read, why, deleted after the check), scanning state, retry state showing
   attempt n of 3 and a reason per code, "Send to MDRRMO for review" after the third failure,
   offline message from §4.4. The guest "Report an emergency" button is visible in every state
   and uses the same beginGuestReport + router.push('/emergency/location') as the form.
5. mobile/src/components/registration/NameFields.tsx: Last, First, Middle (optional), Suffix
   (optional) inputs and the live indicator using matchIdName from @agap/shared on blur and on
   submit. On mismatch show "Your PhilHealth ID shows: LAST, FIRST MIDDLE" from nameOnId and a
   "Send to MDRRMO for review" link. Never pre-fill the inputs from the scan.
6. registration.tsx: extend the state machine with id_intro, id_scanning, id_retry and rename
   'inside' to 'form' (plan §4.2). After the geo-fence passes, go to id_intro. Replace the single
   Full Name input with NameFields. Keep registerSchema as the single client schema (update it for
   the four fields). Create account stays disabled until the name matches or review was chosen.
   Handle ID_SCAN_EXPIRED by returning to id_intro with a message. Keep the rest of the screen
   (phone, email, password, terms, modal, OTP redirect) unchanged.
7. Translations: every new string in both en and fil under the registration block.
8. Delete mobile/app/dev/id-scan-spike.tsx (its job is done) unless the Progress log says to keep it.
9. Tests in mobile/src/lib/__tests__/ or next to the new service: error-code mapping, attempt
   counting and when review is offered, the "create account enabled" rule.
10. Write the manual test steps for the user's phone in the report: rebuild (npx expo run:android),
    restart Metro with npx expo start -c, then the §10 checklist items that need a phone.

Report per Part C F, then STOP.
```

## Prompt 4 — Admin review queue (web)

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/PHILHEALTH_ID_VERIFICATION_PROMPTS.md, then docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md
§1, §5.2a, §7 and §10. Follow Part C (A → F) exactly.

Read first: backend/src/identity-verification/ (from Phase 2), backend/src/administration/
administration.controller.ts and its service, backend/src/common/guards/roles.guard.ts,
backend/src/common/decorators/roles.decorator.ts, backend/src/permissions/,
frontend/app/(ops)/administration/ (existing pages and layout), one frontend feature folder under
frontend/features/ (api + hooks pattern), the SMS and push notification sending code.

1. Backend identity-verification-admin.controller.ts with the four routes in §7. Authorize the
   same way existing administration routes do (@Roles + guard). SYSTEM_ADMINISTRATOR sees all;
   ORG_ADMINISTRATOR only if they belong to the MDRRMO organization (Part B Q1), otherwise 403.
   If the codebase grants admin features through permission rows, add identity_verification:review
   the same way; if not, don't invent a permission system.
2. Image route: open and stream with Cache-Control: no-store, audit ID_IMAGE_VIEWED (actor +
   verification id only), 410 when the image is already deleted.
3. Approve/reject: status change, identity_verified_at on approve, audit (actor, id, reason code),
   delete the image after commit (§5.2a), then notify the citizen by push and SMS with the exact
   texts in §7 (no names, no ID number). A notification failure never undoes the decision.
4. Frontend: frontend/features/identity-verification/ (api.ts, hooks.ts) and
   frontend/app/(ops)/administration/id-reviews/page.tsx: queue table, detail view with the typed
   name and the image loaded only on click, Approve, Reject with a reason select. Add a link to it
   wherever the administration section lists its pages. Hide it from roles that can't use it.
5. Tests: backend role checks (dispatcher 403, BFP org admin 403, MDRRMO org admin OK), image
   route audit + 410, approve/reject state and image deletion, notification failure does not
   revert the decision. Frontend: a unit test for any non-trivial helper you add.

Report per Part C F, then STOP.
```

## Prompt 5 — Dispatch label, profile status, seed

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/PHILHEALTH_ID_VERIFICATION_PROMPTS.md, then docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md
§1, §8 and §10. Follow Part C (A → F) exactly.

Read first: where the dispatch console shows the incident reporter (search frontend for the
reporter card in frontend/components/incidents/ and frontend/app/(ops)/operations/), the backend
query that returns reporter info for that view, mobile/app/profile/, backend/prisma/seed/seed.ts.

1. Backend: include a boolean reporterIdVerified (from User.identity_verified_at) in the incident
   reporter data the console already loads. No other identity fields. Guests stay "guest".
2. Frontend: show "ID verified" / "ID not verified" on the reporter card only, styled as neutral
   information (not a warning colour that suggests lower priority). Never on the patient.
   Confirm nothing in priority, recommendations or dispatch reads this field.
3. Mobile profile: a status row (Verified / Under review / Not approved → Scan again). "Scan again"
   reuses PhilHealthIdStep with a backend route for an existing signed-in account to submit a
   rescan (reuse the Phase 2 service; same rules, the claim goes straight to the signed-in user).
4. Seed: seeded CITIZEN accounts get identity_verified_at and a claimed AUTO_VERIFIED row with no
   image, clearly fake PINs (pin_hmac computed from values like 00-000000001-0 using the pepper
   from the environment; if the pepper is unset in seed context, skip these rows and log one
   line). Upserts only, so running the seed twice creates no duplicates.
5. Tests: reporterIdVerified in the response; the rescan route; seed idempotency if seed tests exist.
6. Run the seed twice against the local DB and confirm no duplicate rows with read-only queries.

Report per Part C F, then STOP.
```

## Prompt 6 — Docs and defense readiness

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/PHILHEALTH_ID_VERIFICATION_PROMPTS.md, then docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md
in full, including the whole Progress log. Follow Part C (A → F) exactly.

1. Set ID_VERIFICATION_REQUIRED=true in .env.example and in any dev setup docs
   (docs/LOCAL_DEV_NO_DOCKER.md, README.md if it lists env vars).
2. Update docs/modules/MOD-01_* and MOD-48_* (registration flow, data collected, retention,
   consent), docs/USER_ACCOUNTS.md (seeded citizens are pre-verified), and
   docs/module-reports/MODULE_TESTING_GUIDE.md (add the §10 checklist as test cases).
3. Find the in-app privacy notice or terms text the registration screen links to. If it exists,
   add what is read from the PhilHealth ID, why, and when it is deleted. If it doesn't exist,
   say so in the report; don't invent a legal page.
4. Run the backend full suite, backend e2e (test:e2e:db then test:e2e) with the flag on, mobile
   and frontend Jest, and typecheck in all packages.
5. Walk the plan's §10 checklist. Tick what tests prove. List the items that need a phone or a
   person in the report, with the exact steps, and the §13 demo steps as a rehearsal script.

Report per Part C F, then STOP.
```

## Prompt R — Independent review of a phase (run after each phase, in a new chat)

Replace `N` with the phase number.

```
You are reviewing Phase N of docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md, implemented in an
earlier chat (uncommitted). Do not re-implement it.

1. Read CLAUDE.md, Parts A, B and C of docs/plans/PHILHEALTH_ID_VERIFICATION_PROMPTS.md, Prompt N
   in Part D, the plan in full, and the Phase N section of the plan's Progress log.
2. Find the phase's changes with `git status --short` and `git diff`, limited to the files the
   Progress log lists plus new untracked files of this phase.
3. Check, with file:line evidence, each of:
   a. Every numbered step of Prompt N is really done; ticked checklist boxes are true.
   b. Bugs: missing awaits, unhandled rejections, wrong Prisma filters, transaction boundaries
      (image deleted only after commit), token expiry/reuse, race on two registrations claiming
      one token, error codes the app can't map, null middle/suffix cases.
   c. Duplication: name matching, PIN parsing or PhilHealth detection implemented anywhere other
      than shared/src/validation/philhealth-id.ts; a second S3 client or crypto helper; two
      definitions of a route, env var, audit action or translation key.
   d. Privacy: no full PIN, OCR text, card name or image in logs, audit details, responses
      (except nameOnId and pinLast4 from the scan endpoint), notifications or SMS. Images deleted
      per plan §5.2a. Image route audited and role-checked.
   e. Rules: guest "Report an emergency" untouched and visible on every ID step; an account under
      review can still send an SOS; the verified label never affects priority or dispatch.
   f. Tests assert behaviour (stored values, refusals, deleted files, response contents), not just
      that a mock was called; no existing test was weakened, skipped or deleted.
   g. New dependencies are exactly the allowed ones, pinned to exact versions.
4. Fix only confirmed problems, smallest change first. Then run Part C D in full.
5. Add a "### Review — <date> (Phase N)" section under Phase N in the Progress log: findings,
   fixes, test counts, anything left open. Don't commit.

Report the findings (fixed / open) and the test counts, then STOP.
```
