# AGAP Product Video: Screen Recording Shot List

What to record for the **Product Presentation and System Demonstration** video, in story order: one emergency travels from a citizen's phone to the operations center, to a responder, to the hospital and to closure, and then the Supervisor, Publisher and Admin views fill in the rest.

Every screen below exists in the codebase. Shots marked **Animate** are built in the motion tool instead of recorded.

---

## 0. Before you record

### 0.1 Reset the database and seed the demo data

Run this **right before a recording session**. The current-shift incidents are timed relative to the moment you seed ("3 minutes ago", "17 minutes ago"), so a seed from yesterday looks stale on camera.

```bash
cd backend
pnpm db:reset-data   # empties every table; keeps migrations and barangay boundaries
pnpm db:seed         # accounts, units, hospitals, 56 incidents, announcements
```

Full rebuild instead (drops the database and re-applies every migration from `prisma/schema.prisma`):

```bash
cd backend
pnpm prisma migrate reset --force
pnpm db:seed         # safe to run even if the reset already seeded
```

Both wipe your local data: test reports, registered test accounts and **passkeys** (register them again).

What the seed puts on screen:

| | |
|---|---|
| Current shift (8 live incidents) | Wakas road crash (new, unacknowledged), Bunlo family on a second floor in a flood, Igulot footbridge rescue (unit on scene), Bundukan fireworks warehouse fire (CRITICAL, fire truck sent), Biñang 1st chemical fumes, Turo chest pain (ambulance offer waiting), Poblacion missing elderly woman, Bambang fallen tree (resolved) |
| Last 30 days | 48 incidents: closed, resolved, false alerts, duplicates, a typhoon week of floods in Lolomboy, Bunlo, Igulot and Bambang, several reported by SMS |
| References | `INC-2026-000001` … `000056`. Your first live SOS gets `INC-2026-000057` |
| Units free for the live demo | ALPHA-2, ALPHA-3 (ambulances), BRAVO-1 (rescue boat), CHARLIE-3 (fire truck) |
| Announcements | Fireworks safety advisory, Basic Life Support training, post-typhoon update, 2 archived flood notices, **1 CRITICAL storm advisory waiting for Supervisor approval** |

### 0.2 Accounts

Password for every account below except the first two rows: `AgapDev2026!`

| Role | Login | Device |
|---|---|---|
| Citizen (on camera) | `citizenaccountdemo@demo.com` / 09757072301: **Angelica Ramos** (own password, see `docs/module-reports/README.md`) | Phone 1 |
| System Administrator | `admin@agap.local` (`INITIAL_ADMIN_PASSWORD`) | Laptop |
| Dispatcher | `dispatcher1@mdrrmo.bocaue.gov.ph` (Juan dela Cruz) | Laptop |
| Supervisor | `supervisor@mdrrmo.bocaue.gov.ph` (Roberto Reyes) | Laptop |
| Responder, ambulance | `responder4@mdrrmo.bocaue.gov.ph` (ALPHA-2) | Phone 2 |
| Responder, fire truck | `responder3@bfp.bocaue.gov.ph` (CHARLIE-1, fire offer waiting) | Phone 2 |
| Responder, rescue boat | `responder2@mdrrmo.bocaue.gov.ph` (BRAVO-1) | Phone 2 |
| Hospital User | `receiving@bocauehospital.gov.ph` (Dr. Luz Aquino) | Laptop |
| Org Administrator | `orgadmin@mdrrmo.bocaue.gov.ph` | Laptop |
| Announcements Publisher | `announcements@lgu.bocaue.gov.ph` | Laptop |

**Log in once with every role before recording.** Staff accounts start with "change your password" and the sign-in security setup. Get those out of the way off camera.

### 0.3 Capture settings (this laptop: i5-13420H, 8 GB, RTX 2050)

- **Web:** frontend as a production build (`pnpm build && pnpm start`), Chrome window 1920×1080, zoom 100%, bookmarks bar hidden.
- **OBS:** NVENC H.264, 1920×1080, **30 fps**, CQP 18–20, record to MKV then remux to MP4.
- **Phone:** `scrcpy --max-fps 30 --video-bit-rate 8M --record shot-XX.mp4`. Do Not Disturb on, full battery.
- **Live moments:** one OBS scene with the scrcpy window and Chrome side by side.
- **Memory:** close VS Code and other apps while recording. Cap WSL at 3 GB in `C:\Users\githu\.wslconfig`.
- **Backend:** must run with Redis, or the SLA escalation, push and ETA jobs won't fire.

### 0.4 Never on screen

- The System Health panel and the Integrations page (they name the SMS provider)
- Any `.env` file, terminal with secrets, or the real SMS gateway number
- The phone's messages app (the SMS step is animated)

---

## 1. Citizen app: onboarding and account

- [ ] **1.** Splash → Onboarding 1 to 4 (`/onboarding/first-onbrd` … `fourth-onbrd`). Swipe slowly.
- [ ] **2.** Login (`/auth/login`): show the guest emergency entry, then tap Register.
- [ ] **3.** Registration (`/auth/registration`): name fields, password strength meter, ID scan step.
- [ ] **4.** OTP (`/auth/verify-otp`): enter the code and land on Home.
- [ ] **5.** Profile → Passkeys (`/profile/passkeys`): create a passkey with your **fingerprint**.
- [ ] **6.** Log out → log in with the fingerprint.
- [ ] **7.** Profile → ID verification and Selfie. Screenshot is enough.

## 2. Citizen app: home and readiness

- [ ] **8.** Home (`/home`): greeting, SOS dial, quick tiles, announcements strip (seeded), GPS Ready card.
- [ ] **9.** Readiness (`/settings/permissions`): every permission green.
- [ ] **10.** Emergency Contacts (`/contacts` → `/contacts/add`): add one contact.
- [ ] **11.** Medical Profile (`/medical`): the separate consent step, then the profile.
- [ ] **12.** First Aid (`/first-aid` → one guide).
- [ ] **13.** Accessibility (`/profile/accessibility`): switch to Filipino. Screenshot.
- [ ] **14.** Coverage map (`/coverage`): Bocaue and 19 barangays.
- [ ] **15.** History (`/history`): Angelica's two past reports from the seed.

## 3. The SOS (the hero sequence)

Phone 1 (Angelica) and Chrome (Dispatcher, Dashboard open) side by side in one OBS scene.

- [ ] **16.** Home → **hold the SOS button** (countdown).
- [ ] **17.** Location (`/emergency/location`): GPS pin, accuracy, address.
- [ ] **18.** Incident type (`/emergency/incident-type`): **Road accident**.
- [ ] **19.** Incident details (`/emergency/incident-details`): who needs help (someone else), what happened. Every field is optional.
- [ ] **20.** Capture (`/emergency/capture`): one scene photo.
- [ ] **21.** Transmission (`/emergency/transmission`): sending → success with `INC-2026-000057`.
- [ ] **22.** Same moment on the web: the new incident appears on the Dashboard with the bell and sound.
- [ ] **23.** Tracking (`/tracking/[id]`): status timeline. Leave it open for shot 36.
- [ ] **24.** Shake-to-Alert: film the phone being shaken with a second phone (B-roll).

## 4. Dispatcher (web)

- [ ] **25.** Login (`/login` → `/login/verify`): password, then the second factor.
- [ ] **26.** Dashboard (`/dashboard`): live counts with the 8 seeded incidents.
- [ ] **27.** Incident Queue (`/operations/incidents`): open Angelica's report.
- [ ] **28.** Incident drawer: priority recommendation, AI suggestions, the scene photo, Barangay panel → Acknowledge.
- [ ] **29.** Triage (`/operations/triage`): validate it.
- [ ] **30.** Live Dispatch (`/operations/dispatch`): suggested units → choose **ALPHA-2** → confirm. The dispatcher decides; the system only suggests.
- [ ] **31.** Fleet & Units (`/operations/fleet`): ALPHA-2 now busy, CHARLIE-1 and CHARLIE-2 busy from the seed.
- [ ] **32.** (Flood) Dispatch **BRAVO-1** to the seeded Bunlo flood (for shot 40).

## 5. Responder app (Phone 2)

- [ ] **33.** Log in as `responder4` → push notification for the assignment.
- [ ] **34.** Home (`/responder/home`): duty card, current mission, availability.
- [ ] **35.** Missions → the mission → **Accept** → Mark **En route** (location sharing starts).
- [ ] **36.** Map (`/responder/map`) and, at the same time, Phone 1 Tracking: the unit's marker moves, ETA labelled as an estimate.
- [ ] **37.** Mark On scene → On-Scene Assessment (`/responder/assessment/[id]`): triage colour, vitals.
- [ ] **38.** Incident Chat (`/incident/chat/[id]`): one message each way with the citizen.
- [ ] **39.** Start transport → choose **Bocaue General Hospital** → Arrived at hospital → Finish.
- [ ] **40.** Log in as `responder2` (BRAVO-1) → Rescue trip (`/responder/rescue-trip/[id]`) on the Bunlo flood.
- [ ] **41.** Log in as `responder3` (CHARLIE-1): accept the waiting Bundukan fire offer → Fire report (`/responder/fire-report/[id]`).
- [ ] **42.** Offline: airplane mode on → tap an action → "Saved on this phone" → airplane mode off → sent.

## 6. Hospital and closure

- [ ] **43.** Hospital User (`/hospitals`): the incoming patient, update the receiving status.
- [ ] **44.** Dispatcher: incident drawer → **Resolve**, then **Close**.
- [ ] **45.** Phone 1: Tracking / History shows Closed.

## 7. Supervisor (web)

- [ ] **46.** Supervisor Dashboard (`/dashboard`).
- [ ] **47.** Escalations (`/operations/escalations`): the **Wakas road crash** escalated by itself (HIGH, not acknowledged within 2 minutes). Don't acknowledge it before this shot.
- [ ] **48.** Response Targets (`/operations/sla-targets`): the targets behind the escalation.
- [ ] **49.** Approvals (`/operations/approvals`): approve the seeded **Tropical Storm Signal No. 1** advisory. Approving sends it to registered phones.
- [ ] **50.** Command / ICS (`/operations/command`): start Incident Command on the Bundukan fire, name a commander.
- [ ] **51.** Multi-Agency (`/operations/multi-agency`): BFP coordination, create a handover.
- [ ] **52.** Surge Mode (`/operations/surge`): Activate → Broadcast to responders → Deactivate.
- [ ] **53.** Analytics (`/analytics`): 30-day charts (the typhoon week stands out) → **AI summary** → export.
- [ ] **54.** Risk Map (`/operations/risk`): hotspots, flood counts per barangay, Check now, pin a risk area.
- [ ] **55.** Activity Log (`/audit`): every action from this session, recorded automatically.
- [ ] **56.** Incident History (`/operations/history`): 30 days of records.

## 8. Announcements (MOD-53)

- [ ] **57.** Publisher: Compose (`/announcements/compose`) a flood advisory with the preview.
- [ ] **58.** Phone 1: push notification → Announcements (`/announcements/[id]`), from shot 49 or 57.
- [ ] **59.** Publisher: Publication History (`/announcements/history`). Screenshot.

## 9. Administration (screenshots or 5-second clips)

- [ ] **60.** System Administrator: Users & Accounts, Roles & Permissions.
- [ ] **61.** Org Administrator: ID Reviews, Barangay Directory, Organizations, Requests.
- [ ] **62.** Any role: Account Security (passkey and authenticator).

## 10. Offline and SMS fallback

- [ ] **63.** Phone 1: airplane mode on → SOS → Transmission shows **Send by SMS** (stop recording before the messages app opens).
- [ ] **64.** **Animate**: the SOS text being composed and sent; never record the messages app.
- [ ] **65.** Web: Incident History filtered to SMS reports from the typhoon week (seeded), showing the SMS channel.

---

## 11. Animated, not recorded

| Video section | Animation |
|---|---|
| A. How the system works | Bocaue problem intro (floods, fireworks, highway crashes), incident lifecycle diagram, architecture |
| B. Automation | Overlays on the recordings: ops SMS sent automatically, priority and unit suggestions, SLA timer turning into an escalation, ETA, surge and risk suggestions, AI summary, audit trail |
| C. Features | Lower-thirds naming each module (e.g. "MOD-22 · Live Dispatch") over the clips |
| D. Uniqueness | Comparison with hotline-only reporting: app plus SMS, guest reporting, reporter separate from patient, offline resend, multi-agency coordination, 9 roles in one system |

## 12. After each session

- [ ] Rename clips by shot number (`shot-30-live-dispatch.mp4`).
- [ ] Watch each clip once at full speed; reshoot anything with a typo, a notification from another app, or a visible secret.
- [ ] Re-seed before the next session (section 0.1).
