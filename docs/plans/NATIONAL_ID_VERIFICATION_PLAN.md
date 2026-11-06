# Plan — Philippine National ID as a Second ID Option at Citizen Registration

**Status:** Phase 0 tools built; no real card scanned yet (G1), and no feature code, migration or dependency added. Decisions recorded 2026-11-06 (§11) · **Date:** 2026-11-06 · **Owner:** AGAP mobile + backend + frontend (admin)
**Baseline:** `main` @ `1a22a45` (PhilHealth Phases 0–6 committed, clean tree)
**Implementation prompts:** [NATIONAL_ID_VERIFICATION_PROMPTS.md](NATIONAL_ID_VERIFICATION_PROMPTS.md)
**Builds on:** [PHILHEALTH_ID_VERIFICATION_PLAN.md](PHILHEALTH_ID_VERIFICATION_PLAN.md) (the "PhilHealth plan"). This plan covers only what changes; everything else stays as that plan says.
**Modules:** MOD-01 (registration), MOD-48 (privacy and consent), MOD-46 (audit), MOD-47 (RBAC), MOD-49 (administration)
**Surfaces affected:** `shared/src/validation`, `shared/src/constants/identity-verification.ts`, `backend/src/identity-verification`, `backend/src/consent`, `backend/prisma`, `mobile/src/components/registration`, `mobile/src/lib/id-verification.ts`, `mobile/src/services/id-scan`, `mobile/app/auth/registration.tsx`, `mobile/app/profile`, `frontend/components/admin`, `frontend/features/identity-verification`
**Surfaces that must NOT change behaviour:** guest/bystander SOS, the PhilHealth flow, older app builds (they send no ID type and keep working as PhilHealth), the dispatch label, staff accounts, seeded demo accounts

---

## 1. Goal

At citizen registration, a citizen can choose to scan **either** a PhilHealth ID **or** a Philippine National ID (PhilID). The name
they type must match the card, the same as today. The check still gates account creation only.

- **Number read from the National ID:** only the 16-digit **PhilSys Card Number (PCN)** on the front. Never the PhilSys Number (PSN).
- **Same machinery:** phone's document scanner, on-device hint, server OCR that decides, split name fields, staff review, one claim per card.
- **No new native module and no new dependency.** No dev-client rebuild is expected.

### What this does and does not prove

The check proves that someone had something that reads as a National ID in hand, and that its name matches the name they typed. It does
**not** prove the card is genuine or belongs to the person holding it. The real authenticity check for this card is its signed QR
code, verified through PSA's PhilSys Check, and the first version doesn't use it (§12). Say this plainly to stakeholders.

**One account per card, not per person (§11 N2).** A PhilHealth PIN and a PCN can't be linked, so one person holding both cards can
create two verified accounts. A replacement National ID may also get a new PCN (vendor source and PSA's "replaceable" wording;
confirm), which would allow another account. Phone OTP, one account per phone number and staff review limit this. They don't close it.

### Constraints from `CLAUDE.md`

The PhilHealth plan's §1 constraints all still apply (rules 5, 8, 10, 11, 14). Added here:

- **Rule 14:** the chooser is a new ID step, so "Report an emergency" must be on it. It is also the answer for someone with neither card.
- **Rule 10:** the PSN is never read, stored, typed, logged or returned. The PCN gets the same treatment as a PhilHealth PIN.
- **Consent specific to the purpose:** RA 11055 Section 17 allows use of a registered person's information with consent "specific to the
  purpose prior to the processing". So the National ID has its own consent type and wording, and changing the chosen ID clears the tick (§4.2).

### Gates (non-negotiable order)

| # | Gate | Blocks |
|---|---|---|
| G1 | **Adviser answers the §11 questions, recorded in §11** (N3) | Anyone scanning a real National ID, including the spike |
| G2 | **PhilHealth finished first:** its Phase 0 target met, approve path run live (PH-14), its Prompt R for Phase 6 run | Prompt 1 onward. The demo must not depend on a second parser untested on real cards. The owner can lift this, in writing, in the Progress log. |

Prompt 0 builds tools only, so it can run before either gate. The card check itself can run alongside PhilHealth's once G1 is met.

---

## 2. Current flow and where it is tied to PhilHealth (verified in code, 2026-11-06)

The flow is in the PhilHealth plan §3. 54 source and test files mention PhilHealth (`git grep -il`), many only in comments or text. These change behaviour:

| Tied to PhilHealth | Where | Why it matters |
|---|---|---|
| Parsers picked by name | [identity-verification.service.ts:172-174](../../backend/src/identity-verification/identity-verification.service.ts#L172-L174), `:211` (`client_read_ok`) | Must follow the chosen type |
| `document_type` never set | [schema.prisma:682](../../backend/prisma/schema.prisma#L682), enum `:2285` | Column exists; every row defaults to `PHILHEALTH` |
| Single consent type | [identity-verification.ts:18](../../shared/src/constants/identity-verification.ts#L18), used at `identity-verification.service.ts:290` and `:453`, [consent.service.ts:27](../../backend/src/consent/consent.service.ts#L27), [privacy.tsx:118-127](../../mobile/app/profile/privacy.tsx#L118-L127) | **Silent failure if missed:** see §5.3 |
| Wrong-card code | `NOT_PHILHEALTH_ID`: service `:60`, `:180`, `:576`; [review service `reviewReasonOf`:54](../../backend/src/identity-verification/identity-verification-review.service.ts#L54); [format.ts:58](../../frontend/features/identity-verification/format.ts#L58); [mobile id-verification.ts:53-69](../../mobile/src/lib/id-verification.ts#L53-L69) | A new code not added to `reviewReasonOf` shows as "Sent for review", with no reason |
| Rejection reason | `NOT_PHILHEALTH`: [identity-verification.ts:63](../../shared/src/constants/identity-verification.ts#L63), [format.ts:13](../../frontend/features/identity-verification/format.ts#L13) | Staff need the matching reason |
| Staff lookup | [review service `findCardHolder`:195](../../backend/src/identity-verification/identity-verification-review.service.ts#L195), [IdCardRelease.tsx](../../frontend/components/admin/IdCardRelease.tsx) | Only parses a PhilHealth PIN |
| Phone's check | `localReadVerdict` at [id-verification.ts:133](../../mobile/src/lib/id-verification.ts#L133) (the handoff's `:135` has moved), called from [philhealth-scan.ts:131](../../mobile/src/services/id-scan/philhealth-scan.ts#L131) | Refuses a National ID before upload unless it knows the type |
| Text | `translations.ts` (60 lines, `en` and `fil`), service messages, `privacy.tsx:131-132`, `users.service.ts:99`, `app.json:37,59` | Would tell a National ID holder about their "PhilHealth ID" |

Reusable as is: `matchIdName`, `normalizeNamePart`, `composeFullName`, the claim and release logic, the cleanup job, sealing, image storage
and retention, the partial unique index, the fallback camera, `NameFields` (text aside). `PhilhealthOcrService` is already generic apart from its name.

---

## 3. New flow

```
Location check (unchanged)
   │ inside Bocaue
   ▼
[A0] Choose your ID: PhilHealth ID / National ID   ── "Report an emergency" visible; neither card → guest report
   │
   ▼
[A] ID intro + consent for THAT ID ── "Choose a different ID" link clears the consent tick and the attempt count
   │
   ▼
[B] Phone's document scanner (front of the card, 1 page)
   ▼
[C] On-device reading, using the chosen ID's rules ── wrong card / unreadable → retry (max 3), "Choose a different ID" offered
   ▼
[D] Upload with documentType → server reads again with that ID's rules and decides
   ▼
[E] Registration form, with the ID's name in the helper, badge and match text
   ▼
[F] POST /auth/register (token only: the scan row already knows its type) → OTP (unchanged)
```

"Scan again" from the profile gets the same chooser. **A citizen may use a different ID type than they used before** after a release,
rejection or withdrawal.

**A printed ePhilID (§11 N1).** The card layout is the only one built and tested. A citizen with only an ePhilID can try it. If it won't read,
they get the usual three attempts and "Send to MDRRMO for review", where staff can approve it. Nobody holding a valid PSA format hits a dead end.

**An ePhilID that does read passes like a card.** The ePhilID may carry the same heading and PCN, and OCR text may not separate the two
formats, so it can't reliably be sent to review. Phase 0 records whether it reads and whether anything marks it as printed. **To revisit
with the adviser** (§11 question 5).

---

## 4. Mobile

### 4.1 Native modules

None. The scanner, text recognition and image manipulator are already in the dev build. JavaScript only, so **no dev-client rebuild**.
A new route needs `npx expo start -c`; a `shared` change needs `cd shared; pnpm build` and restarts.

### 4.2 Screens and components

Rename what would otherwise be misleading, moving the files and updating imports only (no `git mv`: the user stages and commits):

| From | To |
|---|---|
| `components/registration/PhilHealthIdStep.tsx` | `components/registration/IdScanStep.tsx` |
| `services/id-scan/philhealth-scan.ts` | `services/id-scan/id-scan.ts` |

`shared/src/validation/philhealth-id.ts` keeps its name: it holds the PhilHealth rules. Old plan docs keep their old links as history.

```
export type IdStep = 'id_choose' | 'id_intro' | 'id_scanning' | 'id_retry';
```

- **Chooser (`id_choose`):** two large options, PhilHealth ID and National ID, and one line for someone with neither: they can still report
  an emergency, and can't create an account yet. The geo-fence pass goes to `id_choose`: [registration.tsx:218](../../mobile/app/auth/registration.tsx#L218) and `locate()` in `profile/id-verification.tsx`. Add it to `ID_STEPS`.
- **The parent holds `documentType`,** because the step unmounts on the form. `registration.tsx` and `profile/id-verification.tsx` both pass
  `documentType` and `onDocumentTypeChange`. `ID_SCAN_EXPIRED` and the form's Scan again link return to `id_intro` with the type kept.
- **"Choose a different ID"** on the intro and retry states, not while scanning. Changing the type clears the **consent tick** (consent names the ID), the **attempt count**, and the last reason. `useFallback` stays, since it's about the phone.
- **"Report an emergency"** is already rendered outside the state blocks, so it covers `id_choose`. Check it anyway: there are no component tests.
- **Pass the type through:** `processIdImage` options, `localReadVerdict(text, documentType)`, `submitIdScan` (the `documentType` parameter), `retryMessageKey(reason, documentType)`.

**Wrong card, both layers.** A wrong card normally never reaches the server: the on-device check refuses it first.

| Chosen | Card scanned | Normal phone | Phone without text reading, or a review upload |
|---|---|---|---|
| National ID | PhilHealth, licence, anything else | `NOT_RECOGNISED`: "We couldn't find the National ID heading and 16-digit card number…" | Server: `NOT_NATIONAL_ID` |
| PhilHealth | National ID, anything else | `NOT_RECOGNISED`: the existing PhilHealth wording | Server: `NOT_PHILHEALTH_ID` |

Both messages sit next to "Choose a different ID". `countsAsAttempt` adds `NOT_NATIONAL_ID`.

**Text.** Reword to "your ID" where that reads fine. Where the card or number differs, use separate per-type sentences rather than building them
from a name, because Filipino grammar doesn't survive substitution. Both `en` and `fil`. **A Filipino speaker should check the new strings.**
Update: `idOnlyPhilHealth`, `idScannedBadge` ("PIN ending in" → "card number ending in" for a National ID), `nameHelper`, `nameMatches`, `idStatusTitle` and similar;
`privacy.tsx` (English only today, as is); `NameFields.tsx`; `id-status-card.tsx`; `app.json:37,59` ("scan your ID"; those strings affect iOS only).

The National ID consent text says: what is read (name, 16-digit card number), what isn't kept (birth date, address, photo), that **the PhilSys Number
and QR code are not read**, why, and when it's deleted. **The adviser reviews this wording** (§11 question 4).

### 4.3 Fallback camera, 4.4 offline

Unchanged, apart from strings. The fallback frame is already the ID-1 card shape, which a PhilID shares (from memory; check on a real card).

---

## 5. Backend

### 5.1 Data model

```sql
-- new migration, timestamp later than 20261106090000
ALTER TYPE "id_document_type" ADD VALUE 'NATIONAL_ID';
```

**No other schema change.** `pin_hmac`, `pin_last4` and `uq_identity_verifications_pin_active` stay. A 12-digit PIN and a 16-digit PCN can't produce the same
input, so one column is safe, and the columns aren't renamed: they mean "card number" now (update the schema comments). Consent types are free text, so they need no migration.
The `document_type` default stays `PHILHEALTH`, which is what existing rows are.

**Never stored, in any form:** the PSN, birth date, address, sex, blood type, marital status, place of birth, photo as a field, QR contents.

### 5.2 Environment

No new variables. Same `ID_DOCUMENT_ENCRYPTION_KEY` and `ID_PIN_PEPPER`. The retention rules (PhilHealth plan §5.2a) apply unchanged.

### 5.3 Module changes

**`POST /auth/id-verification`**
- `IdScanDto` gains optional `documentType` (`@IsIn(ID_DOCUMENT_TYPES)`). **Missing means `PHILHEALTH`,** so older app builds keep working. An unknown value gets 400.
- `scan()` picks parsers from the shared lookup (§6), saves `document_type`, uses the type's wrong-card code, and returns `documentType` in `IdScanResponse`.
- Messages name the chosen ID. `ScanFailure` adds `NOT_NATIONAL_ID`.
- `MIN_OCR_CONFIDENCE` (40) and `OCR_TIMEOUT_MS` (20 s) were set from one PhilHealth card. The spike records National ID values. Change them only if it shows a need, and log it.
- Rename `PhilhealthOcrService` to `IdOcrService` (file, class, imports, test mocks). No behaviour change.

**Registration and `claimForUser`:** no new input. `prepareClaim` reads `document_type` from the row into `PreparedClaim`, and `claim()` writes the
matching consent type. The audit row's `newValues` gains `documentType` (not personal data).

**Consent: all of these or a citizen can't withdraw.** Today, with a second consent type added and nothing else changed:
- `consent.service.ts:27` wouldn't match it, so it would take the generic path: the consent shows as withdrawn while **the card data stays stored and the account stays verified.** No error.
- `withdrawConsent` (`:453`) would find no PhilHealth consent and return 404.
- `privacy.tsx` would show no card at all.

So:
- Shared: `ID_VERIFICATION_CONSENT_TYPES` (one per type) and `isIdVerificationConsentType()`. Keep `ID_VERIFICATION_CONSENT_TYPE` as the PhilHealth value, because tests and existing rows use it.
- `consent.service.ts`: route **either** type to `withdrawConsent`.
- `withdrawConsent`: `consent_type: { in: [...all] }`. It must withdraw every ID consent, because `releaseInTransaction` erases every row, and a citizen rejected on one card who rescanned with the other holds two `GRANTED` records.
- `privacy.tsx`: check both, show one card if either is granted, name the ID, and invalidate both queries on withdrawal.

**Refusals:** `refuseIfChecked` already stops an account holding two checks, across types, because it isn't filtered by type. Keep it that way, and add a test.

### 5.4 Server-side reading

Same local `tesseract.js` with English data (D3). The card's labels are bilingual, and the Filipino label words are simply matched as text. No cloud OCR, and no Filipino language data unless the spike shows the need (a new dependency: stop and ask).

**A misread number matters more than it looks.** No public check digit is known, so one wrong digit gives a different HMAC. The result is a second account on one card, and a staff lookup that doesn't find the holder. The spike therefore measures exact reads and repeat reads (§9), not just "number found".

---

## 6. Shared rules: `shared/src/validation/national-id.ts`

```ts
export function parsePhilSysCardNumber(text: string): string | null;  // 16 digits or null
export function looksLikeNationalId(text: string): boolean;
export function parseNationalIdName(text: string): IdName | null;
```

and `shared/src/validation/id-document-rules.ts`:

```ts
export const ID_DOCUMENT_RULES: Record<IdDocumentType, {
  looksLike(text: string): boolean;
  parseNumber(text: string): string | null;
  parseName(text: string): IdName | null;
  consentType: string;
  wrongCardCode: IdVerificationErrorCode;
  rejectionReason: IdRejectionReason;   // the "wrong card" reason staff may use for this type
}>;
```

`matchIdName`, `normalizeNamePart` and `composeFullName` stay in `philhealth-id.ts`, unchanged. The new parser reuses its helpers: export `nameTokens` and the suffix check from there rather than copying them. **One source per concept.**

**Number.** 16 digits, expected in 4-4-4-4 grouping, separated by nothing, spaces or a dash. PSA says digits; vendor blogs say alphanumeric. **Confirm on real cards in Phase 0. If the card has letters, stop and revisit this section.**

**The PSN must never be returned.** PSA's published guidance, as read in search excerpts (§14): the PSN is **12 digits**, microprinted on the back, and relying parties shouldn't request or capture it. **That's the same length as a PhilHealth PIN,** which the handoff didn't record. It's safe in the design here because:
- `parsePhilSysCardNumber` accepts exactly 16 digits. A 12-digit run returns null, and a longer run isn't cut down to 16 (no lookbehind: Hermes).
- PhilHealth parsing runs only when the PhilHealth heading is present and PhilHealth was chosen.
- The staff lookup and approval take a type, and a National ID number must be 16 digits, so a PSN typed by mistake is refused.

**Detection.** The National ID heading **and** a valid PCN. Expected from memory, unconfirmed: `PHILIPPINE IDENTIFICATION CARD` and `PAMBANSANG PAGKAKAKILANLAN`. **Don't use `REPUBLIC OF THE PHILIPPINES`:** the PhilHealth card prints it too (PhilHealth plan, Phase 0 notes).

**Name.** From memory, unconfirmed: separate labelled lines, bilingual (`Apelyido/Last Name`, `Mga Pangalan/Given Names`, `Gitnang Apelyido/Middle Name`). If so, there's no first/middle guessing.
- **Label trap:** `GITNANG APELYIDO` contains `APELYIDO`, and `MIDDLE NAME` and `LAST NAME` both contain `NAME`. Match the whole label, and test it.
- All the given names go in `first`. No middle name is valid. Where a suffix prints (PSA's field list has one) is to be confirmed.
- Stop at the birth date and address labels. Never read past them: data minimisation, as PhilHealth plan §5.1.
- OCR may put the value on the label's line or the next one, or garble a label. Take this from real output, not memory.

**Matcher.** Unchanged. It accepts other first/middle splits because the PhilHealth card can't separate them. A labelled card could be stricter, but one matcher on both sides matters more. Note it; don't change it.

**Tests:** `backend/test/identity-verification/national-id.spec.ts`, invented text only. At least:
- PCN with spaces, with dashes and with none; 15 and 17 digits → null.
- **A 12-digit run alone → null. Text with both a 12-digit run and a PCN → the PCN, never the 12 digits.**
- `looksLikeNationalId` is false for PhilHealth text, a licence and a school ID. `looksLikePhilHealthId` is false for National ID text. The existing 4-4-4-4 refusal in `philhealth-id.spec.ts` stays.
- The label traps; no middle name; multi-word surname; `Ñ`; suffix; address and birth lines never returned.
- Every type in `ID_DOCUMENT_RULES` has all its fields.

---

## 7. Staff review (web admin)

Same reviewers, routes and audit actions. Changes:

| Where | Change |
|---|---|
| `IdReviewItem`, queue table, drawer | Show the ID type. Add `documentType` and `hasCardNumber` to the response. |
| `reviewReasonOf`, `IdReviewReason`, `reviewReasonLabel` | Accept `NOT_NATIONAL_ID`. Keep `NOT_PHILHEALTH_ID`: stored rows use it. |
| `reviewCheckHint(reason, documentType)` | Per type. For a National ID: the image is the **front** of a National ID or a legible printed ePhilID, and the name matches. Reject a card of the other type. |
| `ID_REJECTION_REASONS` | Add `NOT_NATIONAL_ID`. Keep `NOT_PHILHEALTH`: stored rows use it. **Server refuses** a wrong-card reason that doesn't fit the row's type (400). The drawer's list is filtered. |
| `find-by-pin` | Body gains `documentType`, default `PHILHEALTH`, so existing calls still work. Parse by type, filter by `document_type`. 400 and not-found messages name the ID. |
| `IdCardRelease.tsx` | A type picker that sets the placeholder and label. For a National ID, the label says to type the **16-digit number on the front**, and warns not to ask for the PhilSys Number. The number is still cleared after use. |

### Approving a National ID whose number wasn't read (new, needed by §11 N1)

A review scan the server couldn't read stores no number, so approving it **holds no card**: the same card could then verify any number of other accounts. `id-review.spec.ts:446` shows this happens today for PhilHealth. N1 sends more scans down this path, which would make "one account per card" untrue for them.

- `POST :id/approve` gains an optional `cardNumber`. **It is required when the row is `NATIONAL_ID` and `pin_hmac` is null**, and must parse as 16 digits, or 400.
- Inside the decision transaction: store `pin_hmac` and `pin_last4` in the same conditional update. The partial index then applies. `P2002` → 409 `ID_ALREADY_REGISTERED`, nothing changes, and staff can look up the holder.
- The drawer shows the input only when `hasCardNumber` is false, and clears it after use. The number never appears in an audit row, response or log.
- **PhilHealth rows are unchanged** (their test stays). The same gap for PhilHealth is listed in §11 as an open question for the owner.

---

## 8. Other surfaces

- **Dispatch label:** no change. It reads `identity_verified_at`, whichever card. Information only (rule 8).
- **Profile status:** no logic change; the title becomes generic.
- **Rename lock:** `users.service.ts:99`, wording only.
- **Seed:** no change. `citizen@demo.agap` stays PhilHealth. Tests create their own National ID citizens with invented numbers.
- **Data export:** `exportMyData` has no ID data today and this doesn't change that. Listed in §11 for MOD-48.

---

## 9. Phases

Tests that can't exist: **frontend Jest has no DOM, and mobile has no component tests.** Screens are typecheck plus hand checks, and adding either needs an approved dependency.

| Phase | Work | Done when |
|---|---|---|
| **0. Spike and samples** | Tools: restore the dev spike screen for the National ID. It compares a typed number and name with what the phone read and shows only yes/no. **After G1:** collect 5–10 National IDs from team members with written consent, plus any printed ePhilID. Confirm heading, PCN format, labels, suffix. The spike deletes its scans, so the server check uses separate photos, moved to the PC without a chat app, email or cloud storage. Delete all samples when done, including phone gallery, trash and backups. | **Name and full PCN exactly right on ≥ 8 of 10 cards, by phone and server.** Same card scanned 3 times gives the same number each time, by phone and, from 3 separate photos, by server (at least 3 cards). Layout notes filled in. Adviser answers in §11. |
| **1. Shared rules** | `national-id.ts`, `id-document-rules.ts`, constants, tests (§6). | All parser tests pass; PhilHealth tests untouched. |
| **2. Backend** | Migration, `documentType` on scan, consent (§5.3), staff routes (§7), rename, tests including real PostgreSQL. | Unit and e2e pass. A scan without `documentType` behaves exactly as today. Withdrawal works for both types and for someone holding both. |
| **3. Mobile** | Chooser, type passed through, text in `en` and `fil`, privacy card, rescan, spike removed, rename. | Real phone: choose National ID → scan → name matches → OTP → home. Wrong card and review paths. Guest SOS from every step, chooser included. |
| **4. Admin** | Type in the queue, per-type hints and reasons, number on approval, type picker. | National ID review approved from the web; a typed number already held gives 409; audit carries no number. |
| **5. Docs and readiness** | Flag-on e2e with a National ID citizen, MOD-01 §22, MOD-48 §21, testing guide (NI-xx cases), PhilHealth plan §12–§13, §13 rehearsal, PhilHealth regression. | Emergency e2e passes with the flag on, for both types. PH-xx hand checks re-run. |

### Progress log

Each implementation prompt fills in its row and adds a `### Phase N — <date>` section below the table: files added or changed, migrations (applied or not), deviations and why, and what still needs a person or a phone.

| Phase | Status | Date | Notes |
|---|---|---|---|
| 0. Spike and samples | Tools built, not yet run on a phone; card check not started | 2026-11-06 | Real cards blocked by G1. No migration or dependency. Test counts unchanged. One out-of-scope digital ID read recorded; it doesn't count toward the target |
| 1. Shared rules | Not started | | Blocked by G2 |
| 2. Backend | Not started | | |
| 3. Mobile | Not started | | |
| 4. Admin | Not started | | |
| 5. Docs and readiness | Not started | | |

### Phase 0 — 2026-11-06

**Added**
- `mobile/app/dev/id-scan-spike.tsx`: dev-only screen (renders `null` unless `__DEV__`), recreated from `3ff8498` for the National ID. Scans 1 page, runs on-device text reading, and compares a typed number, last name, given names and middle name with what was read. It shows only yes/no results and counts: the heading words, a 16-digit number found, 12-digit runs, text lines, image size and reading time. The recognised text and the number read never reach state, the screen or a log. The scanned file is deleted in a `finally`. Delete it in Phase 3.

**Changed**
- `mobile/app/profile/index.tsx`: a `__DEV__`-only "National ID scan spike" row above Sign out. Remove it with the screen in Phase 3.
- `backend/scripts/ocr-spike.ts`: header comment only, now covering both IDs. It still refuses a folder inside the repo (checked on `../docs`) and writes nothing to disk.

**Migrations:** none. **Dependencies:** none. No dev-client rebuild is needed; restart Metro with `npx expo start -c`.

**Inventory:** nothing from this phase existed before this run.

**Tests**
- Backend: 1687 plus `auth-phase3` alone 59. The screen isn't covered by them and the only backend change is a comment, so one run stands for before and after. e2e skipped, as Prompt 0 says.
- Mobile: 212 in 17 suites, before and after. Mobile and backend typecheck clean.
- There are no repo tests for this throwaway screen. Its text logic was run once from outside the repo on invented text only (28 checks). Four deliberate breaks to that logic were each caught, and no repo file was changed for them.

**Deviations**
- The heading shows as two yes/no rows, one for each §6 candidate, rather than one. It's still yes/no, and it tells Prompt 1 which words actually read.
- `keyboardType="visible-password"` turns off keyboard suggestions on Android only. iOS uses the default keyboard with the other suggestion settings off.

**Not yet proven:** the screen hasn't run on a phone. No real card has been used by anything. The heading words, number format and name labels remain unconfirmed until the card check.

**Needs a person or a phone**
1. Send the §11 adviser questions and record the answers in §11. **No real card before this (G1).**
2. Run the card check using the steps in Prompt 0, step 4, then fill in the notes below with patterns only.
3. Delete the samples from the PC and the phone, including the gallery's trash and any backup.

#### Digital National ID read (out of scope; not a card sample)

One image of a Digital National ID, one server read, 2026-11-06. The Digital National ID is out of scope (§12), so this doesn't count toward the 8 of 10 and doesn't confirm the plastic card's layout. Patterns only.

**Handling:** this image was read before G1 was met, and its OCR output, personal data included, was pasted into an agent chat. Still to be done or confirmed by a person: delete the image and any copies, clear the terminal, delete the chat transcript, tell the adviser, and tell the card's owner if it isn't the user's own.

- Heading: `REPUBLIKA NG PILIPINAS`, `Republic of the Philippines`, `PAMBANSANG PAGKAKAKILANLAN`, `Philippine National ID`. The §6 English candidate `PHILIPPINE IDENTIFICATION CARD` did not appear. The Filipino candidate did.
- Number: 16 digits, 4-4-4-4 with dashes, no letters. It shares a line with stray characters and a garbled label. Whether it's the same number as the plastic card's PCN is unknown.
- Name labels: `MGA PANGALAN/GIVEN NAMES` then `GITNANG APELYIDO/MIDDLE NAME`, each with its value on the next line. The last name label was garbled, and no clear value followed it.
- After the name: `PETSANG KAPANGANAKAN/ DATE OF BIRTH` and `TIRAHAN/ADDRESS`, each followed by its value. The parser must stop before them.
- Another number: a short alphanumeric `DIGITAL ID NUMBER`, which isn't the 16-digit number and must never be used as it.
- 12-digit runs: none seen.
- Confidence 50, 840 ms. OCR added junk text around the two-column layout. From the output, the name check would likely fail because of the last name; only a person can confirm that against the card.

#### Layout notes (filled in by the user)

No real names or numbers: patterns only.

- Heading text found on the card (patterns, as printed):
- Card number: digits only, or letters too? Grouping and position:
- Name labels as printed, and their order. Is the value on the label's line or the next?
- Where a suffix prints; a card with no middle name:
- What follows the name (the lines the parser must stop before):
- Cards with name AND full number exactly right, by phone (n/10):
- By server (n/10), OCR confidence range, reading time range:
- Same card scanned 3 times: same number each time? By phone (n cards tested); by server, from 3 separate photos (n cards tested):
- Any 12-digit run seen on the front? (yes/no):
- Printed ePhilID, if available: reads? Anything in the text that marks it as printed?
- Scanner on a phone without Google Play services, if available:
- Sample scans deleted, including phone gallery, trash and backups (date); written consent held for each card (yes/no); no sample sent through a chat app, email or cloud storage (yes/no):

---

## 10. Test checklist

- [ ] Chooser shows both IDs. "Report an emergency" works from the chooser and every later ID step.
- [ ] National ID: scan → typed name matches → account created, `document_type = NATIONAL_ID`, `identity_verified_at` set, OTP sent, image deleted.
- [ ] A scan with no `documentType` (older build) behaves exactly as today, as PhilHealth.
- [ ] Unknown `documentType` → 400.
- [ ] National ID chosen, other card scanned → refused, on a normal phone by the on-device check, otherwise `NOT_NATIONAL_ID`. Both layers show "Choose a different ID".
- [ ] PhilHealth chosen, National ID scanned → refused. A PCN is not stored as a PIN.
- [ ] **A 12-digit number on a scan or typed by staff is never accepted as a National ID number. No PSN is stored anywhere.**
- [ ] Changing the chosen ID clears the consent tick and the attempt count.
- [ ] Same National ID on a second phone number → `ID_ALREADY_REGISTERED`.
- [ ] **One person, both cards, two phone numbers → two accounts, by design (§11 N2). A test records this.**
- [ ] An account holding a check on one type can't claim a scan of the other type.
- [ ] National ID consent recorded as `ID_VERIFICATION_NATIONAL_ID`.
- [ ] **Withdrawing National ID consent erases card data and un-verifies. The card is free again; the account isn't blocked.**
- [ ] Someone rejected on one type who verified on the other: withdrawal withdraws both consents and erases both rows.
- [ ] Privacy & Consent shows the withdrawal card for either type, naming the right ID.
- [ ] Release, expiry and the 24-hour unconfirmed-phone rule work on National ID rows.
- [ ] Review queue shows the type. A wrong-card rejection that doesn't fit the type → 400.
- [ ] Approving an unread National ID review scan without a number → 400; with a 12-digit number → 400; with a number already held → 409 and nothing changes; with a free number → approved, and that card is now held.
- [ ] Staff lookup by type; audited without the number.
- [ ] Logs, audit rows, queued jobs and SMS contain no PCN, OCR text or card name.
- [ ] Printed ePhilID: reads, or reaches review after 3 attempts. Result recorded.
- [ ] Every PhilHealth test case (PH-01 to PH-21) still passes.

---

## 11. Decisions and open questions

### Decided (2026-11-06, by the owner)

| # | Question | Decision | Why |
|---|---|---|---|
| N1 | Printed ePhilID, or only the plastic card? | **Build and test the card first. An ePhilID that won't read goes to staff review after 3 attempts, and staff can approve it.** No ePhilID parser. | PSA releases say the printout has the same validity (§14), and Section 19 fines refusal "without just and sufficient cause", so a flat refusal carries risk. OCR text may not tell them apart anyway. No second parser to test. Changes the handoff's "plastic only". |
| N2 | Accept the weaker duplicate check? | **Yes. Accept and document it:** one account per card, not per person. | The numbers can't be linked. Flagging same names would store a new hash, misfire on common names, and be easy to get around. |
| N3 | When does the adviser review RA 11055? | **Before any real National ID is scanned,** spike included. | Section 17 and its penalty are serious enough to ask first, and the spike already handles real cards. |

### Decided in this plan (change them if you disagree)

| # | Decision | Why |
|---|---|---|
| N4 | PCN only. The parser accepts exactly 16 digits. | PSA's guidance on the PSN. |
| N5 | Separate consent type, one per ID. | Section 17: consent specific to the purpose. |
| N6 | No QR code in the first version (§12). | It's on the back, holds more personal data, and no public API was found. |
| N7 | Reuse `pin_hmac` and `pin_last4`. No rename. | Lengths can't collide, and a rename touches every reviewed query for no behaviour change. |
| N8 | Staff type the number when approving an unread National ID scan (§7). | Otherwise N1 breaks "one account per card". |
| N9 | Seed unchanged. | Nothing needs a seeded National ID. |

### Questions for the adviser (G1; record the answers here). Not settled here, and not legal advice.

Section numbers differ: the Act's Sections 12, 17 and 19 correspond to the IRR's Sections 12, 21 and 23. The handoff said sources conflict on penalties. The Act's Section 19 and the IRR's Section 23 agreed when read on 2026-11-06, through a tool's summary. **Please read Section 19 directly.** As read: refusal P500,000; unlawful use 6 months–2 years and/or P50,000–P500,000; violating Sections 12 or 17, 6–10 years and P3M–P5M.

1. **Is AGAP (or Bocaue MDRRMO running it) a "relying party"?** IRR Sec. 4(q): a public or private service provider "who relies on any PhilSys-enabled service". AGAP reads the printed card with OCR and calls no PhilSys service. If it is one, which duties apply (PSA standards, e-KYC, Sec. 12)?
2. **May AGAP keep an HMAC and the last 4 digits of the PCN?** IRR Sec. 4(k) lists the PhilSys Card Number as a PSN derivative. PSA has said relying parties would hold another form of token, under guidelines not checked here.
3. **May AGAP hold a sealed image of the card** until review ends (PhilHealth plan §5.2a)? No IRR rule on images was found, but the general Section 17 limit applies.
4. **Is the consent wording specific enough** for Section 17? (§4.2)
5. **Does requiring one of two IDs, or routing an ePhilID to staff or passing it automatically, raise a Section 12 or 19 issue?** Does the guest path count toward "just and sufficient cause"? Must a private system accept the PhilID "subject to authentication" if it can't authenticate?
6. **Is OCR-only checking acceptable while the app shows "ID verified"?** Should the label change?
7. **Are written consent forms enough for team members' cards in the spike?**

### Still open, for the owner

1. **PhilHealth review scans approved with no number hold no card** (§7). Existing behaviour. Apply the N8 rule to PhilHealth too? *(Recommended: yes, after G2, as its own change.)*
2. **Should a readable ePhilID pass automatically?** (§3) *(Depends on Phase 0 and question 5.)*
3. **MOD-48 and data export:** `exportMyData` returns no ID check data. *(Existing; decide separately.)*
4. **A Digital National ID that reads may pass like a card,** as with the ePhilID (§3), even though it's out of scope (§12). Its heading and labels read like the expected card format (Phase 0). Should it pass, go to review, or be refused? *(Depends on Phase 0 and adviser question 5.)*

---

## 12. Out of scope

- **QR code reading and PSA's PhilSys Check.** The only real authenticity check for this card, and the first later option to look at. It's digitally signed and verified through PSA's site, but it's on the back while AGAP scans the front, holds more personal data, and one PSA document (per the handoff, not re-read) says that includes a fingerprint, which the PhilHealth plan §12 excludes. No public API was found.
- An ePhilID parser, and the Digital National ID in eGovPH.
- Any PhilSys authentication or e-KYC integration.
- Reading the back of the card.
- Other IDs (licence, UMID, voter's ID).
- Linking one person's cards, or duplicate checks by person.
- Changing `matchIdName`.

---

## 13. Defense demo notes

Adds to PhilHealth plan §13, whose database-reset advice applies to both.

- **A National ID belongs in the demo only if Phase 0's target was met and G1 is answered.** Otherwise demo PhilHealth and describe this as designed.
- Show the chooser and its emergency button first: that answers "what if someone has neither?"
- Happy path with a team member's card; wrong card under the chosen ID, using the on-device message.
- Expected questions and short answers:
  - *"Can it detect a fake National ID?"* No. The real check is the signed QR code through PSA, which this version doesn't use. It checks the card reads as a National ID and the name matches.
  - *"Can one person make two accounts?"* Yes, with both cards, because the numbers can't be linked. The rule is one account per card. Phone OTP and staff review limit misuse.
  - *"Do you store the PhilSys Number?"* No. The app reads only the 16-digit card number on the front, and keeps only a keyed hash and its last 4 digits.
  - *"What about a printed ePhilID?"* It may read like the card. If not, MDRRMO staff can review it. Nobody is stuck, and an emergency report never needs an ID.
  - *"Is this legal under RA 11055?"* Give the adviser's recorded answer (§11). Don't improvise.

---

## 14. Sources (re-checked 2026-11-06)

**Read directly, through a tool that summarises** (so quote from the source, not from here):
- RA 11055, full text: https://lawphil.net/statutes/repacts/ra2018/ra_11055_2018.html. Sections 6, 12, 13, 17, 19. It states no digit count for the PSN and doesn't use the term "relying party".
- Revised IRR: https://dev.lawyerly.ph/laws/97649. Sections 4(k), 4(q), 12, 21, 23. It has no rule on storing card images, and doesn't define the PCN beyond listing it as a derivative.
- Verihubs (vendor, secondary): https://verihubs.com/ph/blog/philsys-number-psn-pcn-guide. PSN 12 digits, must not be stored; PCN "16-character alphanumeric" (**conflicts with PSA's "16-digit"**); a replacement card gets a new PCN.

**PSA pages returned 403 to automated fetching, so these were seen only as search excerpts.** A person should open them before relying on them. The excerpts weren't pinned to individual pages:
- PSN 12 digits, microprinted on the back; PCN 16 digits on the front, the public version of the PSN; relying parties shouldn't request or capture the PSN:
  - https://psa.gov.ph/content/psa-begins-issuance-psn-and-philid-successful-registrants
  - https://psa.gov.ph/content/advisory-1
  - https://rsso01.psa.gov.ph/node/57667
- ePhilID: the printed format is to be accepted "in all CRS Outlets" (**a narrower scope than general validity**); a regional release says it has the "same legal validity and functions as the physical PhilID":
  - https://rsso01.psa.gov.ph/system/files/attachment-dir/Advisory%2520on%2520the%2520Use%2520of%2520ePhilID_rev4_ONS-signed.pdf
  - https://rsso06.psa.gov.ph/content/psa-guimaras-releases-1764-ephilids-3480-digital-nids-2024

**Carried from the handoff; could not be re-read (403):**
- PSA, PhilID design: https://psa.gov.ph/content/psa-showcases-philid-design-assures-reliable-security-features
- PSA and BSP, verification features: https://psa.gov.ph/content/psa-bsp-promote-philid-card-security-and-verification-features
- PSA public advisory: https://psa.gov.ph/content/public-advisory

**From memory, unconfirmed:** the card's heading words, its bilingual labels and their order, and the ID-1 size. Phase 0 settles these.
