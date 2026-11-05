# Plan — PhilHealth ID Verification at Citizen Registration

**Status:** In progress: Phases 0–3 built (see Progress log). Decisions recorded 2026-11-05 (§11) · **Date:** 2026-11-05 · **Owner:** AGAP mobile + backend + frontend (admin)
**Implementation prompts:** [PHILHEALTH_ID_VERIFICATION_PROMPTS.md](PHILHEALTH_ID_VERIFICATION_PROMPTS.md)
**Modules:** MOD-01 (registration), MOD-48 (privacy and consent), MOD-46 (audit), MOD-47 (RBAC), MOD-49 (administration)
**Surfaces affected:** `mobile/app/auth/registration.tsx`, `mobile/src/components/registration/` (new), `mobile/src/services/api/auth.api.ts`, `backend/src/auth`, `backend/src/identity-verification` (new), `backend/prisma`, `shared/src/validation`, `frontend/app/(ops)/administration`
**Surfaces that must NOT change behaviour:** guest/bystander SOS (`registerGuest`, the "Report an emergency" button on the registration screen), staff accounts created by administrators, sign-in for seeded demo accounts

---

## 1. Goal

A citizen must scan their **PhilHealth ID** before an AGAP account is created. This cuts down on fake and scam accounts.
The name the citizen types on the registration form must match the name printed on the ID.

- **Only accepted ID:** PhilHealth ID. Other IDs are rejected with a clear message.
- **Scanner:** the phone's own built-in document scanner, opened from AGAP. That is Google's document scanner on Android
  and Apple's on iOS. AGAP does not build its own camera screen for this, except as the fallback in §4.3.
- **Where in the flow:** after the Bocaue location check passes and before the account is created and the OTP is sent.

### What this does and does not prove

The check proves that the person had a PhilHealth ID card in hand, and that the name on it matches the name they typed.
It does **not** prove the card is genuine or that it belongs to the person holding it. There is no public PhilHealth API to check
a card against PhilHealth's records. The other safeguards (one PhilHealth ID per account, phone OTP, staff review of unclear
cases, §7) reduce misuse. They do not close it completely. Say this plainly to stakeholders. Do not present it as "identity verified".

### Constraints from `CLAUDE.md`

- **Rule 14:** guest emergency reporting must always be available. ID verification gates *account creation*, never *getting help*.
  The "Report an emergency" button stays on every registration step, including the ID steps.
- **Rule 5:** optional data never blocks emergency submission. An account whose ID is still under review can still send an SOS.
- **Rule 8:** dispatchers decide. The "ID not verified" label shown to dispatchers (§8) is information only. It never changes
  priority or blocks dispatch.
- **Rule 10 and Data Privacy Act (RA 10173):** a government-issued ID number is *sensitive personal information* (Sec. 3(l)).
  Collecting it needs explicit consent, encryption at rest, least-privilege access and an audit trail.
- **Rule 11:** every review decision and every staff view of an ID image goes to `AuditLog`.
- Never log the PhilHealth number, the OCR text or the image. Never put any of them in an SMS.

---

## 2. Current flow (verified in code)

| Step | Where |
|---|---|
| 1. Location permission → GPS → Bocaue geo-fence check (`LocationStep` state machine) | [registration.tsx:65-211](../../mobile/app/auth/registration.tsx#L65-L211) |
| 2. Form: one free-text **Full Name** field, mobile, email, password, confirm, terms | [registration.tsx:585-607](../../mobile/app/auth/registration.tsx#L585-L607) |
| 3. Client check (`registerSchema`, Zod) → `POST /auth/register` | [registration.tsx:34-49](../../mobile/app/auth/registration.tsx#L34-L49), [:215-275](../../mobile/app/auth/registration.tsx#L215-L275) |
| 4. Server: geo-fence again → duplicate phone/email → create `User` (`PENDING_VERIFICATION`) → queue OTP SMS | [auth.service.ts:260-335](../../backend/src/auth/auth.service.ts#L260-L335) |
| 5. OTP screen → account becomes `ACTIVE` → home | `mobile/app/auth/verify-otp.tsx` |

Existing pieces to reuse:

- AES-256-GCM sealing with owner binding: [secret-box.ts](../../backend/src/common/crypto/secret-box.ts). The pattern of one key per data class comes from [medical-crypto.service.ts](../../backend/src/medical-profiles/medical-crypto.service.ts).
- Object storage that falls back to local disk: [media.service.ts](../../backend/src/media/media.service.ts).
- `consent_records` (free-text `consent_type`), `AuditLog`, BullMQ processors in `backend/src/jobs/processors`.
- The mobile app is an **Expo dev build** (`expo-dev-client`, native `android/` folder), so native modules can be added. Expo Go cannot run them.

---

## 3. New flow

```
Location check (unchanged)
   │ inside Bocaue
   ▼
[A] ID intro + consent ── "Report an emergency" always visible
   │ consent given
   ▼
[B] Phone's document scanner opens (front of PhilHealth ID, 1 page)
   │ cropped, flattened JPEG
   ▼
[C] On-device text reading (instant) ── not a PhilHealth ID / unreadable → retry (max 3)
   │
   ▼
[D] Upload → server reads the image again and decides
   │   returns: verification token, name parts as read, last 4 digits of the PhilHealth number
   ▼
[E] Registration form
      Last name / First name / Middle name / Suffix   ← typed by the citizen
      live check under the name fields: ✓ "Matches your PhilHealth ID"  or  ✗ "Doesn't match…"
      mobile, email, password, confirm, terms (unchanged)
   │ submit (name must match)
   ▼
[F] POST /auth/register  (+ verification token) ── server checks the match again
   │
   ▼
OTP (unchanged) → ACTIVE, identity verified
```

**After 3 failed scans or a name mismatch**, the citizen can tap **"Send to MDRRMO for review"**. The account is created
with ID status `PENDING_REVIEW`. The citizen can sign in and send an SOS, and their profile shows "ID under review". Staff approve
or reject the account from the web admin (§7).

### Why the name is split into four fields

PhilHealth IDs print the name as `LAST, FIRST MIDDLE` (confirm in Phase 0). With one free-text box it is unclear whether
"Dela Cruz Juan" is wrong or just written in a different order, and Filipino surnames often have several words (DE LOS SANTOS,
DELA CRUZ, STA. MARIA). Separate **Last / First / Middle (optional) / Suffix (optional)** fields make the match exact and easy to explain.
`User.full_name` is still saved, built as `First Middle Last Suffix`, so every screen that shows `full_name` keeps working.

---

## 4. Mobile

### 4.1 Native modules (requires rebuilding the dev client)

| Need | Package | Notes |
|---|---|---|
| Phone's document scanner | `react-native-document-scanner-plugin` | Android: Google ML Kit Document Scanner (requires Google Play services). iOS: VisionKit. Includes an Expo config plugin. |
| On-device text reading | `@react-native-ml-kit/text-recognition` | Latin script, on device, no network |

- Pin exact versions at install (no `latest`). Add the config plugins to `app.json`, then rebuild with `npx expo run:android`
  or an EAS dev build. Metro on Windows serves stale routes after edits; restart with `npx expo start -c`.
- Scanner options: **1 page**, **gallery import off** (ID must be scanned live, not picked from photos; check the plugin
  exposes this, otherwise patch or wrap it), JPEG quality about 85, long edge capped at about 1600 px before upload (≤ 2 MB).
- The `NSCameraUsageDescription` text in `app.json` currently mentions only incident evidence. Update it to also cover scanning a
  PhilHealth ID for account verification.

### 4.2 Screens and components

`registration.tsx` is already about 1,470 lines. Keep the new UI in its own files and extend the existing state machine:

```
type RegistrationStep =
  | …existing LocationStep values…
  | 'id_intro'      // what we collect, why, consent checkbox, "Scan PhilHealth ID"
  | 'id_scanning'   // scanner open / reading text / uploading
  | 'id_retry'      // not a PhilHealth ID, unreadable, or server could not read it (attempt n of 3)
  | 'form';         // registration form with name-match indicator (was 'inside')
```

New files:

- `mobile/src/components/registration/PhilHealthIdStep.tsx`: intro, consent, scan, retry and "Send for review"
- `mobile/src/components/registration/NameFields.tsx`: the four name inputs plus the live match indicator
- `mobile/src/services/id-scan/philhealth-scan.ts`: opens the scanner, runs text reading, calls the shared parser (§6), uploads
- `mobile/src/services/api/auth.api.ts`: add `submitIdScan()`; `register()` gains `firstName`, `middleName`, `lastName`, `suffix`, `idVerificationToken`
- `mobile/src/i18n/translations.ts`: all new strings in `en` and `fil`

Form behaviour:

- The match check runs when a name field loses focus and again on submit. It uses the **same shared matcher** as the server (§6).
- On a mismatch, show the name as read from the card so the citizen can fix spelling. Example: *"Your PhilHealth ID shows:
  DELA CRUZ, JUAN SANTOS"*. This is the citizen's own card, so showing it back is fine.
- **Create account** is disabled until the name matches, or until the citizen has chosen "Send for review".
- Never pre-fill the name fields from the scan. The citizen types the name, as specified, and the system checks it.
- Keep the scanned image in memory and the app cache only. Delete the cached file after upload, and on leaving the screen.

### 4.3 Fallback when the phone has no Google document scanner

Phones without Google Play services cannot open the ML Kit scanner. Common examples are newer Huawei models, which many people in the Philippines use.
When the scanner fails to open, show an `expo-camera` screen with a card-shaped frame and a capture button. The rest of the
flow (text reading, upload, match) is the same. If on-device text reading is also unavailable, upload anyway and let the
server decide.

### 4.4 Offline and slow networks

ID verification needs the network, just like the geo-fence check and OTP already do. Use the existing slow-request pattern
(`registrationSlow`, a 15-second notice). Offline, show *"You need internet to create an account. For emergencies, use Report an
emergency or call 911 / MDRRMO."* with both buttons. Never queue an ID upload offline.

---

## 5. Backend

### 5.1 Data model (new migration)

```prisma
enum id_document_type {
  PHILHEALTH
}

enum identity_verification_status {
  AUTO_VERIFIED    // server read the card, it is a PhilHealth ID, and the name matched
  PENDING_REVIEW   // citizen asked for staff review (unreadable or mismatch)
  APPROVED         // staff approved after review
  REJECTED         // staff rejected
  EXPIRED          // scan never claimed by a registration within 30 minutes
}

/// MOD-01/48: one PhilHealth ID scan. Created before the account exists, then claimed by POST /auth/register.
model identity_verifications {
  id                 String                       @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  user_id            String?                      @db.Uuid          // null until claimed by a registration
  document_type      id_document_type             @default(PHILHEALTH)
  status             identity_verification_status
  claim_token_hash   String                       @unique @db.VarChar(64)  // SHA-256 of the token returned to the app
  claim_expires_at   DateTime                     @db.Timestamptz(6)
  pin_hmac           String                       @db.VarChar(64)   // HMAC-SHA256(PIN, ID_PIN_PEPPER): duplicate check only
  pin_last4          String                       @db.VarChar(4)
  name_on_id_sealed  String                                         // sealed JSON { last, first, middle, suffix }
  image_storage_key  String?                                        // sealed image; null once purged
  client_read_ok     Boolean?                                       // on-device reading agreed with server
  match_result       Json?                                          // which name parts matched; no names, no PIN
  attempt_number     Int                          @default(1) @db.SmallInt
  reviewed_by_id     String?                      @db.Uuid
  reviewed_at        DateTime?                    @db.Timestamptz(6)
  rejection_reason   String?                      @db.VarChar(50)   // fixed codes, never free text with PII
  consent_record_id  String?                      @db.Uuid
  created_at         DateTime                     @default(now()) @db.Timestamptz(6)
  …relations to User (user, reviewer) and consent_records

  @@index([user_id])
  @@index([status, created_at])
}
```

**Phase 3 change:** `pin_hmac`, `pin_last4` and `name_on_id_sealed` are nullable (migration
`20261105160000_identity_verification_review_scans`), so a card the server can't read can still go to staff review after the
third attempt. See the Phase 3 section of the Progress log.

`User` gains `identity_verified_at DateTime? @db.Timestamptz(6)`. It is set on `AUTO_VERIFIED` or `APPROVED`, and it is what
the dispatch label and app banners read.

**One PhilHealth ID per account:** add a partial unique index in the migration SQL, because Prisma cannot express it:

```sql
CREATE UNIQUE INDEX "uq_identity_verifications_pin_active"
  ON "identity_verifications" ("pin_hmac")
  WHERE "user_id" IS NOT NULL AND "status" IN ('AUTO_VERIFIED', 'PENDING_REVIEW', 'APPROVED');
```

The date of birth, address and photo are **not** extracted or stored (data minimisation). Only the name and PIN are read.

### 5.2 New environment variables (`.env.example` placeholders only)

| Variable | Purpose |
|---|---|
| `ID_VERIFICATION_REQUIRED` | `true` enforces the scan on `/auth/register`. `false` in unit tests and old e2e fixtures. |
| `ID_DOCUMENT_ENCRYPTION_KEY` | 32-byte base64 key that seals the names and the image. Separate from `MEDICAL_ENCRYPTION_KEY` and `MFA_ENCRYPTION_KEY`. |
| `ID_PIN_PEPPER` | Secret for `pin_hmac`. Rotating it breaks the duplicate check, so document that. |

If `ID_VERIFICATION_REQUIRED=true` and a key is missing, refuse to start. Same rule as the medical key.

### 5.2a Image retention (decided, §11 D2)

The ID image is kept **only while something still needs it**:

| Situation | When the image is deleted |
|---|---|
| Name matched at registration (`AUTO_VERIFIED`, claimed) | Right after the registration transaction commits |
| Sent for staff review (`PENDING_REVIEW`) | When staff approve or reject |
| Scanned but never registered (unclaimed) | When the claim expires, 30 minutes after the scan |

Deleting the stored file happens **after** the database commit and must never fail the registration or the review. If the
delete fails, log it (no PII) and leave `image_storage_key` set; the cleanup job (§5.3) retries it. What stays in the database
after deletion: `pin_hmac`, `pin_last4`, the sealed name, the status and the match result.

### 5.3 Module `backend/src/identity-verification/`

```
identity-verification.module.ts
identity-verification.controller.ts      POST /api/v1/auth/id-verification (public)
identity-verification-admin.controller.ts  admin review routes (§7)
identity-verification.service.ts
philhealth-ocr.service.ts                server-side text reading
id-document-crypto.service.ts            seal/open names + image buffers
```

**`POST /api/v1/auth/id-verification`**, public and multipart:

- Throttle like `/auth/register`: 5 per minute and 10 per 15 minutes per IP. JPEG/PNG only, ≤ 2 MB, rejected before decoding.
- Body: `image`, `consentGiven: true` (required), `clientText` (optional, the on-device reading, used only for comparison),
  `attemptNumber`, plus `latitude`/`longitude`, which go through the same geo-fence check so the endpoint is not open to the whole country.
- Steps:
  1. Read text with the server OCR (§5.4).
  2. Check it is a PhilHealth ID: the card heading keywords and a PIN in the expected pattern (§6). If not → `422 NOT_PHILHEALTH_ID`.
  3. Parse the name. If unreadable → `422 UNREADABLE` (the app offers a retry).
  4. Seal the image and store it under a separate `id-documents/` prefix, never in the incident media bucket.
  5. Save the row with status `AUTO_VERIFIED`, unclaimed, and an expiry 30 minutes ahead. The name match happens at registration, because the name isn't typed yet.
  6. Return `{ token, nameOnId: {last, first, middle, suffix}, pinLast4 }`. The full PIN is **never** returned.
- Duplicate PhilHealth ID: if `pin_hmac` already belongs to an active account, return `409 ID_ALREADY_REGISTERED` with
  *"This PhilHealth ID is already linked to an AGAP account. Sign in or reset your password."*

**`POST /auth/register` changes** in [auth.service.ts:260](../../backend/src/auth/auth.service.ts#L260):

- `RegisterDto` gains `lastName`, `firstName`, `middleName?`, `suffix?`, `idVerificationToken`, and `requestReview?: boolean`.
  `fullName` is still accepted from older clients but rejected when `ID_VERIFICATION_REQUIRED=true` and no token is sent.
- Inside one transaction, after the existing geo-fence and duplicate phone/email checks:
  1. Look up the verification by `sha256(token)`. It must be unclaimed and unexpired, otherwise `400 ID_SCAN_EXPIRED` (rescan).
  2. Open `name_on_id_sealed` and run the shared matcher (§6) against the typed name.
     - Match → create the user, set `identity_verified_at = now()`, claim the row.
     - No match and `requestReview` not set → `400 NAME_DOES_NOT_MATCH_ID`. Nothing is created.
     - No match and `requestReview = true` → create the user, set the row to `PENDING_REVIEW`, claim it, and leave `identity_verified_at` null.
  3. Create the `consent_records` row (`consent_type = 'ID_VERIFICATION_PHILHEALTH'`) and link it.
  4. Audit `IDENTITY_VERIFICATION_CLAIMED`, with outcome and user id only.
- After the commit: on a match, delete the image (§5.2a). On `PENDING_REVIEW`, keep it for the reviewer.
- OTP sending is unchanged.

**Background job:** a `processors/identity-verification.processor.ts` that runs every 10 minutes and does two things:
- expire unclaimed rows past `claim_expires_at` (status → `EXPIRED`) and delete their images;
- sweep: delete any image still stored for a row that is `AUTO_VERIFIED` and claimed, `APPROVED`, `REJECTED` or `EXPIRED`
  (catches deletes that failed earlier), setting `image_storage_key = null`.

### 5.4 Server-side text reading

The server reads the image itself. Text sent from the phone is never trusted on its own, because a modified app could send anything.

- **Decided (§11 D3):** `tesseract.js` with English data **bundled on the server** (set `langPath` to a local folder so nothing is fetched from a CDN at runtime).
  Images stay on AGAP infrastructure, with no third-party transfer to cover in the privacy notice, and it works without internet on the demo laptop.
- The phone's scanner already crops and flattens the card, which is where Tesseract does best. Run it on the name and PIN area
  first (positions from Phase 0 samples), then on the whole card if that fails.
- If the server cannot read the card but the phone could, return `UNREADABLE`, and on the third attempt offer review. **Never
  auto-verify from phone text alone.**
- No cloud OCR service (§12). Revisit only if Phase 0 accuracy is below the target.

---

## 6. Shared matching rules: `shared/src/validation/philhealth-id.ts`

Mobile (live indicator) and backend (final decision) both use this file, so they never disagree.

```ts
export interface IdName { last: string; first: string; middle?: string; suffix?: string }

export function normalizeNamePart(value: string): string;           // see rules below
export function parsePhilHealthPin(text: string): string | null;    // 12 digits or null
export function looksLikePhilHealthId(text: string): boolean;
export function parsePhilHealthName(text: string): IdName | null;   // from OCR text
export function matchIdName(typed: IdName, onId: IdName): {
  matches: boolean;
  parts: { last: boolean; first: boolean; middle: 'match' | 'initial' | 'omitted' | 'mismatch'; suffix: boolean };
};
```

**Normalisation** (both sides): trim; uppercase; strip accents (`Ñ`→`N`, `É`→`E`) so either spelling matches; remove periods
and commas; hyphens and repeated spaces become single spaces; expand `STA`→`SANTA`, `STO`→`SANTO`.

**Match rules:**

| Part | Rule |
|---|---|
| Last name | Must equal the ID's last name after normalisation. Multi-word surnames compared as a whole (`DELA CRUZ` ≠ `CRUZ`). |
| First name | Must equal the ID's first name. Two-word first names (`MARIA CLARA`) must be typed in full. |
| Middle name | If the ID has one: typed full name or initial both pass. Leaving it blank passes, so it stays optional. A different name fails. |
| Suffix | `JR`, `SR`, `II`, `III`, `IV`. Must match when the ID shows one. Ignored when the ID has none. |
| OCR slips | Each word of 5+ letters may differ by **one** character (edit distance 1), which covers misreads like `0/O`, `1/I`, `5/S` and `8/B`. Shorter words must match exactly. |

**PIN:** 12 digits, printed in a 2-9-1 grouping (`12-345678901-2`). Accept spaces or dashes. Check the format only; there is no
public check-digit rule to rely on.

**PhilHealth detection:** the text contains the PhilHealth heading (`PHILHEALTH` or `PHILIPPINE HEALTH INSURANCE`) **and** a valid
PIN. The exact keywords and name layout are confirmed against real cards in Phase 0.

Tests in `backend/test/identity-verification/philhealth-id.spec.ts` must cover at least:
`DELA CRUZ` vs `Dela Cruz` vs `Delacruz` (last one fails), `Ñ`/`N`, `Sto. Niño`, middle initial, missing middle,
`Jr.` vs `JR`, two-word first names, swapped first/last (fails), one OCR slip in a long word (passes), and one in a 4-letter word (fails).

---

## 7. Staff review (web admin)

Who reviews: **System Administrator** and **MDRRMO Org Administrator**, via the new permission `identity_verification:review`
in `backend/src/permissions`. Dispatchers do not review; they are busy with live incidents.

Backend routes (`identity-verification-admin.controller.ts`):

| Route | Does |
|---|---|
| `GET /api/v1/admin/id-verifications?status=PENDING_REVIEW` | Queue: account name, phone, submitted at, attempt count, which name parts failed. No image, no PIN. |
| `GET /api/v1/admin/id-verifications/:id/image` | Streams the opened image with `Cache-Control: no-store`. **Every call audited** (`ID_IMAGE_VIEWED`, by whom). `410 Gone` once the image is deleted. |
| `POST /api/v1/admin/id-verifications/:id/approve` | → `APPROVED`, sets `identity_verified_at`, audit, then deletes the image (§5.2a). |
| `POST /api/v1/admin/id-verifications/:id/reject` | `{ reason: 'NOT_PHILHEALTH' \| 'NAME_MISMATCH' \| 'UNREADABLE' \| 'SUSPECTED_FRAUD' }` → `REJECTED`, audit, then deletes the image (§5.2a). |

Frontend page: `frontend/app/(ops)/administration/id-reviews/page.tsx`
- Table of pending reviews. Opening one shows the typed name next to the ID image (loaded only on click), with Approve and Reject.
- The citizen gets a push notification and SMS: *"Your AGAP account ID check was approved."* / *"…was not approved. Open AGAP to scan again."*
  The SMS contains no names and no ID number.
- A rejected citizen can rescan from their profile. The account is **not** deactivated automatically. Suspending is a separate,
  deliberate admin action (existing MOD-49 tools).

---

## 8. Other surfaces

- **Dispatch console:** on the incident reporter card, show *"ID verified"* or *"ID not verified"* from `identity_verified_at`.
  It applies to the **reporter** only, never the patient. It is information only and never affects priority, recommendations or
  dispatch (rule 8). Guests already show as guests.
- **Mobile profile:** a status row (Verified / Under review / Not approved → Scan again).
- **Every citizen account goes through the scan (§11 D1).** The database is reset before the defense, so there are no
  pre-existing citizen accounts to migrate. No "verify later" banner and no grandfathering.
- **Seed:** seeded citizen accounts get `identity_verified_at` set and a claimed `AUTO_VERIFIED` row with no image, so demos
  and e2e flows work unchanged. Use clearly fake PINs (for example `00-000000001-0`), never real-looking ones.

---

## 9. Phases

| Phase | Work | Done when |
|---|---|---|
| **0. Spike and samples** | Install both native modules in the dev build and test on one Google-services phone and one phone without them. Collect 5–10 PhilHealth IDs from team members, with written consent. Confirm the name layout, heading keywords and PIN pattern, and measure Tesseract accuracy on them. Have the adviser review the consent text. Delete the sample scans when Phase 0 ends. | Name and PIN read correctly on ≥ 8 of 10 samples, by phone **and** server. Layout notes added to §6. |
| **1. Shared rules** | `philhealth-id.ts` + tests (§6). Rebuild `shared/dist`, then restart backend and frontend. | All matcher tests pass. |
| **2. Backend** | Migration, env vars, crypto service, `POST /auth/id-verification`, `register()` changes behind `ID_VERIFICATION_REQUIRED`, cleanup job, audit events, tests. | Unit and controller tests pass. Register without a token fails when the flag is on and works as before when it is off. |
| **3. Mobile** | Native modules, new steps and components, split name fields, live match, fallback camera, translations. | Full flow on a real phone: scan → typed name matches → OTP → home. Mismatch → review path. Guest SOS reachable from every step. |
| **4. Admin review** | Permission, admin routes, `id-reviews` page, approve/reject notifications. | Pending review approved from the web. Citizen sees "Verified". Audit shows the image view. |
| **5. Labels and seed** | Dispatch reporter label, profile status row, seed update. | Labels shown, nothing blocked. Seed runs twice without duplicates. |
| **6. Docs and defense readiness** | Turn on `ID_VERIFICATION_REQUIRED` in `.env.example` and the dev setup. Update `docs/modules/MOD-01_*`, `MOD-48_*`, `docs/USER_ACCOUNTS.md`, `docs/module-reports/MODULE_TESTING_GUIDE.md`, and the privacy notice. Rehearse the §13 demo. | Emergency-flow e2e suite passes with the flag on. |

### Progress log

Each implementation prompt fills in its row and adds a `### Phase N — <date>` section below the table: files added or changed,
migrations (applied or not), dependencies added (exact versions), deviations from this plan and why, and what still needs a
person or a phone.

| Phase | Status | Date | Notes |
|---|---|---|---|
| 0. Spike and samples | Tools installed; waiting on phone + sample runs | 2026-11-05 | Agent part done. The user still fills in the layout notes below |
| 1. Shared rules | Done, awaiting review | 2026-11-05 | 25 matcher tests pass; built on 1 real card's layout (see Phase 0) |
| 2. Backend | Done, awaiting review | 2026-11-05 | Migration applied; 44 new tests pass; e2e blocked by Redis not running |
| 3. Mobile | Done, awaiting review and a phone test | 2026-11-05 | Includes a backend follow-up (review of unreadable scans, migration applied) and `expo-image-manipulator`, both approved by the user. 23 mobile + 7 backend tests; e2e blocked by Redis again |
| 4. Admin review | Not started | | |
| 5. Labels and seed | Not started | | |
| 6. Docs and defense readiness | Not started | | |

### Phase 0 — 2026-11-05

**Added**
- `mobile/app/dev/id-scan-spike.tsx`: dev-only screen (renders `null` unless `__DEV__`). Scans 1 page, runs on-device text
  reading, and shows only: PIN pattern found (yes/no), number of text lines, image size, reading time. If the scanner fails it
  shows the error and the stage (`scanner` / `image` / `text`). It never shows or logs the text, and it deletes the scanned
  file from the cache in a `finally`. To be deleted in Phase 3.
- `backend/scripts/ocr-spike.ts`: runs local tesseract.js on every `.jpg`/`.jpeg`/`.png` in a folder and prints the raw text,
  confidence and time per file. It writes nothing to disk and refuses a folder inside the repo.

**Changed**
- `mobile/app.json`: `NSCameraUsageDescription` now also covers scanning the PhilHealth ID. Added the
  `react-native-document-scanner-plugin` config plugin with the same text as `cameraPermission`. The plugin only sets that iOS
  string and changes nothing on Android.
- `pnpm-workspace.yaml`: `tesseract.js: false` under `allowBuilds`. Its only install script is `opencollective-postinstall`
  (a donation banner), and pnpm refuses to finish the install until a choice is recorded.
- `mobile/package.json`, `backend/package.json`, `pnpm-lock.yaml`: the dependencies below.

**Dependencies (exact versions)**

| Package | Version | Where | Notes |
|---|---|---|---|
| `react-native-document-scanner-plugin` | 2.0.4 | mobile | TurboModule (codegen). Android: `play-services-mlkit-document-scanner:16.0.0`. iOS: VisionKit. |
| `@react-native-ml-kit/text-recognition` | 2.0.0 | mobile | Old-style bridge module (`NativeModules`). App has `newArchEnabled=true`, so it relies on RN's interop layer. Confirm in the phone build. |
| `tesseract.js` | 7.0.0 | backend | |
| `@tesseract.js-data/eng` | 1.0.0 | backend | English data bundled on disk (`4.0.0_best_int/eng.traineddata.gz`, about 14 MB unpacked across both variants) |

**Scanner options (step 1 finding)**
- **1-page limit:** `maxNumDocuments: 1`. **Android only.** It maps to ML Kit's `setPageLimit`. On iOS the plugin has no page
  limit, so take the first page and ignore the rest.
- **Gallery import off:** **not available** as a plugin option. The plugin never calls ML Kit's `setGalleryImportAllowed`, and ML
  Kit's default is "not allowed". So on Android gallery import should already be off. Confirm on the phone: the scanner screen
  should have no "Import" button. iOS VisionKit has no gallery import. No patch needed unless the phone shows an Import button.
- Other options: `croppedImageQuality` (0–100, default 100) and `responseType` (`imageFilePath` | `base64`). The plugin always
  runs ML Kit in `SCANNER_MODE_FULL`, which adds the cleaning and filter tools. There is no option to change that.
- If the phone has no Google Play services, `scanDocument` rejects with the error message ML Kit gives (from
  `getStartScanIntent` failing). The spike screen shows that message so it can be recorded below.

**Tesseract settings for Phase 2 to reuse**
`createWorker('eng', OEM.LSTM_ONLY, { langPath: <dir of @tesseract.js-data/eng>/4.0.0_best_int, gzip: true, cacheMethod: 'none' })`.
`cacheMethod: 'none'` stops tesseract writing `eng.traineddata` into the working directory.
A **synthetic** test card (invented name, PIN `00-000000001-0`, generated outside the repo) read back exactly: worker ready in
about 0.75 s, then 0.67 s per image, with confidence 94. No real card was used. This shows the bundled data loads offline. It
says nothing about accuracy on real cards.

**Inventory:** nothing from Phase 0 existed before this run (no `mobile/app/dev/`, no `ocr-spike.ts`, none of the four packages).

**Tests:** backend before: 99 suites, 1585–1586 of 1587 pass across two runs. The 1–2 failures were in
`test/auth/auth-phase3.spec.ts`, the known timeout under full-suite load. Backend after: 1587 of 1587 pass, and
`auth-phase3.spec.ts` alone passes 59 of 59. Mobile: 15 suites / 182 tests, before and after.
Mobile, backend and `scripts/ocr-spike.ts` all typecheck clean.

**Deviations**
- `mobile/android/` is committed, so `npx expo run:android` does **not** re-run prebuild, and `app.json` plugin changes don't
  reach Android. That's fine here: both modules autolink through Gradle, and neither needs Android manifest changes (the ML Kit
  scanner runs in Google Play services and needs no `CAMERA` permission). The iOS string applies on the next iOS prebuild.
- The spike screen sits under `/dev`, which the root `AuthGuard` treats as a protected route, so sign in first.
  `_layout.tsx` was left unchanged. There's no USB cable for `adb`, so `mobile/app/profile/index.tsx` gained a
  `__DEV__`-only "PhilHealth scan spike" row (Profile → bottom, above Sign out) that opens the screen. Remove that row
  together with the spike screen in Phase 3.

**Phone results (development build, phone with Google Play services, 2026-11-05)**
- 1 PhilHealth ID scanned from Profile → PhilHealth scan spike: scanner opened, **PIN pattern found: yes**, 8 text lines,
  image 2478 × 1733 px, on-device reading 385 ms.
- So `@react-native-ml-kit/text-recognition` loads through the New Architecture interop layer, and the ML Kit scanner works.
- The spike only checks the PIN pattern. Whether the *name* reads correctly on the phone is checked in Phase 1/3 with the
  shared parser.

**Follow-ups for later phases**
- Phase 3: the scanner returns about 2500 px on the long edge, even at quality 85. Downscale to about 1600 px before upload
  (§4.1) to stay under the 2 MB limit of the scan endpoint.
- Phase 3: the text-recognition module bundles the Chinese, Devanagari, Japanese and Korean models next to Latin, which makes
  the APK bigger. Consider excluding them in Gradle.
- Phase 3: the spike's PIN regex is throwaway. The real one goes in `shared/src/validation/philhealth-id.ts` (Phase 1).

**Needs a person or a phone**
1. Rebuild the dev client and run the spike screen on a phone with Google Play services, then on one without (for example a newer Huawei).
2. Run `ocr-spike.ts` on the 5–10 sample cards (stored outside the repo).
3. Fill in the layout notes below. **No real names or numbers.**
4. Delete the sample scans when Phase 0 ends.

#### Layout notes (filled in by the user)

Written from one card's server OCR output; patterns only, no real values.

- Heading text found on the card: `REPUBLIC OF THE PHILIPPINES`, then `PhilHealth` (mixed case), then
  `Philippine Health Insurance Corporation` (mixed case) on the next line. OCR adds stray symbols around them.
- Name line format (e.g. `LAST, FIRST MIDDLE`): `LAST, FIRST MIDDLE` on **one line**, all caps, comma after the surname.
  The middle name is printed **in full**, not as an initial. The line comes right after the PIN line. OCR left junk
  *before* it (one stray letter and `~~`), so the parser must drop leading non-word tokens and single stray letters.
- Where the PIN appears and its grouping: on its own line **between the heading and the name**, printed
  `NN-NNNNNNNNN-N` (2-9-1, with dashes). OCR may put stray characters before it.
- After the name: date of birth as `MONTH DD, YYYY` followed by the sex (`- MALE` / `- FEMALE`), then the address over two
  lines, ending in municipality, province and ZIP. The parser must ignore these lines (§5.1: not extracted). OCR slips seen in
  these lines: `,` read as `.`, and `E` read as `F`, the kind of slip the §6 one-edit tolerance covers.
- Cards read correctly by phone (n/10): 1 scanned so far. The PIN pattern was found; the spike doesn't check the name.
- Cards read correctly by server (n/10): 1/1 **after cropping to the card** (confidence 57, 1.4 s). The same card as an
  uncropped 3024 × 4032 phone photo, re-compressed by a chat app, was unreadable (confidence 28, 8.3 s).
  **Below the Phase 0 target of 8 of 10 cards:** only 1 card tested so far.
- Scanner on a phone without Google Play services (works / fails with: ...): not tested yet.

**Finding:** the server OCR only works on a card that is cropped and upright. The ML Kit scanner already returns that.
The Phase 3 fallback camera (§4.3) must crop to its card-shaped frame before upload, and Phase 2's OCR service should
downscale large images. Never send a raw full-frame photo.

### Phase 1 — 2026-11-05

**Added**
- `shared/src/validation/philhealth-id.ts`: `IdName`, `normalizeNamePart`, `parsePhilHealthPin`, `looksLikePhilHealthId`,
  `parsePhilHealthName`, `matchIdName`, `composeFullName`, plus a local edit-distance helper. No logging, no new dependency.
- `backend/test/identity-verification/philhealth-id.spec.ts`: 25 tests. They cover every case listed in §6, PINs with dashes
  and spaces, 11/13 digits and other groupings (including a PhilSys-style 4-4-4-4 number), a driver's licence and a school ID
  (made-up text), `composeFullName` with and without middle name and suffix, and parsing of made-up OCR text in the Phase 0
  layout. Invented names and fake PINs only.

**Changed**
- `shared/src/validation/index.ts`: exports the new file. `shared/dist` rebuilt (`pnpm build` writes to `dist/` only; no new
  `.js` copies in `shared/src`).

**Inventory:** none of the six functions, `composeFullName`, the spec file or the test folder existed before.

**Tests:** backend before: 1587 tests, all passing in the last Phase 0 run. Backend after: 1612 tests (1587 + 25 new). The other
99 suites pass 1553/1553, and `auth-phase3.spec.ts` alone passes 59/59. In the full run it timed out again (known, under load).
Typecheck clean in shared, backend, mobile and frontend.

**Deviations and decisions (for review)**
- **Splitting the given names.** The card prints `FIRST MIDDLE` with no separator, so `MARIA CLARA SANTOS` could be
  MARIA CLARA + SANTOS or MARIA + CLARA SANTOS.
  - `parsePhilHealthName` picks a split: a middle name that starts with a surname particle (`DELA CRUZ`, `DE LOS SANTOS`),
    otherwise the last word.
  - `matchIdName` also accepts the other plausible splits: no middle name, a one-word middle name, or a particle-led one.
  - "Two-word first names typed in full" holds whenever the card shows three or more given words. With **two** given words
    (`MARIA CLARA`), the card can't tell first from middle, so typing only `MARIA` passes. This is inherent to the card, not
    a bug.
- **Typed middle name when the ID shows none** → `mismatch`. The plan didn't say, and this is the stricter choice.
- **Middle initials of a compound middle name**: `D` or `DC` both count as `initial` for `DELA CRUZ`.
- **Suffix position**: the parser accepts the suffix after the surname (`DELA CRUZ JR., JUAN`) or after the given names, because
  the Phase 0 card had none. Recheck when a card with a suffix is scanned.
- **Comma misread as `.`, `;` or `:`**: only on the line right after the PIN, and only when no line has a comma. A wrong split
  there just leads to a mismatch and the review path.
- **OCR junk filter**: name words must be mostly capitals, since the card prints names in caps. A single stray letter before the
  surname is dropped, as in the Phase 0 card. Lines with a run of 2+ digits (PIN, birth date, address) are never read as the
  name, so the birth date, sex and address are never extracted (§5.1).
- **Normalisation detail**: a period glued to the next letter (`STA.MARIA`) becomes a space rather than vanishing, so it still
  equals `STA. MARIA`.
- **Hermes safety**: accents are stripped with an explicit Latin-1 map, not `String.normalize`, and the PIN regex has no
  lookbehind, so mobile and backend get identical results.
- **Extra type exports**: `MiddleNameResult` and `IdNameMatch` name the return type of `matchIdName` from §6. Types only, so
  the mobile app can import them.
- **`looksLikePhilHealthId`** accepts any text with the PhilHealth heading and a valid PIN, so a PhilHealth paper form (MDR)
  would also pass. The plan's rule; staff review and one-ID-per-account limit the risk.

**Needs a person or a phone:** more real cards through `ocr-spike.ts`, then `parsePhilHealthName` checked against them (a
throwaway local check that prints only "parsed: yes/no" and "matches typed: yes/no", never the text). Most useful: a card
with a suffix, a two-word first name, and a compound middle name.

### Phase 2 — 2026-11-05

**Migration:** `20261105130000_identity_verifications`, **applied** to the dev database with `migrate deploy`, and to the
E2E database through `test:e2e:db`. It adds `id_document_type`, `identity_verification_status`, the
`identity_verifications` table, `users.identity_verified_at`, the partial unique index
`uq_identity_verifications_pin_active`, and the `audit_action` value `IDENTITY_VERIFICATION_CLAIMED`.
`migrate status`: up to date. `migrate diff` against the schema: empty (Prisma doesn't flag the partial index).

**Added**
- `backend/src/identity-verification/`:
  - `identity-verification.module.ts`
  - `identity-verification.service.ts`: scan, `prepareClaim`, `claim`, `deleteImage`, cleanup
  - `identity-verification.controller.ts`: `POST /api/v1/auth/id-verification`
  - `id-document-crypto.service.ts`
  - `philhealth-ocr.service.ts`
  - `dto/id-scan.dto.ts`
- `backend/src/jobs/processors/identity-verification.processor.ts`: `@Cron('*/10 * * * *')`.
- `shared/src/constants/identity-verification.ts`: `ID_IMAGE_MAX_BYTES` (2 MB), `ID_SCAN_CLAIM_TTL_MINUTES` (30),
  `ID_SCAN_MAX_ATTEMPTS` (3), `ID_VERIFICATION_CONSENT_TYPE`, and the `IdVerificationErrorCode` enum. These are for the
  app in Phase 3.
- Tests in `backend/test/identity-verification/`:
  - `id-document-crypto.spec.ts` (10): crypto round trip, wrong `aad`, tampering, PIN HMAC, startup refusal.
  - `id-scan-endpoint.spec.ts` (13): real HTTP through multer and the validation pipe.
  - `id-register.spec.ts` (14).
  - `id-cleanup-and-ocr.spec.ts` (7).
  - `id-test-kit.ts`: in-memory database that rolls back transactions and enforces the partial index, plus in-memory
    storage.

**Changed**
- `schema.prisma`: matches the migration; no other lines reformatted.
- `.env.example`: `ID_VERIFICATION_REQUIRED=false` (Phase 6 turns it on), `ID_DOCUMENT_ENCRYPTION_KEY`, `ID_PIN_PEPPER`.
- `config.validation.ts`: with the flag on, the server refuses to start without a valid key and a pepper of at least
  32 characters. A malformed key is refused even with the flag off, the same as the other keys.
- `secret-box.ts`: `sealBuffer` / `openBuffer`, the binary form of the v1 format: `v1.` + iv + tag + ciphertext.
- `media.service.ts`: `putPrivateObject` / `getPrivateObject` / `deletePrivateObject`. They use the same S3 client and
  local-disk fallback, with no public URL. The location is stored as `<bucket>:<key>`.
- `auth.service.ts` `register()`: changed only after the unchanged geo-fence and duplicate phone/email checks.
  - Flag check, then the scan check.
  - The user is created and the scan claimed in one transaction.
  - The image is deleted after commit on a match.
  - The response gains `identityVerification: 'AUTO_VERIFIED' | 'PENDING_REVIEW' | null`.
  - OTP is unchanged. `registerGuest` is untouched.
- `RegisterDto`: `fullName` is now optional, and it gained `lastName`, `firstName`, `middleName`, `suffix`,
  `idVerificationToken` and `requestReview`.
- `auth.module.ts`, `jobs.module.ts`: wiring. `AuditAction.IDENTITY_VERIFICATION_CLAIMED` added in shared.
- Test setup only, no assertions changed:
  - `test/auth/fake-prisma.ts`: `makeAuthService` passes the two new `AuthService` arguments.
  - `test/users/user-sex.spec.ts`: builds `AuthService` with a config stub.
  - `test/transport-flow.e2e-spec.ts`: sets `ID_VERIFICATION_REQUIRED=false`.

**Inventory:** nothing existed before this phase. `user_verifications` (OTP codes) is unrelated and was left alone.

**Tests:** backend before: 1612 (Phase 1). Backend after: 1656 (+44). The suite run without `auth-phase3` passed
1592/1597. The 5 failures were in `user-sex.spec.ts`, which builds `AuthService` by hand; after giving it a config stub it
passes 16/16. All auth suites together pass 133/133. Typecheck clean in shared, backend, mobile and frontend.
**E2E:** `test:e2e:db` succeeded: migrated and seeded. `test:e2e` booted the full `AppModule`, which proves the new module
wiring, but the transport-flow test timed out at 120 s because **Redis is not running** (port 6379 closed), so BullMQ calls
wait forever. Re-run with Redis up.

**Deviations and decisions (for review)**
- **Controller location.** The scan controller lives in `identity-verification/` but is registered in `AuthModule`, because
  it needs `AuthService.checkGeoFence` and `AuthService` needs this module to claim scans. Registering it there avoids a
  circular module import.
- **Cleanup schedule.** The cleanup job uses `@Cron` from `@nestjs/schedule`. The repo has no BullMQ repeatable jobs; every
  periodic job is a `@Cron`, so "registered the same way" means that.
- **Extra error codes**, all in the shared `IdVerificationErrorCode` enum:
  - `CONSENT_REQUIRED` (400)
  - `OUTSIDE_SERVICE_AREA` (400)
  - `IMAGE_TOO_LARGE` (413; multer's own refusal is mapped to the same code by a filter)
  - `UNSUPPORTED_IMAGE_TYPE` (415, judged by the file signature, not the declared type; 400 when no image)
  - `ID_VERIFICATION_REQUIRED` (400, flag on and no token)
  - `NAME_DOES_NOT_MATCH_ID` also returns `parts` (which name parts failed). No names.
- **Unreadable vs not PhilHealth.** OCR failure or timeout → `UNREADABLE`. Text without the PhilHealth heading and PIN →
  `NOT_PHILHEALTH_ID`, but only when OCR confidence is ≥ 40, otherwise `UNREADABLE`. From Phase 0: the uncropped photo read
  at 28, the cropped card at 57. A heading and PIN with no name line → `UNREADABLE`.
- **Consent record.** It is created at registration, when the user exists, not at scan time. `consentGiven=true` is required
  at scan time (`consent_records.user_id` is NOT NULL).
- **Order of checks.** The flag and token are checked after the existing geo-fence and duplicate checks, so an
  already-registered phone gets the same "Phone number already registered" as before.
- **Image deletion on a match** is awaited after commit, so the response comes back with the image already gone. It never
  throws; a failure is retried by the job.
- **Bug found by the tests and fixed.** The global `ValidationPipe` uses implicit conversion, which turns the string
  `'false'` into `true`. `consentGiven` and `requestReview` now read the raw field, so `consentGiven=false` can never count
  as consent.
- **OCR runs on the whole card.** There are no Phase 0 coordinates for a name/PIN-only pass, and the server doesn't
  downscale (no image library; the app downscales in Phase 3).
- **Real OCR test skipped.** There is no image library to generate a card in Jest. Phase 0's synthetic card through
  `ocr-spike.ts` covers the bundled-data path.
- **The app's flag default is off.** `ID_VERIFICATION_REQUIRED` unset means off, so the current mobile app keeps
  registering until Phase 3 ships.
- **Pepper length.** `ID_PIN_PEPPER` must be at least 32 characters when the flag is on. The plan only said "secret"; a
  short pepper would let a leaked HMAC be brute-forced over the 10¹² PINs.

**Needs a person**
- Start Redis, then `cd backend; pnpm test:e2e`.
- Before turning the flag on, generate `ID_DOCUMENT_ENCRYPTION_KEY` and `ID_PIN_PEPPER` in `backend/.env` with the command
  in `.env.example`.
- Restart the backend so it picks up the new module and the regenerated Prisma client.

**Later check (Phase 3 preflight, 2026-11-05):** with Redis up, `test:e2e:db` + `test:e2e` passed 1/1.

### Phase 3 — 2026-11-05

**Preflight check of Phases 0–2.** No errors or duplication found; 218/218 ID + auth tests and the e2e passed. One gap: plan §3
promises "Send to MDRRMO for review" after 3 failed scans, but the backend refused an unreadable scan, stored nothing and
returned no token, and the PIN/name columns were `NOT NULL`. The user chose to fix it inside this phase (backend follow-up below).

**Migration:** `20261105160000_identity_verification_review_scans`, **applied** to the dev database (`migrate deploy`) and the
E2E database (`test:e2e:db`). It makes `pin_hmac`, `pin_last4` and `name_on_id_sealed` nullable. `migrate status`: up to date.

**Dependency (approved by the user; not in Part C's list):** `expo-image-manipulator` **57.0.21** (the `sdk-57` tag), mobile.
It crops the fallback photo to the card frame and downscales both paths to a 1600 px long edge, as the Phase 0 findings require.
It's a native module, so the dev client must be rebuilt (it already had to be).

**Added — mobile**
- `mobile/src/lib/id-verification.ts`: pure rules, no native imports:
  - `IdVerificationError` (an `ApiError` with a typed `code`), `readIdVerificationCode`, `toIdVerificationError`
  - `scanFailureFromError`, `countsAsAttempt`, `canOfferReview`, `nextAttemptNumber`, `retryMessageKey`
  - `localReadVerdict`, `typedIdName`, `checkTypedName`, `canCreateAccount`, `formatNameOnId`
  - `frameToPhotoCrop` (fallback camera frame → photo pixels)
- `mobile/src/services/id-scan/philhealth-scan.ts`: `openDocumentScanner` (1 page; a scanner that can't start returns
  `scanner_unavailable`), `processIdImage` (crop/downscale → on-device reading → local check → `submitIdScan`; both image
  files deleted in a `finally`), `deleteCachedFile`.
- `mobile/src/components/registration/PhilHealthIdStep.tsx`: intro + consent, scanning (15 s slow notice), retry with
  "Attempt n of 3" and a reason per failure, the review offer after the third failed attempt, the offline card (§4.4) with
  911 / MDRRMO call buttons, and the fallback camera in a modal. "Report an emergency" is on every state and in the fallback camera.
- `mobile/src/components/registration/IdCameraFallback.tsx`: `expo-camera` with an ID-1 card frame.
- `mobile/src/components/registration/NameFields.tsx`: Last / First / Middle / Suffix plus the match indicator.
- `mobile/src/lib/__tests__/id-verification.test.ts`: 23 tests.

**Changed — mobile**
- `app/auth/registration.tsx`:
  - `LocationStep` is now `RegistrationStep` with `id_intro`, `id_scanning` and `id_retry`, and `inside` is renamed to `form`.
    The geo-fence pass goes to `id_intro`.
  - The Full Name input is replaced by `NameFields`. `registerSchema` has `lastName`, `firstName`, `middleName` and `suffix`.
  - Create account is disabled until the name matches or review is chosen.
  - `ID_SCAN_EXPIRED` returns to `id_intro` with a notice. A badge on the form shows "PIN ending in ••••" plus a Scan again link.
  - Phone, email, password, terms, the modal and the OTP redirect are unchanged; the modal now greets by first name.
- `src/services/api/auth.api.ts`:
  - `submitIdScan()` is a native multipart `UploadTask`, like incident photos.
  - `register()` gained the name parts, `idVerificationToken` and `requestReview`, and rethrows coded errors as `IdVerificationError`.
- `src/i18n/translations.ts`: every new string in `en` and `fil`. The now-unused `fullName` / `fullNamePlaceholder` keys
  were removed from both.
- `app/profile/index.tsx`: the `__DEV__` "PhilHealth scan spike" row was removed. **Deleted:** `app/dev/id-scan-spike.tsx`.
- `package.json`, `pnpm-lock.yaml`: the dependency above.

**Changed — backend and shared (review-path follow-up)**
- `POST /auth/id-verification` accepts `requestReview` (read from the raw field, like `consentGiven`). It's honoured only when
  `attemptNumber ≥ 3` **and** the server can't use the card (`UNREADABLE` or `NOT_PHILHEALTH_ID`).
  - The sealed image is then stored as an unclaimed `PENDING_REVIEW` row: no name, and `match_result = { scanFailure }`.
  - A readable card is processed normally even when review was asked for.
  - A PIN the server could read is still HMAC'd and checked against existing accounts (409).
- The response always has `reviewRequired`; `nameOnId` and `pinLast4` are `null` on a review scan.
  New shared type `IdScanResponse` in `shared/src/constants/identity-verification.ts`.
- `prepareClaim` / `claim` accept an unclaimed `PENDING_REVIEW` row. A review scan always registers as `PENDING_REVIEW`, so
  the image is kept for staff and `identity_verified_at` stays null. `PreparedClaim.parts` became `matchResult`.
- The cleanup job also expires unclaimed `PENDING_REVIEW` rows after 30 minutes and deletes their images.
- Tests:
  - `id-scan-endpoint.spec.ts`: +5 tests. The success test's expected keys gained `reviewRequired`; no assertion was loosened.
  - `id-register.spec.ts`: +1.
  - `id-cleanup-and-ocr.spec.ts`: +1.

**Inventory:** none of the Phase 3 files, functions, translation keys or the `requestReview` scan field existed before.

**Tests:**
- Mobile: 182 → **205** (15 → 16 suites).
- Backend: 1656 → **1663**. The suite without `auth-phase3` passed 1604/1604, and `auth-phase3` alone passed 59/59.
- Typecheck clean in shared, backend, mobile and frontend.
- **E2E:** `test:e2e:db` succeeded (migrated and seeded). `test:e2e` timed out at 120 s because **Redis was down again**
  (port 6379 closed). It passed earlier the same day with Redis up. Re-run with Redis up.

**Deviations and decisions (for review)**
- **How "Send for review" works.** It opens the scanner once more and uploads that scan with `requestReview`, rather than keeping
  a failed image on the phone between attempts. Every image still leaves the cache right after its upload.
- **Phone-side check.** When the phone's own reading lacks the PhilHealth heading and PIN (`looksLikePhilHealthId`), the scan is
  refused on the phone (`NOT_RECOGNISED`, which counts as an attempt) and not uploaded.
  - If on-device text reading isn't available (no ML Kit), the scan is uploaded anyway (§4.3).
  - The review upload skips the phone check.
  - The server still decides every upload.
- **What counts as an attempt.** Only `NOT_RECOGNISED`, `NOT_PHILHEALTH_ID`, `UNREADABLE` and image problems count. Offline and
  server errors don't count. The review offer is hidden after `ID_ALREADY_REGISTERED`, which shows "Sign in instead".
- **Image preparation.** Both paths are re-encoded as JPEG at 0.85 with a long edge ≤ 1600 px. The scanner is asked for
  quality 95 to avoid a double loss. The fallback crop is the frame plus a 6 % margin, mapped through the preview's `cover` scaling.
- **The live check and the button.** The match indicator shows after a name field loses focus and on submit, as specified. The
  button's enabled state is computed live, because tapping a button in RN with `keyboardShouldPersistTaps` doesn't blur the input.
- **Suffix** is a chip picker (None / Jr. / Sr. / II / III / IV), the values the shared matcher knows, not a free-text field.
- **The guest SOS code in the form** is unchanged (same inline handler). The ID steps call the same `beginGuestReport()` +
  `router.push('/emergency/location')`.
- **Not done:** excluding ML Kit's Chinese/Devanagari/Japanese/Korean models in Gradle (a Phase 0 "consider"). The location
  screens before the ID step are still English-only and have no guest button; that's existing behaviour, outside this phase.

**Needs a person or a phone**
1. Start Redis, then `cd backend; pnpm test:e2e`.
2. In `backend/.env`, set `ID_DOCUMENT_ENCRYPTION_KEY` and `ID_PIN_PEPPER` (command in `.env.example`). The scan endpoint
   returns 503 without them, **even with the flag off**. Optionally set `ID_VERIFICATION_REQUIRED=true`. Restart the backend.
3. Rebuild the dev client (new native module, spike removed), restart Metro with `-c`, and run the phone checks in the Phase 3 report.

---

## 10. Test checklist

- [ ] Guest "Report an emergency" works from the ID intro, scanning, retry and form steps.
- [ ] A non-PhilHealth ID (driver's licence, PhilSys, school ID) → "This isn't a PhilHealth ID".
- [ ] A blurred or glared scan → retry. On the third failure, "Send for review" appears.
- [x] Typed name matches → account created, `identity_verified_at` set, OTP sent.
- [ ] Typed name differs → Create account disabled. The server also rejects a forced request with `NAME_DOES_NOT_MATCH_ID`.
- [x] Same PhilHealth ID on a second phone number → `ID_ALREADY_REGISTERED`.
- [x] Token older than 30 minutes → `ID_SCAN_EXPIRED`. The image is deleted by the job.
- [x] A modified client sending matching `clientText` with an image of something else → not verified (server reads the image).
- [ ] Logs, Sentry and SMS contain no PIN, no OCR text, no name from the ID.
- [ ] Admin image view writes an audit row. A dispatcher cannot open the review page or the image route (403).
- [ ] Phone without Google Play services → fallback camera works.
- [ ] Seeded citizen account signs in and sends an SOS as before.
- [x] Matched registration → the stored image is gone right after (`image_storage_key` null, file deleted).
- [ ] Review approved or rejected → image deleted; the image route then returns 410.
- [x] Storage delete fails → registration still succeeds; the next job run deletes the image.

---

## 11. Decisions and open questions

### Decided (2026-11-05)

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Must existing citizen accounts verify? | **Yes, every citizen account goes through the scan.** No banner, no grandfathering. Seeded demo citizens are pre-verified. | The database is reset before the defense, so there are no real existing accounts. |
| D2 | How long is the ID image kept? | **Only while needed:** deleted right after a matched registration, when a review is decided, or 30 minutes after an unclaimed scan (§5.2a). | Data Privacy Act proportionality: collect and keep only what the purpose needs. Less stored, less to secure, a clear answer for the panel. |
| D3 | Local or cloud card reading? | **Local `tesseract.js` on the AGAP server.** No cloud OCR. | No third-party transfer of a government ID; free; works offline on the demo laptop. |

### Still open (recommended answer in brackets)

1. **Who reviews:** MDRRMO Org Administrator and System Administrator only, or barangay staff too? *(MDRRMO + System Admin only.)*
2. **Minors:** can a citizen under 18 with a PhilHealth ID (as a dependent) register? *(Out of scope for this plan.)*
3. **Huawei-style phones:** is the fallback camera enough, or must those users go straight to review? *(Fallback camera; review if it fails.)*

---

## 12. Out of scope

- Cloud OCR services (for example Google Cloud Vision). Ruled out by D3.
- Checking the card against PhilHealth's records (no public API exists today).
- Selfie or face matching against the ID photo (biometric data; much heavier privacy duties).
- Other ID types (PhilSys, driver's licence, UMID, voter's ID). Adding them later means a new `id_document_type` value and parser.
- ID verification for staff accounts (administrator-provisioned, unchanged).

---

## 13. Defense demo notes

- **Reset the database after the last rehearsal.** One PhilHealth ID per account means a card used in rehearsal is rejected
  with `ID_ALREADY_REGISTERED` while that rehearsal account still exists.
- Have three cards ready: **(1)** a team member's PhilHealth ID for the happy path; **(2)** a second person's PhilHealth ID,
  typing a different name, to show the mismatch → "Send to MDRRMO for review" → approve from the web admin; **(3)** a
  non-PhilHealth ID (school ID or driver's licence) to show "This isn't a PhilHealth ID".
- Show the guest **Report an emergency** button on the ID screens, which answers "what if someone has no PhilHealth ID?" (rule 14).
- Expected panel questions and short answers:
  - *"Can it detect a fake ID?"* No. It checks the card is a PhilHealth ID and the name matches. One ID per account,
    phone OTP and staff review reduce misuse (§1).
  - *"Where do the ID photos go?"* Encrypted on our own server, read by our own server, deleted as soon as the check is done (§5.2a).
  - *"Why only PhilHealth?"* Project scope; other IDs are a new parser and enum value later (§12).
