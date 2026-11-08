# Plan — Philippine National ID as a Second ID Option at Citizen Registration

**Status:** Phases 1–4 (shared rules, backend, mobile, web admin) built at the owner's instruction, ahead of their gates and **unconfirmed on a real card, a phone or in the browser**: the layout notes are blank and the adviser's answers aren't in §11 (see the Progress log). Docs (Phase 5) not started. Decisions recorded 2026-11-06 (§11) · **Date:** 2026-11-06 · **Owner:** AGAP mobile + backend + frontend (admin)
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
| 1. Shared rules | Done, awaiting review; parser unconfirmed on a real card | 2026-11-06 | Built on the owner's instruction with G2 lifted and the layout notes blank. No migration or dependency. Backend 1687 → 1741, plus `auth-phase3` alone 59 |
| 2. Backend | Done, awaiting the review decision; parser unconfirmed on a real card | 2026-11-07 | Built on the owner's instruction with the Phase 1 review skipped and G2 lifted. G1 and the layout notes still open. 1 migration, applied (37). Backend 1741 → 1811, plus `auth-phase3` alone 59; e2e 19 → 26 |
| 3. Mobile | Code done and reviewed (2026-11-07), not yet run on a phone | 2026-11-07 | Built on the owner's instruction with the Phase 2 review skipped. G1 and the layout notes still open. No migration or dependency. Mobile 212 → 241. Backend must be restarted first |
| 4. Admin | Code done and reviewed (2026-11-09, same chat, not independent); not yet checked in the browser | 2026-11-09 | Gate met: Phase 3 reviewed 2026-11-07. G1 and the layout notes still open. Frontend only: no migration, dependency, backend, shared or mobile change. Frontend 199 → 212, 217 after the review. Restart `pnpm dev` |
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

#### First National ID sample read (server, one image; not a passing sample)

One image from the owner's sample folder, one server read, 2026-11-06, after Phase 1 was built. Patterns only. It doesn't count toward the 8 of 10, and the notes below remain the user's to fill in.

**Handling:** G1 wasn't met when this was read, and its OCR output, personal data included, was pasted into an agent chat, against the rule for samples. Still to be done or confirmed by a person: clear the terminal, delete the chat transcript, tell the card's owner and the adviser, and delete the image when testing ends. Confirm written consent for this card.

- Confidence 35, below the server's minimum of 40. About 4.7 s.
- Heading: pieces of the Filipino heading and of `Philippine Identification` appeared, split across lines. This is the first support for §6's English candidate, but neither heading came through whole.
- Number: no 16-digit run, and no 12-digit run. Only short digit fragments.
- Labels: pieces of `Apelyido/L…`, `Mga Pan…galan/Gi…ven Names` and `Tirah…an/Add…`, each broken across lines. That supports the bilingual slash form and that order. No sign of the middle name or birth date label.
- Words stepping from one line to the next suggest a tilted image, and repeated background print was read as text. Likely not a cropped, upright image; only a person can confirm that.
- Read by inspection, with the text kept off disk, the Phase 1 rules would refuse it: no heading, no number, no name. That's a safe failure (retry, then review), but it says nothing yet about a clean image.

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

### Phase 1 — 2026-11-06

**Gates: the owner's instruction, as written.** Prompt 1 stopped on its gates, and the owner replied on 2026-11-06: "just proceed, i'm the owner of this application the main developer, the photo i have on the id-samples folder are the ids samples i have gathered with my friends and fellow developers so i can test the national id".

- **G2:** recorded as lifted by the owner, for this phase. PhilHealth's own Phase 0 target, PH-14 and Prompt R for Phase 6 are still not done.
- **G1:** **not met.** No adviser answers are recorded in §11, and nothing here should be read as saying they were. The owner chose to go ahead without them.
- **Layout notes:** **still blank.** The owner chose to go ahead without them, so no card count backs this parser (0 of the 8 of 10 target). Fill them in and revisit this code.
- **Sample images:** the agent didn't open, read or run a tool on them (Part A3). It checked only that the folder is outside the repo and holds 1 JPG.

**What the parser rests on:** §6's memory of the heading and labels, and the one Digital National ID read recorded above, which is a different format and didn't show the last name label or value clearly. A real card may differ on any of the unconfirmed points below.

**Added**
- `shared/src/validation/national-id.ts`: `parsePhilSysCardNumber`, `looksLikeNationalId`, `parseNationalIdName`.
- `shared/src/validation/id-document-rules.ts`: `ID_DOCUMENT_RULES`.
- `backend/test/identity-verification/national-id.spec.ts`: 54 tests, invented text only.

**Changed**
- `shared/src/constants/identity-verification.ts`: `ID_DOCUMENT_TYPES`, `IdDocumentType`, `ID_VERIFICATION_NATIONAL_ID_CONSENT_TYPE`, `ID_VERIFICATION_CONSENT_TYPES`, `isIdVerificationConsentType`, `IdVerificationErrorCode.NOT_NATIONAL_ID`, `NOT_NATIONAL_ID` in `ID_REJECTION_REASONS`, the wider `IdReviewReason`, `documentType` on `IdScanResponse` and `IdReviewItem`, `hasCardNumber` on `IdReviewItem`. Every existing value kept.
- `shared/src/validation/philhealth-id.ts`: exports `nameTokens` and a new `isNameSuffix`, which replaces the same check written inline in `buildName`. No behaviour change; `philhealth-id.spec.ts` is unchanged and passes.
- `shared/src/validation/index.ts`: exports both new files.
- `frontend/features/identity-verification/format.ts`: one label, `NOT_NATIONAL_ID` (see Deviations).

**Migrations:** none (36, up to date). **Dependencies:** none.

**Inventory:** everything was missing except `IdReviewReason`, which was extended.

**Tests**
- Backend: 1687 → 1741, all passing (+54, the new spec), plus `auth-phase3` alone 59 → 59. Identity-verification specs: 204.
- Mobile 212 → 212. Frontend 199 → 199. Backend, mobile and frontend typecheck clean.
- e2e not run: nothing under `backend/src` changed. Prompt 2 runs it.
- **Deliberate breaks:** 42 one-line breaks to the number, heading, label, stop and rules code, each restored byte for byte (hashes compared). The first run caught 39. The 3 that survived were real test gaps (a later label overwriting a value, a label half with the slash lost, an unlabelled date ending the reading), so 4 tests were added. All 42 are now caught.

**Deviations**
- `documentType` and `hasCardNumber` are **optional** for now. Required fields would stop the backend compiling until Phase 2 fills them in. **Phase 2 should make them required.**
- One line in `frontend/.../format.ts`, ahead of Phase 4. `REJECTION_REASON_LABELS` needs a label for every reason, so adding `NOT_NATIONAL_ID` otherwise broke the frontend typecheck and `id-review-format.spec.ts:67`.
- Added `ID_VERIFICATION_NATIONAL_ID_CONSENT_TYPE`, which Prompt 1 didn't name, so the rules and the list share one value.

**Temporary, until later phases**
- The review drawer's rejection list now also shows "Not a National ID" on PhilHealth rows, and the server accepts it. Phase 2's check (400) and Phase 4's filtered list close this. Until then staff shouldn't pick it.

**Known limits**
- 4-4-4 digits followed by exactly one 4-digit group on the same line read as a card number: text alone can't tell them apart. A test pins this. It's why the PSN being on the back and AGAP scanning the front matters: **confirm on a real card that no 12-digit run shows on the front.**
- Any extra digits joined to the number by only spaces or a dash refuse it whole, so the scan is retried rather than risk a wrong number. If real OCR often puts digits beside it, this may need loosening, without ever cutting a longer run down.
- A year or date anywhere before the name labels ends the reading, so the name reads as null. The safe side, but check real OCR output for a stray year above the name.
- A bare single letter at the start of a value is dropped as OCR junk, so a printed `J PAUL` becomes `PAUL` and goes to review.

**To confirm from the layout notes:** the heading words, whether the number has letters (N4), the labels and their order, value on the label's line or the next, whether a suffix has its own label, what a card with no middle name prints, and the labels after the name. `Philippine National ID`, seen on the digital read, isn't accepted as a heading. A Digital National ID with the Filipino heading does pass detection (§11, still open item 4).

**§10 boxes:** none ticked. Each describes behaviour across the scan, staff or phone flow, which later phases build. The parser tests cover only the shared rules underneath them.

**Needs a person or a phone**
1. Run the card check (Prompt 0, step 4) and fill in the layout notes with patterns only. Use your own terminal for any OCR output, and don't paste it into a chat.
2. Get the §11 answers from the adviser, or record who decided otherwise.
3. Written consent for each friend's card, then delete the samples, including gallery, trash and backups.
4. Run Prompt R for this phase in a new chat before Prompt 2.

### Phase 2 — 2026-11-07

**Gates: the owner's instruction, as written.** On 2026-11-06 the owner said: "Skip the Phase 1 review and lift G2 for Phase 2."

- **Prompt R for Phase 1:** not run, on that instruction.
- **G2:** recorded as lifted by the owner, for this phase.
- **G1:** **still not met.** No adviser answers are recorded in §11.
- **Layout notes:** **still blank.** Everything here runs on invented text that follows §6, so these tests don't show that a real National ID reads.

**Added**
- `backend/prisma/migrations/20261106100000_id_document_type_national_id/`: `ALTER TYPE` only.
- `backend/test/identity-verification/id-national.spec.ts`: 70 tests through the real scan, registration, consent and staff flows, with OCR stubbed.

**Changed**
- `backend/src/identity-verification/identity-verification.service.ts`: scan takes its parsers, wrong-card code and phone-reading check from `ID_DOCUMENT_RULES`, saves and returns `documentType`, and names the chosen ID in its messages. Claim writes the row's consent type and audits the type. Withdrawal covers all ID consent types. The account check stays unfiltered by type.
- `backend/src/identity-verification/identity-verification-review.service.ts`: reads `NOT_NATIONAL_ID`; the queue returns `documentType` and `hasCardNumber`; a wrong-card reason that doesn't fit the row's type is 400; lookup parses and filters by type; approve takes `cardNumber` per §7 and maps `P2002` to 409.
- `backend/src/identity-verification/dto/id-scan.dto.ts`, `dto/id-review.dto.ts`, `identity-verification.controller.ts`, `identity-verification-admin.controller.ts`: the new fields and their validation.
- `backend/src/consent/consent.service.ts`: either ID consent routes to the erasing withdrawal.
- `backend/src/identity-verification/philhealth-ocr.service.ts` moved to `id-ocr.service.ts`; `PhilhealthOcrService` is now `IdOcrService`, with `identity-verification.module.ts` updated.
- `backend/src/users/users.service.ts`, `backend/src/auth/auth.service.ts`: messages that can reach a National ID holder no longer name PhilHealth.
- Comments only, where they'd now be false: `backend/prisma/schema.prisma` (plus the enum value), `backend/src/auth/dto/register.dto.ts`, `backend/src/config/config.validation.ts`, `backend/src/incidents/incidents.service.ts`, `backend/src/jobs/processors/identity-verification.processor.ts`, and others in `backend/src/identity-verification/`.
- `shared/src/validation/id-document-rules.ts`, `shared/src/constants/identity-verification.ts`: see Deviations.
- `backend/test/identity-verification-release.e2e-spec.ts`: a National ID block on real PostgreSQL, 7 tests.

**Migrations:** 36 → 37, applied to the dev and e2e databases. `migrate status` is up to date. **Dependencies:** none.

**Inventory:** the shared rules, types and `NOT_NATIONAL_ID` existed from Phase 1 and were extended. Everything else in this phase was missing.

**Tests**

| Suite | Before | After |
|---|---|---|
| Backend | 1741 | 1811 |
| `auth-phase3` alone | 59 | 59 |
| Identity-verification specs (within backend) | 204 | 274 |
| e2e | 19 in 3 suites | 26 in 3 suites |
| Frontend | 199 | 199 |
| Mobile | 212 | 212 |

Backend, frontend and mobile typecheck clean.

- **e2e:** `transport-flow` fails now and then when the suites run in parallel. It failed in the baseline run before this phase's code, and in 1 of 2 parallel runs at the end. At the end it passed alone, and the whole suite passed 26/26 both in band and in the other parallel run. The cause wasn't found: the error text wasn't captured.
- **Deliberate breaks:** 55 one-line breaks, each run against `id-national.spec.ts`. 54 are caught. The first pass caught 52, and the 3 survivors were:
  - **Number read from any card: a real gap, now closed.** The PhilHealth pattern accepts any unspaced 12 digits, so only the card check stops a PhilSys Number being stored as a PIN on a review scan. 2 tests added.
  - **Too-long approval number: a real gap, now closed.** The old test used text the parser refuses anyway. It now also sends a valid number padded past the limit.
  - **Name read from any card: can't be caught, because it changes nothing.** On a wrong card the number is always null, so the scan is either refused or sent to review, and a review neither stores nor returns the name.
- **Interrupted run:** the first break run was killed and left the `@IsIn` line missing from `IdCardLookupDto`. The hash check found it, the line was restored, and all 13 files match their hashes.

**Existing tests changed**
- Added keys only: `id-scan-endpoint`, `id-review`, `id-register`, `id-rescan` (`documentType` in the expected responses and audit values).
- Rename only: `id-cleanup-and-ocr`, `id-test-kit`, `emergency-flow-id-required`.
- None deleted, skipped or loosened.

**Deviations**
- `ID_DOCUMENT_RULES` gained `label`, `numberPrompt` and `approvalNeedsNumber`, and `DEFAULT_ID_DOCUMENT_TYPE` was added, so per-type choices stay in the lookup.
- `wrongCardCode` was narrowed to the two wrong-card codes.
- `documentType` and `hasCardNumber` are now required, as the Phase 1 log asked.
- A `cardNumber` sent when none is needed is ignored and never stored.
- The OCR log text is now generic.
- The wrong-card message now reads "Scan the front of your X, or choose a different ID", no longer "Only a PhilHealth ID can be used".

**Temporary, until later phases**
- The app sends no `documentType` until Phase 3, so every real scan is still PhilHealth.
- The review drawer still offers "Not a National ID" on PhilHealth rows until Phase 4. The server now refuses it with a 400, which closes the Phase 1 gap on the server side only.

**§10 boxes:** ticked only where the tests prove the server behaviour. They use invented text, so none of them shows a real card reads. Left open:
- Chooser, changing the chosen ID, and the Privacy & Consent card: Phase 3.
- National ID scan to home: the server steps are tested except the OTP, which no National ID test checks, and the full flow needs a phone.
- Other card scanned: the server code is tested; the on-device check and "Choose a different ID" are Phase 3.
- Review queue: the API and the 400 are tested; showing the type on screen is Phase 4.
- Printed ePhilID and the PH-xx regression: need a person.

**Needs a person or a phone**
1. Restart the backend so it loads the new code.
2. Everything still listed under Phase 1, "Needs a person or a phone", items 1–3: the card check and layout notes, the §11 adviser answers, and written consent and sample deletion.
3. Decide on Prompt R for this phase before Prompt 3. The owner's skip covered the Phase 1 review only.

### Phase 3 — 2026-11-07

**Gates: the owner's instruction, as written.** Asked whether to run Prompt R for Phase 2, the owner replied on 2026-11-07: "skip it and proceed with prompt 3". It ran in the same chat as Phase 2, on that instruction.

- **Prompt R for Phase 2:** not run, on that instruction. Phases 1 and 2 have both had no independent review.
- **G1:** **still not met.** No adviser answers are recorded in §11, so the National ID consent text isn't the adviser's wording.
- **Layout notes:** **still blank.**

**Added**
- `mobile/src/components/registration/IdScanStep.tsx` (moved from `PhilHealthIdStep.tsx`): the `id_choose` state, `documentType` and `onDocumentTypeChange` props, and "Choose a different ID" on intro and retry. Changing ID clears the consent tick, the attempt count and the last reason.
- `mobile/src/services/id-scan/id-scan.ts` (moved from `philhealth-scan.ts`): `documentType` through `processIdImage`.
- `mobile/src/services/id-scan/__tests__/id-scan.test.ts`: 10 tests that the chosen type reaches the phone's check and the upload, with native modules stubbed.

**Changed**
- `mobile/src/lib/id-verification.ts`: `localReadVerdict(text, documentType)` through `ID_DOCUMENT_RULES`; `NOT_NATIONAL_ID` in `IdScanFailureReason`, `scanFailureFromError` and `countsAsAttempt`; `retryMessageKey(reason, documentType)`; a new `idConsentCard`.
- `mobile/src/services/api/auth.api.ts`: `documentType` in the upload.
- `mobile/app/auth/registration.tsx`, `mobile/app/profile/id-verification.tsx`: hold `documentType`; go to `id_choose` after the geo-fence; `ID_SCAN_EXPIRED` and Scan again return to `id_intro` with the type kept; the badge and the already-registered message follow the type.
- `mobile/app/profile/privacy.tsx`: checks both consent types, shows one card, and invalidates both on withdrawal. Medical consent untouched.
- `mobile/src/i18n/translations.ts`: every new or reworded string in `en` and `fil`. Per-ID sentences live in `idDocument`, keyed by type.
- `mobile/app.json:37,59`: "scan your ID". `NameFields.tsx`, `id-status-card.tsx`, `id-verification.api.ts`: comments only.
- `mobile/src/lib/__tests__/id-verification.test.ts`: see Tests.

**Removed**
- `mobile/app/dev/id-scan-spike.tsx` and its profile row, as Prompt 3 says. **The card check it was built for is still open.** To run it, restore the screen with `git show 9f790be:mobile/app/dev/id-scan-spike.tsx` and the row from `9f790be:mobile/app/profile/index.tsx`.

**Migrations:** none (37, up to date). **Dependencies:** none. **No dev-client rebuild:** JavaScript only.

**Inventory:** everything in this phase was missing except the shared rules from Phase 1, which were used as they are. `shared/`, `backend/` and `frontend/` weren't changed.

**Tests**
- Mobile 212 → 241, all passing, in 18 suites (+1). Mobile typecheck clean.
- Backend and frontend not re-run: nothing they use changed. Last counts are in Phase 2.
- A production Android bundle (`expo export`) compiled to Hermes, with the chooser text in it and no trace of the spike route. That shows the moves and imports resolve, not that the screens work. No lookbehind in the shared rules.
- **Deliberate breaks:** 36 one-line breaks to the verdict, failure mapping, attempts, messages, Privacy card, scan service, upload and text, each restored byte for byte (hashes compared). All 36 caught the first time.
- **Not tested at all, because screens have no component tests:** the chooser, clearing state on changing ID, the type held across chooser, scan, form and rescan, the Privacy screen's queries, and the emergency button's place on each step. These rest on typecheck and reading the code until a phone check.

**Existing tests changed**
- Added arguments only: `localReadVerdict(..., 'PHILHEALTH')`, and the `retryMessageKey` check now runs for each ID.
- Added values only: `NOT_NATIONAL_ID` in `ALL_REASONS`, the error table and the expected attempts list.
- None deleted, skipped or loosened.

**Deviations**
- **The form's helper and match text say "your ID" rather than naming the card.** Prompt 3 step 5 says they follow the type; §4.2 says to reword to "your ID" where that reads fine. It never names the wrong card, and a test holds this. The badge does name the card.
- `idConsentCard` is new, so the card's wording can be tested. Someone holding both consents gets one card naming both IDs, which the plan didn't specify. Single-ID wording for PhilHealth is unchanged, and a test pins it.
- `idChooseNeitherSignedIn` is new: "can't create an account yet" is false for someone scanning from their profile.
- `idOnlyPhilHealth` became `idAcceptedIds`. `idIntroTitle`, `idWhatWeRead`, `idConsentLabel`, `idScanBtn`, `idScannedBadge`, `idScannedBadgeNoPin` and `idReviewBadge` moved into `idDocument`.
- The wrong-card messages now read "Scan the front of your X, or choose a different ID", matching Phase 2's server text.
- **A bug the self-check found:** registration and the profile rescan both showed the PhilHealth "already linked" message directly, whichever ID was scanned. Both now use `retryMessageKey`. These two screen lines have no test.

**Temporary, until later phases**
- **Staff can't approve an unread National ID from the web until Phase 4:** the drawer has no number input, so the server's 400 stands. Such a citizen stays under review and can still sign in and send an SOS.
- The staff lookup has no ID type picker until Phase 4, so it only finds PhilHealth IDs.
- `privacy.tsx` stays English only, as it was.

**§10 boxes:** none newly ticked. The tests cover the rules underneath them, and each open box needs a phone, a person or a later phase.

**Needs a person or a phone**
1. Restart the backend. **An app with this code gets a 400 from a backend still running the old code**, because it sends `documentType`.
2. `npx expo start -c`, then run the phone checks in this phase's report. Any step using a real National ID goes ahead of G1 (N3), so it's the owner's call and the card holder's written consent. Keep OCR output out of chats.
3. A Filipino speaker should check every new string in `translations.ts`. They were written by an agent.
4. Still open from Phase 1: the card check and layout notes, the §11 adviser answers, and consent and sample deletion.
5. Decide on Prompt R for this phase before Prompt 4.

### Review — 2026-11-07 (Phase 3)

Prompt R, run on the owner's choice in a new chat. **This review read code and ran tests. Nothing ran on a phone, and no real card was used,** so it can't show that the screens work.

**Scope:** Phase 3, plus the Phase 1 and 2 lines that Phase 3 calls and checks b, c and d need. Phases 1 and 2 as a whole still have no independent review.

**Fixed**
1. **An old "scan expired" notice followed the citizen to a different ID.** After an expired scan, choosing another ID showed "Your ID scan expired" on the new ID's intro, for a card they hadn't scanned. Choosing an ID now clears it: `mobile/app/auth/registration.tsx:389`, `mobile/app/profile/id-verification.tsx:177`. Typecheck only, like every screen line: deliberate breaks S11 and S12 survive.
2. **A blank line left by removing the spike row.** `mobile/app/profile/index.tsx` now has no diff from `1a22a45`.
3. **The phone steps were only in the old chat.** The Phase 3 log pointed to "this phase's report", which isn't in the repo. They are now listed below.

**Open, for the owner**
1. **Screens have no test.** Of 12 deliberate breaks to screen lines, the typecheck caught one (S3) and no test caught any. The other 11 are listed under Tests. Only the phone checks below cover them.
2. **The gates were not met, on the owner's instruction.** G1 is unanswered, the layout notes are blank, and Phases 1 and 2 had no review. The parser still rests on §6's memory and invented text.
3. **For the adviser (§11 question 4), the consent text says less than the system does.** It says "What we read: your name and the 16-digit card number", but OCR reads the whole front on the phone and on the server, and the phone uploads everything it read as `clientText` (`mobile/src/services/id-scan/id-scan.ts:140`). The server uses that text only for one comparison (`identity-verification.service.ts:222`), and no store or log of it was found. The intro also doesn't say that a keyed hash, the last 4 digits and the sealed name are kept; only the Privacy card does. The PhilHealth text has the same gap. Text not changed: this is the adviser's call.
4. **The Privacy card can say "We keep" data that's gone.** A staff or 24-hour release erases the card data but leaves the consent `GRANTED` (`identity-verification.service.ts:420`; the only consent writes are `:304` and `:468`). The card then still shows, and after a rescan with the other ID it names both cards. Withdrawal still works. This is existing behaviour that the second ID makes easier to reach. Not changed: choosing a fix is a behaviour decision, and it reaches past this phase.
5. **`transport-flow` e2e failed again in the parallel run, and the error is now captured:** `No TO_FACILITY route cached for the dispatch within 30000 ms` (`backend/test/transport-flow.e2e-spec.ts:193`, called at `:217`). The same 26 tests passed in band straight after. No Phase 3 code is involved. The cause isn't established; suites competing for a shared queue is only a guess, and wasn't checked.

**Checks**

| Check | Result | Evidence |
|---|---|---|
| a. Steps, boxes, gates | Steps 1–9 done. No box newly ticked, correctly. Gates not met, as logged | Files moved with the expected changes only (compared with `9f790be`); step 10's list is now below |
| b. PSN | Pass | Screens hold only `pinLast4`. Server parsers run only for the chosen type (`identity-verification.service.ts`, `isChosenCard`); B5 caught. A 12-digit run is refused on the phone and the server |
| c. Older builds | Pass | Compared with `1a22a45`: same parsers, requestReview rule and stored values; `documentType` added to the response. Reworded messages don't reach old apps: they show their own text by code (`1a22a45:mobile/src/components/registration/PhilHealthIdStep.tsx:246`). B3 and B8 caught |
| d. Consent | Pass on the server | Both paths walked. Holding both consents: `consent.service.ts:27` → `withdrawConsent` → every consent withdrawn and all rows released. A rejected row of the other type is included (`RELEASABLE_STATUSES`). B1 and B2 caught. The Privacy screen's part is untested |
| e. Bugs | One fixed (above) | All codes mapped. The type can't change while a scan is held: the only way to the chooser goes through `resetIdScan`, or `outside`, and the form needs a new scan. So the two `retryMessageKey('ID_ALREADY_REGISTERED', documentType)` lines (`registration.tsx:317`, `id-verification.tsx:127`) are correct. Image deleted after commit, number stored in the decision's update, `P2002` → 409: read in `identity-verification-review.service.ts:315-364` |
| f. Duplication | Pass | No number parsing outside `shared/src/validation`. One per-type condition, `granted.includes('NATIONAL_ID')` (`id-verification.ts:190`), for English Privacy text the rules don't hold: not a ladder |
| g. Privacy | Pass | No `console` or `logger` call in the changed mobile files, and no request-body logging found. Spike removed. No sample in the repo by file name |
| h. Rules | Pass by reading | Emergency button outside the state blocks (`IdScanStep.tsx:354`), so it's on the chooser. No change under `mobile/app/emergency`, `backend/src/emergency-alerts`, dispatch, realtime or analytics. Nothing outside `identity-verification` reads the type. Flag-on e2e passes. Not yet seen on a phone |
| i. Wording | Pass in `en` and `fil` | Every `philhealth` hit read: only per-ID sentences, the accepted-IDs line, codes and comments. A Filipino speaker still has to check the new text |
| j. Tests | Rules strong, screens uncovered | See below. No test weakened: removed lines are renames, or now carry an added key or argument |
| k. Dependencies | Pass | No manifest or lockfile changed since `1a22a45` |

**Tests**

| Suite | Before | After |
|---|---|---|
| Mobile | 241 | 241 |
| Backend | 1811 | 1811 |
| `auth-phase3` alone | 59 | 59 |
| Frontend | 199 | 199 |
| e2e, parallel | 26 | 25 of 26 (`transport-flow`) |
| e2e, in band | 26 | 26 of 26 |

Shared built. Shared, mobile, backend and frontend typecheck clean. 37 migrations, up to date. No test added: the fixes are screen lines, which have no test harness.

- **Deliberate breaks:** 44, one at a time, each restored and its hash compared. Metro and the backend were off. Originals were backed up first, and all 12 files matched afterwards.
- **Caught, 32 of 32:** the phone's verdict, failure mapping, attempts, per-ID messages, Privacy card logic, scan service, image deletion, upload, text (`en` and `fil`), and 8 backend lines for consent, older builds, the type and number storage.
- **Survived tests, 12 of 12 screen lines.** Typecheck caught S3 (the step not passing the type to the scan). It passes the other 11: changing ID keeps the tick; keeps the attempt count; registration skips the chooser; profile skips the chooser; the already-linked message ignores the type on registration and on profile; Privacy shows only PhilHealth; Privacy refreshes one consent; the form's badge ignores the type; the stale notice on registration and on profile.

**Phone checks still needed (Prompt 3, step 10)**

Restart the backend, then `npx expo start -c`. No dev-client rebuild. A step using a real National ID goes ahead of G1 (N3), so it's the owner's call and needs the card holder's written consent. Keep OCR output out of chats.

1. **Chooser:** after the location check, both IDs show, with the "neither" line and "Report an emergency".
2. **National ID happy path:** choose, tick, scan, the type's badge, name matches, OTP, home.
3. **Wrong card, each way:** the message names the chosen ID, with "Choose a different ID" beside it.
4. **Change ID:** after a failed scan, choose a different ID. The tick is off, the attempt count is gone, and the text follows the new ID.
5. **Expired scan (this review's fix):** let a scan expire on the form. The intro shows the notice with the type kept. Choose a different ID, and the notice is gone.
6. **Three failures:** "Send to MDRRMO for review" appears and creates the account under review. Staff can't approve an unread National ID until Phase 4.
7. **Printed ePhilID,** if available: record whether it reads or reaches review.
8. **Guest SOS** from chooser, intro, retry, fallback camera and form, on registration; and from the same steps on the profile's Scan again, where the button goes to the signed-in SOS.
9. **Privacy & Consent:** after a National ID check, the card names the National ID. Withdraw it: the card goes, the profile shows not verified, and sign-in and SOS still work. Repeat for someone holding both consents.
10. **PhilHealth still works:** the same happy path, then the already-linked message on a card already held.
11. **Filipino:** repeat 1–4 in Filipino. A Filipino speaker should check the new strings.

**Prompt 4's gate** is "Phase 3 reviewed", which this meets. The plan's "Done when" for Phase 3 needs the phone checks, which are not done. The owner decides whether to run them first.

### Change — 2026-11-07: second read and failure log (owner's request)

**Why:** on a phone test, a clear, centred, cropped National ID got "We couldn't read your National ID". The owner asked for a more accurate scanner. **This is not a confirmed fix: it hasn't run on a real card, and 100% accuracy isn't achievable with OCR.** G1 is still open, so real-card testing remains the owner's call.

**What the message shows:** it's the server's `UNREADABLE`, so the phone's check passed or couldn't read text, and the failure is in the server's read or the parser. The failed scan stored and logged nothing, so which stage failed is unknown.

**Changed**
- `backend/src/identity-verification/id-ocr.service.ts`: `read(image, layout)`. `block` is Tesseract's default and is what every first read uses. `auto` runs on its own lazily created worker, because a layout setting applies to a whole worker.
- `backend/src/identity-verification/identity-verification.service.ts`: a read that doesn't get the heading, number and name is tried once more with `auto`. The second read counts only if it reads all three; otherwise the first read's refusal stands. A passing first read isn't repeated, and a timed-out one isn't retried.
- The same file logs one line whenever a second read was tried: per read, confidence and yes/no stages, plus whether the phone's own check passed.
- `shared/src/validation/national-id.ts`, `id-document-rules.ts`: `digitRunShapes`, `nationalIdReadSignals`, `readSignals`. Group lengths and yes/no only, never a digit, a name or card text.

**Effect on PhilHealth and older builds:** the same second read applies. Scans that pass first time and refusals are unchanged, but a card that used to be refused can now pass. This changes "exactly as today" (§9) in that one way.

**Evidence, on generated cards with invented data and a layout from memory (no real card):**
- Tesseract's default is `SINGLE_BLOCK`: its results matched explicit PSM 6.
- On a heavy background, every layout failed all 9 raw images. Automatic layout had higher confidence (44 vs 29) and ran faster (0.4 s vs 3.4 s) but passed no more of them.
- A clean-up tuned to these cards recovered the number on all 9. **An untuned clean-up recovered none,** so this gives no case for adding an image library yet. Tesseract's built-in thresholding didn't help, and adaptive Otsu did worse on easy images.
- No wrong card number was accepted in any run. Some names misread or lost a part, which the name check or staff review would have to catch.
- **So the second read may not fix the reported failure.** The log line's job is to show what will.

**Tests:** written first; 11 failed before the code existed.

| Suite | Before | After |
|---|---|---|
| Backend | 1811 | 1843 |
| `auth-phase3` alone | 59 | 59 |
| Mobile | 241 | 241 |
| Frontend | 199 | 199 |

- All typechecks clean. No migration or dependency.
- **e2e:** 26 of 26, four runs in a row, after the `transport-flow` fix below. An earlier note here said the e2e suites share the dev backend's Redis. That was wrong: they use Redis database 15 (`backend/test/e2e/e2e-database.ts`), and the dev backend uses database 0.
- **Deliberate breaks:** 27, applied in memory inside Jest's transform, so no source file changed while the backend ran in watch mode (hashes compared). 24 caught at first; the 3 survivors got tests and are now caught.
- **`administration/health.spec.ts` failed once** in a full run (`not.toContain('917')`), then passed alone and in the next full run. It's intermittent and the cause isn't established. Nothing here touches that code.

**`transport-flow` e2e, the failure in the Phase 3 review's open item 5: fixed.** It's a clash between test suites, not a product or ID bug. `transport-flow` and `emergency-flow-id-required` share Redis database 15, and each runs a real ETA worker. The emergency suite's fake router returns no route, and a job that gets no route completes without being queued again (`eta-refresh.processor.ts:141`), so if that worker takes the transport test's job, the route never arrives.

| Run | Result |
|---|---|
| `transport-flow` + emergency suite, parallel | 3 of 4 failed, all with this error |
| `transport-flow` + release suite, parallel | 0 of 4 failed |
| All three, in band | 26 of 26 |

The pairing is measured. Which worker took the job was read from the code, not traced in a run. **Fix:** `test:e2e` in `backend/package.json` now passes `--runInBand`, because the suites also share one Postgres database. Four runs after the fix: 26 of 26 each, 29–52 s. No product code changed.

**Next:** restart the backend, scan once, and read the `ID scan needed a second read` line. It's safe to share, and it decides the next step:

| The line shows | Means | Next step |
|---|---|---|
| `outcome=second read passed` | The layout was the cause | Repeat on more cards |
| `card=false`, `heading=false`, low `conf`, `digitRuns=none` | OCR can't see through the card's print | Image clean-up (a new dependency, needs approval) |
| `heading=true`, `number=true`, `name=false`, `labels=none` or partial | The parser's labels don't fit the real card | Fix the parser, and fill in the layout notes |
| `digitRuns` is close to but not `4-4-4-4` | Digits misread or split | Look at number handling, without guessing digits |
| `phone=read` while both server reads fail | The phone reads what the server can't | Owner decision: "the server decides" is rule A3, and trusting the phone would weaken it |

### Change — 2026-11-07: combining reads, after testing more cards

**What the owner's test showed.** One National ID passed. Other cards failed; the owner named a Digital National ID and a different card, but the log doesn't say which scan was which. All 7 log lines, patterns only:

| Time | Phone | First read found | Second read found | Outcome |
|---|---|---|---|---|
| 5:28:15 | read | heading, number | little (6 lines) | Unreadable |
| 5:29:07 | read | heading | name | Unreadable |
| 5:29:52 and 5:30:04 (identical) | read | heading; digits `1-4-4` | name | "Not a National ID" |
| 5:30:21 | read | heading, number | heading, name | Unreadable |
| 5:30:53 | read | one heading word; digits `4-4-4` | digits `4-4-4` | "Not a National ID" |
| 5:31:35 | read | number, two heading words | little | "Not a National ID" |

- **The phone read every scan and the server read none,** so server Tesseract is the weak link on these cards. First-read confidence was 34–55.
- **Automatic layout usually had higher confidence but found fewer parts.** It often kept the name and lost the number, so it isn't a better read, only a different one.
- **A `4-4-4` run was seen and refused.** Whether it's a PhilSys Number or part of a card number is unknown. If it's a card's front, it bears on §6 and the layout notes.

**Changed**
- `shared/src/validation/id-document-rules.ts`: `combineIdReads`. Two reads of one image can complete each other, using only the chosen ID's parsers. The heading must appear in some read. Two different numbers trust neither. The most confident read's name wins, and the typed-name check still applies. `hasHeading` added to the rules.
- `identity-verification.service.ts`: uses it. A read that saw the heading now gives `UNREADABLE`, not the wrong-card code, which applies to PhilHealth and older builds too; their apps show their own "couldn't read" text.
- `shared/src/validation/national-id.ts`: `hasNationalIdHeading` accepts the two Filipino words apart, not the English ones, since other IDs print those.
- Log additions: `phoneNumberSeen` and `phoneNameSeen` (how much of the phone's reading the server's reads back up, as counts), `conflict`, `nameValues`, `endedBy`, and heading words as short codes. **They never change an outcome:** the server still decides from its own reads, and a test holds this.

**Expected effect: small.** Applied to the 7 scans by reading the log, combining would rescue only 5:30:21, and the wording fix would change only 5:29:52 and 5:30:04. So this doesn't solve the problem. Not yet re-run on these cards.

**Existing test changed (Phase 2, `id-national.spec.ts`, "a 16-digit run under PhilHealth…"):** it pinned the bug, expecting a wrong-card code when the heading was read but the number wasn't. It now expects `UNREADABLE`. Its refusal and nothing-stored checks stay, and a 422 check was added.

**Tests**

| Suite | Before | After |
|---|---|---|
| Backend | 1843 | 1868 |
| `auth-phase3` alone | 59 | 59 |
| e2e | 26 | 26 |
| Mobile | 241 | 241 |
| Frontend | 199 | 199 |

All typechecks clean. No migration or dependency. Deliberate breaks: 27 in memory, no source touched; 26 caught at first, and the survivor (reads not ordered by confidence) now has a test. `id-register.spec.ts` hit Jest's 5-second limit once in a full run, in a registration test that never reaches the scan code. It passed alone and in the next full run.

**Open, for the owner**
1. **How to close the gap between phone and server.** Options, with a recommendation in that day's report: the phone proposes and the server confirms, sending such scans straight to staff review, image clean-up (a new dependency), or trusting the phone. A cloud service was already ruled out (D3). The new counts show whether the first can work.
2. **The Digital National ID is out of scope (§12), and whether it should pass is still open (§11, owner item 4).** It's now being tested, so this needs deciding.

### Phase 4 — 2026-11-09

**Gate:** Prompt 4's gate is "Phase 3 reviewed", and that's met (Review, 2026-11-07). The rest is unchanged: **G1 is unanswered, the layout notes are blank,** Phases 1 and 2 have had no review, and the Phase 3 phone checks aren't recorded as done. The two open decisions in "combining reads" (closing the phone/server gap, the Digital National ID) are still open, and nothing here depends on them. Baseline: `482f46c`, clean tree.

**Changed** (frontend only)
- `frontend/features/identity-verification/format.ts`:
  - `idDocumentLabel`, read from `ID_DOCUMENT_RULES[type].label` so staff and server name the ID the same way.
  - `reviewReasonLabel` now maps both wrong-card codes through the rules' `wrongCardCode`, not an `if` per code.
  - `reviewCheckHint(reason, documentType)` names the expected card. For a National ID it says a legible printed ePhilID may be approved (N1), and it points to the matching wrong-card reason.
  - `rejectionReasonsFor(type)` keeps the type's own wrong-card reason and drops the other type's.
  - `needsCardNumberToApprove(item)` is true for a pending check whose rules need a number and that has none stored.
  - `CARD_NUMBER_FIELD` holds the per-type label, fake example and PhilSys warning.
  - `approveErrorText` gives the 400 text, and tells 409 `ID_ALREADY_REGISTERED` apart from a plain 409.
- `frontend/features/identity-verification/api.ts`, `hooks.ts`: `approveIdReview(id, cardNumber?)` sends the number in the body only when one is given. `findIdCardHolder(pin, documentType)`. `useApproveIdReview` is now `gcTime: 0`, as `useFindIdCardHolder` is.
- `frontend/components/admin/IdReviewQueue.tsx`:
  - An "ID" column, and an "ID the citizen chose" line in the drawer. The drawer title and the image's alt text follow the type.
  - The rejection list is filtered by type.
  - When `needsCardNumberToApprove`, the drawer shows a card-number input labelled with the 16-digit number on the front, plus the PhilSys Number warning. Approve stays disabled until the input has text.
  - The typed number is cleared from state as soon as it's sent, and the mutation is reset afterwards, so its variables don't keep it. It's also cleared on choosing Reject.
  - Messages: 400 asks for the right number; 409 `ID_ALREADY_REGISTERED` says the card is held elsewhere and nothing changed; a plain 409 keeps "Someone else already decided this check". A 400 on reject says the reason doesn't apply to this ID.
- `frontend/components/admin/IdCardRelease.tsx`:
  - A type picker that defaults to `DEFAULT_ID_DOCUMENT_TYPE` (PhilHealth). The label, placeholder and warning come from `CARD_NUMBER_FIELD`.
  - The 400 text uses the rules' `numberPrompt`, and the 404 text names the ID.
  - Changing type clears the typed number, the result and both mutations. The number is still cleared after every lookup.
- Wording: `frontend/app/(ops)/administration/id-reviews/page.tsx` (description), plus the error and empty texts in the queue. Comments only: `frontend/lib/role-access.ts` and `frontend/features/incidents/api.ts:186` (the reporter's ID check is no longer PhilHealth only; nothing there reads the type).

**Migrations:** none (37). **Dependencies:** none. **Not changed:** `shared/`, `backend/`, `mobile/`. So their suites weren't re-run, and the e2e run in Part C D3 was skipped.

**Inventory:** everything was missing except the `NOT_NATIONAL_ID` rejection label (Phase 1), which was used as is. The backend contracts (`documentType` on `find-by-pin`, `cardNumber` on approve, the 409 code) came from Phase 2 and were used unchanged.

**Tests**

| Suite | Before | After |
|---|---|---|
| Frontend | 199 in 18 suites | 212 in 18 suites |
| `id-review-format.spec.ts` | 9 | 22 |

Frontend typecheck clean. Backend, mobile and shared were not touched; their last counts are in "combining reads".

- **Existing tests changed:** added argument only. The three `reviewCheckHint` calls in "gives a review hint for every reason kind" now pass `'PHILHEALTH'`. Nothing was deleted, skipped or loosened.
- **Deliberate breaks:** 15, all caught on the first run. Each was applied to a scratch copy of `format.ts` that Jest was pointed at, so the repo file never changed (hash compared before and after) and a running `pnpm dev` never saw a break. They cover the reason filter (2), the needs-a-number check (3), the 400 and 409 texts (2), the wrong-card label (2), the hint (3), the number field (2) and the type label (1).
- **Not tested, because frontend Jest has no DOM:** the column, the drawer line, the input appearing, Approve staying disabled, clearing the input, the filtered list on screen, the type picker and its reset. These rest on typecheck and reading the code until the hand checks below.

**Deviations**
- **Approve is reset after each try.** `gcTime: 0` alone keeps the typed number in the mutation's `variables` while the drawer is open. The error is copied to state first, so it still shows.
- **Rejection reasons and the number field are lookups in `format.ts`** (`EXPECTED_IMAGE`, `CARD_NUMBER_FIELD`), not new fields on `ID_DOCUMENT_RULES`. They are staff-page English, and the server doesn't use them. Labels, prompts, wrong-card codes and `approvalNeedsNumber` still come from the shared rules.
- **The name-mismatch hint now names the expected card** for both IDs. The existing assertion (`/typed name/`) still holds.
- **The release lookup keeps its old pattern:** `find` isn't reset after each lookup, because its error is shown afterwards. Its `variables` hold the typed number until the next lookup, a type change or leaving the page. This is the same as before this phase, with `gcTime: 0`. *(Fixed in the review below.)*

**§10 boxes:** none newly ticked. "Review queue shows the type" is built, but nobody has seen it on screen yet. Its 400 half has been server-tested since Phase 2.

**Needs a person: web hand checks**

Restart `pnpm dev` first. Sign in as an MDRRMO Org Administrator or a System Administrator. For checks 2–6 you need a National ID check under review with no number read: on the phone, choose National ID, fail 3 scans, then send it for review. Use invented numbers only, and never a real PhilSys Number.

1. **Page:** the description names both IDs. The queue has an ID column.
2. **National ID drawer:**
   - The title says "National ID check", and the "ID the citizen chose" line shows.
   - The hint mentions the printed ePhilID.
   - The card-number input has the 16-digit label and the PhilSys warning. Approve stays disabled until something is typed.
3. **400:** type a 12-digit number and approve. The message asks for the 16-digit number, the input is empty, and the row is still pending.
4. **409:** type the card number of a National ID already verified on another account. The message says it's already linked and nothing changed, and the row is still pending.
5. **Approve:** type an unused 16-digit test number. The check is approved and the image deleted. Then Find account with National ID and that number shows this account. The audit row for the approval has no number.
6. **Reject list:** on a National ID row it offers "Not a National ID" and not "Not a PhilHealth ID". A PhilHealth row is the reverse.
7. **PhilHealth row:** no number input, and Approve behaves as before.
8. **Card release:**
   - The picker starts on PhilHealth ID, with the old placeholder.
   - Switch to National ID: the label, placeholder and warning change, and a typed number is cleared.
   - A 12-digit number gives the 16-digit message. An unknown number gives "No account holds this National ID".
   - The number clears after each lookup.
9. **Roles:** a non-MDRRMO user still can't open the page.

**Still open:** everything in Phase 3's "Needs a person or a phone", the two decisions in "combining reads", and Prompt R for this phase.

### Review — 2026-11-09 (Phase 4)

Prompt R, run at the owner's request **in the same chat that built Phase 4.** It is not the independent review Prompt R asks for: the reviewer had seen the code being written. It read code and ran tests. **Nothing was checked in a browser.**

**Fixed**
1. **The card lookup kept the typed number in the query cache while the page was open.** In TanStack Query 5.103.1, `gcTime: 0` only removes a mutation once nothing is watching it, and `MutationObserver.reset()` is what stops the page watching it (read in `query-core`). So `IdCardRelease` now copies the lookup error into its own state and resets `find` after each lookup, as the approve panel already did. This existed before this phase, but Prompt R check g asks for it. `frontend/components/admin/IdCardRelease.tsx`, `onFind`.
2. **The 409 message sent staff to the wrong place.** It said "Look up who holds it below", but the panel covers the page, and the lookup starts on PhilHealth ID. A 16-digit number typed there gets the 12-digit error. It now says to close the panel and use "Find account" with the ID chosen. A test pins this (`format.ts`, `approveErrorText`).
3. **The ID picker could change while a release was being sent.** The new type's view would then show "Released". The picker is now disabled during a release as well as a lookup.
4. **Test gaps that didn't need a DOM.** A new `frontend/__tests__/id-verification-api.spec.ts`, 4 tests:
   - approve sends the typed number in the body and never the URL, and an empty body without one, as before;
   - the card lookup sends the chosen type;
   - both hooks that carry a number use `gcTime: 0`. `useMutation` is stubbed to return its options, which needs no new dependency.

**Checks**

| Check | Result | Evidence |
|---|---|---|
| a. Steps, boxes, gates | Steps 1–5 done. No box newly ticked, correctly. Gate met | Phase 4 section; the "Review — 2026-11-07 (Phase 3)" section |
| b. PSN | Pass | The web pages parse nothing. The server parses by the row's type (approve) or the chosen type (lookup), in `identity-verification-review.service.ts` (`cardToHold`, `findCardHolder`). The National ID field and the lookup both warn about the PhilSys Number |
| c. Older builds | Pass | Compared with `1a22a45`: approve sent `{}` and still does when no number is needed. The lookup sent `{ pin }` and now sends `{ pin, documentType }`, where `'PHILHEALTH'` is the server's default. Pinned by the new spec |
| d. Consent | Not affected | Phase 4 changes no consent code. Phase 3's review walked both paths |
| e. Bugs | Fixes 1–3 | All codes mapped (`reviewReasonLabel` goes through the rules' `wrongCardCode`). The typed number is cleared on send, on choosing Reject and on closing the panel (it unmounts). The 409 code is read from `ApiError.body.code` (`frontend/lib/api.ts:61`) |
| f. Duplication | Pass | No parsing in the frontend. ID labels, prompts, wrong-card codes and `approvalNeedsNumber` come from `ID_DOCUMENT_RULES`. Each new name is defined once |
| g. Privacy | Pass after fix 1 | No `console` or logging in the changed files or `frontend/lib/api.ts`. Numbers go in bodies only. Server messages and audit carry no number (Phase 2) |
| h. Rules | Pass | Nothing outside the ID files reads `documentType`. The one `features/incidents/api.ts` change is a comment. No SOS or dispatch code touched |
| i. Wording | Pass | Every `philhealth` hit read: per-type labels, tests, and comments naming both IDs |
| j. Tests | Helpers strong, screens mostly uncovered | See below |
| k. Dependencies | Pass | No manifest or lockfile changed |

**Tests**

| Suite | Before | After |
|---|---|---|
| Frontend | 212 in 18 suites | 217 in 19 suites |

Frontend typecheck clean. Backend, mobile and shared were untouched, so they weren't re-run.

- **Helper breaks** (`format.ts`, applied to a scratch copy): 16, all caught. These are the 15 from Phase 4, plus the old 409 wording.
- **Screen and request breaks:** 18, applied in place with no dev server running. Every file was restored byte for byte (hashes compared).
  - **Caught by typecheck (2):** calling the hint without a type; a lookup with no type.
  - **Caught by the new spec (3, after the fix):** the API dropping `documentType`; the API dropping `cardNumber`; approve losing `gcTime: 0`. A fourth break, the lookup losing `gcTime: 0`, was also caught.
  - **Survived (13), covered only by the hand checks:**
    - Approve enabled with no number; the input shown on every row; the number never sent from the panel.
    - The typed number not cleared after approve; the approve mutation not reset.
    - The reject list not filtered; the hint ignoring the type; the 409 code ignored; the ID column blank.
    - The lookup always using PhilHealth; changing type keeping the number; the lookup mutation not reset; the number kept after a lookup.

**Open, for the owner**
1. **Not independent.** For a separate reviewer, run Prompt R again in a new chat.
2. **Screens have no automated test.** 13 of 18 screen breaks survive. Only the Phase 4 hand checks cover them, and they haven't been done.
3. **The web and the backend must ship together.** The queue reads `documentType` from every row. A backend older than Phase 2 doesn't send it, and the queue would fail to render. Both are in `482f46c` and later, so a normal deploy is fine. No fallback was added: it would hide a mismatched deploy rather than fix it.
4. Unchanged from earlier: G1, the layout notes, the Phase 3 phone checks, and the two decisions in "combining reads".

---

## 10. Test checklist

- [ ] Chooser shows both IDs. "Report an emergency" works from the chooser and every later ID step.
- [ ] National ID: scan → typed name matches → account created, `document_type = NATIONAL_ID`, `identity_verified_at` set, OTP sent, image deleted.
- [x] A scan with no `documentType` (older build) behaves exactly as today, as PhilHealth.
- [x] Unknown `documentType` → 400.
- [ ] National ID chosen, other card scanned → refused, on a normal phone by the on-device check, otherwise `NOT_NATIONAL_ID`. Both layers show "Choose a different ID".
- [x] PhilHealth chosen, National ID scanned → refused. A PCN is not stored as a PIN.
- [x] **A 12-digit number on a scan or typed by staff is never accepted as a National ID number. No PSN is stored anywhere.**
- [ ] Changing the chosen ID clears the consent tick and the attempt count.
- [x] Same National ID on a second phone number → `ID_ALREADY_REGISTERED`.
- [x] **One person, both cards, two phone numbers → two accounts, by design (§11 N2). A test records this.**
- [x] An account holding a check on one type can't claim a scan of the other type.
- [x] National ID consent recorded as `ID_VERIFICATION_NATIONAL_ID`.
- [x] **Withdrawing National ID consent erases card data and un-verifies. The card is free again; the account isn't blocked.**
- [x] Someone rejected on one type who verified on the other: withdrawal withdraws both consents and erases both rows.
- [ ] Privacy & Consent shows the withdrawal card for either type, naming the right ID.
- [x] Release, expiry and the 24-hour unconfirmed-phone rule work on National ID rows.
- [ ] Review queue shows the type. A wrong-card rejection that doesn't fit the type → 400.
- [x] Approving an unread National ID review scan without a number → 400; with a 12-digit number → 400; with a number already held → 409 and nothing changes; with a free number → approved, and that card is now held.
- [x] Staff lookup by type; audited without the number.
- [x] Logs, audit rows, queued jobs and SMS contain no PCN, OCR text or card name.
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
