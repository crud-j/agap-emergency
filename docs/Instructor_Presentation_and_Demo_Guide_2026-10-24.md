# AGAP — Instructor Presentation & Demo Guide (2026-10-24)

**Purpose of this file:** a single script the team can use tomorrow to (1) explain each assigned module in plain language and (2) demo it live on the actual AGAP system (the "proof"). It is based on the current, working code as re-checked on 2026-10-23 (see [`docs/100%ModulesFunctionalities+AdditionalModules.md`](100%25ModulesFunctionalities%2BAdditional%20Modules.md) and the per-module files in [`docs/module-reports/`](module-reports/)).

**Assignments**

| # | Member | Modules |
|---|---|---|
| 1 | Jhobert Dionisio | MOD-37, 48, 40, 39, 50 |
| 2 | Vanessa Danielle | MOD-02, 03, 05, 09, 53 |
| 3 | Aldrin Dela Cruz | MOD-20, 25, 27, 31, 32 |
| 4 | Christian Joaquin | MOD-06, 08, 10, 11, 12 |
| 5 | Arjay Mauricio | MOD-30, 26, 52, 22, 28 |

Each member's section below gives, per module: **what to say** (1–2 sentences for the instructor), **what the system actually does today**, **which account to sign in as** (and whether it's mobile or the website), and **exact click-by-click demo steps**. Say the one-sentence "what to say" line first, then run the demo, then (only if asked) mention the stated limit.

Five more modules — MOD-01, 07, 13, 16, 18 — aren't part of the five-person assignment below but were reviewed in the same way; they're in their own section, [§6](#6-additional-modules-reviewed--mod-01-07-13-16-18), as backup/extra coverage.

---

## 0. Before you present — do this tonight / before class

1. **Use one committed version.** Make sure everyone demos off the same branch/commit — don't let one laptop have newer code than another.
2. **Database ready:**
   ```bash
   pnpm install
   cd backend
   pnpm prisma migrate deploy
   pnpm prisma db seed
   ```
   The seed script prints test accounts at the end. `MEDICAL_ENCRYPTION_KEY` must be set in `backend/.env` (copy from `.env.example`) *before* seeding, or medical-profile demos (MOD-03, MOD-48) will fail to save.
3. **Start all three apps** (separate terminals):
   ```bash
   cd backend  && pnpm start:dev     # http://localhost:3000 (API)
   cd frontend && pnpm dev           # http://localhost:3001 — Operations Center / web
   cd mobile   && npx expo start     # scan QR with Expo Go, or press w for web preview
   ```
4. **Test accounts** (seeded by `backend/prisma/seed/seed.ts`). Password for every account below **except** the System Administrator is `AgapDev2026!`. Several accounts are flagged `must_change_password` — log in once beforehand so the forced password-change screen doesn't eat time during the real demo.

   | Role | Email | Used by |
   |---|---|---|
   | System Administrator | `admin@agap.local` (password set by `INITIAL_ADMIN_PASSWORD`, default `ChangeThisPasswordImmediately!`) | — (not needed for these 25 modules) |
   | Dispatcher | `dispatcher1@mdrrmo.bocaue.gov.ph` / `dispatcher2@mdrrmo.bocaue.gov.ph` | Jhobert, Aldrin, Christian, Arjay |
   | Supervisor | `supervisor@mdrrmo.bocaue.gov.ph` | Arjay (surge), Jhobert (analytics) |
   | Responder (ambulance) | `responder1@mdrrmo.bocaue.gov.ph` / `responder2@mdrrmo.bocaue.gov.ph` | Jhobert, Aldrin |
   | Responder (BFP/fire) | `responder3@bfp.bocaue.gov.ph` | Aldrin (optional) |
   | Hospital user | `receiving@bocauehospital.gov.ph` | Jhobert (MOD-39 context) |
   | Announcements Publisher | `announcements@lgu.bocaue.gov.ph` | Vanessa |
   | Org Administrator | `orgadmin@mdrrmo.bocaue.gov.ph` | Aldrin |
   | Citizen (mobile) | `citizen@demo.agap` | Vanessa, Christian |
   | Bystander (mobile, guest-like) | `bystander@demo.agap` | Christian (optional) |

   A second, *different* citizen account is useful for MOD-02's isolation check — register a fresh one in the app (Sign Up) rather than reusing the seeded one.
5. **Say this up front to the instructor**, once, so nobody has to repeat it five times: *"AGAP complements 911 and the MDRRMO hotline — it never replaces them. Every screen we show is live against our own PostgreSQL database and Socket.io server, not a mockup."*
6. **Known, honest limits to disclose only if asked** (don't volunteer unless the instructor probes):
   - SMS demos (MOD-16/17/53 contact + publisher alerts) need load on the Textbee phone/SIM; if there's no load, describe the SMS path and show the app/push side instead.
   - MOD-32 (responder app) and MOD-52 (surge mode) are marked "works, with a stated limit" — no push to responders (15-second refresh) and the surge triage-tag list refreshes every 30–60 seconds. State the limit plainly if asked; it is not a bug, it's documented behavior.
   - A few modules elsewhere in the system (not in this group's list) are tagged "walkthrough pending" — not your concern tomorrow, but if the instructor jumps to a module outside this list, don't claim it's been hand-tested.

---

## Suggested live run order (one continuous incident, if time allows)

Running all 25 modules as one story — instead of five disconnected demos — is the strongest way to present, because AGAP's whole pitch is "one incident, one record, five clusters of people touching it." Suggested order, with presenter in bold:

1. **Vanessa** — citizen readiness, contacts and medical profile are already set up *before* the emergency (MOD-05, MOD-02, MOD-03).
2. **Christian** — the citizen triggers SOS: hold-to-send, GPS capture, address/barangay, a photo, and (separately) a cancel/false-alert example (MOD-06, MOD-11, MOD-12, MOD-10, MOD-08).
3. **Vanessa** — same report's Details screen shows the type-specific questions that raised its priority (MOD-09).
4. **Aldrin** — the incident lands live on the dispatcher's screen with no refresh, goes through Triage, is checked against the organization/resource registry, and gets dispatched with an explicit authorization click (MOD-20, MOD-25, MOD-27, MOD-31).
5. **Arjay** — before confirming dispatch, the dispatcher sees ranked unit recommendations; two near-duplicate reports get flagged and merged; the incident and responder both appear live on the map; the fleet board shows unit availability; (separately) surge mode for a mass-casualty scenario (MOD-30, MOD-26, MOD-22, MOD-28, MOD-52).
6. **Aldrin** — the responder's phone shows the assignment and status buttons (MOD-32).
7. **Jhobert** — the responder records a patient assessment on scene, transports to a hospital chosen from the registry, and (separately) shows the citizen's own consent/encryption screen and the analytics dashboard that summarizes everything that just happened (MOD-37, MOD-40, MOD-39, MOD-48, MOD-50).

If time is short, each member can instead just run their own section independently — every section below is self-contained.

---

## 1. Jhobert Dionisio — MOD-37, 48, 40, 39, 50 (Field Response & Governance)

### MOD-37 — On-Scene Patient Assessment (Cluster F)

**What to say:** "Once a responder reaches the scene, they can record a structured patient assessment — vitals, symptoms, observations, interventions, all timestamped — instead of a verbal radio report that gets lost. It supports more than one patient per incident, and an unknown patient is a valid, supported state."

**What it does today:** optional vitals/assessment form in the responder app, saved, audited, and broadcast live to the operations side. `mobile/app/responder/assessment/[id].tsx` + `backend/src/incidents/assessment`.

**Account to use:** created on **mobile** as `responder1@mdrrmo.bocaue.gov.ph`. **Website account:** `dispatcher1@mdrrmo.bocaue.gov.ph` (to view the assessment land in the Incident Command Queue drawer).

**Demo steps:**
1. On the web (dispatcher), have an incident already dispatched to `responder1@mdrrmo.bocaue.gov.ph` (reuse Aldrin's or Arjay's dispatched incident from earlier in the run-through, or dispatch a fresh test one yourself).
2. On the phone, sign in as `responder1@mdrrmo.bocaue.gov.ph`, open the assignment, and mark it **On Scene**.
3. Open **Patient Assessment** on that assignment. Enter patient/unknown status, a symptom or two, one vital sign, an observation, and an intervention. Submit.
4. Switch to the web Operations Center → open the same incident in the Incident Command Queue drawer → show the assessment now attached to the incident and the audit trail entry.

### MOD-48 — Privacy, Consent and Medical Data Protection (Cluster H)

**What to say:** "Medical information is the most sensitive data in this system, so it's walled off: a citizen must give a separate consent before any medical profile can exist, every medical value is encrypted at rest, and the citizen can see an access log and export their own data at any time."

**What it does today:** consent granted/withdrawn separately from the rest of the profile; medical values encrypted (AES-256-GCM); an access log and a data export on the Privacy screen. `backend/src/consent`, `backend/src/privacy`, `mobile/app/profile/privacy.tsx`.

**Account to use:** **mobile only** — `citizen@demo.agap`. No website account needed (the Prisma Studio step below is a database tool, not an AGAP account/screen).

**Demo steps:**
1. On the phone, sign in as `citizen@demo.agap`, go to **Profile → Privacy**.
2. Show **Medical Data Consent** (grant/withdraw toggle), the **Access Log** (who/when the profile was read), and **Export My Data** (downloads the citizen's own medical and personal data, in readable form, because it belongs to them).
3. If you want to show the encryption claim concretely: open a database client (Prisma Studio — `pnpm prisma studio` in `backend/`) and show a row in `medical_profiles` where every value starts with `v1.` (ciphertext), next to the same profile shown in readable form on the app screen. This is the strongest "proof" artifact for this module — it shows the database literally cannot be read without the app's key.
4. Withdraw consent and show that Medical Profile (Vanessa's MOD-03) immediately locks again — this is the cross-module link worth saying out loud.

### MOD-40 — Transport and Destination Tracking (Cluster F)

**What to say:** "After a patient is picked up, AGAP tracks the transport itself — which hospital, when it started, the estimated arrival (always labeled an estimate, never a promise), and the actual arrival and handover. A dispatcher can redirect an ambulance mid-transport if needed."

**What it does today:** responder picks a destination hospital (sorted by distance, searchable) or "decide later," records arrival with one tap; drawer shows destination/start/ETA/arrival; dispatcher/supervisor can change destination; one open transport per dispatch. `mobile/src/components/responder/DestinationPicker.tsx`, `backend/src/incidents/transport`.

**Account to use:** created on **mobile** as `responder1@mdrrmo.bocaue.gov.ph`. **Website account:** `dispatcher1@mdrrmo.bocaue.gov.ph` (to view the Transport section / change destination).

**Demo steps:**
1. Continuing from MOD-37: on the responder phone, mark the assignment **Transporting**.
2. The **Destination Picker** appears — hospitals sorted by distance with a search box (pulls from Jhobert's own MOD-39 registry, below). Pick a hospital (or demonstrate "Decide later" and set it afterward).
3. Tap **Arrived at hospital**.
4. On the web drawer's **Transport** section, show destination, start time, "est." arrival, and arrival timestamp. If you have a second dispatcher window open, show that they could change the destination mid-transport.

### MOD-39 — Hospital and Receiving Facility Registry (Cluster F)

**What to say:** "This is the directory everything else reads from — every hospital's profile, location, contacts, capabilities and status. Keep it accurate and the destination picker, referrals, and dispatch all work correctly."

**What it does today:** hospital list with search, create and edit. `frontend/app/(ops)/hospitals`, `backend/src/hospitals`, `backend/src/facilities`.

**Account to use (website):** `dispatcher1@mdrrmo.bocaue.gov.ph` for create/edit; `receiving@bocauehospital.gov.ph` for the read-only hospital-side view.

**Demo steps:**
1. Web, signed in as a dispatcher (or `receiving@bocauehospital.gov.ph` for the read side) → **Hospitals** page.
2. Search for a hospital, open its profile, show location/contacts/capabilities.
3. Edit one field (e.g. a contact number) and save.
4. Create a new facility to show the registry isn't static seed data — it's a live CRUD screen.
5. Tie it back: "This is exactly the list MOD-40's destination picker just pulled from."

### MOD-50 — Emergency Response Analytics (Cluster I)

**What to say:** "Everything the other four presenters just did leaves a timestamp. This module turns those timestamps into the numbers MDRRMO actually needs: how many incidents, how fast we acknowledged and dispatched, whether we met SLA, and the false-alert rate — filterable by 7, 30 or 90 days."

**What it does today:** volume, false-alert, response-time and SLA-compliance charts for a chosen date range, computed from real incident timestamps against the active SLA policy (default 120s to acknowledge, 300s to dispatch). `backend/src/analytics`, `frontend/app/(ops)/analytics`.

**Account to use (website):** `supervisor@mdrrmo.bocaue.gov.ph` or `dispatcher1@mdrrmo.bocaue.gov.ph`.

**Demo steps:**
1. Web, signed in as supervisor or dispatcher → **Analytics**.
2. Switch the range between 7 / 30 / 90 days and show the charts update.
3. Point at the incident you just ran through the whole demo — if it's recent enough, it should be reflected in the volume count.
4. If the instructor asks about accuracy: state the one honest caveat — the false-alert rate counts false-alert *records*, not distinct incidents, and an empty range correctly shows "No data" instead of a misleading 0%.

---

## 2. Vanessa Danielle T. Jose — MOD-02, 03, 05, 09, 53 (Citizen Readiness & Broadcast)

### MOD-02 — Emergency Contact Management (Cluster A)

**What to say:** "Before an emergency ever happens, a citizen can save the people who should be told if they report one — so nobody has to be looked up or called mid-emergency. Each contact can be switched on or off for alerts."

**What it does today:** add, edit, remove contacts; per-contact "notify on alert" switch; visible only to the owner; feeds MOD-16's SMS notification. `backend/src/emergency-contacts`, `mobile/app/contacts`.

**Account to use:** **mobile only** — `citizen@demo.agap` (plus a second, freshly-registered citizen account for the isolation check). No website account.

**Demo steps:**
1. Sign in on the phone as `citizen@demo.agap` → **Profile → Emergency Contacts**.
2. Add two contacts — one with alerts **on**, one with alerts **off**.
3. Edit one contact's details.
4. Remove one, confirm the dialog, and show it drops off the list.
5. Sign in as a *different* citizen account and show this list is empty for them — contacts are private per account.
6. (If Textbee has load) Submit a real SOS as the first citizen and show only the alerts-on contact gets an SMS.

### MOD-03 — Medical Profile (Cluster A)

**What to say:** "A citizen can optionally record blood type, allergies, conditions and medications — but only after a separate, explicit consent, and a missing medical profile never blocks an emergency report."

**What it does today:** consent-gated creation, encrypted storage, edit/review-date tracking, validation on entry length/count. `backend/src/medical-profiles`, `backend/src/consent`, `mobile/app/medical`.

**Account to use:** **mobile only** — `citizen@demo.agap`. No website account.

**Demo steps:**
1. On a fresh account (or after withdrawing consent), open **Profile → Medical Profile** — show it's locked with an explanation.
2. Tap **Manage Consent** → grant medical data consent in Privacy.
3. Back in Medical Profile, set a blood type and add two allergies; save.
4. Edit the profile (add a medication) and save again — note the "last reviewed" date updates.
5. Try entering a 61-character item in a list — show it's rejected (limit is 60 characters per item, 20 items per list).
6. Withdraw consent in Privacy and show the Medical Profile screen locks again.

### MOD-05 — Emergency Readiness and Permission Status (Cluster A)

**What to say:** "This is a pre-flight checklist — it finds problems like location permission being off *before* an emergency, not during one. It never blocks sending a report; it just tells the citizen what to fix."

**What it does today:** checks location, notification, camera, connection and motion-sensor status plus account completeness (contacts, verified phone, medical consent); combines into Ready / Limited / Not Ready. `mobile/app/settings/permissions.tsx`.

**Account to use:** **mobile only** — `citizen@demo.agap`. No website account.

**Demo steps:**
1. In phone Settings, turn the app's **Location** permission off, then open **Profile → Emergency Readiness** in AGAP — status should show **Not Ready**.
2. Turn location back on and pull to refresh — status improves.
3. Temporarily remove all emergency contacts (from MOD-02) and refresh — status should drop to **Limited**, not Not Ready (contacts are "recommended," not essential).
4. Put the phone in airplane mode and open the screen again — it still evaluates offline using the same rules on the device.

### MOD-09 — Rapid Incident Detail Capture (Cluster C)

**What to say:** "This is the 'tell responders what you see' screen — a handful of tap-to-answer questions chosen for the incident type, every one of them optional, so the report is never delayed waiting for answers."

**What it does today:** type-specific questions (Road incident, Fire, Natural disaster), a flooding follow-up that re-files the incident as Flood, landmark/people-hurt/reporter-situation fields, free-text notes, and the readable summary a dispatcher sees. `mobile/app/emergency/incident-details.tsx`.

**Account to use:** created on **mobile** as `citizen@demo.agap`. **Website account:** `dispatcher1@mdrrmo.bocaue.gov.ph` (to view the caller-answer lines and priority reasons in the drawer).

**Demo steps:**
1. During an SOS flow (after Christian's GPS step), pick **Fire** as the incident type on the Details screen.
2. Tick "People trapped: Yes" and "Fireworks/explosives involved."
3. Add a landmark, set people hurt to "2–5," and add a short note. Send.
4. Switch to the web Incident drawer and show the readable caller-answer lines and the priority reasons that were raised by those specific answers.
5. Second example: pick **Natural disaster**, tick flooding, answer water depth — show it files as a **Flood** incident, not "Other."

### MOD-53 — Municipal Announcements and Public Broadcast (Cluster J)

**What to say:** "This is the Mayor's Office / MDRRMO's one-way broadcast channel — river level, flood, evacuation and class-suspension advisories, sent at once through the app, push notification, and SMS. It is explicitly not a dispatch channel."

**What it does today:** compose from structured templates, required-field validation before release, publish now or schedule, live push/app update, cancel with a correction note, archive. `backend/src/announcements`, `frontend/app/(ops)/announcements`.

**Account to use (website):** `announcements@lgu.bocaue.gov.ph`. (Viewing the result is on **mobile** as `citizen@demo.agap`.)

**Demo steps:**
1. Web, sign in as `announcements@lgu.bocaue.gov.ph` → **Announcements → Compose**.
2. Pick the **Bocaue River water level** template, fill in the fields, save as a draft.
3. Try to **Publish** with the issuing office left blank — show it's refused.
4. Fill it in and publish — switch to the mobile app and show the notice appears in the citizen's Announcements list immediately (and a push, if a device token is registered).
5. Schedule a second notice two minutes ahead and show it releases on its own.
6. Cancel a published notice with a correction note, then archive it — show both move to History.

---

## 3. Aldrin Dela Cruz — MOD-20, 25, 27, 31, 32 (Dispatch Operations)

### MOD-20 — Real-Time Event / WebSocket Engine (Cluster D)

**What to say:** "Every status change in AGAP — a new incident, a unit moving, a dispatch — reaches every authorized screen immediately, over a secured, authenticated connection. Nothing waits for a manual refresh."

**What it does today:** Socket.io with sign-in required at connection, rooms scoped per user/incident/operations-staff, standard event set; a failed broadcast never blocks the underlying request. `backend/src/realtime`.

**Account to use (website):** `dispatcher1@mdrrmo.bocaue.gov.ph` and `dispatcher2@mdrrmo.bocaue.gov.ph` (two browser windows).

**Demo steps:**
1. Open two browser windows signed in as `dispatcher1@mdrrmo.bocaue.gov.ph` and `dispatcher2@mdrrmo.bocaue.gov.ph`, both on the **Incident Command Queue**.
2. From the phone, submit a new SOS.
3. Show it appear on *both* dispatcher windows within a second or two, with no manual refresh.
4. Point at the small connection indicator on the dashboard — show it (briefly stop/restart the backend if you're brave, or just explain) that a lost connection is shown clearly, never silently.

### MOD-25 — Incident Triage and Validation (Cluster E)

**What to say:** "Before anything gets dispatched, a trained dispatcher validates it — acknowledges it, checks the location and category, clarifies the patient, and notes hazards. Every step is audited."

**What it does today:** triage queue (Submitted / Received / Acknowledged) with Mark Received, Mark Acknowledged, Mark Assessed, and False Alert actions. `frontend/app/(ops)/operations/triage`.

**Account to use (website):** `dispatcher1@mdrrmo.bocaue.gov.ph`.

**Demo steps:**
1. Web, signed in as a dispatcher → **Operations → Triage**.
2. Take the incident from MOD-20's demo (or a fresh one). Click **Mark Received**, then **Mark Acknowledged**, then **Mark Assessed** — show the status chip change each time.
3. Open the **Audit** page (or the drawer's audit view) and show a timestamped, attributed row for each transition.
4. (Optional, ties to Christian's MOD-08) On a *second* test incident, acknowledge it, then click **False Alert** and show the confirmation and the resulting status.

### MOD-27 — Emergency Organization and Resource Registry (Cluster E)

**What to say:** "Every responding organization — MDRRMO, BFP, the hospital — and every unit they own is registered here, with its capabilities and ownership, so dispatch always knows who can be sent and who owns them."

**What it does today:** create/edit/filter organizations and resources; each unit shows its owning organization; an Org Administrator can edit only their own organization's units. `frontend/app/(ops)/organizations`, `frontend/app/(ops)/resources`.

**Account to use (website):** `dispatcher1@mdrrmo.bocaue.gov.ph` for the full registry; `orgadmin@mdrrmo.bocaue.gov.ph` for the ownership-scoped proof step.

**Demo steps:**
1. Web, signed in as a dispatcher → **Organizations** — show MDRRMO, BFP, and Bocaue Hospital listed, each with its units under **Resources/Fleet → Registry**.
2. Create a new unit (e.g. "Ambulance 4") under MDRRMO; edit one unit's capability flags.
3. Sign out, sign in as `orgadmin@mdrrmo.bocaue.gov.ph`, and try to edit a BFP-owned unit — show it's refused; then edit an MDRRMO unit — show it's allowed. This is the clearest way to prove the ownership check is real, not decorative.

### MOD-31 — Dispatcher Assignment and Dispatch Authorization (Cluster E)

**What to say:** "AGAP can recommend a unit, but a human dispatcher always has to click to actually authorize sending it — the system never dispatches on its own."

**What it does today:** dispatcher confirms an assignment; can add/remove crew, reassign, or cancel a dispatch; everything audited. `frontend/app/(ops)/operations/dispatch`.

**Account to use (website):** `dispatcher1@mdrrmo.bocaue.gov.ph`.

**Demo steps:**
1. Web, dispatcher → open an **Assessed** incident → **Dispatch**.
2. Pick a recommended unit (Arjay's MOD-30 output appears right here — say so).
3. Add a crew member, then click **Confirm Dispatch** — emphasize this explicit click is the "dispatch decision," nothing happened automatically before it.
4. Show **Reassign** (swap the unit) and **Cancel Dispatch**, and point at the audit entries each one leaves.

### MOD-32 — Responder / Ambulance Crew Mobile Interface (Cluster E)

**What to say:** "This is the responder's whole workday on their phone — see the assignment, navigate, update status step by step, and record what happened. Note: we don't yet push new assignments to the phone instantly — it refreshes every 15 seconds, which is an intentional, stated limit, not a bug."

**What it does today:** assignment list, accept, status progression (en route → on scene → transporting/assisting → resolved), navigation, map, availability toggle. `mobile/app/responder`.

**Account to use:** **mobile only** — `responder1@mdrrmo.bocaue.gov.ph`. No website account (the dispatch that puts the assignment there is done on web by a dispatcher, but this module itself is the phone side).

**Demo steps:**
1. Phone, sign in as `responder1@mdrrmo.bocaue.gov.ph`.
2. Show the assignment inbox receiving the unit Aldrin just dispatched (allow up to 15 seconds, or pull to refresh).
3. **Accept** it, then step through **En Route → On Scene** — show the map/navigation view at each step.
4. Toggle the responder's own **availability** switch and show it reflected live on the web Fleet board (Arjay's MOD-28).

---

## 4. Christian Joaquin — MOD-06, 08, 10, 11, 12 (SOS Trigger & Capture)

### MOD-06 — Immediate SOS Trigger / One-Button SOS (Cluster B)

**What to say:** "This is the big red button — hold it three seconds, and it starts a guided report with the citizen's location already attached, sent straight to the Operations Center. It complements 911 and the hotline; it doesn't replace them."

**What it does today:** hold-to-SOS with vibration/sound, a unique report key so resending never duplicates, guided Confirm Location → Incident Type → Details, a guest path for people without an account inside Bocaue. `mobile/src/components/emergency/HoldToSOS.tsx`.

**Account to use:** **mobile only** — `citizen@demo.agap`, or no account at all for the guest path. No website account.

**Demo steps:**
1. On the home screen, press and hold **SOS** for one second and let go — show nothing is sent (hard to trigger by accident).
2. Hold the full three seconds (feel/show the vibration and filling ring) — the flow starts.
3. Complete the guided flow and note the reference number shown (e.g. `INC-2026-NNNNNN`).
4. Turn on airplane mode, hold SOS again, and show the **failure screen** with the "Call 911 or the MDRRMO Hotline" message and a **Try Again** button. Turn data back on and tap Try Again — show it returns the *same* incident instead of creating a duplicate.
5. (Optional) From the sign-up screen, show a guest ("report without an account") SOS, which requires GPS to confirm the device is inside Bocaue.

### MOD-11 — Precision GPS Capture (Cluster C)

**What to say:** "Instead of a caller trying to describe where they are, the app takes several GPS readings in a few seconds, keeps the best one, and pins it on a map — checked against the Bocaue boundary."

**What it does today:** up to three high-accuracy readings within six seconds (stops early at 20m accuracy); map preview with accuracy; Bocaue boundary check; fallback to typed location for signed-in users, hard requirement for guests. `mobile/src/services/gps`, Confirm Location screen.

**Account to use:** **mobile only** — `citizen@demo.agap`, or guest for the "required" case. No website account.

**Demo steps:**
1. Right after starting SOS, show the **Confirm Location** screen capture a position and display its accuracy (e.g. "±8m") on the map.
2. Deny location permission (or disable GPS) once to show the fallback options: **Retry**, **Edit** (type a location), and — only for a signed-in citizen — **Continue without precise location**.
3. As a guest with GPS off, show the flow is blocked until a Bocaue-area GPS fix is captured — this is the one case where location *is* required.

### MOD-12 — Location Context and Reverse Geocoding (Cluster C)

**What to say:** "The raw coordinates get turned into a street address and an official Bocaue barangay — so dispatchers read 'Igulot, near the bridge,' not a pair of numbers."

**What it does today:** reverse geocoding via Nominatim with a 5-second timeout and graceful fallback to coordinates; editable address; official barangay tagging (PostGIS boundary match, marked approximate near a border). `backend/src/locations/maps/providers/nominatim-geocoding.provider.ts`.

**Account to use:** created on **mobile** as `citizen@demo.agap`. **Website account:** `dispatcher1@mdrrmo.bocaue.gov.ph` (to view the Barangay column in the Incident Queue).

**Demo steps:**
1. On the same Confirm Location screen, show the resolved street address and barangay appear under the map.
2. Tap **Edit** and show the address field is editable by the reporter.
3. Submit the report, then open the web Incident Queue and show the **Barangay** column — point out this is a backend-verified tag, not whatever the phone displayed.

### MOD-10 — Incident Photo and Evidence Capture (Cluster C)

**What to say:** "The reporter can attach one live photo or a short video straight from the in-app camera — never from the gallery, which matters because dispatchers get an advisory check of whether it looks like a genuine, current, on-scene capture."

**What it does today:** in-app camera only, up to 60s video, uploads after the report is saved (never blocks it), authenticity scoring (time/place/live-capture) shown to dispatchers as Verified/Review/Suspect. As of today there's also a second, AI-based layer: an advisory OpenAI vision check (async, never blocks upload) that flags a photo as possibly a screenshot/stock photo/AI image, surfaced as a second badge, plus a dispatcher "Reject evidence" button that warns the reporter. `mobile/app/emergency/capture.tsx`, `backend/src/media/evidence-ai-review.service.ts`.

**Account to use:** created on **mobile** as `citizen@demo.agap`. **Website account:** `dispatcher1@mdrrmo.bocaue.gov.ph` (to view the authenticity chip and, if time allows, the AI flag + Reject button).

**Demo steps:**
1. On the Details screen, tap **Add a photo or video**, take a live photo (not from gallery — there is no gallery option, which is itself worth pointing out), and send the report.
2. Open the web Incident drawer and show the photo with its authenticity chip and the plain-language reasons behind it.
3. Show **Skip** on a second report — the report still sends with no photo.
4. (New today, optional stretch) Wait a few seconds for the AI review badge to appear next to the authenticity chip, then click the small flag icon on the thumbnail to show the **Reject evidence** dialog — point out it only rejects that one attachment, never the incident, and that the reporter gets a warning notification. Needs `OPENAI_API_KEY` set in `backend/.env`; if it's not configured, this step silently does nothing (by design) — skip it.

### MOD-08 — Emergency Cancellation and False Alert Management (Cluster B)

**What to say:** "A reporter can cancel their own report before a unit is dispatched, with a reason. A dispatcher can separately mark an acknowledged report as a false alert. Both are audited and update the dashboard immediately."

**What it does today:** citizen-side cancel with a 911 warning and five reasons, blocked once dispatched; dispatcher-side False Alert from Triage or the drawer, blocked outside Acknowledged/Assessed; both audited and notify the reporter. `mobile/app/emergency/cancel.tsx`, `backend/src/false-alerts`.

**Account to use:** cancel is on **mobile** as `citizen@demo.agap`. **Website account:** `dispatcher1@mdrrmo.bocaue.gov.ph` (for the False Alert action).

**Demo steps:**
1. Send a test report, open it on the phone, tap **Cancel** — show the 911 warning, pick "Accidental trigger," confirm — show the status becomes **Cancelled** with the reason in the timeline.
2. Dispatch a different test report, then try to cancel it from the phone — show it's refused (cancellation is blocked once dispatched).
3. On the web, acknowledge a third test incident in Triage, click **False Alert**, confirm — show the status, the audit entry, and the reporter's in-app notice.

---

## 5. Arjay Mauricio — MOD-30, 26, 52, 22, 28 (Resource Intelligence)

### MOD-30 — Suitable Response Unit Recommendation (Cluster E)

**What to say:** "Before a dispatcher picks a unit, AGAP ranks the suitable ones by capability match, distance and readiness, and shows *why* — but the dispatcher can always override it. The system recommends; it never decides."

**What it does today:** ranked list scored on capability, PostGIS distance, and unit type, with reasons shown. `backend/src/dispatch/resource-matching`.

**Account to use (website):** `dispatcher1@mdrrmo.bocaue.gov.ph`.

**Demo steps:**
1. Web, dispatcher, open an **Assessed** incident → **Dispatch**.
2. Show the ranked unit list with each unit's reason (e.g. "Ambulance 1 — 1.2 km, BLS capable, Available").
3. Deliberately pick a *lower-ranked* unit to show the recommendation is advisory, not enforced.

### MOD-26 — Duplicate Incident Detection and Merging (Cluster E)

**What to say:** "When the same emergency gets reported twice — common during a real event — AGAP flags the likely duplicate by time, location and category, but a dispatcher always confirms the merge. Nothing merges by itself."

**What it does today:** candidate duplicates surfaced by distance (PostGIS) and time window; dispatcher-confirmed merge only. `backend/src/incidents/duplicate-detection/`.

**Account to use:** the two reports are created on **mobile** (`citizen@demo.agap` + a guest/second session). **Website account:** `dispatcher1@mdrrmo.bocaue.gov.ph` (to confirm the merge).

**Demo steps:**
1. From two different phones (or the citizen account plus a guest session), submit two SOS reports of the same category, close together in time and within a short distance of each other.
2. On the web, open either incident and show the **possible duplicate** candidate surfaced.
3. Confirm the merge and show the master incident keeps both reports' history rather than deleting one. (Also show declining a merge, if time allows, to prove it isn't forced.)

### MOD-52 — Disaster Surge and Mass-Casualty Mode (Cluster I)

**What to say:** "For a mass-casualty event — like an industrial fire in Bundukan — a supervisor can switch the whole operations view into surge mode: multiple patients get triage tags, a resources summary shows what's available municipality-wide, and a broadcast can go out. One honest limit: the triage-tag list refreshes every 30–60 seconds, not instantly."

**What it does today:** surge mode on/off, triage tags, resources summary, broadcast. `backend/src/disaster-mode`, `frontend/app/(ops)/operations/surge`.

**Account to use (website):** `supervisor@mdrrmo.bocaue.gov.ph`.

**Demo steps:**
1. Web, signed in as `supervisor@mdrrmo.bocaue.gov.ph` → **Operations → Surge**.
2. Click **Activate Surge Mode** for the current (or a test) incident.
3. Add two or three patients with different triage tags (e.g. Red/Yellow/Green) and show the resources summary.
4. Send the surge broadcast and show it appear on the dashboard.
5. Deactivate surge mode and state the refresh-rate limit if asked.

### MOD-22 — Real-Time Incident Map (Cluster D)

**What to say:** "The operations map shows every active incident and every responder's live position on an actual Bocaue map, color-coded by priority, with flood-prone barangays overlaid."

**What it does today:** MapLibre map with incident markers by priority, live responder markers, flood overlays, click-to-open. `frontend/app/(ops)/operations/map`.

**Account to use (website):** `dispatcher1@mdrrmo.bocaue.gov.ph` or `supervisor@mdrrmo.bocaue.gov.ph`.

**Demo steps:**
1. Web, dispatcher or supervisor → **Operations → Map**.
2. Point out the color-coded incident markers and the flood-prone-barangay overlay (Lolomboy, Bunlo, Igulot, Bambang).
3. From the phone, submit a new SOS and show the marker appear on the map live, with no refresh.
4. Click a marker to open that incident's drawer directly from the map.

### MOD-28 — Response Unit Availability and Readiness (Cluster E)

**What to say:** "Every unit's current status — available, assigned, en route, on scene, unavailable, in maintenance — is visible on one board, and it's live: a responder changing their own status on the phone updates this board immediately."

**What it does today:** fleet board with a status summary and a live status dropdown; responders set their own availability from the app. `frontend/app/(ops)/operations/fleet`.

**Account to use:** **website:** `dispatcher1@mdrrmo.bocaue.gov.ph`. **Mobile:** `responder1@mdrrmo.bocaue.gov.ph` (toggling own availability).

**Demo steps:**
1. Web, dispatcher → **Operations → Fleet**.
2. Change a unit's status via the dropdown (e.g. to "Maintenance") and show the summary tile counts update.
3. On the responder phone (Aldrin's MOD-32 account), toggle the responder's own availability, and show the web Fleet board update live without a page refresh — this is the strongest "proof" moment for this module because it visibly links the mobile and web sides of the same system.

---

## 6. Additional Modules Reviewed — MOD-01, 07, 13, 16, 18

These five aren't part of the 25-module, five-person assignment above — they were reviewed separately and are added here as extra coverage in case the instructor asks about them, or in case someone wants a backup module to show. Each was independently re-checked against the current code tonight (2026-10-24), the same way MOD-18 was checked earlier.

### MOD-01 — User Registration and Profile Management (Cluster A)

**What to say:** "A resident creates an AGAP account from inside Bocaue only, verifies their number with a one-time SMS code, and signs in afterward by password, SMS code, or passkey. None of this is ever required to report an emergency — guest reporting stays available."

**What it does today — verified exactly as documented, no discrepancies:** Bocaue geo-fence check on registration (PostGIS `ST_Within`), password rule (8+ chars, upper/lower/digit/symbol), PH phone format, 6-digit OTP valid 15 minutes (registration) / 10 minutes (login), passkey sign-in. `backend/src/auth/auth.service.ts`, `mobile/app/auth`, `mobile/app/profile`.

**Account to use:** **mobile only** — no website account. **Important for the demo:** don't reuse `citizen@demo.agap` for the registration walkthrough — it's already verified, so the OTP step can't be shown on it. **Register a brand-new account live** instead; that's also the stronger "proof" moment since the instructor watches the OTP arrive and get verified in real time.

**Demo steps:**
1. Tap **Create Account**, grant location, and show the Bocaue-only check (works from inside Bocaue; explain it would block outside).
2. Fill in name, phone, password — show a weak password gets rejected (missing a symbol/number).
3. Submit, then show the OTP step. If Textbee isn't loaded, open the backend log and show `[DEV] Registration OTP for … (expires in 15 min)` — this is expected dev behavior, not a bug.
4. Enter the code, land on Home signed in.
5. Sign out, sign back in with a one-time SMS code instead of the password, to show the second login method.
6. **Do not claim:** editing your name/address or deleting your account from the app — the backend routes exist (`PATCH /users/me`, `DELETE /users/me`) but no screen uses them.

### MOD-07 — Shake-to-Alert Trigger (Cluster B)

**What to say:** "A second way to start a report for someone whose hands are busy or who can't look at the screen: shake the phone hard, and a five-second countdown starts — cancel it, or let it run out to begin the same SOS flow as the button, recorded as triggered by a shake."

**What it does today — verified exactly as documented, no discrepancies:** shake threshold ~2.5g with a 2-second debounce, 5-second countdown with vibration and Cancel/Send now, only listens on the home screen while the app is foregrounded, the setting is on, and no incident is already active. `mobile/src/services/shake-detector/shake-detector.service.ts`, `mobile/src/components/emergency/ShakeCountdown.tsx`.

**Account to use:** **mobile only** — `citizen@demo.agap`. No website account (optionally reopen the web drawer afterward as `dispatcher1@mdrrmo.bocaue.gov.ph` to point at "Trigger: Shake" in the Overview).

**Demo steps:**
1. On the home screen, shake the phone hard — the countdown appears with vibration.
2. Tap **Cancel** — show nothing was created.
3. Shake again and let the countdown run out (or tap **Send now**) — the normal SOS flow opens.
4. Complete the report, then open it on the web as a dispatcher and show **Trigger: Shake** versus a button-triggered report showing **Trigger: SOS button**.
5. **Do not claim:** shake detection while the app is backgrounded or the phone is locked, or a Filipino-language countdown (English only for now).

### MOD-13 — Live Incident Location Tracking (Cluster C)

**What to say:** "While an incident is active, the responder's phone pushes a live GPS position, and both the citizen's own tracking screen and the dispatcher's ops map update instantly over the same realtime connection — never the responder's name or phone number, only their unit call sign."

**What it does today — mostly verified, one correction to the written report:** the report says positions are accepted "only while ACCEPTED"; the actual code is slightly more permissive — it accepts a position while the dispatch is `PENDING`, `SENT`, **or** `ACCEPTED` (`backend/src/locations/locations.service.ts`), so this works even before the responder has tapped Accept. ETA recalculation is throttled to once per 15 seconds per dispatch; a position older than 60 seconds is shown as "signal lost" instead of a frozen marker. `backend/src/locations/locations.service.ts`, `mobile/src/hooks/useIncidentTracking.ts`, `mobile/app/tracking/[id].tsx`.

**Account to use:** this one is a genuine freebie for tomorrow — it piggybacks exactly on the seeded demo dispatch with **zero extra setup**: `ALPHA-1` is already dispatched to `INC-2026-DEMO01`, reported by `citizen@demo.agap`, crewed by `responder1@mdrrmo.bocaue.gov.ph`. **Mobile:** `responder1@mdrrmo.bocaue.gov.ph` (posts position) and `citizen@demo.agap` (views the tracking screen). **Website account:** `dispatcher1@mdrrmo.bocaue.gov.ph` or `supervisor@mdrrmo.bocaue.gov.ph` (ops map).

**Demo steps:**
1. On the responder phone (`responder1@mdrrmo.bocaue.gov.ph`), open the `ALPHA-1` assignment and let it post a position (or trigger one manually).
2. On the citizen phone (`citizen@demo.agap`), open **Track my report** for `INC-2026-DEMO01` and show the unit marker and ETA — no manual refresh.
3. On the web, as a dispatcher/supervisor, open the ops map and show the same unit's live marker.
4. Stop posting positions and wait past the 60-second mark to show the marker switch to "signal lost" instead of staying frozen as if still live.
5. **Do not claim:** background tracking while the app is closed/locked, or a guaranteed push interval — only that ETA recalculation is capped at once per 15 seconds.

### MOD-16 — Emergency Contact Notification (Cluster D)

**What to say:** "The moment a citizen's report is saved, AGAP texts the contacts that citizen already chose — automatically, in the background — so family doesn't have to be called one by one while the emergency is still happening."

**What it does today — a real bug was found and fixed tonight:** the per-contact "notify on alert" switch (MOD-02) was being silently ignored server-side — every active contact was texted regardless of that toggle, which would have visibly broken the MOD-02 demo claim ("only the alerts-on contact gets an SMS") live in front of the instructor. **Fixed just now** in `backend/src/emergency-contacts/emergency-contact-notification.service.ts` (added `notify_on_alert: true` to the contact query) and the backend has been rebuilt and restarted with the fix live. Everything else — 160-character SMS truncation, 2 retry attempts with a 5-second backoff, fire-and-forget (a notification failure never touches the incident) — was already correct.

**Account to use:** **mobile only** to trigger it — `citizen@demo.agap`, after setting up one alerts-on and one alerts-off contact via MOD-02. **No website account** — this module has no dedicated UI on either surface; the only "proof" is a real SMS arriving (if Textbee/the phone+SIM is loaded) or the backend log line confirming how many contacts were queued.

**Demo steps:**
1. On `citizen@demo.agap`, confirm one contact has "notify on alert" **on** and a second has it **off** (MOD-02).
2. Submit a real SOS.
3. If Textbee is loaded: show only the alerts-on contact's phone receives the SMS. If not loaded: open the backend log and show the queued-count line instead, and say what *should* happen.
4. **Do not claim:** delivery confirmation for this path (it's fire-and-forget, 2 retries then gives up — no "delivered" receipt), or any channel besides SMS (no push/email to contacts who aren't AGAP users).

### MOD-18 — Responder Assignment Notification and Dispatch Messaging (Cluster D)

**What to say:** "When a dispatcher confirms a dispatch, the system records it, marks the unit dispatched, broadcasts it live to the operations dashboard, tells the reporter help is on the way, and relays the responder's own status changes back to the dispatcher who assigned them — automatically, without a radio call."

**What it does today — verified in depth earlier today; mostly accurate, two caveats worth knowing before presenting:**
- Dispatch creation, cancel, reassign are all transactional, audited (`MOD-31`), and broadcast live — confirmed exactly as documented.
- **Caveat 1:** adding/removing crew on an existing dispatch is audited but **not broadcast** over the realtime connection — if the instructor expects a second open dashboard to update live when crew changes, it won't; only create/cancel/reassign broadcast live.
- **Caveat 2:** the `resource.status_changed` event only reaches the ops dashboard room, not the specific incident's own room — not something a presenter would normally notice, but worth knowing if asked why a unit's status didn't update inside one specific incident's own view.
- Confirmed accurate: the responder's phone has **no push notification** for a brand-new assignment — it's a 15-second REST poll (`mobile/src/hooks/useResponderAssignments.ts`). State this as a known, intentional limit if asked, exactly like MOD-32.

**Account to use:** **website:** `dispatcher1@mdrrmo.bocaue.gov.ph` (confirms the dispatch). **Mobile:** `responder1@mdrrmo.bocaue.gov.ph` (sees the assignment in Missions, up to 15 seconds later).

**Demo steps:**
1. Web, as `dispatcher1@mdrrmo.bocaue.gov.ph`, dispatch a unit to an Assessed incident (same action as MOD-31 — point out this *is* MOD-31's "Confirm Dispatch" click, just viewed from the notification/messaging side).
2. Open a second dispatcher browser window and show it also sees the new assignment live, no refresh.
3. On the responder phone, show the assignment appear in Missions within ~15 seconds (or pull to refresh).
4. Advance the responder through **En Route → On Scene** and show the assigning dispatcher's notification bell pick up each change.
5. **Do not claim:** a push notification to the responder's phone for the new assignment itself (covered above), or messaging to any unit outside AGAP (no external-agency radio/CAD bridge).

---

## Closing notes for whoever presents last

- If the instructor asks "what's left to build," the honest answer across this whole module set is: nothing blocking — every module above works end to end today. A few modules *elsewhere* in the 53 (not in this group's list) are tagged "walkthrough pending," meaning built and unit-tested but not yet hand-verified by a team member; don't claim those as done if asked, but they aren't part of tomorrow's assignment anyway.
- If asked why module numbers jump (e.g. no MOD-19 anywhere in the 53): MOD-19, Offline Emergency Queue and Retry, was *deliberately eliminated* — a report queued on a disconnected phone could arrive hours late, possibly after the emergency (or the patient) was already gone, which the team judged more dangerous than guaranteed delivery. The system sends over data and SMS simultaneously instead and tells the citizen to call the hotline if both fail. Good one-liner to have ready even though it's not one of your 25.
- Keep every demo on the actual running app — the instructor is checking for "the proof," not slides. If a live step fails for a trivial reason (phone signal, Expo reload), narrate what *should* happen and move on; don't stall the group's time slot on one screen.
