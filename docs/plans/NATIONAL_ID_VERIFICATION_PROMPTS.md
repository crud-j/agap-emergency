# AGAP — National ID Verification: Implementation Prompts

**Companion to:** [NATIONAL_ID_VERIFICATION_PLAN.md](NATIONAL_ID_VERIFICATION_PLAN.md) (the "plan")
**Prepared:** 2026-11-06 · **Baseline:** `main` @ `1a22a45`
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
   `#file:docs/plans/NATIONAL_ID_VERIFICATION_PROMPTS.md #file:docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md #file:CLAUDE.md`
   **Claude Code:** paste the prompt as is. It reads `CLAUDE.md` automatically and the prompt names the other two files.
3. Paste the prompt's fenced block unchanged.
4. When the agent asks to run commands: **allow** tests, typecheck, `pnpm build` in `shared`, `pnpm prisma migrate deploy`,
   `pnpm prisma generate`, and read-only git commands (`git show`, `git diff`, `git grep`, `git status`). **Deny** `pnpm add`, `migrate dev`, `migrate reset`,
   `git commit`, `git push`, `git add`, `git mv`, `git stash`, `git checkout .`, `git reset`, `rm -rf`, and anything that opens `backend/.env`.
5. When it reports and stops, read the report. Then run **Prompt R** for that phase in a new chat before the next phase.
6. If a chat dies halfway, start a new chat with the **same** prompt. Part C step A makes the agent find what exists and finish it.
7. You commit. The agent never commits.

| Order | Prompt | Gate before starting | Who does what |
|---|---|---|---|
| 1 | Prompt 0: Spike tools | none | Agent builds the tools |
| 2 | Adviser review | Plan §11 questions sent | **You** get answers and record them in plan §11 (**G1**) |
| 3 | Card check | **G1 met** | **You** scan sample cards and fill in the layout notes. Can run alongside PhilHealth's card check. |
| 4 | Prompt R (Phase 0) | Layout notes filled in | |
| 5 | Prompt 1: Shared rules | Phase 0 reviewed **and G2 met** (PhilHealth finished, or you lifted it in the Progress log) | Agent |
| 6 | Prompt R (Phase 1) | | |
| 7 | Prompt 2: Backend | Phase 1 reviewed | Agent |
| 8 | Prompt R (Phase 2) | | |
| 9 | Prompt 3: Mobile | Phase 2 reviewed | Agent; **you** test on a real phone |
| 10 | Prompt R (Phase 3) | | |
| 11 | Prompt 4: Admin | Phase 3 reviewed | Agent; **you** check the web pages |
| 12 | Prompt R (Phase 4) | | |
| 13 | Prompt 5: Docs and readiness | Phase 4 reviewed | Agent; **you** run hand checks and rehearse |
| 14 | Prompt R (Phase 5) | | |

Phases must run in order. Each depends on the one before.

---

# Part A — Context briefing

## A1. The system

AGAP is an emergency alert and dispatch system for the Bocaue MDRRMO (Bocaue, Bulacan). It is a **pnpm monorepo**:

| Package | Stack | Notes |
|---|---|---|
| `backend/` | NestJS, Prisma → PostgreSQL + PostGIS, Redis + BullMQ | One API server. Routes `/api/v1/...` |
| `frontend/` | Next.js + React, Tailwind, TanStack Query | Operations Center and admin web |
| `mobile/` | Expo + React Native, Expo Router | Citizen and responder app. **Expo dev build**; Expo Go can't run its native modules |
| `shared/` | TypeScript | Used by all three. **Backend and frontend read the compiled `shared/dist`**: after editing `shared/src`, run `cd shared; pnpm build` and restart dev servers |

## A2. What we are building

Citizens can already create an account only after scanning a **PhilHealth ID** (built: `docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md`). This work adds a **chooser**, so they can scan a **Philippine National ID** instead. Same scanner, server OCR, name match, staff review and claim logic. New: parsers, a document type passed through every layer, a second consent type, per-type text, and a card number staff type when approving an unread National ID. Full detail: the plan, §3–§8.

## A3. Rules that override convenience

- **The PhilSys Number (PSN) is never read, stored, typed, logged or returned.** Only the 16-digit PhilSys Card Number (PCN) from the front. The PSN is reported to be **12 digits, the same length as a PhilHealth PIN**, so "12 digits" must never count as a National ID number.
- **Guest emergency reporting is never blocked** (rule 14). "Report an emergency" stays on every ID step, the chooser included. Nothing here touches `registerGuest` or the SOS flow.
- **An account under review can still sign in and send an SOS.**
- **The ID label is information only.** It never changes priority, recommendations or dispatch (rule 8). It applies to the reporter, never the patient.
- **Never log, return or send** a full card number, OCR text, names read from the card, or the image. The API returns only `pinLast4`, plus `nameOnId` from the scan endpoint.
- **The server decides.** Text read on the phone is a UX hint.
- **Older app builds keep working.** A scan with no `documentType` is a PhilHealth scan, unchanged.
- **Withdrawing either consent must erase the card data.** Missing this fails silently: see plan §5.3.
- **Sample ID images and their text are personal data.** Agents never run tools on real cards, and never ask to see their text.

## A4. Existing code to reuse (do not rewrite)

| Need | Use |
|---|---|
| Name matching, normalisation, full name | `matchIdName`, `normalizeNamePart`, `composeFullName` in `shared/src/validation/philhealth-id.ts`. Unchanged. |
| Name word and suffix helpers | `nameTokens` and the suffix check in the same file. Export them; don't copy them. |
| Scan, claim, release, withdrawal, cleanup | `backend/src/identity-verification/identity-verification.service.ts` |
| Staff review and lookup | `backend/src/identity-verification/identity-verification-review.service.ts` |
| OCR | `backend/src/identity-verification/philhealth-ocr.service.ts` (generic in all but name) |
| Sealing and HMAC | `backend/src/identity-verification/id-document-crypto.service.ts` |
| OCR script | `backend/scripts/ocr-spike.ts`. Reads any folder outside the repo. |
| Old phone spike | `git show 3ff8498:mobile/app/dev/id-scan-spike.tsx` (deleted in `a8b80bf`) |
| Scan step | `mobile/src/components/registration/PhilHealthIdStep.tsx`; rules in `mobile/src/lib/id-verification.ts` |
| Test kit | `backend/test/identity-verification/id-test-kit.ts`; real PostgreSQL in `backend/test/identity-verification-release.e2e-spec.ts` |
| Flag-on e2e | `backend/test/emergency-flow-id-required.e2e-spec.ts` |

## A5. House rules for this repo

- **Search with `git grep`, never a recursive `grep`.** A recursive search once printed the secrets in `backend/.env` into a transcript. **Never open `backend/.env`.** Add variables to `.env.example` with placeholders only (this work needs none).
- **Never run `git add`, `git mv`, `git reset`, `git stash` or `git commit`.** Rename by moving the file. The user stages and commits.
- **Never start a second backend.** It shares Redis, BullMQ and the Textbee SMS poller with the user's running one on :3000.
- **Never create incidents on the live backend** (they send real SMS).
- Read-only DB checks via `node -e` with `pg` from `backend/` are fine. Don't print card data.
- Don't run `next build` while `pnpm dev` is up.
- Backend tests: `cd backend; npx jest --config ./test/jest.config.ts <path>`. **Run `auth-phase3.spec.ts` alone.** `auth-phase0`, `auth-phase2` and `auth-phase3` can fail under full-suite load: re-run them alone.
- `pnpm lint` is broken (ESLint 9 mismatch). Don't chase it.
- **Backend specs get no type check by default:** `backend/tsconfig.json` excludes `test/`, and ts-jest uses `isolatedModules`.
- **An e2e spec needs `dotenv.config` or it silently skips, and Redis on 6379 or it times out at 120 s.** Check the count, not just the exit code.
- **A new test that passes first time proves little.** Break the code on purpose and restore it byte for byte, and check the break really does something: `incident.incident_reporters` is a single object, not an array.
- **Frontend Jest has no DOM, and mobile has no component tests.** Screens are typecheck plus hand checks. Adding either needs an approved dependency: stop and ask.
- `git checkout -- frontend/tsconfig.tsbuildinfo` after a frontend typecheck (this one file only).
- Metro on Windows drops edited routes: restart with `npx expo start -c`. `next dev` serves stale modules after a `shared` change: restart `pnpm dev`.
- **Windows:** `python3` is the Store stub and hangs. Long shell heredocs with backticks fail in Git Bash, so write a script file. In parallel tool calls, use full paths.
- **Test accounts:** leave the second test citizen alone. `citizen@demo.agap` is verified with a fake PIN and no consent record, so it has no Withdraw card. Users with audit rows can't be hard-deleted. Never disable the `audit_logs_no_update_delete` trigger.
- **An active claim blocks every new scan of a card** (`ID_ALREADY_REGISTERED`). `REJECTED`, `EXPIRED` and `RELEASED` rows don't.
- **The scan endpoint returns 503 without the two ID keys,** even with the flag off.

---

# Part B — Decisions (already made, do not reopen)

| # | Decision |
|---|---|
| N1 | Build and test the plastic card only. No ePhilID parser. An ePhilID that won't read reaches staff review after 3 attempts, and staff can approve it. |
| N2 | One account per card, not per person. Accepted and documented. A test records it. |
| N3 | No real National ID is scanned until the adviser's answers are in plan §11 (G1). |
| N4 | PCN only; exactly 16 digits. If real cards show letters, stop and ask. |
| N5 | One consent type per ID. Changing the chosen ID clears the consent tick. |
| N6 | No QR code, no PhilSys Check, no e-KYC. |
| N7 | Reuse `pin_hmac`, `pin_last4` and the partial index. No column renames. Only `ALTER TYPE`. |
| N8 | Approving a National ID review scan with no stored number requires staff to type the number. PhilHealth rows stay as they are. |
| N9 | Seed unchanged. |
| From the PhilHealth plan | D1–D8 and Q1–Q3 still apply: local OCR, image retention, withdrawal erases, staff release, same bucket, name locked while verified, same reviewers. |

---

# Part C — Working protocol (every prompt follows this)

### A. Preflight (no edits yet)
1. Read `CLAUDE.md`, Part A of this file, the plan in full, and every file the prompt lists under "Read first".
2. Read the plan's **Progress log**. If this phase already has a dated section, this is a **resume**: continue from it.
3. Check the prompt's gate. If it isn't met, **stop and say so**.
4. Run `git status --short` and keep the output. Never revert, reformat or "clean up" files you didn't change in this phase.
5. **Inventory before writing.** List everything the phase adds: files, functions, migrations, enum values, routes, error codes, consent types, translation keys, tests. Search with `git grep` and mark each **exists / partial / missing**. Extend what exists. **Never create a second copy.** Never edit an applied migration (`pnpm prisma migrate status`).
6. Run the test suites of the packages this phase touches once and record the counts. Last recorded: backend 1746 (1687, plus `auth-phase3` alone 59), e2e 19 in 3 suites, frontend 199, mobile 212, 36 migrations.
7. If a file or symbol isn't where this file or the plan says, follow the code and note the difference for the report.

### B. Implement
- Follow the prompt's numbered steps in order.
- **One source per concept:** number parsing, card detection and name reading live only in `shared/src/validation/`, and per-type choices go through `ID_DOCUMENT_RULES`. No `if (type === ...)` ladders for what the lookup can answer.
- Match the surrounding code: naming, comment density, DTOs with class-validator, `try/catch` + `this.logger.warn`, `@Roles(...)`.
- **Dependencies: none may be added.** If you think one is needed, stop and ask.
- Migrations: write SQL by hand in `backend/prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` with a timestamp later than every existing folder (latest known `20261106090000`). Update `schema.prisma` to match **without reformatting other lines**. Then `pnpm prisma migrate deploy; pnpm prisma generate`.
- **Invented data only in tests:** invented names, and clearly fake numbers such as `0000 0000 0000 0001`.
- Stay inside the phase. Problems you notice elsewhere go in the report, not the code.

### C. Self-check before verifying
- Search for every name you added. Each route, enum value, error code, consent type and translation key is defined exactly once (translation keys once per language).
- **Privacy grep** over every file you changed: no full number, OCR text, card name or image in any `logger.*`, `console.*`, audit `details`, response body (except `nameOnId` and `pinLast4` from the scan endpoint), notification or SMS.
- **PSN check:** nothing accepts a 12-digit number as a National ID number.
- `git diff` shows no change to `registerGuest`, `mobile/app/emergency` or `backend/src/emergency-alerts`.
- Nothing under dispatch, jobs, analytics or realtime reads the document type.
- No existing test was deleted, skipped or loosened. Adding an argument or an extra expected key is fine: say so in the report.

### D. Verify
1. If `shared/src` changed: `cd shared; pnpm build; cd ..`.
2. `pnpm typecheck` (or `npx tsc --noEmit -p .`) in every touched package.
3. Run the touched packages' Jest suites. After a migration or a backend change also run `pnpm test:e2e:db` then `pnpm test:e2e` in `backend/`, with Redis up. Check the count.
4. `pnpm prisma migrate status` → up to date.
5. **See new tests fail.** For anything that passed first time, break the code on purpose and restore it byte for byte. Report what was caught.
6. Fix every failure you caused and re-run until green. Never weaken a test to make it pass.
7. `git checkout -- frontend/tsconfig.tsbuildinfo` if the frontend typecheck touched it.

### E. Record
- Tick only the plan's §10 boxes that are now true, saying what tests cover and what still needs a person.
- Fill in the plan's **Progress log** row for this phase and add a `### Phase N — <date>` section: files added/changed, migrations (applied or not), inventory result, deviations and why, what needs a person or a phone.
- **Don't commit.**

### F. Report, then STOP
Reply with: (1) what was built, per step; (2) test counts before → after, per package; (3) deviations and inventory findings; (4) what needs a person or a phone. Then stop. Don't start the next phase.

---

# Part D — The prompts

## Prompt 0 — Spike tools

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/NATIONAL_ID_VERIFICATION_PROMPTS.md, then docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md
(§1, §5.4, §6, §9, §11). Follow Part C (A → F) exactly.

Goal: tools to measure how well real National IDs read. No feature code and no registration
changes. Do not run anything on a real card, and never ask for card text.

Read first: `git show 3ff8498:mobile/app/dev/id-scan-spike.tsx`, the `__DEV__` row that commit
added in mobile/app/profile/index.tsx, backend/scripts/ocr-spike.ts, the "Layout notes" section of
docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md (the format to follow).

1. Mobile: recreate mobile/app/dev/id-scan-spike.tsx from that commit for the National ID, and the
   __DEV__-only profile row that opens it. It renders null unless __DEV__. It opens the scanner
   (1 page), runs on-device text reading, and shows only: heading words found (yes/no, using the
   plan §6 candidates), a 16-digit number found (yes/no), how many 12-digit runs were found (a
   count), number of text lines, image size, reading time. For the count, remove 16-digit matches
   first so a card number's first three groups aren't counted, and count 12 digits with or without
   4-4-4 grouping.
   Add inputs "Type the number on your card", "Last name", "Given names" and "Middle name" (blank if
   the card has none). The citizen fills them in before scanning. When a scan finishes, compare and
   show only yes/no: "number exact match" against the number read, ignoring spaces and dashes, and
   one result per name field. A name field matches when its words, normalised with normalizeNamePart
   from @agap/shared, appear together as whole words in the normalised text; a blank field shows
   "not checked". Keep only the yes/no results: the recognised text and the number read are never
   put in state, displayed or logged. Typed values stay in component state so the same card can be
   scanned again, and clear on leaving. Editing a field clears the old results. All inputs: no
   autocorrect, suggestions or autofill. Don't use a numbers-only keypad, because Phase 0 has to
   find out whether cards contain letters. Delete the scanned file in a finally. Throwaway regexes
   are fine here; Prompt 1 writes the real ones. Prompt 3 deletes this screen and row.
2. Backend: in backend/scripts/ocr-spike.ts change the header comment only, so it covers both
   IDs. It must still refuse a folder inside the repo and write nothing to disk.
3. In the plan's Progress log add "### Phase 0 — <date>" with a "Layout notes (filled in by the
   user)" list, empty, to be completed WITHOUT real names or numbers:
   - heading text found on the card (patterns, as printed);
   - card number: digits only, or letters too? grouping and position;
   - name labels as printed, and their order; is the value on the label's line or the next?
   - where a suffix prints; a card with no middle name;
   - what follows the name (the lines the parser must stop before);
   - cards with name AND full number exactly right, by phone (n/10);
   - by server (n/10), OCR confidence range, reading time range;
   - same card scanned 3 times: same number each time? by phone (n cards tested); by server, from 3
     separate photos (n cards tested);
   - any 12-digit run seen on the front? (yes/no);
   - printed ePhilID, if available: reads? anything in the text that marks it as printed?
   - scanner on a phone without Google Play services, if available;
   - sample scans deleted, including phone gallery, trash and backups (date); written consent held
     for each card (yes/no); no sample sent through a chat app, email or cloud storage (yes/no).
4. Write in the report the exact steps for the user, in this order:
   a. Send the plan §11 adviser questions; record the answers in §11. NO REAL CARD BEFORE THIS.
   b. Restart Metro with `npx expo start -c` (JavaScript only, no dev-client rebuild; a new route).
   c. Sign in (/dev is behind AuthGuard). Profile → the spike row. For each card, type its number and
      name, scan it, and note the yes/no results. Scan at least 3 of the cards 3 times each.
   d. The spike deletes its scans, so the server check needs separate photos. Turn off the phone's
      photo backup first. Photograph each card, upright and in focus, and take 3 separate photos of
      the cards from step c that were scanned 3 times. Re-reading one file doesn't test repeat reads.
      Move them to the PC by USB cable, memory card or a direct local transfer. Never use a chat app,
      email or cloud storage: they can re-compress the image, and they leave a copy of an ID on
      someone else's servers.
      Crop each photo to the card, long edge about 1600 px (what the server receives), in a folder
      outside the repo, then: cd backend; npx ts-node --transpile-only scripts/ocr-spike.ts <folder>
      The output contains card text. Read it in your own terminal. Never paste it into a chat or file.
   e. Fill in the layout notes with patterns only. Delete the samples from the PC and the phone,
      including the gallery's trash and any backup.

Verify per Part C D (mobile and backend typecheck; no test count should change). The only backend
change is a header comment, so skip the e2e run in Part C D3 and say so in the report. Report per
Part C F, then STOP.
```

## Prompt 1 — Shared rules

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/NATIONAL_ID_VERIFICATION_PROMPTS.md, then docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md
in full, including the Phase 0 layout notes. Follow Part C (A → F) exactly.

STOP and say so if: the layout notes are empty; the adviser's answers aren't in §11 (G1); G2 is
neither met nor lifted in the Progress log; or the notes say the card number contains letters
(plan §6 must be revisited first). If under 8 of 10 cards passed, continue only if the user has
written that they accept it in the Progress log, and say in the report what the parser rests on.

Read first: shared/src/validation/philhealth-id.ts, shared/src/validation/index.ts,
shared/src/constants/identity-verification.ts, backend/test/identity-verification/philhealth-id.spec.ts.

1. shared/src/constants/identity-verification.ts: ID_DOCUMENT_TYPES and IdDocumentType;
   ID_VERIFICATION_CONSENT_TYPES and isIdVerificationConsentType (keep ID_VERIFICATION_CONSENT_TYPE
   as the PhilHealth value); IdVerificationErrorCode.NOT_NATIONAL_ID; 'NOT_NATIONAL_ID' in
   ID_REJECTION_REASONS; the IdReviewReason code union; documentType on IdScanResponse and
   IdReviewItem, and hasCardNumber on IdReviewItem. Keep every existing value.
2. shared/src/validation/national-id.ts: parsePhilSysCardNumber, looksLikeNationalId,
   parseNationalIdName, per plan §6 and the real layout notes where they differ from §6's memory.
   Never read past the birth date or address lines. No lookbehind (Hermes). Export nameTokens and
   the suffix check from philhealth-id.ts rather than copying them; change nothing else in that file.
3. shared/src/validation/id-document-rules.ts: ID_DOCUMENT_RULES per plan §6. Export both new files
   from the validation index.
4. backend/test/identity-verification/national-id.spec.ts: every case in plan §6. Invented text
   only, shaped like the layout notes. No real values. philhealth-id.spec.ts stays unchanged.
5. cd shared; pnpm build. Run the new spec and the full backend suite. See Part C D5: break the
   16-digit rule and the label matching on purpose, and confirm the tests catch it.

Report per Part C F, then STOP.
```

## Prompt 2 — Backend

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/NATIONAL_ID_VERIFICATION_PROMPTS.md, then docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md
§1, §2, §5, §6, §7 and §10, and the Phase 0 and Phase 1 sections of its Progress log.
Follow Part C (A → F) exactly.

Read first: backend/src/identity-verification/ (all of it), backend/src/consent/consent.service.ts,
backend/src/users/users.service.ts near line 99, backend/prisma/schema.prisma (the
identity_verifications model and id_document_type enum), the latest migration folder,
backend/test/identity-verification/id-test-kit.ts, id-scan-endpoint.spec.ts, id-release.spec.ts,
id-review.spec.ts, backend/test/identity-verification-release.e2e-spec.ts.

1. Migration: ALTER TYPE "id_document_type" ADD VALUE 'NATIONAL_ID'. Schema enum and comments only.
   Apply with migrate deploy + generate, and to the e2e database with test:e2e:db.
2. Scan: IdScanDto gains optional documentType (@IsIn; missing = PHILHEALTH). scan() takes its
   parsers, wrong-card code and client_read_ok check from ID_DOCUMENT_RULES, saves document_type,
   and returns documentType. Messages name the chosen ID. Keep the requestReview rules exactly.
3. Claim: PreparedClaim carries document_type from the row; claim() writes that type's consent;
   the audit newValues gains documentType. refuseIfChecked stays unfiltered by type.
4. Consent, per plan §5.3: consent.service.ts routes either ID consent to withdrawConsent;
   withdrawConsent withdraws all ID consent types.
5. Staff, per plan §7: reviewReasonOf accepts NOT_NATIONAL_ID; list() returns documentType and
   hasCardNumber; reject() refuses a wrong-card reason that doesn't fit the row's type (400);
   find-by-pin takes documentType (default PHILHEALTH), parses by type and filters on
   document_type; approve takes optional cardNumber per plan §7. For a NATIONAL_ID row with a null
   pin_hmac it's required and must parse, otherwise 400. Store pin_hmac and pin_last4 in the same
   conditional update, and map P2002 to 409 ID_ALREADY_REGISTERED with nothing changed. The number
   appears in no audit row, log or response. PhilHealth approval behaves as today.
6. Wording: every remaining user-facing PhilHealth message that can now reach a National ID holder,
   including users.service.ts:99 and the 503 messages. Comments may follow where they'd now be false.
7. Rename PhilhealthOcrService to IdOcrService (move the file; imports and test mocks only).
8. Tests. New spec backend/test/identity-verification/id-national.spec.ts, using the real scan and
   register flow with stubbed OCR and invented text:
   - no documentType → PhilHealth; unknown → 400; National ID success returns only pinLast4;
   - wrong card each way, both codes; PhilHealth chosen with National ID text stores no number;
   - 12-digit text with National ID chosen never stores a number;
   - duplicate PCN → ID_ALREADY_REGISTERED; both cards on two accounts → both verified (records N2);
   - an account with a check on one type can't claim the other;
   - consent type written per ID; withdrawing National ID consent erases data, un-verifies and frees
     the card; someone holding both consents has both withdrawn and all rows erased;
   - release, expiry and the unconfirmed-phone rule on a National ID row;
   - review reason, reject mismatch, lookup by type, every approve case in plan §10.
   Real PostgreSQL additions in identity-verification-release.e2e-spec.ts: the new enum value saves;
   the partial index refuses an approval with a number already held and rolls back; withdrawal across
   both consent types.
9. Prove existing behaviour held: every existing identity-verification spec still passes. Any change
   to an existing test is an added key or argument only, and is listed in the report.

Report per Part C F, then STOP. Tell the user to restart the backend.
```

## Prompt 3 — Mobile

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/NATIONAL_ID_VERIFICATION_PROMPTS.md, then docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md
§1, §3, §4, §5.3 (consent) and §10, and the Phase 0–2 sections of its Progress log.
Follow Part C (A → F) exactly.

Read first: mobile/src/components/registration/PhilHealthIdStep.tsx,
mobile/src/services/id-scan/philhealth-scan.ts, mobile/src/lib/id-verification.ts and its test,
mobile/app/auth/registration.tsx (ID parts), mobile/app/profile/id-verification.tsx,
mobile/app/profile/privacy.tsx, mobile/src/components/registration/NameFields.tsx,
mobile/src/components/profile/id-status-card.tsx, mobile/src/services/api/auth.api.ts,
mobile/src/i18n/translations.ts (ID strings in en and fil), mobile/app.json.

1. Rename PhilHealthIdStep.tsx to IdScanStep.tsx and philhealth-scan.ts to id-scan.ts by moving the
   files. Imports only, nothing else in this step.
2. lib/id-verification.ts: localReadVerdict(text, documentType) through ID_DOCUMENT_RULES;
   IdScanFailureReason and scanFailureFromError gain NOT_NATIONAL_ID; countsAsAttempt includes it;
   retryMessageKey(reason, documentType).
3. id-scan.ts and auth.api.ts: documentType through processIdImage and submitIdScan as a parameter.
4. IdScanStep: the id_choose state per plan §4.2, with both options and the neither-card line.
   documentType and onDocumentTypeChange props. "Choose a different ID" on intro and retry, not while
   scanning. Changing type clears consent, failedAttempts and lastReason. Consent and intro text
   follow the type. The emergency button stays outside the state blocks, so id_choose has it.
5. registration.tsx and profile/id-verification.tsx: hold documentType; go to id_choose after the
   geo-fence; add it to ID_STEPS and the profile's phase handling. ID_SCAN_EXPIRED and Scan again
   return to id_intro with the type kept. The form's badge, helper and match text follow the type.
6. privacy.tsx per plan §5.3: check both consent types, one card, the right ID's name and erase
   text, invalidate both on withdrawal. Medical consent untouched.
7. translations.ts: every new or reworded string in en and fil, per plan §4.2. The National ID consent
   text says what is read, what isn't kept, that the PhilSys Number and QR code aren't read, why, and
   when it's deleted; use the adviser's wording if §11 has it. NameFields.tsx, id-status-card.tsx, and
   app.json:37,59 ("scan your ID").
8. Delete mobile/app/dev/id-scan-spike.tsx and its profile row, unless the Progress log says to keep them.
9. Tests in mobile/src/lib/__tests__/id-verification.test.ts: verdict per type, both directions;
   failure mapping; attempts; message key per type. Existing assertions stay; added arguments only.
10. Write the phone steps in the report. No dev-client rebuild; `npx expo start -c`. Then: chooser;
    National ID happy path; each wrong-card case and its message; change ID and see the tick and count
    clear; three failures → review; a printed ePhilID if available; guest SOS from chooser, intro, retry,
    fallback camera and form, on registration and Scan again; Privacy & Consent withdrawal; Filipino
    language throughout. Say a Filipino speaker should check the new strings. Screens are typecheck
    only: there are no component tests.

Report per Part C F, then STOP.
```

## Prompt 4 — Admin (web)

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/NATIONAL_ID_VERIFICATION_PROMPTS.md, then docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md
§1, §7 and §10, and the Phase 2 section of its Progress log. Follow Part C (A → F) exactly.

Read first: frontend/components/admin/IdReviewQueue.tsx, frontend/components/admin/IdCardRelease.tsx,
frontend/features/identity-verification/ (api.ts, hooks.ts, format.ts),
frontend/app/(ops)/administration/id-reviews/page.tsx, frontend/lib/role-access.ts,
frontend/__tests__/id-review-format.spec.ts.

1. format.ts: labels for ID types and NOT_NATIONAL_ID; reviewReasonLabel handles both wrong-card
   codes; reviewCheckHint(reason, documentType) per plan §7, including that a legible printed ePhilID
   may be approved; a helper giving the rejection reasons that fit a type.
2. IdReviewQueue.tsx: an ID type column and a line in the drawer; the rejection list filtered by type.
   When hasCardNumber is false on a National ID, show a card-number input with Approve disabled until
   it's filled. It says to type the 16-digit number from the front, and warns not to use the PhilSys
   Number. Clear it after use, never keep it in the mutation cache (gcTime: 0, as useFindIdCardHolder),
   and show messages for 400 and 409.
3. IdCardRelease.tsx: a type picker defaulting to PhilHealth; label and placeholder per type (fake
   example numbers only); api and hooks pass documentType. The number still clears after use.
4. Page and error wording: generic where it says PhilHealth only.
5. Tests in frontend/__tests__/id-review-format.spec.ts for the helpers. Components are typecheck only:
   say so in the report and write the web hand checks.

Report per Part C F, then STOP. Tell the user to restart pnpm dev.
```

## Prompt 5 — Docs and readiness

```
You are working on the AGAP monorepo. Read CLAUDE.md, then Parts A, B and C of
docs/plans/NATIONAL_ID_VERIFICATION_PROMPTS.md, then docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md
in full, including the whole Progress log. Follow Part C (A → F) exactly.

1. backend/test/emergency-flow-id-required.e2e-spec.ts: add a National ID citizen, matched and under
   review, through the real scan and register flow with stubbed OCR and invented text. They report,
   reach the queue and the ops room, can be dispatched, and get the same priority as the others. The
   log and queued-job check covers them. Break the code on purpose per Part C D5.
2. docs/modules/MOD-01_* section 22 and MOD-48_* section 21: both IDs, what is read and not read
   (the PhilSys Number and QR code), consent types, retention, withdrawal, one account per card, the
   number staff type on approval. Keep section numbers. State the adviser's answers only as §11
   records them.
3. docs/module-reports/MODULE_TESTING_GUIDE.md §7: add NI-xx cases from plan §10 in the same format,
   marking which need a person. PH-xx cases stay.
4. docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md: at §1 ("Only accepted ID"), §12 (Other ID types) and
   §13 ("Why only PhilHealth?"), add a short dated note pointing here. Don't rewrite its history.
5. docs/USER_ACCOUNTS.md only if it says PhilHealth is the only ID.
6. Run the backend full suite, test:e2e:db + test:e2e, mobile and frontend Jest, and typecheck in all
   packages.
7. Walk the plan's §10. Tick what tests prove, saying what they don't. List what needs a phone or a
   person with exact steps, including re-running PH-01 to PH-21, and give the §13 demo as a rehearsal
   script. State plainly whether the National ID is ready to demo under §13's first bullet.

Report per Part C F, then STOP.
```

## Prompt R — Independent review of a phase (run after each phase, in a new chat)

Replace `N` with the phase number.

```
You are reviewing Phase N of docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md, implemented in an earlier
chat (possibly uncommitted). Do not re-implement it.

1. Read CLAUDE.md, Parts A, B and C of docs/plans/NATIONAL_ID_VERIFICATION_PROMPTS.md, Prompt N in
   Part D, the plan in full, and the Phase N section of the plan's Progress log.
2. Find the phase's changes with `git status --short` and `git diff`, limited to the files the Progress
   log lists plus new untracked files of this phase. If it's committed, use the commit the user names.
3. Check, with file:line evidence, each of:
   a. Every numbered step of Prompt N is really done; ticked boxes are true; the gates were respected.
   b. PSN: nothing accepts, stores, logs or returns a 12-digit number as a National ID number. A
      PhilHealth PIN and a PCN can't cross over: each parser runs only for its own chosen type.
   c. Older builds: a request with no documentType behaves exactly as before. Compare with the code at
      1a22a45, not just the tests.
   d. Consent: withdrawing either type erases data and un-verifies. Walk the path for a citizen holding
      both consents, and for one who holds a rejected row of the other type.
   e. Bugs: a code missing from reviewReasonOf, the mobile mapping or format.ts; a type lost between
      chooser, scan, form and rescan; state not cleared on changing ID; transaction boundaries (image
      deleted only after commit; number stored in the same update as the decision); P2002 handling;
      null middle or suffix; label matching (GITNANG APELYIDO vs APELYIDO).
   f. Duplication: number parsing, detection or name reading anywhere but shared/src/validation; type
      ladders where ID_DOCUMENT_RULES answers; a second copy of a helper; two definitions of a code,
      route or key.
   g. Privacy: no full number, OCR text, card name or image in logs, audit rows, responses (except
      nameOnId and pinLast4 from the scan endpoint), notifications or SMS. Typed numbers are cleared and
      not cached. Spike output and sample scans are not in the repo.
   h. Rules: "Report an emergency" untouched and visible on every ID step, including the chooser; an
      account under review can still send an SOS; nothing in dispatch reads the document type.
   i. Wording: no screen tells a National ID holder about their "PhilHealth ID", or the reverse, in en
      or fil. `git grep -in philhealth` in the changed files, and read each hit.
   j. Tests assert behaviour (stored rows, refusals, deleted files, response contents), not just that a
      mock was called. Pick the lines that matter most, break them one at a time, restore them byte for
      byte, and report what survived. No existing test was weakened, skipped or deleted.
   k. No dependency was added.
4. Fix only confirmed problems, smallest change first. Then run Part C D in full.
5. Add a "### Review — <date> (Phase N)" section under Phase N in the Progress log: findings, fixes, test
   counts, anything left open. Don't commit.

Report the findings (fixed / open) and the test counts, then STOP.
```
