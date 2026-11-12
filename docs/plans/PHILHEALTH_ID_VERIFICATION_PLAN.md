# Plan — PhilHealth ID Verification at Citizen Registration

**Status:** Phases 0–6 built; hand checks, Phase 0's card target and the demo rehearsal still need a person (see Progress log). Decisions recorded 2026-11-05 (§11) · **Date:** 2026-11-05 · **Owner:** AGAP mobile + backend + frontend (admin)
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
- ~~Never pre-fill the name fields from the scan.~~ **Changed 2026-11-09 (owner's request):** after a scan that read a name,
  the fields are filled from it in title case and stay editable. A notice asks the citizen to check the spelling, and the
  match indicator shows straight away. A name the citizen typed or corrected is never overwritten, and a review scan
  fills nothing. The server re-checks the submitted name against the card exactly as before. See the National ID plan's
  Progress log, "Change — 2026-11-09: name filled from the scan".
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
  EXPIRED          // scan never claimed by a registration within 30 minutes; card data erased
  RELEASED         // the claim ended (§5.2a); card data erased, and the card can be scanned again
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
after deletion, for a claim still held: `pin_hmac`, `pin_last4`, the sealed name, the status and the match result.

**When the name and PIN data are erased too (§11 D4–D6).** These clear `pin_hmac`, `pin_last4` and `name_on_id_sealed`:

| Situation | What happens | Status |
|---|---|---|
| Scan never claimed | The cleanup job erases the data when the claim expires. Nobody registered, and no consent record covers it. | `EXPIRED` |
| Citizen withdraws consent (Profile → Privacy & Consent) | Erased at once, with any image. The account shows "ID not verified" until the citizen scans again. | `RELEASED` |
| Account never confirmed its phone, 24 hours after the scan | The cleanup job releases the claim, so nobody can hold a card using a number they don't control. | `RELEASED` |
| Staff release the card (§7) | Erased at once; the holder is told to scan again. | `RELEASED` |

A release never blocks the account: it can still sign in and send an SOS (rules 5 and 14). **Suspended and deactivated accounts
keep their claim** unless staff release it, so waiting can't undo a ban.

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
  4. Seal the image and store it under a separate `id-documents/` prefix of the same private bucket (§11 D7).
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

**A card's owner finds it already taken (§11 D6).** The scan's `ID_ALREADY_REGISTERED` screen tells the citizen to call MDRRMO and
has a call button. Staff then use the same page:

| Route | Does |
|---|---|
| `POST /v1/administration/id-verifications/find-by-pin` | `{ pin }` in the body, typed from the card in front of staff. Compares only the HMAC and returns the account holding the card, never the number. Throttled. **Every lookup audited** (`ID_CARD_LOOKUP`, found or not, without the number). |
| `POST /v1/administration/id-verifications/:id/release` | `{ reason: 'OWNER_DISPUTE' \| 'ACCOUNT_CLOSED' \| 'STAFF_CORRECTION' }`. Needs a recent sign-in. Erases the card data, marks the account not verified, audits (`IDENTITY_VERIFICATION_RELEASED`), deletes any image, and tells the citizen unless the account is blocked. |

---

## 8. Other surfaces

- **Dispatch console:** on the incident reporter card, show *"ID verified"* or *"ID not verified"* from `identity_verified_at`.
  It applies to the **reporter** only, never the patient. It is information only and never affects priority, recommendations or
  dispatch (rule 8). Guests already show as guests. Accounts that aren't citizens' show no label: only citizens can scan.
- **Mobile profile:** a status row (Verified / Under review / Not approved → Scan again).
- **Every citizen account goes through the scan (§11 D1).** The database is reset before the defense, so there are no
  pre-existing citizen accounts to migrate. No "verify later" banner and no grandfathering.
- **Seed:** seeded citizen accounts get `identity_verified_at` set and a claimed `AUTO_VERIFIED` row with no image, so demos
  and e2e flows work unchanged. Use clearly fake PINs (for example `00-000000001-0`), never real-looking ones.
  **They must also get `is_phone_verified = true`** (the default is `false`), or the cleanup job releases their claims after 24 hours (§5.2a).

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
| 0. Spike and samples | Reviewed (no code defects); "done when" not met: 1 of 8–10 cards, no phone without Google Play services | 2026-11-06 | Layout notes filled in from 1 card |
| 1. Shared rules | Reviewed; 1 defect fixed (address read as name) | 2026-11-06 | 30 matcher tests pass; built on 1 real card's layout (see Phase 0) |
| 2. Backend | Reviewed (no code defects); 4 decisions open | 2026-11-06 | Migration applied; e2e passes with Redis up |
| 3. Mobile | Reviewed (no defects); phone: happy path passed; the database shows a mismatch → review run on 2026-11-05 (see Review, Phase 4) | 2026-11-05 | Includes a backend follow-up (review of unreadable scans, migration applied) and `expo-image-manipulator`, both approved by the user. 23 mobile + 7 backend tests; e2e passed on re-run with Redis up |
| 4. Admin review | Reviewed; 3 defects fixed; reject path ran live, approve path still to test | 2026-11-06 | Migration applied (3 audit actions); 22 backend + 5 frontend tests; e2e passes. Routes under `/administration`, not `/admin` |
| 5. Labels and seed | Done, awaiting review | 2026-11-06 | No migration. Seed runs twice without duplicates; backend 1735, e2e 10/10. Screens still need a person |
| 6. Docs and defense readiness | Done, awaiting review; hand checks and the rehearsal need a person | 2026-11-06 | No migration. Emergency e2e passes with the flag on: new spec 7/7, `test:e2e` 19/19 |

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

### Review — 2026-11-06 (Phase 0)

Prompt R on commit `3ff8498` and the current code, run after the later phases.

**Findings: no code defects, no changes.**
- Steps: the spike screen and its profile row are gone (Phase 3), with no references left. `ocr-spike.ts` has the required
  header, refuses a folder inside the repo, and writes nothing to disk.
- Dependencies: the four allowed packages, exact versions. Both backend packages are in `dependencies`, so they exist at runtime.
- Privacy: no sample images or card text in the repo. The layout notes hold patterns only.

**Open: the Phase 0 "done when" is not met.**
1. **Accuracy:** 1 card tested; the target is at least 8 of 10, by phone and server. The name parser rests on this one layout.
2. **Phone without Google Play services:** not tested, so the fallback path (Part B Q3) is unproven on real hardware.
3. **For a person to confirm:** the adviser reviewed the consent text, and the sample scans were deleted.

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

### Review — 2026-11-06 (Phase 1)

Prompt R on commit `7808d6d` and the current code, run after the later phases.

**Fixed: `parsePhilHealthName` could read the address as the name.** It searched every line after the PIN for a comma, so when
OCR garbled the name line, the first address line without a run of digits won.
- Made-up example: `SITIO PAG-ASA, BUNLO` became last name `SITIO PAG-ASA`, first name `BUNLO`.
- Effects:
  - It broke §5.1 ("the address is not extracted") and showed the citizen a wrong "Your PhilHealth ID shows" line.
  - A card that should have been `UNREADABLE` was accepted, and typing the address as the name would have passed the match.
  - The comma-misread fallback never ran on such a card.
- Now only the lines between the PIN and the birth line can be the name, or lines above the PIN if OCR moved it there. The birth
  line is a line with a run of digits, `MONTH DD,` (including misread digits) or `- MALE` / `- FEMALE`.
- Only the backend calls this function, so restarting the backend is enough; the app needs no rebuild.
- 5 new tests in `philhealth-id.spec.ts`; 4 failed before the fix. All use invented data. It has not been run on a real card yet.

**Otherwise no defects.** The §6 API, normalisation and match rules are as specified; PIN parsing, detection and matching live
only in this file; every §6 test case exists.

**Open**
1. **The one-edit tolerance can accept a different name.** Typing `JUAN` passes against a card reading `JUANA`, because the card
   word has 5 letters. This is the §6 rule working as written, and the price of tolerating OCR slips.
2. **Two given words can't be told apart** (`MARIA CLARA`): logged in Phase 1, and inherent to the card.

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

### Review — 2026-11-06 (Phase 2)

Prompt R on commit `e245ff5` and the current code, run after the later phases.

**Findings: no code defects, no changes.** Checked against the code:
- **Claim:** the conditional `updateMany` inside the registration transaction means two registrations can't both claim a token.
  A card already on another account trips the partial index and returns `ID_ALREADY_REGISTERED`. The image is deleted only after commit.
- **Crypto:** AES-256-GCM with the row id as `aad`; separate key; the PIN is stored only as an HMAC plus its last 4 digits; the
  token is stored only as a SHA-256. The server refuses to start with the flag on and a missing key or pepper.
- **Privacy:**
  - No backend code logs request bodies, and the backend has no Sentry, so `clientText` and typed names aren't captured there.
  - Log lines carry a row id or an error name. The OCR failure log carries the error message, never the card text.
  - No static route serves the local upload folder, and `backend/uploads/` is gitignored.
  - No `id-documents` folder remains on disk in the dev environment.
- **Rules:** `registerGuest` has no diff. The geo-fence and duplicate phone/email checks run first, as before.
- **Tests:** they assert stored rows, refusal codes and deleted files, and cover every case in Prompt 2 step 6 except the
  logged real-OCR test.

**Open: decisions for the owner, not defects.** All four were settled the same day: see "Follow-up — 2026-11-06" and §11 D4–D7.
1. **Abandoned scans keep data indefinitely.** An `EXPIRED` row loses its image but keeps the sealed name, `pin_hmac` and
   `pin_last4` forever, with no consent record, because consent is recorded only at registration. §5.2a allows this as written,
   but nothing needs that data once the scan has expired. **Recommended:** have the cleanup job clear those three columns on
   expired rows.
2. **ID images share the media bucket.** `putPrivateObject` uses `STORAGE_BUCKET` (`agap-media`), the bucket incident photos load
   from by direct URL. §5.3 says "never in the incident media bucket", while Prompt 2 says to reuse the storage under an
   `id-documents/` prefix. This deviation wasn't logged. Objects are AES-sealed with random ids, so the exposure is ciphertext
   at worst. **Recommended:** a separate private bucket before production; fine for the defense.
3. **Withdrawing consent doesn't touch ID data.** `consent.service.ts` handles any consent type generically. MOD-48 should say what
   withdrawal means here (Phase 6 docs).
4. **There is no supported way to release a card.** A deactivated or never-OTP-verified account keeps its claim, so a card's real
   owner can be locked out by someone who scanned it first, with only a manual database fix available. Consider an admin action.

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
  - **Re-run 2026-11-05 with Redis up:** `test:e2e:db` migrated and seeded; `test:e2e` **1/1 passed**
    (`transport-flow.e2e-spec.ts`, 12.7 s).
- **Phone test, 2026-11-05** (EAS `development` build of `a8b80bf`, `ID_VERIFICATION_REQUIRED=true`): happy path passed.
  Scan → typed name matched → OTP → home. DB row: `AUTO_VERIFIED`, claimed, image deleted, `client_read_ok` true, attempt 1,
  user `ACTIVE` with `identity_verified_at` set. **Not yet run on a phone:** guest SOS from each ID step, non-PhilHealth card,
  three failed scans → review offer, offline card, name mismatch, `ID_ALREADY_REGISTERED`, review registration, fallback camera.
  - The first install of the old dev client failed with `Cannot find native module 'ExpoImageManipulator'`, as expected;
    the rebuilt APK (368 MB) fixed it.

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

### Review — 2026-11-05 (Phase 3)

Prompt R on commit `a8b80bf` (`git show a8b80bf`, 23 files). Run in the same chat as the phone test, not a new one, at the
user's choice; every point below was checked against the code.

**Findings: no confirmed defects, so no code was changed.**

- **a. Steps.** Prompt 3 steps 1–10 are all present:
  - scan service: [philhealth-scan.ts](../../mobile/src/services/id-scan/philhealth-scan.ts), 1 page, files deleted in `finally`
  - fallback camera: [IdCameraFallback.tsx](../../mobile/src/components/registration/IdCameraFallback.tsx)
  - `submitIdScan` / `register()` plus typed errors: [auth.api.ts](../../mobile/src/services/api/auth.api.ts)
  - [PhilHealthIdStep.tsx](../../mobile/src/components/registration/PhilHealthIdStep.tsx), [NameFields.tsx](../../mobile/src/components/registration/NameFields.tsx)
  - state machine, `registerSchema` with four parts, disabled button, `ID_SCAN_EXPIRED` → intro
  - en/fil strings: each new key defined exactly twice; the removed `fullName` keys are unused
  - spike deleted with no references left; tests
  - No §10 boxes were ticked by Phase 3. The phone test confirms only the already-ticked "typed name matches" box.
- **b. Bugs.** None confirmed.
  - Backend: the claim is atomic (`updateMany` re-checks unclaimed, unexpired and claimable status; `P2002` → `ID_ALREADY_REGISTERED`).
    The image is deleted only after the transaction commits, and only for `AUTO_VERIFIED`. The cleanup job also expires
    unclaimed `PENDING_REVIEW` rows. A review scan with a readable PIN is still duplicate-checked, at scan time and by the
    partial index at claim.
  - Every server error code the scan and register routes emit maps to a screen state.
  - Null middle name / suffix: handled by `typedIdName` and the optional DTO fields.
- **c. Duplication.** None. PIN, name and PhilHealth detection come only from `@agap/shared`. There is no second upload
  client and no second crypto helper.
- **d. Privacy.**
  - Logs: no `console.*` in the new mobile files. The backend's only new or changed log lines carry a row id or an error name.
  - Responses: `nameOnId` and `pinLast4` are `null` on a review scan. `match_result` holds a fixed code only.
  - Images: both cache files are deleted in `finally`.
  - The image route is Phase 4.
- **e. Rules.**
  - "Report an emergency" is rendered outside the state blocks of `PhilHealthIdStep`, so it shows in every ID state, and also
    in both fallback-camera views.
  - The form's guest handler has no diff.
  - `identity_verified_at` is read nowhere except at registration, so an account under review signs in and sends an SOS as before.
- **f. Tests.** The one removed assertion was replaced by an equally exact one (the response keys now include
  `reviewRequired`). No skips, and new tests assert stored rows, kept or deleted images, and refusal codes.
- **g. Dependencies.** Only `expo-image-manipulator` **57.0.21**, exact and user-approved.

**Open (not defects; for Phase 4 or later)**
1. **The three-attempt gate is client-reported.** `attemptNumber` comes from the app, so a modified client can send any image
   straight to review. Staff review is the control. Phase 4 reviewers should treat review scans (`match_result.scanFailure`)
   as unverified, and they may be a non-PhilHealth card (`scanFailure: NOT_PHILHEALTH_ID`).
2. **Phase 4's queue must handle review rows with null `pin_last4` and null sealed name.**
3. **`openDocumentScanner` treats any scanner error as "unavailable".** It then switches to the fallback camera for the rest
   of that registration. A transient ML Kit error (for example, the scanner module still downloading on first use) would do
   the same. Not seen on the test phone.
4. **A claim race losing with `ID_ALREADY_REGISTERED` at Create account shows the message without a "Sign in instead" button.**
5. **The dev-client APK is 368 MB.** ML Kit's Chinese/Devanagari/Japanese/Korean models are still bundled (Phase 0 "consider").

**Tests after review** (unchanged from Phase 3):
- Typecheck clean in shared, backend, mobile and frontend.
- Mobile 205/205 (16 suites).
- Backend 1604/1604 without `auth-phase3`, plus `auth-phase3` alone 59/59 (= 1663).
- `test:e2e:db` + `test:e2e` 1/1.
- `migrate status` up to date (34 migrations).

**Still needs a phone before Prompt 4** (Phase 3 "done when"): the mismatch → review path, plus the unrun checks listed above.

### Phase 4 — 2026-11-05

Started at the user's request before the Phase 3 mismatch → review phone test (that gate is still open). Same chat as the
Phase 3 review, not a new one.

**Inventory:** none of the routes, services, audit actions, rejection codes, frontend files or the `orgType` session field
existed. There was nothing to extend. (`orgType` exists elsewhere, but only as an unrelated incident filter.)

**Migration:** `20261105180000_identity_verification_review_audit`, **applied** to the dev database (`migrate deploy`) and the
E2E database (`test:e2e:db`). It adds `ID_IMAGE_VIEWED`, `IDENTITY_VERIFICATION_APPROVED` and `IDENTITY_VERIFICATION_REJECTED`
to `audit_action`. `migrate status`: up to date. **No new dependencies.**

**Added — backend** (`backend/src/identity-verification/`)
- `identity-verification-admin.controller.ts`: `/v1/administration/id-verifications`
  - `GET` (queue; `?status=PENDING_REVIEW|APPROVED|REJECTED`, paged)
  - `GET :id/image`
  - `POST :id/approve`
  - `POST :id/reject` (`{ reason }`)
  - Guards: `@Roles(SYSTEM_ADMINISTRATOR, ORG_ADMINISTRATOR)` plus the service's MDRRMO check.
- `identity-verification-review.service.ts`:
  - `assertReviewer`: a System Administrator, or an Org Administrator with an active membership in an active MDRRMO
    organization. Anyone else gets 403.
  - `list`: account name (as typed), phone, submitted at, scans, and the reason (`reviewReasonOf`: failed name parts or the
    scan failure code). No image, no PIN, no card name.
  - `openImage`: 404 for unknown or unclaimed scans, 410 once deleted. The `ID_IMAGE_VIEWED` audit row (actor + id only)
    is written with a throwing write before the image is returned, so if the audit fails the image isn't shown.
  - `approve` / `reject`:
    - One transaction: a conditional status update (two reviewers can't both decide; the loser gets 409),
      `identity_verified_at` on approve, and the audit row with the status and reason code.
    - After the commit: delete the image (a failure keeps the decision and leaves the key for the cleanup job), then notify.
- `id-review-notifier.ts`: an in-app row plus a push, then an SMS, with the exact §7 texts. It never throws; logs carry the
  user id and the error name only.
- `dto/id-review.dto.ts`: query DTO; reject reason limited to the 4 fixed codes.
- Module: registers the controller, the service and the notifier; imports `NotificationsModule` and the NOTIFICATIONS and SMS
  queues.

**Changed**
- `shared/src/enums/audit-action.enum.ts`: the 3 actions.
- `shared/src/constants/identity-verification.ts`:
  - `ID_REJECTION_REASONS`, `ID_REVIEW_STATUSES`
  - `IdReviewItem`, `IdReviewReason`, `IdReviewDecisionResult`, `IdNamePart`
- `backend/prisma/schema.prisma`: enum values only.
- `backend/src/auth/auth.service.ts`: `SessionUser.orgType` (the first active organization's type), so the console can hide
  the link from non-MDRRMO org admins. The API remains the control.
- Frontend:
  - `lib/auth.ts` and `lib/use-auth.ts`: `orgType`.
  - `lib/role-access.ts`:
    - route `/administration/id-reviews` (Org Admin, Sys Admin)
    - sidebar link "ID Reviews" with `orgAdminOrgTypes: ['MDRRMO']`
    - `navForRole(role, orgType?)`
  - `components/layout/Sidebar.tsx`: passes `orgType`; adds the `IdCard` icon.

**Added — frontend**
- `features/identity-verification/api.ts`, `hooks.ts` and `format.ts`.
  - `useIdImage` fetches only on "Show ID image", never caches, retries or refetches on focus, and revokes the object URL.
- `components/admin/IdReviewQueue.tsx`:
  - Status tabs, queue table and a detail drawer.
  - The drawer shows the typed name next to the image, which loads on click with an "opening is audited" note.
  - Approve; Reject with a reason select.
  - Messages for 403, 409 and 410.
- `app/(ops)/administration/id-reviews/page.tsx`.

**Tests**
- New: `backend/test/identity-verification/id-review.spec.ts` (19). It runs over HTTP with the real `RolesGuard`, the real
  service and notifier, and rows created through the real scan + register flow. It covers:
  - who may review: dispatcher, BFP org admin and ended MDRRMO membership → 403; MDRRMO org admin and System Admin → OK
  - queue content: no card data
  - image: no-store, audit per view, audit failure → not shown, 410 after a decision, 404 for unclaimed
  - approve and reject: stored state, image deleted, push + SMS texts
  - fixed reason codes only; 409 on a second decision
  - failed push/SMS keeps the decision; failed image delete → cleanup removes it later; failed audit rolls back
  - review scans; `reviewReasonOf`
- New: `frontend/__tests__/id-review-format.spec.ts` (4).
- Changed (extended, not loosened):
  - `backend/test/auth/auth-phase1.spec.ts`: the session user gains `orgType`.
  - `frontend/__tests__/role-access.spec.ts`: the System Administrator's exact sidebar list gains "ID Reviews", plus one new
    test for the MDRRMO-only link.
- Counts, before → after:
  - Backend 1663 → **1682** (1623 without `auth-phase3`, plus `auth-phase3` alone 59).
  - Frontend 181 → **186** (16 → 17 suites).
  - Mobile 205 → 205.
  - Typecheck clean in all four packages.
  - `test:e2e:db` + `test:e2e` 1/1.

**Deviations and decisions (for review)**
- **Routes are `/v1/administration/id-verifications`, not the plan's `/api/v1/admin/...`.** Every existing admin route lives
  under `administration`.
- **No permission row.** Prompt 4 step 1: the `permissions` / `role_permissions` tables are a catalog that no guard reads, so
  adding `identity_verification:review` there would grant nothing. Access is `@Roles` plus the MDRRMO membership check.
- **The image-view audit uses a throwing write** (`logInTransaction` on the client), not `AuditService.log()`, which swallows
  failures. An unaudited view is refused instead.
- **Approve/reject don't require recent sign-in (step-up)**, unlike user unlock and temporary passwords. They can be added if
  wanted.
- **The sidebar link follows the first active organization's type** (`getSessionUser` already picks the first). The API
  accepts an Org Administrator with **any** active MDRRMO membership. An admin of several organizations whose first isn't
  MDRRMO could use the page but wouldn't see the link.
- **"Typed name" in the queue is `users.full_name`**, the four typed parts joined. The parts aren't stored separately.
- **The SMS processor's existing log line prints the phone number** (`SMS delivered to …`). That's existing behaviour for all
  SMS, not changed here.

**Needs a person**
1. Restart the backend (new routes, regenerated Prisma client) and the frontend dev server (`shared/dist` rebuilt). Sign out
   and back in on the web so the session carries `orgType`.
2. On the web, as `orgadmin@mdrrmo.bocaue.gov.ph` or `admin@agap.local`: open **Administration → ID Reviews**, open a pending
   check, Show ID image, then approve or reject.
   - The citizen gets the push and SMS.
   - The image then shows as deleted.
   - The Audit Log shows `ID_IMAGE_VIEWED` and the decision.
   - As `orgadmin@bfp.bocaue.gov.ph`, the link isn't shown and the URL shows "Only MDRRMO administrators…".
   - A pending check needs the phone's mismatch → review path (the open Phase 3 phone check), or a review scan.

### Review — 2026-11-06 (Phase 4)

Prompt R on the uncommitted changes, in a new chat. Prompt 4 steps 1–5 are all present; no new dependencies; each route, audit
action and label is defined once.

**Fixed (3)**
1. **The image route could serve an image after its retention ended.** `openImage` checked only for a stored key, so while a failed
   delete waited for the cleanup job, an image stayed viewable after a decision, or after an auto-match. It now returns 410
   unless the check is `PENDING_REVIEW`, and the queue's `hasImage` follows the same rule. 2 new tests.
2. **A failed read after the commit lost the notification.** `decide()` read the image key after the transaction, outside any
   `try`. A database error there returned 500 for a decision that had saved, and the citizen was never told. The key is now read
   inside the transaction, so that failure rolls the decision back. 1 new test.
3. **"Show ID image" (`useIdImage`).**
   - After a failed load the button did nothing, because the query was already enabled.
   - Hide then Show redisplayed the cached image with no request, so that view wasn't audited (rule 11).
   - Each Show is now a new audited request, and Hide drops the image from memory.
   - **Not covered by a unit test:** the frontend's Jest runs in Node with no DOM or testing library, and adding one needs approval.
     Typecheck only; confirm in the web test.

**Otherwise no defects**
- **Queues:** both job shapes match the real SMS and notification processors, and in-app rows use the feed's existing fallback.
- **Access:** checked against the real `JwtStrategy` user and `canOpen`. The permission tables are read by no guard, so skipping
  a permission row was right.
- **Privacy:** the queue returns no card data; audit rows carry the actor, the id and at most a reason code; messages carry no names.
- **Rules:** an account under review signs in as usual, and nothing reads `identity_verified_at` for dispatch.
- **Tests:** they assert stored rows, deleted files and response contents. Two earlier assertion changes extend, not loosen.

**What the dev database shows (read-only, statuses and timestamps only; local time, 2026-11-05)**
- 18:52: a citizen account was created with `PENDING_REVIEW`, reason "first name doesn't match", scan attempt 4.
- 18:53:03: an MDRRMO Org Administrator opened the image; `ID_IMAGE_VIEWED` was written.
- 18:53:21: rejected with `NAME_MISMATCH`, audited, the image deleted, and the push row marked delivered.

So the mismatch → review path and the reject path appear to have run for real, just before the 18:55 handoff that called them
untested. The screens and the SMS can't be confirmed from the database, so no §10 box was ticked on this evidence.

**Test data retired (approved by the owner, 2026-11-06):** the first test citizen account, using the same steps as
`AdministrationService.deactivate()`. It is `DEACTIVATED`, with a placeholder email, no phone number, its session revoked and its
push token removed; the audit trigger stayed on. It had no `identity_verifications` row left (removed earlier, with no audit
entry), and the card was already free. The second test account was not touched.

**Open**
1. **The approve path hasn't run live.** That is the rest of the Phase 4 "done when". "Citizen sees Verified" also needs the Phase 5
   status row; until then the push and SMS are the only signal.
2. **Check the BFP Org Administrator on the web:** no link, and the page shows the MDRRMO-only message.
3. From the Phase 4 section: approve/reject need no step-up, and an admin whose first organization isn't MDRRMO won't see the link.
4. **The SMS processor logs phone numbers** (existing behaviour for all SMS). This keeps the §10 "logs contain no…" box honest only
   for PIN, OCR text and card name, not for the phone number.

**Tests, final**
- Backend 1682 → **1690**: 1631, plus `auth-phase3` alone 59 (3 new here, 5 new in the Phase 1 review).
- Frontend 186, mobile 205, unchanged.
- Typecheck clean in all four packages. `test:e2e:db` + `test:e2e` 1/1. `migrate status` up to date.

### Follow-up — 2026-11-06 (decisions from the Phase 2 review)

The owner asked for what actually solves each problem, checked first. See §11 D4–D7 and §5.2a.

**What the checks changed**
- **Separate bucket: dropped, reversing the review's recommendation.** Anonymous read and list return 403 on dev storage, and the
  objects are sealed. Production settings couldn't be checked from here, so D7 records a deployment rule instead.
- **Consent withdrawal: more work than the review said.** Privacy & Consent only offered medical consent, so a citizen couldn't
  reach it at all. It needed a button, not just backend logic.
- **Releasing a card: built now, not after the defense.** Nothing else fixes a lockout.

**Migration:** `20261106090000_identity_verification_release`, **applied** to the dev and E2E databases. It adds the status
`RELEASED` and the audit actions `ID_CARD_LOOKUP` and `IDENTITY_VERIFICATION_RELEASED`. **No new dependencies.**

**Backend**
- `identity-verification.service.ts`:
  - `releaseInTransaction`: the single way a claim ends.
  - `deleteReleasedImages`, `withdrawConsent`, `releaseUnverifiedClaims`.
  - `cleanup` also erases the data of expired scans, including rows that expired before this rule.
- `identity-verification-review.service.ts`: `findCardHolder`, `releaseCard`. The controller and DTOs add the two routes in §7.
- `id-review-notifier.ts`: the `RELEASED` message. `identity-verification.processor.ts`: releases first, then cleans up.
- `consent.service.ts`: withdrawing this consent type goes through `withdrawConsent`. Other types are unchanged. `consent.module.ts` imports the module.

**Frontend:** `components/admin/IdCardRelease.tsx` on the ID Reviews page, plus API, hooks and labels. The typed number is cleared
once used and isn't kept in the mutation cache.

**Mobile**
- `profile/privacy.tsx`: a "PhilHealth ID Check" card, shown only while the consent is active, with a confirmation that says what
  is erased and that SOS still works. English only, like the rest of that screen.
- `PhilHealthIdStep.tsx`: a call button on the already-linked screen.
- `translations.ts`: the already-linked message now tells the owner to call MDRRMO, in `en` and `fil`, with the number from `hotlines.ts`.
- JavaScript only: no new dev build is needed.

**Tests**
- New: `id-release.spec.ts` (12) and additions to `id-review.spec.ts` (8) and `id-cleanup-and-ocr.spec.ts` (2), all written before the code.
- New: `test/identity-verification-release.e2e-spec.ts` (6), against **real PostgreSQL** through the real `PrismaService`: the partial
  index, the relation filter, enum values, rollback and date comparison.
- New frontend tests: `cardHolderNotes` and the labels (4).
- **Not tested:** `IdCardRelease.tsx` and the privacy card have no component tests, because neither package's setup covers them without
  new dependencies. Typecheck only. Check them by hand.
- **Counts, final:**
  - Backend 1690 → **1712**: 1653, plus `auth-phase3` alone 59.
  - Frontend 186 → **190**. Mobile 205.
  - `test:e2e` 2 suites, **7/7**. Typecheck clean in all four packages. `migrate status` up to date.
- **One flaky run.** The first full run failed 1 test in `auth-phase2.spec.ts` (the bcrypt password-suffix test) and 3 in `auth-phase3.spec.ts`.
  Both passed alone (9/9, 59/59), and the full suite then passed 1653/1653 with no code change. `auth-phase3` is a known load timeout. The
  `auth-phase2` failure looks like the same thing, but its error wasn't captured, so that cause is likely, not proven.

**Decisions for review**
- **A release frees the card, so one card can verify a new account after withdrawing from an old one.** At most one account is verified
  per card at a time, which is the rule that matters. The old account loses its status and its audit trail stays.
- **A `REJECTED` row keeps its card data** until the citizen withdraws or staff release. The rejection may be evidence (`SUSPECTED_FRAUD`).
- **24 hours is a judgement call:** long enough for a slow SMS, short enough that an owner isn't stuck for long. A citizen released this
  way only loses the label, and can scan again.
- **"Scan again" arrives in Phase 5.** Until then, a released citizen is told to scan again but has no screen to do it from.
  The in-app feed has no special handling for the new notification type and uses its default icon.

**Needs a person**
1. Restart the backend (new routes, new Prisma client) and `pnpm dev` (`shared/dist` rebuilt). Reload the app in Metro.
2. Web, as an MDRRMO org admin: ID Reviews → type a card's number → Find account → pick a reason → Release card. Then check the Audit Log.
   A long-signed-in session should get the step-up prompt first.
3. Phone: Profile → Privacy & Consent → PhilHealth ID Check → Withdraw. Scanning a card already linked should show the MDRRMO message and call button.

### Phase 5 — 2026-11-06

Run in the same chat as the reviews, at the user's request, not a new one.

**Inventory:** none of the fields, routes, screens or seed rows existed. **No migration, no new dependencies.**

**Backend**
- `incidents.service.ts`: `getReporterIdVerified`: true or false for an account, null for a guest or no account.
- `incidents.controller.ts`: `GET /incidents/:id` returns `reporterIdVerified` to **staff only**; not to crew or the reporter.
- `identity-verification.service.ts`:
  - `profileStatus`: `VERIFIED`, `UNDER_REVIEW`, `NOT_APPROVED` or `NOT_VERIFIED`. Being verified decides first, then the newest scan.
  - `claimForUser`: registration's rules for a signed-in citizen. Staff and guests are refused; so is an account already verified or under review.
  - `typedNameFrom`: moved here from `auth.service.ts`, so one place builds the typed name.
- `identity-verification.controller.ts`: `GET /v1/auth/id-verification/status` and `POST /v1/auth/id-verification/claim`, signed-in only. New `dto/id-claim.dto.ts`.
- `prisma/seed/seed.ts`: the demo citizen gets `is_phone_verified`, `identity_verified_at` and a claimed `AUTO_VERIFIED` row: fake PIN, no image, keyed on a fixed token hash.

**Frontend:** `reporterIdLabel` in `format.ts`, shown in `IncidentDetailDrawer.tsx` under Reporter only, in the same neutral text colour as other secondary details. `reporterIdVerified` added to the type.

**Mobile**
- `components/profile/id-status-card.tsx` on the profile, citizens only. It shows nothing until it has an answer or if the request fails.
- `app/profile/id-verification.tsx`: location, then `PhilHealthIdStep`, then `NameFields`, then the result. "Report an emergency" stays reachable and opens `/emergency/sos`.
- `services/api/id-verification.api.ts`: a separate file because `authed-fetch` imports `auth.api`, so `auth.api` can't import it back.
- `PhilHealthIdStep.tsx`: `onSignIn` is now optional, since a signed-in citizen has nothing to sign in to.
- `lib/id-verification.ts`: `idStatusView`. `translations.ts`: new strings in `en` and `fil`.
- JavaScript only: no new dev build. It adds a route, so restart Metro with `npx expo start -c`.

**Rule check (rule 8):** outside the identity-verification module and the registration code that sets it, `identity_verified_at` and `reporterIdVerified` are read only by `getReporterIdVerified`, its controller branch and the reporter card. Nothing under `dispatch`, `jobs` or `analytics` reads them. `registerGuest` has no change; the only `auth.service.ts` change is the moved helper.

**Seed, run twice against the dev database:** users 21, incidents 10, consents 2 and the demo citizen's 1 row did not change between runs. Identity rows went 3 → 4 on the first run and stayed 4.

**Tests**
- New: `id-rescan.spec.ts`. Extended: `reporter-sex.spec.ts` (3 new; one mock gains the new method), `incident-read-access.spec.ts` (mock only), `id-test-kit.ts` (newest-first), `id-review-format.spec.ts` (1), `id-verification.test.ts` (1).
- `identity-verification-release.e2e-spec.ts` gains 3 on **real PostgreSQL**: newest row decides the status, the real index rolls back a raced claim, and the reporter flag for verified, unverified and guest.
- Unlike the follow-up above, these tests were written with the code, so they weren't seen failing first.
- **Not tested:** the status card, the rescan screen and the reporter label's placement have no component tests. Typecheck only.
- Counts, before → after:
  - Backend 1712 → **1735**: 1676, plus `auth-phase3` alone 59.
  - Frontend 190 → **191**. Mobile 205 → **206**.
  - `test:e2e` **10/10** (2 suites). Typecheck clean in all four packages. `migrate status` up to date.

**Deviations and decisions (for review)**
- **Scanning again is two calls, not one rescan route:** the existing scan route, then the new claim route. The scan and its checks aren't duplicated, and the citizen can fix a typed name without rescanning, as at registration.
- **The claim changes the account's name to the name typed and checked,** as registration does. Otherwise "ID verified" could sit beside a different name, and reviewers would compare the card with the wrong one.
- **The geo-fence applies to scanning again** ("same rules"): a citizen outside Bocaue sees an explanation and can scan when back.
- **The seeded row has no sealed name and no consent record.** So the demo citizen has no Withdraw card in Privacy & Consent; use a registered account to show that.
- **Only the demo citizen is a seeded `CITIZEN`.** `bystander@demo.agap` is a different role.

**Open (reported, not changed; outside this phase)**
1. **A verified citizen can change their name through `PATCH /users/me`.** The app has no screen for it, so it takes a modified client, but "ID verified" would then sit beside a name nobody checked. **Recommended:** refuse a name change while verified.
2. **The seed's timestamps land 8 hours early.** Its database adapter doesn't pin the session to UTC as `PrismaService` does: `identity_verified_at` stored 2025-12-31 16:00 UTC instead of 2026-01-01 00:00. Harmless here, and existing behaviour for the whole seed.
3. **A tapped ID notification doesn't open the ID screen.** The citizen reaches it through the profile.

**Live evidence (read-only):** two scans on the dev database from 2026-11-06 about 14:25 were never claimed. Both are `EXPIRED` with PIN data and image gone, so D4's erasure works on the running backend.

**Needs a person**
1. Restart the backend and `pnpm dev` (`shared/dist` rebuilt), and restart Metro with `npx expo start -c`.
2. Web: open an incident from a registered citizen as a dispatcher. The Reporter card shows "ID verified" or "ID not verified"; a guest incident shows neither; the Patient card never does. `INC-2026-DEMO01` is a ready example (verified).
3. Phone, as the second test citizen (check rejected): the profile shows "Not approved" with "Scan again". Scan, type the name and submit; it should become "Verified". Try a wrong name too, then "Send to MDRRMO for review".
4. Sign in as `citizen@demo.agap` and send an SOS to confirm that §10 box. **Use a staging path, not the live backend, if it would send real SMS.**

### Review — 2026-11-06 (Phase 5)

Prompt R on the unstaged Phase 5 changes, in a new chat. Prompt 5 steps 1–6 are all present. No new dependencies, no migration; each route and translation key is defined once.

**Fixed (7).** The four backend ones each had a test that failed first.
1. **Two different cards could be claimed for one account at once.** The partial index keeps a card on one account, but nothing kept an account on one card, and both requests passed the check before either committed. Reproduced on real PostgreSQL. `claimForUser` now locks the user row and checks again inside the transaction. New e2e test.
2. **Non-citizen reporters were labelled "ID not verified".** That includes bystander, responder and staff accounts, none of which can scan: the claim route refuses them. The dev database has one such incident. `getReporterIdVerified` now returns null for them, and §8 says so.
3. **The profile could offer "Scan again" when the claim would be refused.** With a check under review and a rejected scan taken later, the status followed the newest scan and showed "Not approved". `profileStatus` now checks in the same order as the refusal, so this replaces "the newest scan decides" in the Phase 5 section. It no longer needs an `orderBy`, so that fake is gone from `id-test-kit.ts`.
4. **A last or first name of only spaces returned 500.** It passed `@IsNotEmpty`, then `typedNameFrom` returned null into the matcher. It now returns 400. A modified client only: the app trims names.
5. **"Report an emergency" was missing from four states of the Scan again screen:** `locating`, `location_error`, `outside` and `done`. The `outside` message even says you can still send an SOS. It is now on every state (rule 14).
6. **The status card went out of date.** The profile stays mounted under the screens it opens, and nothing asked again on returning, so a citizen who withdrew still saw "Verified" with no way to scan. The same went for a staff decision read in Notifications. It now refreshes on focus. (Its cache was per account at first; clearing the whole cache at sign-out, below, replaced that.)
7. **Scan again showed a dead "Already have an account? Sign in" link.** `onSignIn` became optional, but this row still rendered with no action.

Also removed: a doc comment left behind in `auth.service.ts` that now described `registerGuest`. `registerGuest` itself has no change.

**Not covered by a test:** fixes 5, 6 and 7 are typecheck only, because the mobile package has no component tests. They haven't been run on a phone.

**Tests seen failing (mutation check).** The Phase 5 tests were written with the code, so 19 lines of `claimForUser`, `profileStatus`, `getReporterIdVerified` and the controller were broken one at a time, then restored byte for byte. 17 were caught. The 2 that survived were real gaps, and both are now caught by new tests: a verified account with no scan row, and another citizen's scan affecting the status.

**Checked, no defect**
- **Privacy:** no new log lines except the seed's fixed text. The claim returns only the typed name; the audit row carries only the outcome.
- **Rules:** nothing under dispatch, jobs, analytics, realtime or risk intelligence reads the verified field. `mobile/app/emergency` and `backend/src/emergency-alerts` are untouched. A deactivated account has its sessions revoked, so it can't reach the claim route. `claimForUser` has no status check of its own, and no backend code sets `SUSPENDED` today, so a suspension added later must revoke sessions too.
- **Seed:** the fake PIN uses the same pepper handling as the app. The dev database holds 1 row for the demo citizen, and no citizen has a verified flag out of step with their rows. The seed itself wasn't re-run.
- **Earlier tests:** none weakened. Two titles were reworded to match the new status logic, with their assertions unchanged.

**Open**
1. ~~Signing out doesn't clear the mobile query cache.~~ Fixed: see "Follow-up (query cache at sign-out)" below.
2. ~~A verified citizen can still rename through `PATCH /users/me`.~~ Decided and fixed: see the follow-up below and §11 D8.
3. **Small wording and feedback gaps, not changed:**
   - On Scan again, a signed-in citizen sees "Emergency? Report without an Account".
   - The already-linked message says "Sign in or reset your password", with no sign-in button.
   - Tapping the dimmed Submit with an empty name shows no message.
4. **A name over 255 characters returns 500 and writes nothing.** The fields allow 310 in total, the column 255. A modified client only; registration behaves the same.
5. **Still true from earlier phases:** Phase 0's "done when" isn't met (1 card tested, target 8 of 10; no phone without Google Play services), and the Phase 4 approve path hasn't run live.

**Tests, final**
- Backend 1735 → **1740**: 1681, plus `auth-phase3` alone 59.
- Frontend **191**, mobile **206**, unchanged.
- `test:e2e:db` + `test:e2e` 2 suites, 10 → **11**. Typecheck clean in all four packages. `migrate status` up to date.
- **One flaky run.** The first full run failed 1 test in `auth-phase0.spec.ts` (the bcrypt unknown-account test). It passed alone (18/18) and the full suite then passed 1681/1681 with no code change. Its error text wasn't captured, so load is the likely cause, not a proven one.

**Needs a person** (in addition to the Phase 5 list; restart the backend and Metro first)
1. Phone: Profile → Privacy & Consent → Withdraw → back. The status should change to "Not verified" with "Scan again".
2. Phone: Scan again with location denied. "Report an emergency" should be visible and open the SOS screen, and no "Sign in" link should appear on any step.
3. Web: an incident reported by a bystander or staff account shows no ID label; one from a citizen account still does.

### Follow-up — 2026-11-06 (renaming while verified)

The owner decided a verified citizen can't rename (§11 D8).

**Changed:** `UsersService.updateMe` returns 409 when a verified account sends a different `fullName`, and saves nothing from that request. The message repeats neither name. No migration, no new dependencies, and no mobile change: the app has no rename screen.

**Still allowed:** sending the same name, changing any other profile field, and renaming by an unverified citizen or a staff account. A citizen whose legal name changed withdraws consent, then scans again.

**Tests:** new `test/users/verified-name.spec.ts` (6), plus 1 e2e on real PostgreSQL: locked while verified, free after a withdrawal. The refusal tests failed before the fix.
- Backend 1740 → **1746**: 1687, plus `auth-phase3` alone 59.
- `test:e2e` 11 → **12**. Backend typecheck clean. `migrate status` up to date. Frontend and mobile weren't changed or re-run.

**Open, not changed**
1. **An account under review can still rename.** Reviewers see the current name, so a rename before the decision is compared with the card. A rename between staff opening the case and approving it would be verified unchecked. This needs a modified client and precise timing.
2. **The check and the save aren't atomic.** A rename sent at the moment a claim commits could overwrite the checked name. This also needs a modified client and precise timing.

### Follow-up — 2026-11-06 (query cache at sign-out)

Existing behaviour across the whole mobile app, fixed at the owner's request before Prompt 6. **The problem:** nothing cleared the query cache, and keys like `['medical-profile']` and `['emergency-contacts']` aren't per account, so the next account on a shared phone could be shown the last one's data.

**Changed**
- `mobile/src/lib/query-client.ts` (new): the one `QueryClient`, moved out of `app/_layout.tsx` so the auth store can reach it.
- `mobile/src/stores/auth.store.ts`: clears the queries and mutations when a session ends, and when a different account signs in. That covers every sign-out, including an expired session in `authed-fetch`. A token refresh keeps the cache.
- `id-status-card.tsx`: back to a plain key, so there is one mechanism, not two.

**Guard:** `logout` clears only when a session actually existed. `authedFetch` calls it on every 401 with no refresh token, so clearing each time would make a mounted screen fetch, fail and repeat forever.

**Emergency flow:** no emergency screen uses a mutation, and the guest path doesn't sign in, so clearing can't touch an SOS being sent. If a session dies during an SOS, a background query such as the map settings may reload, which doesn't affect sending the report.

**Tests:** new `auth-query-cache.test.ts` (6). 4 failed before the fix. The other 2 guard against clearing too much, so the store's lines were also broken one at a time: all 4 mutations were caught. JavaScript only: no new dev build.
- Mobile 206 → **212**. Mobile typecheck clean. Backend and frontend weren't changed or re-run.

**Not covered:** this tests the store and the real cache, not screens. A screen still mounted under the stack can hold what it last rendered until it re-renders or unmounts. Check by hand: sign in as one citizen, open Medical, sign out, sign in as another citizen and open Medical straight away. Nothing from the first account should appear.

**The web app.** Fixed as well, at the owner's request.
- **What was really exposed was narrower than first reported.** Console sign-outs call `router.replace('/login')`, but `AuthGate` also calls `redirectToLogin()` as soon as the session ends. That is a full page load, which should wipe the in-memory cache, though only as a side effect of that race. The change-password page sits outside `AuthGate`, so its sign-out really was client-side only. Read from the code; not confirmed in a browser.
- **Changed:** `frontend/lib/session-cache.ts` (new) follows the session itself, and `providers/providers.tsx` starts it. The cache empties when the signed-in account signs out or changes, whichever path caused it. A token refresh, an unlock and a session restored after a page load keep it, so a dispatcher's screens never blank out.
- **Tests:** new `session-cache.spec.ts` (8), written with the code. So its logic was broken 7 different ways, and all 7 were caught. Frontend 191 → **199**. Frontend typecheck clean.
- **Not covered:** the provider's wiring has no test, because the frontend's Jest has no DOM. Check by hand: sign in as a dispatcher, open an incident, sign out, sign in as another staff account and open the same page. **Restart `pnpm dev` first.**

### Phase 6 — 2026-11-06

Started on commit `c94e928` with a clean tree, in a new chat. **No migration, no new dependencies, no change under `backend/src`, `shared/src`, `mobile` or `frontend`.**

**Inventory:** none of the listed docs mentioned this feature. `.env.example` had the flag, set to `false`. `DEVELOPER_SETUP.md` wasn't in the prompt's list, but it is a dev setup doc with a "fill in at minimum" list, so it was updated too.

**Changed**
- `.env.example`: `ID_VERIFICATION_REQUIRED=true`.
- `README.md` (3 rows, approved by the owner; the flag alone would leave out the two keys it requires), `docs/LOCAL_DEV_NO_DOCKER.md`, `DEVELOPER_SETUP.md`: the flag, both keys and how to generate them. **With the flag on and the keys blank, the backend refuses to start,** so a fresh copy of `.env.example` needs both generated first.
- `docs/modules/MOD-01_*` section 22: flow, data collected, rules, routes, error codes, configuration. §5–§7 updated.
- `docs/modules/MOD-48_*` section 21: what is read and why, consent, retention, withdrawal, who sees what, staff routes and audit actions, operating rules, open items.
- `docs/USER_ACCOUNTS.md`: a "Seeded citizen (pre-verified)" section, and ID Reviews in the sidebar lists.
- `docs/module-reports/MODULE_TESTING_GUIDE.md`: §7 with test cases PH-01 to PH-21: the 19 §10 checks and 2 later screens. Also §0, §1, §2.1, MOD-01, MOD-47 and §6.

**Added:** `backend/test/emergency-flow-id-required.e2e-spec.ts` (7 tests), approved by the owner. It runs the real `AppModule` over real HTTP and PostgreSQL with the flag on. Only OCR, ID image storage and the outside world are stubbed. It covers:
- a new account without a scan is refused, and nothing is created
- a guest, a seeded citizen, a citizen who matched and a citizen under review each report through `POST /v1/incidents`, then reach the queue and the ops room and can be dispatched
- all four get the same priority
- no log line or queued job carries a PIN or text read from a card

**The flag-on e2e.** `transport-flow.e2e-spec.ts:78` forces the flag off, with a comment saying it needs the old registration. It never calls registration, so that line isn't needed, and flipping it would prove nothing about registration anyway. It was left unchanged at the owner's choice. A throwaway copy with the flag on and test keys **passed 1/1** and was deleted. The committed proof is the new spec.

**Tests seen failing.** All 7 passed first time, so the code was broken 8 ways, one at a time, and restored byte for byte. **All 8 were caught:** flag ignored; no-account report refused; guest token refused; priority depending on having an account; dispatch held for an unverified reporter; image kept after a match; OCR text logged; a card-only name in a queued job. One break first survived because it was written wrongly (`incident_reporters` is a single object there, not an array, so it did nothing). Corrected, it was caught.

**Tests, before → after**
- Backend **1746 → 1746**: 1687, plus `auth-phase3` alone 59. The new spec is an e2e spec, so it isn't in this count.
- `test:e2e:db` + `test:e2e`: 2 suites, **12 → 19** in 3 suites.
- Frontend **199**, mobile **212**, unchanged.
- Typecheck clean in all four packages. `migrate status` up to date (36 migrations).
- **Backend specs get no type check by default:** `backend/tsconfig.json` excludes `test/`, and ts-jest runs with `isolatedModules`. The new spec was checked once with a throwaway config: clean.

**§10:** 5 more boxes ticked, each saying what the tests cover and what they don't. Still open: the guest button on each ID screen, and a phone without Google Play services.

**Step 3, privacy notice:** there is **no privacy policy or terms page**. In `mobile/app/auth/registration.tsx`, "Terms of Service" and "Privacy Policy" are styled text with no link. No legal page was written, as the prompt says. Already in place and accurate: the ID intro screen and the Privacy & Data card both say what is read, why and when it is deleted. **For a person to decide:**
1. The agree box starts ticked (`useState(true)`), although RA 10173 consent should be an active choice. The separate ID consent box is not affected.
2. The form says information is used "only for emergency response", which doesn't cover the ID check.

**Findings for review (nothing changed)**
1. **§10 and §13 promised the wrong message for a non-PhilHealth card.** On a normal phone, the on-device check refuses it first, with "We couldn't find the PhilHealth heading and number on this card…". "This isn't a PhilHealth ID" appears only when the server decides. Both sections are corrected, and it's in PH-02.
2. **The ID label also reaches Org Administrators of any organization through `GET /incidents/:id`,** because they count as incident staff (`INCIDENT_STAFF_ROLES`). That is an existing rule, wider than §8's "dispatchers". It is only the label. MOD-48 states it as built.
3. **`USER_ACCOUNTS.md` still lists Bystander under "no seeded account"**, although `bystander@demo.agap` is seeded. The new section mentions the account; the old row was left.
4. **Commit `38cd0b3` is labelled `docs(readme)` but also holds all of Phase 4** (42 files). `git log` won't show a Phase 4 commit, so find it by that hash.
5. **During preflight, a recursive search printed the two ID secrets from `backend/.env` into the agent's session,** breaking the house rule. Nothing used them, and the search then moved to `git grep`, which can't read that ignored file. Generate new values when the database is reset before the defense. Changing them without a reset would make stored data unreadable and break the duplicate check.

**Needs a person.** The system is **not** defense-ready until these are done.
1. **Phase 0's target isn't met:** 1 card tested against a target of 8 of 10, and no phone without Google Play services. The parser fix hasn't been run on a real card.
2. **The approve path hasn't run live** (PH-14).
3. **Hand checks:** the cases marked "Yes" in `MODULE_TESTING_GUIDE.md` §7, including those from the Phase 5 lists.
4. **Cache at sign-out:** the hand checks in that follow-up, on both phone and web.
5. **Rehearse the §13 demo, then reset the database.** Consent text: confirm the adviser reviewed it, and that the sample scans were deleted (Phase 0).

---

## 10. Test checklist

- [ ] Guest "Report an emergency" works from the ID intro, scanning, retry and form steps. *(With the flag on, the e2e proves the API accepts a report with no account; the button on each screen still needs a phone.)*
- [x] A non-PhilHealth ID (driver's licence, PhilSys, school ID) is refused: on a normal phone by the on-device check ("We couldn't find the PhilHealth heading and number on this card…"), otherwise by the server ("This isn't a PhilHealth ID"). *(Tests, with made-up text; a real card still needs a phone.)*
- [x] A blurred or glared scan → retry. On the third failure, "Send for review" appears. *(Tests, with stubbed OCR and the offer rule; a real blurred scan and the screen still need a phone.)*
- [x] Typed name matches → account created, `identity_verified_at` set, OTP sent.
- [x] Typed name differs → Create account disabled. The server also rejects a forced request with `NAME_DOES_NOT_MATCH_ID`. *(Tests, including the e2e over HTTP; the disabled button still needs a phone.)*
- [x] Same PhilHealth ID on a second phone number → `ID_ALREADY_REGISTERED`.
- [x] Token older than 30 minutes → `ID_SCAN_EXPIRED`. The image is deleted by the job.
- [x] A modified client sending matching `clientText` with an image of something else → not verified (server reads the image).
- [x] Logs, Sentry and SMS contain no PIN, no OCR text, no name from the ID. *(The e2e checks every backend log line and queued job while citizens register, both matched and sent for review; `id-review.spec.ts` checks the exact SMS and push texts of a decision. No package uses Sentry. Not run through the e2e: staff decisions, lookups, releases and withdrawals. Real SMS still needs a person. The SMS processor logs phone numbers, which this box doesn't cover.)*
- [x] Admin image view writes an audit row. A dispatcher cannot open the review page or the image route (403).
- [ ] Phone without Google Play services → fallback camera works.
- [x] Seeded citizen account signs in and sends an SOS as before. *(E2e over HTTP, with the flag on; the app still needs a phone.)*
- [x] Matched registration → the stored image is gone right after (`image_storage_key` null, file deleted).
- [x] Review approved or rejected → image deleted; the image route then returns 410.
- [x] Storage delete fails → registration still succeeds; the next job run deletes the image.
- [x] Unclaimed scan expires → its name, PIN hash and last 4 digits are erased.
- [x] Withdrawing consent → card data erased, account not verified, card free again; the account isn't blocked. *(Tests; the Privacy & Consent button still needs a phone.)*
- [x] Account never confirms its phone → claim released after 24 hours. Suspended and deactivated accounts keep theirs.
- [x] Staff look up a card by its number and release it → audited without the number, holder un-verified, card free again. *(Tests; the page still needs a web check.)*

---

## 11. Decisions and open questions

### Decided (2026-11-05)

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | Must existing citizen accounts verify? | **Yes, every citizen account goes through the scan.** No banner, no grandfathering. Seeded demo citizens are pre-verified. | The database is reset before the defense, so there are no real existing accounts. |
| D2 | How long is the ID image kept? | **Only while needed:** deleted right after a matched registration, when a review is decided, or 30 minutes after an unclaimed scan (§5.2a). | Data Privacy Act proportionality: collect and keep only what the purpose needs. Less stored, less to secure, a clear answer for the panel. |
| D3 | Local or cloud card reading? | **Local `tesseract.js` on the AGAP server.** No cloud OCR. | No third-party transfer of a government ID; free; works offline on the demo laptop. |
| D4 (2026-11-06) | Do abandoned scans keep their data? | **No.** The cleanup job erases the name and PIN data once a scan expires. | Nobody registered, so nothing needs it and no consent record covers it. |
| D5 (2026-11-06) | What does withdrawing consent do? | **Erases the card data and marks the account not verified.** The account stays usable; scanning again verifies it again. A button in Privacy & Consent makes this reachable. | RA 10173: withdrawal has to mean something, and a citizen needs a way to do it. Getting help never depends on it (rule 14). |
| D6 (2026-11-06) | How does a card's owner get it back? | **Unconfirmed phone: released automatically after 24 hours. Any other account: staff look at the card, find the holder by its number, and release it.** Blocked accounts are never released automatically. | Without this, whoever scans a card first can lock its owner out for good, and only a database edit could fix it. |
| D7 (2026-11-06) | Do ID images need their own bucket? | **No.** They stay under `id-documents/` in the same bucket. **Deployment rule: keep that bucket private** (noted in `.env.example`). | Checked: anonymous read and list both return 403 on the dev storage, objects are AES-sealed with a key kept outside storage, and incident photos and announcement images already stream through the API, so nothing needs the bucket public. A second bucket would use the same credentials, so it adds setup and a failure mode and closes no hole. Production storage settings couldn't be checked from here. |
| D8 (2026-11-06) | Can a verified citizen change their name? | **No.** `PATCH /users/me` refuses a different name while the account is verified. To change it: withdraw consent, then scan again. | Otherwise "ID verified" could sit beside a name nobody checked. |

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
  non-PhilHealth ID (school ID or driver's licence) to show it being refused. On a normal phone the message is "We couldn't find the
  PhilHealth heading and number on this card…", from the on-device check.
- Show the guest button on the ID screens (it reads **Emergency? Report without an Account**), which answers "what if someone has no PhilHealth ID?" (rule 14).
- Expected panel questions and short answers:
  - *"Can it detect a fake ID?"* No. It checks the card is a PhilHealth ID and the name matches. One ID per account,
    phone OTP and staff review reduce misuse (§1).
  - *"Where do the ID photos go?"* Encrypted on our own server, read by our own server, deleted as soon as the check is done (§5.2a).
  - *"Why only PhilHealth?"* Project scope; other IDs are a new parser and enum value later (§12).
