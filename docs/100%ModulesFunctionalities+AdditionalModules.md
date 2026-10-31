# AGAP — Implemented Modules (100% Functional) and Additional Modules

**Date:** 2026-10-22, re-checked 2026-10-23
**Purpose:** a reference for the Individual Module Report check-up. It shows which modules each member can document and get signed now, which need a caveat written into the TO-BE, and which are not ready.
**Module specs:** [docs/modules/](modules/). Owners come from each spec's "Prepared By" line.
**Fix plan:** [plans/MODULE_GAPS_COMPLETION_PLAN.md](plans/MODULE_GAPS_COMPLETION_PLAN.md). All five of its phases are built (2026-10-23); their walkthroughs are pending.

> **Rule for the reports.** The `docs/modules/MOD-XX_*.md` specs describe the full planned design. The **TO-BE** section of a report must describe only what the app does today. Do not copy features from a spec into the TO-BE unless this file lists them as working.

---

## How this list was made

- The code was read module by module on 2026-10-22: backend controller and service, web page, and mobile screen. Each module also had to have a working path from a screen to the database.
- Automated checks on the same day:
  - **Typecheck:** passes in all four packages (shared, backend, frontend, mobile).
  - **Frontend tests:** 59 of 59 pass.
  - **Backend tests:** 632 of 643 pass in a full run. The 11 failures are bcrypt timeouts in the login security (MFA) suites on a busy machine. Run alone, all 132 auth tests pass, and the whole suite passes with `--testTimeout=30000` (see the [handoff](handoff/2026-10-22_incident-timeline-push-and-verified-reporter.md)).
- **Re-check on 2026-10-23**, after the fix plan and a review:
  - Every "Main code" path below exists, every backend module is registered, and every API area a module uses is called from a web or phone screen.
  - Every endpoint requires sign-in unless it is meant to be public (login, health, the barangay link page).
  - **Typecheck** passes in all four packages. **Tests:** backend 777 of 777 (51 suites, run with `--testTimeout=30000`), frontend 60 of 60, mobile 8 of 8.
  - Fixed in this round: MOD-27 Organization column, MOD-03 encryption at rest, MOD-46 audit rows protected in the database, and the review findings for MOD-38, 40 and 50 (see the fix plan).
- **What "functional" means here:** the code does it, end to end. Before the leader signs, each member must still run their module by hand with test data (Section III of the instructions). Rows marked **Walkthrough pending** are built but have never been tried by hand.

**Legend**

| Mark | Meaning |
|---|---|
| ✅ | Works end to end. Can be documented as is. |
| 🟡 | Works, with a limit that the TO-BE must state. |
| ❌ | Not ready. Do not get it signed yet. The fix plan covers it. |
| ⛔ | Eliminated from the system by decision. |
| 📄 | Report written: the module's report content is in [module-reports/](module-reports/). |

---

## Summary

| Status | Count | Modules |
|---|---|---|
| ✅ Works end to end | 52 | 01–18, 20–53 |
| ↳ of which built on 2026-10-23, walkthrough pending | 5 | 07, 38, 40, 50, 51 |
| ↳ of which built on 2026-10-30 (automation plan Phase 1), walkthrough pending | 1 | 32 (MOD-53's STOP processing also pending) |
| ↳ of which built on 2026-10-30 (automation plan Phase 2), walkthrough pending | 1 | 52 (MOD-51's hotspot proposals also pending) |
| ↳ of which built on 2026-10-30 (automation plan Phase 4), walkthrough pending | 1 | 39 (MOD-38's hospital ranking also pending; MOD-28's unit heartbeat deferred) |
| 🟡 Works, with a stated limit | 0 | — (16 and 17 still need SMS credit for the demo) |
| ❌ Not ready | 0 | — |
| ⛔ Eliminated | 1 | 19 |
| 📄 Report written | 52 | 01–18, 20–53 (re-checked against the code 2026-10-31) |

---

## Module status by member

**Reports written (📄):** MOD-01, MOD-02, MOD-03, MOD-05 and MOD-53. The content is in [module-reports/](module-reports/), ready to copy into the [report template](AGAP_Individual_Module_Report_Template.pdf). These five rows were corrected on 2026-10-22 after a closer code reading.

### Justine R. Soliman — MOD-01 to 08, MOD-53

| MOD | Module | Status | Report | What works (basis for the TO-BE) | Main code |
|---|---|---|---|---|---|
| 01 | User Registration and Profile | ✅ | 📄 [Report](module-reports/MOD-01_User_Registration_and_Profile_Management.md) | Citizen registration with OTP verification, guest registration, phone or email login, refresh-token rotation, forgot and reset password, profile view and preference settings (name and address can't be edited in the app). Registration is limited to Bocaue by a GPS check (see Additional Module A6). | `backend/src/auth`, `backend/src/users`, `mobile/app/auth`, `mobile/app/profile` |
| 02 | Emergency Contact Management | ✅ | 📄 [Report](module-reports/MOD-02_Emergency_Contact_Management.md) | Add, edit and remove contacts; every active contact gets the SMS alert (the per-contact switch was removed). Visible only to the owner. No phone-format check and no reordering in the app yet. | `backend/src/emergency-contacts`, `mobile/app/contacts` |
| 03 | Medical Profile | ✅ | 📄 [Report](module-reports/MOD-03_Medical_Profile.md) | Blood type, allergies, conditions and medications, saved only after a separate medical consent. Every medical value is encrypted at rest (AES-256-GCM, `MEDICAL_ENCRYPTION_KEY`) and readable only through the app. Missing medical data never blocks dispatch. No screen shows it to responders yet. | `backend/src/medical-profiles`, `backend/src/consent`, `mobile/app/medical` |
| 04 | Accessibility and Multi-Language | ✅ | — | English and Filipino, text size, high contrast, reduced motion, and the Shake-to-Alert switch. The preferred language is saved to the profile. | `mobile/src/i18n/translations.ts`, `mobile/src/stores/accessibility.store.ts`, `mobile/app/profile/accessibility.tsx` |
| 05 | Emergency Readiness and Permissions | ✅ | 📄 [Report](module-reports/MOD-05_Emergency_Readiness_and_Permission_Status.md) | Checklist of location, notification and camera permissions, profile completeness, contacts and medical profile. Each row links to the screen that fixes it. | `mobile/app/settings/permissions.tsx`, `mobile/src/services/readiness`, `GET /v1/users/me/readiness` |
| 06 | Immediate SOS Trigger | ✅ | — | Hold-to-SOS button → confirm location → incident type → reporter or patient → details → photo → submit. Each report carries a unique key, so a resend never creates a duplicate. | `mobile/src/components/emergency/HoldToSOS.tsx`, `mobile/app/emergency/*`, `backend/src/incidents` |
| 07 | Shake-to-Alert | ✅ (walkthrough pending) | — | On the home screen, a shake opens a 5-second countdown with vibration, **Cancel** and **Send now**. It then starts the same SOS flow as the button, and the incident is saved as `SHAKE_GESTURE` (the button saves `SOS_BUTTON`). It only listens while the home screen is open, the app is in front, the setting is on and no incident is active. The home chip and Accessibility both toggle it. Dispatchers see the trigger in the drawer. The countdown text is English only. | `mobile/src/hooks/useShakeToAlert.ts`, `mobile/src/components/emergency/ShakeCountdown.tsx`, `mobile/src/services/shake-detector` |
| 08 | Cancellation and False Alerts | ✅ | — | The citizen cancels with a reason (911 and MDRRMO numbers are shown). The dispatcher marks a false alert from triage. Both are audited and push a notice to the reporter. | `mobile/app/emergency/cancel.tsx`, `backend/src/false-alerts` |
| 53 | Municipal Announcements | ✅ | 📄 [Report](module-reports/MOD-53_Municipal_Announcements_and_Public_Broadcast.md) | Compose, schedule, publish and archive in the structured Mayor's Office format. Publishing pushes to subscribed phones. Citizens read, subscribe and unsubscribe in the app. A subscriber's STOP reply (also UNSUBSCRIBE, ITIGIL, HUWAG NA…) to the Textbee phone deactivates them, is audited and gets one confirmation SMS; a barangay hotline's STOP is still handled as a barangay reply (`SMS_OPT_OUT_ENABLED`, default on; added 2026-10-30, automation plan C3, walkthrough pending: not yet checked with a real phone). One-way broadcast only. CRITICAL advisories can require Supervisor approval (submit, then approve or return, on the Approvals page), but only when `ANNOUNCEMENT_APPROVAL_REQUIRED=true`. It is off by default, and then the publisher releases their own notice. | `backend/src/announcements`, `frontend/app/(ops)/announcements`, `mobile/app/announcements` |

### Vanessa Danielle T. Jose — MOD-09 to 16

| MOD | Module | Status | What works | Main code |
|---|---|---|---|---|
| 09 | Rapid Incident Detail Capture | ✅ | Guided questions per incident type, landmark, free-text description. Every field is optional. | `mobile/app/emergency/incident-details.tsx`, `incident-type.tsx` |
| 10 | Photo and Evidence Capture | ✅ | Camera capture with retake, uploaded to object storage and linked to the incident. A failed photo never blocks the report. | `mobile/app/emergency/capture.tsx`, `backend/src/media` |
| 11 | Precision GPS Capture | ✅ | High-accuracy fix with an accuracy reading. The reporter confirms the pin and can continue without GPS. | `mobile/src/services/gps`, `mobile/app/emergency/location.tsx`, `backend/src/locations` |
| 12 | Reverse Geocoding | ✅ | Coordinates → address and barangay, using the Nominatim provider. | `backend/src/locations/maps/providers/nominatim-geocoding.provider.ts` |
| 13 | Live Incident Location Tracking | ✅ | Location updates are stored in history and pushed live to the operations map and the tracking screen. | `backend/src/locations`, `mobile/app/tracking/[id].tsx` |
| 14 | Incident Record and Ticketing | ✅ | Each incident is saved to PostgreSQL first and gets a public reference (`INC-2026-NNNNNN`). The reporter and the patient are separate records, and an unknown patient is allowed. | `backend/src/incidents`, `backend/src/emergency-alerts` |
| 15 | Incident Lifecycle State Management | ✅ (walkthrough pending) | Allowed status transitions are enforced by a shared transition table. Every change is timestamped, audited and broadcast live. Incident progress is also stamped per dispatch so multiple units can advance independently; the incident resolves only after the last active unit finishes. | `backend/src/incidents/incident-status`, `backend/src/responders/responders.service.ts`, `shared/src/enums/incident-status.enum.ts` |
| 16 | Emergency Contact Notification | ✅ (SMS needs load) | When a signed-in citizen submits a report, their emergency contacts with alerts on get an SMS through Textbee, plus app notices for each timeline step (see A8). **The live SMS demo needs credit on the Textbee phone.** | `backend/src/emergency-contacts/emergency-contact-notification.service.ts`, `backend/src/notifications` |

### Jhobert S. Dionisio — MOD-17 to 24, MOD-51

| MOD | Module | Status | What works | Main code |
|---|---|---|---|---|
| 17 | Multi-Channel Transmission Gateway | ✅ (SMS needs load) | The data path (HTTPS) and a backend SMS to MDRRMO operations, under 160 characters in the `AGAP\|INC-…\|lat,lng\|time\|TYPE\|C:Y` format. The SMS is sent only after the incident is saved, and a failed SMS never cancels the incident. | `backend/src/jobs/processors/sms.processor.ts`, `backend/src/emergency-alerts` |
| 18 | Responder Assignment and Dispatch Messaging | ✅ (walkthrough pending) | A dispatch creates an assignment with per-unit field progress stamps, appears in the responder app (refreshed every 15 seconds and after each action), and notifies the reporter. | `backend/src/dispatch`, `backend/src/responders`, `mobile/app/responder/assignments.tsx` |
| 19 | Offline Queue and Retry | ⛔ | **Eliminated.** See the section below. | — |
| 20 | Real-Time Event / WebSocket Engine | ✅ | Socket.io with a sign-in check at connection, rooms per user, per incident and for operations staff, and the standard events. A failed broadcast never blocks a request. | `backend/src/realtime` |
| 21 | Operations and Dispatch Dashboard | ✅ | A dashboard per role (dispatcher, supervisor, LGU) with live KPI tiles, recent incidents, a connection indicator and a surge banner. | `frontend/app/(ops)/dashboard`, `frontend/components/dashboard` |
| 22 | Real-Time Incident Map | ✅ | MapLibre map of Bocaue with incident markers colored by priority, live responder markers and flood-prone overlays. Clicking a marker opens the incident. | `frontend/app/(ops)/operations/map` |
| 23 | Incident Command Queue | ✅ | Sortable, filterable incident list with live updates and a detail drawer (Overview, Barangay, Timeline, Chat). The queue shows a fire-status badge and a "12 rescued" badge, and the drawer has Fire and Rescue cards from the crews' field reports (unit field flow plan Phases 3–4; walkthrough pending). | `frontend/app/(ops)/operations/incidents`, `IncidentDetailDrawer.tsx` |
| 24 | Severity and Priority Recommendation | ✅ | A recommended priority with its reasons. The dispatcher confirms or overrides it. | `backend/src/incidents/priority` |
| 51 | Risk Intelligence and Visualization | ✅ (walkthrough pending) | The heatmap, flood and industrial overlays and the list of active risk areas (read-only, for operations staff). The System Administrator adds, edits, deactivates and deletes risk areas on **Administration → Risk Areas**: the barangay is checked against the official list, the flood threshold is shown only for FLOOD (hint: 11.50 m), and every change is audited. Area boundaries can't be drawn; new areas attach to a barangay. Each night (02:30) the system looks for places where 4 or more incidents of one type happened within about 150 m in the last 90 days, and lists them under **Proposed areas** with the barangay and count. Areas already covered by an active risk area, and recently dismissed ones, are skipped. Approving creates the risk area with the cluster's map boundary; dismissing hides it. Both are audited, and nothing is added without the administrator (added 2026-10-30, automation plan C7, walkthrough pending). | `backend/src/risk-intelligence`, `frontend/app/(ops)/operations/risk`, `frontend/app/(ops)/administration/risk-areas` |

### Christian Joaquin — MOD-25 to 32, MOD-52

| MOD | Module | Status | What works | Main code |
|---|---|---|---|---|
| 25 | Triage and Validation | ✅ | Triage queue (Submitted, Received, Acknowledged) with actions to mark received, acknowledged and assessed, plus false alert. Audited. | `frontend/app/(ops)/operations/triage`, `backend/src/dispatch` |
| 26 | Duplicate Detection and Merging | ✅ | Candidate duplicates by distance (PostGIS) and time window. The dispatcher confirms any merge; nothing merges automatically. | `backend/src/incidents/duplicate-detection/` |
| 27 | Organization and Resource Registry | ✅ | Create, edit and filter organizations and resources (Fleet → Registry). Each unit shows its organization. An Org Administrator edits only their own organization's units. | `frontend/app/(ops)/organizations`, `resources`, `backend/src/organizations`, `backend/src/resources` |
| 28 | Unit Availability and Readiness | ✅ | Fleet board with a status summary and a live status dropdown. The responder app sets its own availability. *Automation plan C5 ("No signal" badge) is **deferred**: idle units send no GPS (location is stored only while a crew is on an active dispatch, and units have no standing crew list), so it needs a unit roster and an on-duty ping first.* | `frontend/app/(ops)/operations/fleet`, `backend/src/fleet` |
| 29 | Capability Matrix | ✅ | A required-capability table for all 8 categories, used to score units. | `backend/src/dispatch/resource-matching` |
| 30 | Unit Recommendation | ✅ | A ranked list scored on capability, distance (PostGIS) and unit type, with the reasons shown. | `backend/src/dispatch/resource-matching` |
| 31 | Dispatch Authorization | ✅ | The dispatcher must click to confirm an assignment. Add or remove crew, cancel a dispatch. All audited. | `frontend/app/(ops)/operations/dispatch`, `backend/src/dispatch` |
| 32 | Responder Mobile Interface | ✅ (walkthrough pending) | Assignment list, accept, per-unit en route → on scene → finish progress, navigation, map, availability, and unit-specific field-flow actions. Ambulance/motorcycle medical actions are enforced server-side; fire and rescue units get their own field forms; every unit can finish its own part. Every crew member gets a phone push ("New assignment", category and case reference only, high-importance `assignments` channel) when dispatched or added to a crew, and "Assignment cancelled" when the dispatch is cancelled; tapping it opens the assignment. The 15-second refresh stays as the fallback. A failed push never affects the dispatch. Added 2026-10-30 (automation plan C1); not yet checked on a backgrounded phone. The two-crew and multi-unit walkthrough remains pending. Every accepted crew has a "Request help" row (Ambulance / Fire unit / Rescue unit / More personnel, optional note for dispatchers only) that notifies dispatchers and never dispatches by itself; the header names the unit's flow ("BFP Fire Truck 1 · Fire unit"). Added 2026-10-31 (unit field flow plan, Prompt 2b); walkthrough pending on a device. A fire unit's crew now files fire reports from the phone (works offline through the outbox) and sees the latest fire status, also while another unit transports or treats; Finish asks first when the last report isn't "Fire out", and never blocks (Phase 3, walkthrough pending). A rescue boat or truck crew now logs each trip from the phone (people rescued, families, children under 18, elderly 60+, PWD, pregnant, still waiting, water level, access, where taken, with evacuation centers nearest first; works offline through the outbox) and sees the running totals; Finish asks first when people are still waiting, and never blocks (unit field flow plan Phase 4, decision D2; walkthrough pending). | `mobile/app/responder`, `backend/src/responders`, `shared/src/constants/unit-field-flow.ts` |
| 52 | Disaster Surge and Mass-Casualty Mode | ✅ (walkthrough pending) | Turn surge mode on and off, triage tags, a resources summary, broadcast. Triage tags now update live on every open surge page (`surge.triage_tag_updated`); the 30–60-second refresh stays as the fallback. **Surge recommendation:** every 5 minutes the system checks recent incidents against MDRRMO-editable rules (8 incidents in 30 min anywhere; 5 FLOOD in Lolomboy, Bunlo, Igulot or Bambang in 30 min; 2 INDUSTRIAL in Bundukan or Biñang 1st in 15 min) and an entered Bocaue River reading at or above 11.50 m. When one trips, every Supervisor gets an app notice (at most once an hour per rule) and the surge page shows a banner whose button opens the usual activate form, prefilled. It never activates surge mode itself. Supervisors edit the rules and enter the river level on the surge page; both are audited (added 2026-10-30, automation plan C2, walkthrough pending). While a surge is active, the surge page shows people rescued and still waiting per barangay from the rescue crews' trip logs since the surge was declared, refreshed live (unit field flow plan Phase 4; walkthrough pending). A rescue crew finishing with people still waiting, or handing people to an ambulance when none is on the incident, sends dispatchers an in-app notice; neither dispatches anything. | `backend/src/disaster-mode`, `frontend/app/(ops)/operations/surge` |

### Aldrin Dela Cruz — MOD-33 to 40, MOD-49

| MOD | Module | Status | What works | Main code |
|---|---|---|---|---|
| 33 | Secure Incident Communication | ✅ | Chat limited to one incident's participants, delivered live to that incident's room only. Staff appear by role label. | `backend/src/communications`, `mobile/app/incident/chat/[id].tsx`, drawer Chat tab |
| 34 | Multi-Agency Coordination | ✅ (walkthrough pending) | Add or remove participating agencies (for example BFP) on an incident. Barangay coordination extends it (A1). Dispatching a unit now adds its organization automatically, with the unit type as its role (decision D5): once per organization, audited, and a failure there never affects the dispatch. Added 2026-10-31 (unit field flow plan, Phase 3). | `frontend/app/(ops)/operations/multi-agency`, `backend/src/organizations` |
| 35 | Resource Request and Mutual Aid | ✅ | Raise a request to another organization. The receiving org approves or declines. | `operations/multi-agency` (Mutual Aid tab), `backend/src/resources` |
| 36 | Incident Command / ICS Support | ✅ (walkthrough pending) | Activate ICS, assign and remove positions, deactivate. Supervisor only. Fire reports: a fire unit's crew (or staff relaying the radio) files append-only size-up reports (status, alarm level, hazards, counts; D1 provisional until BFP Bocaue confirms the alarm terms). Ops sees a live Fire card in the incident drawer and a fire badge in the queue. Fireworks, trapped people, 3rd alarm or above, or casualties with no ambulance send dispatchers and supervisors a notice; nothing is dispatched or activated automatically. Added 2026-10-31 (unit field flow plan, Phase 3). | `frontend/app/(ops)/operations/command`, `backend/src/incidents` |
| 37 | On-Scene Patient Assessment | ✅ | Optional vitals and assessment form in the responder app, saved, audited and broadcast. | `mobile/app/responder/assessment/[id].tsx`, `backend/src/incidents/assessment` |
| 38 | Hospital Receiving Coordination | ✅ (walkthrough pending) | A dispatcher or supervisor uses **Refer to hospital** in the incident drawer (hospital, dispatch, pre-arrival notes, ETA labeled "estimated"). Terminal incidents and a second pending referral to the same hospital are refused, and the hospital's users get an app notice. The hospital user sees the referral on the Hospitals page (20-second refresh), acknowledges it and marks the patient arrived; the drawer shows Pending, Acknowledged or Arrived. Creation, acknowledgment and arrival are audited. A hospital user sees only their own hospital's referrals; citizens and the System Administrator see none. **Refer to hospital** now lists up to 5 suggested hospitals first (C6: straight-line distance, receiving status, ER and ICU need, beds), each with its reasons; a status over 12 h old counts as unknown. The full list stays below and the dispatcher picks (walkthrough pending). | `frontend/components/incidents/IncidentDetailDrawer.tsx`, `frontend/app/(ops)/hospitals`, `backend/src/hospitals` |
| 39 | Hospital and Facility Registry | ✅ (walkthrough pending) | Hospital list with search, create and edit. Receiving status (C8): a hospital user reports status and beds for their own organization's facilities (dispatchers and supervisors for any), audited; the page shows how long ago it was reported, in amber after 12 h. Hourly, each hospital user of a facility whose status is over 6 h old gets one app notice per 6 h; on the 1st of each month every Org Administrator gets a list of facilities not verified and units not updated in 90 days. The jobs never change a stored status. | `frontend/app/(ops)/hospitals`, `backend/src/hospitals`, `backend/src/facilities` |
| 40 | Transport and Destination Tracking | ✅ (walkthrough pending) | After **Transporting**, the responder picks the destination hospital (sorted by distance, with search) or **Decide later**, and records **Arrived at hospital** with one tap. Transport can begin after another unit is **ASSISTING**, and a resolving crew checks open transports across the incident before the last-unit resolve. A failed destination save never undoes TRANSPORTING. The drawer's Transport section shows destination, start, estimated arrival and arrival, and a dispatcher or supervisor can change the destination. One open transport per dispatch; changes are audited. | `mobile/src/components/responder/DestinationPicker.tsx`, `mobile/app/responder/assignment/[id].tsx`, `backend/src/incidents/transport` |
| 49 | System Administration | ✅ | Users (create, change role, activate, deactivate), configuration, health and integrations, barangay directory, risk areas (MOD-51), permissions reference. Since role dashboards Phase 5b the System Administrator has no operational powers (no dispatch, fleet status, surge, escalations or referrals). Only an account with no history can be deleted; anyone who has signed in or acted is deactivated instead, so audit rows keep their actor. | `frontend/app/(ops)/administration`, `backend/src/administration` |

### Arjar Mauricio — MOD-41 to 48, MOD-50

| MOD | Module | Status | What works | Main code |
|---|---|---|---|---|
| 41 | SLA and Escalation Engine | ✅ (walkthrough pending) | A background job watches SLA policies and raises escalations. The escalations board lets staff acknowledge and resolve them, with live updates. | `backend/src/jobs/processors/sla-monitor.processor.ts`, `backend/src/escalations`, `frontend/app/(ops)/operations/escalations` |
| 42 | User-Facing Emergency Status | ✅ (walkthrough pending) | The citizen's incident screen shows the live status timeline, plus a push and an app notice for each step (see A8). | `mobile/app/incidents/[id].tsx`, `backend/src/notifications/incident-status-notifier.ts` |
| 43 | Live ETA and Responder Tracking | ✅ | A route-based ETA is refreshed by a background job and always labeled "est.". The responder's position is shown live. | `backend/src/jobs/processors/eta-refresh.processor.ts`, `mobile/app/tracking/[id].tsx` |
| 44 | Incident Handover | ✅ | Create a handover; the receiver acknowledges it. Live broadcast. | `backend/src/incidents/incident-handover`, multi-agency Handover tab |
| 45 | Resolution and Closure | ✅ (walkthrough pending) | The responder resolves; the dispatcher records the outcome and closes in the **Resolve & Close** dialog. The reporter is notified. The dialog was fixed on 2026-10-22 and has not been checked by hand. | `backend/src/incidents`, `IncidentDetailDrawer.tsx` (`ResolutionDialog`) |
| 46 | Immutable Audit Trail | ✅ | Every consequential action writes an audit row. The database itself refuses any UPDATE, DELETE or TRUNCATE on `audit_logs`, and deleting a user or an incident can no longer rewrite audit rows. A filterable read-only viewer for supervisors and administrators. | `backend/src/audit`, `frontend/app/(ops)/audit` |
| 47 | Role-Based Access Control | ✅ | Every endpoint checks the sign-in and role. Web navigation and pages are limited by role. Note: the Roles & Permissions tab is reference only; no guard reads it. | `backend/src/common/guards`, `frontend/middleware.ts`, `frontend/components/layout/Sidebar.tsx` |
| 48 | Privacy, Consent and Medical Data | ✅ (walkthrough pending) | Medical consent is granted and withdrawn separately; medical data is encrypted at rest; access log and data export (the export returns the owner's medical data readable). Responder profile access is limited to an active crew on an incident involving the target reporter or patient, with the incident public reference in the access-log purpose; a refused read is audited (`PERMISSION_DENIED`). | `backend/src/consent`, `backend/src/privacy`, `backend/src/medical-profiles` |
| 50 | Emergency Response Analytics | ✅ (walkthrough pending) | Volume, false-alert, response-time and SLA-compliance charts, all for a 7, 30 or 90-day range. Response times and SLA come from the incident timestamps; the SLA threshold comes from the most specific active SLA policy (default 120 s to acknowledge, 300 s to dispatch). An empty range shows "No data", not 0%. Limit to state: the false-alert rate counts false-alert records, not distinct incidents. | `backend/src/analytics`, `frontend/app/(ops)/analytics` |

---

## Eliminated module — MOD-19 Offline Emergency Queue and Retry ⛔

**Decision:** removed from the system on purpose.

**Why:** a report saved on the phone while offline would be sent only when the phone reconnects, possibly hours later. By then the emergency may already be over, or the reporter may have died. A late, stale alert could send responders to a scene that no longer needs them while live emergencies wait. The team judged that risk to outweigh guaranteed delivery.

**What was removed:** the backend `offline-sync` module and its job, the phone's offline queue and assessment queue, the network-sync hook, and their tests (details in [SESSION_HANDOFF.md](SESSION_HANDOFF.md)).

**What the system does instead (already in place):**
1. The report is sent right away over the data path, and the MDRRMO SMS is sent by the backend once the incident is saved (MOD-17).
2. If sending fails, the app says so clearly and shows the **911 and MDRRMO hotlines** so the reporter can call (Rule 9).
3. Each report carries a unique key. If the reporter taps submit again, the backend returns the same incident instead of creating a duplicate.

**Leftovers, harmless:** the `offline_event_queue` table remains in the schema, and nothing reads it. `CLAUDE.md`, `README.md` and `tests/http/sos-flow.http` still mention MOD-19. Checked 2026-10-23: no offline-sync code is left in the backend or the phone app.

**For the report owner (Jhobert):** confirm with the instructor how an eliminated module is reported. One option is to keep MOD-19 in the report as a documented design decision, describing the AS-IS process and the decision above, with no TO-BE automation.

---

## Additional modules (built beyond the 53)

These features exist in the code but are not among the 53 module specs. They work unless marked otherwise. Each one extends listed modules, so a member can mention it in the TO-BE of the module it extends.

| # | Feature | What it does | Extends | Status | Main code |
|---|---|---|---|---|---|
| A1 | **Barangay Alert and Callback Automation** | Works out the incident's barangay and texts its BDRRMC/BPSO hotline with a secure link. Barangay staff open a public web page (`/b/[token]`) to report back, or reply by SMS (codes such as `OTW 4416`, read by a poller). A free-text reply (`nandito na kami`) is linked to the barangay's single open case and shown in the drawer; with AI Assist on, Gemini reads it and the dispatcher can accept the suggested status (AUTOMATION_NEEDS_PLAN Phase 3, C4). The dispatcher logs call attempts and outcomes in the drawer's Barangay tab. Includes an admin directory of barangay contacts. | MOD-17, 34, 41, 46 | Built. Phases 0–4 are live-verified; the SMS-reply check is pending because the demo SIM has no load. Free-text replies shown and AI-read: built, **walkthrough pending, eval pending** (AI off by default; free-tier key, so synthetic texts only). | `backend/src/barangay-coordination`, `frontend/app/b`, `frontend/app/(ops)/administration/barangays` |
| A2 | **Supervisor Oversight Dashboard** | Supervisor-only, read-only: operations summary, dispatcher workload, exceptions (overdue items), pending handovers, recent activity, major incidents. | MOD-21, 36, 41 | Built. Signed-in walkthrough pending. | `backend/src/oversight`, `frontend/components/dashboard/SupervisorDashboard.tsx` |
| A3 | **Role-Based Navigation and Dashboards** | One `/dashboard` page with different content per role, a sidebar per role, and a **Municipal Overview** for the LGU account (counts only, no personal data). | MOD-21, 47, 50 | Phases 1–7 built (signed-in walkthroughs pending). Phase 7's CRITICAL approval is off by default. | `frontend/components/layout/Sidebar.tsx`, `frontend/components/dashboard/*`, `GET /v1/analytics/municipal-overview` |
| A4 | **Operations Center Login Security** | Second sign-in step by authenticator app (TOTP), SMS code or passkey; backup codes; account lockout; password policy with a forced change on first sign-in; session list and sign-out of sessions; re-confirming identity before sensitive actions. | MOD-01, 46, 47, 49 | Built. The MFA database migration is applied only to local development. | `backend/src/auth`, `backend/src/auth/mfa`, `frontend/app/login/*`, `frontend/app/(ops)/account/security` |
| A5 | **Mobile Passkey Sign-In** | Sign in on the phone with a passkey (fingerprint or face) instead of a password. | MOD-01 | Built. | `mobile/app/profile/passkeys.tsx`, `mobile/src/services/passkey`, `backend/src/auth/well-known.controller.ts` |
| A6 | **Bocaue Geo-Fence and Coverage** | Registration checks that the GPS position is inside Bocaue and fills in the barangay. A coverage map screen shows the service area. | MOD-01, 11, 12 | Built. | `POST /v1/auth/geo-check`, `mobile/app/coverage.tsx` |
| A7 | **First-Aid Guides** | Step-by-step first-aid guides built into the app, readable without internet. | MOD-04, 06 | Built. | `mobile/app/first-aid`, `mobile/src/data/first-aid` |
| A8 | **Incident Timeline Push and Verified Reporter Badge** | A push and an app notice to the reporter at every status step. App notices and a toast for the dispatcher who assigned the unit (en route, on scene, awaiting closure). Phone screens refresh by themselves. After a CLOSED incident, a signed-in reporter gets a **Verified Reporter** badge and a thank-you card, and dispatchers see the reporter's record in the drawer. | MOD-16, 42, 45, 21/23 | Built, unit-tested and committed (`fbbe369`). Not tried by hand yet. | `backend/src/notifications/incident-status-notifier.ts`, `mobile/src/components/reporter/verified-reporter.tsx`, `mobile/src/hooks/useLiveIncidentRefresh.ts` |
| A9 | **MapLibre Bocaue Map** | Replaced the Leaflet map with MapLibre (web and phone), using a Bocaue barangay boundary layer. | MOD-13, 22, 43 | Built. Missing sprite icons are logged (cosmetic only). | `frontend/app/(ops)/operations/map`, `mobile/src/components/tracking/live-tracking-map.tsx` |

**Planned but not built. Do not document as working:** AI Assist for the incident drawer ([plans/AI_ASSIST_PLAN.md](plans/AI_ASSIST_PLAN.md), not started).

---

## Before the leader signs: checklist per member

1. Commit the working tree. About 110 files are uncommitted (2026-10-23), including the fix plan's five phases and Role Dashboards Phases 5a–7. Everyone should demo the same version.
2. Every server that runs the demo needs **`MEDICAL_ENCRYPTION_KEY`** (see `.env.example`) and `pnpm prisma migrate deploy`. Then run `pnpm medical:encrypt` once per database, so medical profiles saved before 2026-10-23 are encrypted too.
3. Run your modules by hand with test data and save screenshots of each output listed in your report.
4. Modules marked **walkthrough pending** (07, 38, 40, 41, 42, 45, 50, 51, A2, A8) must be walked through first. For 07, 38, 40, 50 and 51, use each phase's **Done when** list in the [fix plan](plans/MODULE_GAPS_COMPLETION_PLAN.md). The steps are in the [A8 handoff, "What's left"](handoff/2026-10-22_incident-timeline-push-and-verified-reporter.md#whats-left).
5. SMS demos (MOD-16, 17, A1) need credit on the Textbee phone.
6. After a walkthrough passes, update that module's report TO-BE to match its row above.
