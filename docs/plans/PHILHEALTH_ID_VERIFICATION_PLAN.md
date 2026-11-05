# Plan — PhilHealth ID Verification at Citizen Registration

**Status:** Approved, not started. Decisions recorded 2026-11-05 (§11) · **Date:** 2026-11-05 · **Owner:** AGAP mobile + backend + frontend (admin)
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
| 0. Spike and samples | Not started | | |
| 1. Shared rules | Not started | | |
| 2. Backend | Not started | | |
| 3. Mobile | Not started | | |
| 4. Admin review | Not started | | |
| 5. Labels and seed | Not started | | |
| 6. Docs and defense readiness | Not started | | |

---

## 10. Test checklist

- [ ] Guest "Report an emergency" works from the ID intro, scanning, retry and form steps.
- [ ] A non-PhilHealth ID (driver's licence, PhilSys, school ID) → "This isn't a PhilHealth ID".
- [ ] A blurred or glared scan → retry. On the third failure, "Send for review" appears.
- [ ] Typed name matches → account created, `identity_verified_at` set, OTP sent.
- [ ] Typed name differs → Create account disabled. The server also rejects a forced request with `NAME_DOES_NOT_MATCH_ID`.
- [ ] Same PhilHealth ID on a second phone number → `ID_ALREADY_REGISTERED`.
- [ ] Token older than 30 minutes → `ID_SCAN_EXPIRED`. The image is deleted by the job.
- [ ] A modified client sending matching `clientText` with an image of something else → not verified (server reads the image).
- [ ] Logs, Sentry and SMS contain no PIN, no OCR text, no name from the ID.
- [ ] Admin image view writes an audit row. A dispatcher cannot open the review page or the image route (403).
- [ ] Phone without Google Play services → fallback camera works.
- [ ] Seeded citizen account signs in and sends an SOS as before.
- [ ] Matched registration → the stored image is gone right after (`image_storage_key` null, file deleted).
- [ ] Review approved or rejected → image deleted; the image route then returns 410.
- [ ] Storage delete fails → registration still succeeds; the next job run deletes the image.

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
