# AGAP — Hands-On Test Guide for the 52 Modules

Use this guide to check each module yourself on the running system. Every module in §4 is written the same way:

- **Purpose**: what the module is for, in one or two sentences.
- **Sign in as**: the test account(s) to use (passwords in §1).
- **Go to**: the exact place to open, on the web (sidebar page and address) or on the phone (tab → menu item).
- **Before you start**: anything that must exist first, such as an incident or a setting.
- **Steps**: numbered checks. Each step says where you are (📱 phone, 🖥️ web, 🔌 Swagger, 🗄️ database) and what you should see.
- **Not built yet**: things the module has no screen for. A failure there is expected and is not a bug.

Legend: 📱 Mobile app · 🖥️ Web console · 🔌 API in Swagger (`http://localhost:3000/api`) · 🗄️ Database (Prisma Studio: `cd backend && pnpm prisma studio`)

The steps come from the "Test before signing" notes at the end of each module report, checked against the current screens and role rules (`frontend/lib/role-access.ts`).

### Module numbering

The old Offline Emergency Queue module (old MOD-19) was removed, and the modules after it moved up by one so the list has no gap:

| New number | Old number |
|---|---|
| MOD-01 to MOD-18 | Unchanged |
| MOD-19 to MOD-52 | Old MOD-20 to MOD-53 (new = old − 1). For example, the WebSocket Engine is now MOD-19 and Announcements is now MOD-52. |

This guide uses the **new** numbers everywhere. Two places still use the old numbers:
- The report files in this folder (for example `MOD-20_Real_Time_Event_WebSocket_Engine.md` is the new MOD-19).
- The `module_id` the backend writes on audit rows (for example the ICS audit row says `MOD-36`, which is the new MOD-35). When a step asks you to find an audit row, it gives the tag to look for.

### Who tests what

| Member | Assigned modules |
|---|---|
| Justine R. Soliman | MOD-01 User Registration and Profile Management<br>MOD-06 Immediate SOS Trigger<br>MOD-07 Shake-to-Alert Trigger<br>MOD-10 Incident Photo and Evidence Capture<br>MOD-11 Precision GPS Capture<br>MOD-12 Location Context and Reverse Geocoding<br>MOD-13 Live Incident Location Tracking<br>MOD-15 Incident Lifecycle State Management<br>MOD-16 Emergency Contact Notification |
| Vanessa Danielle T. Jose | MOD-02 Emergency Contact Management<br>MOD-03 Medical Profile<br>MOD-04 Accessibility and Multi-Language Support<br>MOD-05 Emergency Readiness and Permission Status<br>MOD-08 Emergency Cancellation and False Alert Management<br>MOD-09 Rapid Incident Detail Capture<br>MOD-14 Emergency Incident Record and Ticketing<br>MOD-52 Municipal Announcements and Public Broadcast |
| Jhobert S. Dionisio | MOD-17 Multi-Channel Emergency Transmission Gateway<br>MOD-18 Responder Assignment Notification and Dispatch Messaging<br>MOD-19 Real-Time Event / WebSocket Engine<br>MOD-20 Emergency Operations and Dispatch Dashboard<br>MOD-21 Real-Time Incident Map<br>MOD-22 Incident Command Queue<br>MOD-23 Emergency Severity and Priority Recommendation<br>MOD-50 Emergency Intelligence and Risk Visualization |
| Christian Joaquin | MOD-24 Incident Triage and Validation<br>MOD-25 Duplicate Incident Detection and Merging<br>MOD-26 Emergency Organization and Resource Registry<br>MOD-27 Response Unit Availability and Readiness<br>MOD-28 Incident-to-Response Capability Matrix<br>MOD-29 Suitable Response Unit Recommendation<br>MOD-30 Dispatcher Assignment and Dispatch Authorization<br>MOD-31 Responder / Ambulance Crew Mobile Interface<br>MOD-51 Disaster Surge and Mass-Casualty Mode |
| Aldrin Dela Cruz | MOD-32 Secure Incident Communication (chat)<br>MOD-33 Multi-Agency Coordination<br>MOD-34 Resource Request and Mutual Aid<br>MOD-35 Incident Command / ICS Support<br>MOD-36 On-Scene Patient Assessment<br>MOD-37 Hospital Receiving Coordination<br>MOD-38 Hospital and Receiving Facility Registry<br>MOD-39 Transport and Destination Tracking<br>MOD-48 System Administration and Account Management |
| Arjar Mauricio | MOD-40 Dispatcher SLA and Escalation Engine<br>MOD-41 User-Facing Emergency Status<br>MOD-42 Live ETA and Responder Tracking<br>MOD-43 Incident Handover<br>MOD-44 Incident Resolution and Closure<br>MOD-45 Immutable Audit Trail<br>MOD-46 Role-Based Access Control<br>MOD-47 Privacy, Consent and Medical Data Protection<br>MOD-49 Emergency Response Analytics |

Many checks need someone else's module running first (for example, dispatch needs an incident from MOD-06). The end-to-end run in §3 is the easiest way to set that up together.

---

## 0. Setup (do once)

```bash
docker compose up -d                       # Postgres + Redis
pnpm install
cd backend && pnpm prisma migrate dev && pnpm prisma db seed
cd backend && pnpm start:dev               # API  → http://localhost:3000   (Swagger: http://localhost:3000/api)
cd frontend && pnpm dev                    # Web  → http://localhost:3001
cd mobile && npx expo start -c             # Mobile (Expo Go / dev build / emulator)
```

**Mobile on a real phone:** `localhost` on the phone is the phone, not your PC. Set `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:3000` and `EXPO_PUBLIC_WS_URL=ws://<your-PC-LAN-IP>:3000`, put the phone on the same Wi-Fi, and restart Expo with `-c`. A preview APK uses the addresses stored in the EAS "preview" environment instead.

**GPS:** guest reports and registration only work **inside Bocaue**. On an emulator, set a mock location such as `14.7950, 120.9300`.

**SMS (Textbee):** optional. Without `TEXTBEE_API_KEY` / `TEXTBEE_DEVICE_ID`, SMS jobs are skipped and **OTP codes are printed in the backend console** (`[DEV] Registration OTP …`). Steps that need a real SMS are marked *(Needs Textbee)*.

**API-only checks (🔌):** some checks have no screen. Open Swagger at `http://localhost:3000/api`, call `POST /v1/auth/login` with the account (the body field is `identifier`, not `email`), copy the access token, click **Authorize**, then call the endpoint. Paths are `/v1/...` (no `/api` prefix).

**Every new incident texts the MDRRMO ops phone** when Textbee is configured. Create test incidents on purpose, not by accident.

---

## 1. Test accounts (from `backend/prisma/seed/seed.ts`)

Password for every account: **`AgapDev2026!`**. The admin uses `INITIAL_ADMIN_PASSWORD` from your `.env`, which defaults to the same value.

> **Keep `AgapDev2026!` when the change-password screen appears.** Every staff account asks for a new password at first sign-in. Type `AgapDev2026!` again as the new one. If you must use a different password, post it in the team chat right away. On 2026-11-02 shared accounts were locked out after a tester changed a password and nobody else knew it.
> Staff accounts (every web-console role) lock after **5 wrong passwords**. The first lock lasts 15 minutes; locking again soon after lasts 30, then 60. The System Administrator can unlock an account early with `POST /v1/administration/users/:id/unlock` (Swagger).

| Role | Login (email) | Phone | Where it signs in | Organization | First login |
|---|---|---|---|---|---|
| System Administrator | `admin@agap.local` | — | **Web** | — | Must change password |
| Dispatcher | `dispatcher1@mdrrmo.bocaue.gov.ph` | +639171234001 | **Web** | MDRRMO | Must change password |
| Dispatcher (2nd) | `dispatcher2@mdrrmo.bocaue.gov.ph` | +639171234002 | **Web** | MDRRMO | Must change password |
| Supervisor | `supervisor@mdrrmo.bocaue.gov.ph` | +639171234003 | **Web** | MDRRMO | Must change password |
| Responder (ambulance crew) | `responder1@mdrrmo.bocaue.gov.ph` | +639171234004 | **Mobile** (opens the Responder app) | MDRRMO | — |
| Responder (2nd) | `responder2@mdrrmo.bocaue.gov.ph` | +639171234005 | **Mobile** | MDRRMO | — |
| Responder (BFP fire) | `responder3@bfp.bocaue.gov.ph` | +639171234006 | **Mobile** | BFP Bocaue | — |
| Hospital User | `receiving@bocauehospital.gov.ph` | +639171234007 | **Web** (Hospital Portal) | Bocaue General Hospital | Must change password |
| Announcements Publisher | `announcements@lgu.bocaue.gov.ph` | +639171234008 | **Web** | — | Must change password |
| Org Administrator | `orgadmin@mdrrmo.bocaue.gov.ph` | +639171234009 | **Web** | MDRRMO | Must change password |
| Org Administrator (BFP) | `orgadmin@bfp.bocaue.gov.ph` | +639171234010 | **Web** | BFP Bocaue | Must change password |
| Org Administrator (hospital) | `orgadmin@bocauehospital.gov.ph` | +639171234011 | **Web** | Bocaue General Hospital | Must change password |
| Citizen | `citizen@demo.agap` | +639170000001 | **Mobile** (opens the Citizen app) | — | — |
| Bystander | `bystander@demo.agap` | +639170000002 | **Mobile** | — | — |
| Guest (no account) | — | — | **Mobile**: sign-in screen → **Report an emergency as a guest** | — | — |

**Notes**
- The **same mobile app** serves citizens and responders. After sign-in, a Responder lands on the Responder **Home**; everyone else lands on the citizen **Home**. On the sign-in screen, tap **Email** to use the emails above, or stay on **Mobile** and use the phone number.
- **Use two browsers** (for example Chrome and an Edge or Incognito window) to stay signed in as two roles at once. Many live-update checks need this.
- Only one Supervisor is seeded. MOD-43 needs a second one: as admin, **Users & Accounts → Change role** on dispatcher2.

**Seeded data you can use right away**
- Units: `ALPHA-1`, `ALPHA-2` (MDRRMO ambulances), `BRAVO-1` (MDRRMO rescue boat), `CHARLIE-1` (BFP fire truck), `CHARLIE-2` (BFP rescue truck).
- Incidents: `INC-2026-DEMO01` (Medical, Dispatched to ALPHA-1 with responder1, reported by citizen@demo.agap), `DEMO02` Submitted, `DEMO03` Acknowledged, `DEMO04` On Scene, `DEMO05` Fire Dispatched, `DEMO06` Industrial Assessed, `DEMO07` Resolved, `DEMO08` Received.
- Facilities: Bocaue General Hospital and 4 evacuation centers.

**Org Administrators of the other organizations.** `orgadmin@bfp.bocaue.gov.ph` and `orgadmin@bocauehospital.gov.ph` are seeded since 2026-11-02 (used by MOD-34 and MOD-38). If your database was seeded before that, run `cd backend && pnpm prisma db seed` once to add them. Existing accounts are not changed, but the seed puts `ALPHA-1` back on `INC-2026-DEMO01` as Dispatched.

---

## 2. Where things are

### 2.1 Web console (`http://localhost:3001`)

Each sidebar page, its address, and who sees it. A role that doesn't see a page gets "Not available for your role" if it types the address.

| Sidebar page | Address | Roles |
|---|---|---|
| Dashboard | `/dashboard` | every console role |
| Incident Queue | `/operations/incidents` | Dispatcher, Supervisor |
| Live Map | `/operations/map` | Dispatcher, Supervisor |
| Triage | `/operations/triage` | Dispatcher, Supervisor |
| Dispatch | `/operations/dispatch` | Dispatcher, Supervisor |
| Escalations | `/operations/escalations` | Supervisor |
| Activity Log | `/audit` | Supervisor (the admin's **Audit Log** is the same page) |
| Command / ICS | `/operations/command` | Supervisor |
| Multi-Agency (tabs: Agencies · Mutual Aid · Handover) | `/operations/multi-agency` | Dispatcher, Supervisor |
| Surge Mode | `/operations/surge` | Supervisor |
| Organizations | `/organizations` | Org Administrator, System Administrator |
| Fleet & Units (tabs: Units & Personnel · Registry) | `/operations/fleet` | Dispatcher, Supervisor, Org Administrator, System Administrator. The Org and System Administrators see the Registry only. |
| Requests | `/resources/requests` | Org Administrator, System Administrator (view only) |
| Hospitals & Facilities | `/hospitals` | Hospital User (as the Hospital Portal), Dispatcher, Supervisor, Org Administrator, System Administrator |
| Analytics | `/analytics` | Supervisor |
| Risk Map | `/operations/risk` | Supervisor |
| Announcements | `/announcements` (compose: `/announcements/compose`) | Announcements Publisher |
| Publication History | `/announcements/history` | Announcements Publisher |
| Approvals | `/operations/approvals` | Supervisor |
| Incident History | `/operations/history` | Dispatcher, Supervisor |
| Users & Accounts | `/administration/users` | System Administrator |
| Roles & Permissions | `/administration/permissions` | System Administrator |
| Barangay Directory | `/administration/barangays` | Org Administrator, System Administrator |
| Risk Areas | `/administration/risk-areas` | System Administrator |
| Security Events | `/administration/security` | System Administrator |
| Integrations | `/administration/integrations` | System Administrator |
| Configuration | `/administration/config` | System Administrator |
| Account Security | `/account/security` | every console role |

**The incident drawer.** Many steps say "open the incident drawer". Go to **Incident Queue** and click the incident's row; a panel opens on the right. It has the tabs **Overview** (details, answers, photos, priority, transport, **Refer to hospital**, **Resolve & close**), **Barangay**, **Timeline** and **Chat**. `/operations/incidents?id=<incidentId>` opens it directly.

### 2.2 Citizen app (📱)

| To open | Tap |
|---|---|
| Home (SOS button, active incident card, shake chip) | bottom bar **Home** |
| Report an emergency | hold the **SOS** button on Home, or the round centre button of the bottom bar → **Report Emergency** |
| Your reports and their details | bottom bar **Incidents** → tap a report. Its tabs are **Overview · Timeline · Notifications · Location · Resolution**, with a **Track** button while it is active. |
| Live tracking of the responding unit | opens by itself after you send a report; later: **Incidents** → the report → **Track** |
| Chat with responders | **Tracking** screen → chat icon (top right) |
| Cancel an active report | **Home** → active incident card → **Cancel** |
| Announcements and SMS subscription | bottom bar **Announcements**; subscribe from its **Subscribe** card |
| Emergency Contacts | **Profile** → **Emergency Contacts** |
| Medical Profile | **Profile** → **Medical Profile** |
| Emergency Readiness (permissions check) | **Profile** → **Emergency Readiness** |
| Accessibility (text size, contrast, motion, shake to alert) | **Profile** → **Accessibility** |
| Language | **Profile** → **Language** |
| Privacy (medical consent, access log, export) | **Profile** → **Privacy & Data** |
| Incident history and announcement archive | **Profile** → **Incident History** / **Announcement Archive** |
| Register, forgot password, guest report | sign-in screen → **Create Account** / **Forgot password?** / **Report an emergency as a guest** |

### 2.3 Responder app (📱, signed in as a Responder)

| To open | Tap |
|---|---|
| Current assignment summary | bottom bar **Home** |
| All assignments | bottom bar **Missions** → tap one to open the **assignment screen** |
| Assignment actions: Accept, En Route, On Scene, Patient Assessment, Transporting, Arrived at hospital, Fire report, Rescue trip, Request help, Chat, Finish | the **assignment screen** (the buttons shown depend on the unit type and the current step) |
| Map with your route | bottom bar **Map** |
| Availability toggle | bottom bar **Profile** (or the Home availability control) |

---

## 3. A full end-to-end run (covers about 30 modules)

Run this once first. Most of the per-module checks below reuse it.

1. 📱 **Phone A** (citizen@demo.agap): **Home** → hold **SOS** for 3 s → pick a type → answer the questions → take a photo → confirm the location → send. Note the `INC-…` reference. *(MOD-06, 09, 10, 11, 12, 14)*
2. 🖥️ **Browser 1** (dispatcher1): the incident appears in **Incident Queue**, **Live Map** and **Dashboard** with no refresh. *(MOD-19, 20, 21, 22)*
3. 🖥️ **Triage**: select the incident → **Mark Received** → **Acknowledged** → **Assessed**. Check the recommended priority and **Possible duplicates**. *(MOD-15, 23, 24, 25)*
4. 🖥️ **Dispatch**: select the incident → review the ranked units → pick one → add crew `responder1` → **Authorize Dispatch**. *(MOD-28, 29, 30)*
5. 📱 **Phone B** (responder1): the assignment push, or **Missions** → the assignment → **Accept** → **En Route** → **On Scene** → **Patient Assessment** → **Transporting** → pick a hospital → **Arrived at hospital** → resolve. *(MOD-13, 18, 27, 31, 36, 39, 42)*
6. 📱 **Phone A**: the **Tracking** screen shows the status, the ETA and the unit marker updating live. *(MOD-41, 42)*
7. 🖥️ Incident drawer → **Refer to hospital** → sign in as `receiving@…` in Browser 2 → **Acknowledge**. *(MOD-37, 38)*
8. 🖥️ Incident drawer → **Resolve & close**. 📱 **Phone A**: **Incidents** → the report → **Resolution** tab. *(MOD-44)*
9. 🖥️ (supervisor) **Activity Log** shows each step with the actor and a timestamp. *(MOD-45)*

---

## 4. Module-by-module checks

### Cluster A — User and Identity

#### MOD-01 User Registration and Profile Management · 📱
**Purpose:** Lets a resident create an AGAP account with a verified phone number, sign in and recover access, so their reports carry a known identity.
**Sign in as:** a new phone number (to register), then `citizen@demo.agap`
**Go to:** 📱 sign-in screen → **Create Account** · **Forgot password?** · **Profile → Language**
**Before you start:** be inside Bocaue (or set a mock location there). Without Textbee, the OTP is in the backend console.

1. 📱 **Create Account**: register a new account, enter the OTP, and confirm you land on **Home**.
2. 📱 Register again with the same number. It is refused.
3. 📱 Enter a wrong or expired OTP. It is refused.
4. 📱 Sign in with the password. Sign out (**Profile** → bottom), then sign in with **Send me an SMS code instead**.
5. 📱 **Forgot password?**: reset the password and sign in with the new one.
6. 📱 **Profile → Language**: change it, sign out and back in. The language is kept.

**Not built yet:** editing your name, barangay or address in the app; deleting your account from the app.

#### MOD-02 Emergency Contact Management · 📱
**Purpose:** Lets a citizen keep a list of people who get an SMS when they send an SOS.
**Sign in as:** `citizen@demo.agap`, then `bystander@demo.agap`
**Go to:** 📱 **Profile → Emergency Contacts**

1. 📱 Add two contacts, edit one, remove one.
2. 📱 Sign in as the bystander and open **Emergency Contacts**. The citizen's contacts are not visible.
3. 📱 *(Needs Textbee)* Send an SOS as the citizen. Only the remaining contact gets the SMS.

**Not built yet:** phone-format validation; a per-contact on/off switch; reordering contact priority.

#### MOD-03 Medical Profile · 📱 + 🗄️
**Purpose:** Stores a citizen's blood type, allergies and conditions, encrypted, and only after they give separate consent.
**Sign in as:** a newly registered citizen
**Go to:** 📱 **Profile → Medical Profile** and **Profile → Privacy & Data**

1. 📱 Open **Medical Profile**. It is locked.
2. 📱 **Privacy & Data** → turn on **Medical Data Consent**. Back in **Medical Profile**, create a profile with a blood type and two allergies, then edit it.
3. 📱 Enter an item of 61 or more characters. It is rejected.
4. 📱 **Privacy & Data** → withdraw consent. **Medical Profile** locks again.
5. 🗄️ Table `medical_profiles`: the stored values start with `v1.` (encrypted).

**Not built yet:** responders viewing the profile; deleting the profile from the app.

#### MOD-04 Accessibility and Multi-Language Support · 📱
**Purpose:** Makes the app usable in English or Filipino, with larger text, higher contrast and less motion for those who need it.
**Sign in as:** `citizen@demo.agap`
**Go to:** 📱 **Profile → Accessibility** and **Profile → Language**

1. 📱 Switch between English and Filipino. The Home, SOS and Profile screens change language.
2. 📱 Turn on **Large text** and **High contrast**. Text grows and body text turns black.
3. 📱 Turn on **Reduced motion**. The Home screen and the SOS button stop animating.
4. 📱 Close and reopen the app. The settings are kept.
5. 🗄️ Table `users`: the `preferred_language` column changes.

**Not built yet:** settings following you to a new phone; languages other than English and Filipino.

#### MOD-05 Emergency Readiness and Permission Status · 📱
**Purpose:** Tells the citizen, before an emergency, whether the phone is ready to send one (location, notifications, contacts).
**Sign in as:** `citizen@demo.agap`
**Go to:** 📱 **Profile → Emergency Readiness**

1. 📱 Turn location permission off in the phone's settings. The status shows **Not Ready**. Turn it back on and refresh. The status goes up.
2. 📱 Delete all contacts (**Emergency Contacts**). The status shows **Limited**.
3. 📱 Turn on airplane mode and open the screen. The offline result appears.
4. 🗄️ Table `device_readiness_reports` gets a row.

### Cluster B — Alert Triggering

#### MOD-06 Immediate SOS Trigger · 📱 + 🖥️
**Purpose:** The main way to call for help: hold one button and the report reaches the Operations Center.
**Sign in as:** 📱 `citizen@demo.agap`, then a guest · 🖥️ dispatcher1
**Go to:** 📱 **Home → SOS** button · 🖥️ **Incident Queue**

1. 📱 Hold **SOS** for 1 s and let go. Nothing is sent.
2. 📱 Hold for 3 s and finish the flow. 🖥️ The `INC-…` reference shown on the phone is in **Incident Queue**.
3. 📱 Turn on airplane mode before sending. A failure screen with the hotline appears. Reconnect and tap **Try Again**. 🖥️ Only **one** incident is created.
4. 📱 As a guest (sign-in screen → **Report an emergency as a guest**) outside Bocaue or with GPS off, the report is refused.

**Not built yet:** a Medical type in the app (only Road incident, Fire and Natural disaster); saving a report on the phone to send later.

#### MOD-07 Shake-to-Alert Trigger · 📱 + 🖥️
**Purpose:** Starts an SOS by shaking the phone, for when tapping the screen is hard. A countdown lets you cancel by mistake.
**Sign in as:** 📱 `citizen@demo.agap` · 🖥️ dispatcher1
**Go to:** 📱 **Home** (shake chip) or **Profile → Accessibility → Shake to Alert** · 🖥️ incident drawer → **Overview** (Trigger)

1. 📱 Turn on **Shake to Alert**. Shake the phone on **Home**. A countdown appears. Tap **Cancel**. Nothing is created.
2. 📱 Shake and let the countdown run out. **Confirm Location** opens. Submit. 🖥️ The incident drawer shows **Trigger: Shake**.
3. 📱 Send one by holding **SOS** instead. 🖥️ The drawer shows **SOS button**.
4. 📱 Turn the setting off, or move to another screen, or have an incident already active. Shaking does nothing.

**Not built yet:** shake while the app is closed or the phone is locked; countdown text in Filipino.

#### MOD-08 Emergency Cancellation and False Alert Management · 📱 + 🖥️
**Purpose:** Lets a reporter cancel a report sent by mistake, and lets a dispatcher mark a report as a false alert, with both recorded.
**Sign in as:** 📱 citizen · 🖥️ dispatcher1 · supervisor (to read the audit rows)
**Go to:** 📱 **Home → active incident card → Cancel** · 🖥️ **Triage** · **Activity Log**

1. 📱 Send a report, then cancel it with the reason "Accidental trigger". 🖥️ The incident's **Timeline** has the cancel note, and **Activity Log** has the row.
2. 📱 Send a report, have it dispatched (🖥️ **Dispatch**), then try to cancel it on the phone. It is refused.
3. 🖥️ **Triage**: acknowledge a report → **False Alert**. Check the status, the audit row, and the reporter's notice on the phone.
4. 🔌 `POST /v1/incidents/:id/false-alert` on a Closed incident is refused.

### Cluster C — Location and Tracking

#### MOD-09 Rapid Incident Detail Capture · 📱 + 🖥️
**Purpose:** Asks a few quick, category-specific questions (people trapped, fireworks, water depth) so dispatchers know what they face, without slowing the report down.
**Sign in as:** 📱 citizen · 🖥️ dispatcher1
**Go to:** 📱 the report flow (after you pick a type) · 🖥️ incident drawer → **Overview**

1. 📱 Report a **Fire**, answer "Fireworks" and "People trapped: Yes". 🖥️ The drawer shows the answers and a raised priority with reasons.
2. 📱 Report a **Natural disaster**, tick flooding, and enter the water depth. 🖥️ It is filed as **Flood**.
3. 📱 Send a report with no answers at all. It is accepted.

#### MOD-10 Incident Photo and Evidence Capture · 📱 + 🖥️
**Purpose:** Lets the reporter attach a photo or short video so dispatchers can see the scene. It is optional and never blocks the report.
**Sign in as:** 📱 a signed-in citizen · 🖥️ dispatcher1
**Go to:** 📱 the report flow → photo step · 🖥️ incident drawer → **Overview** (photos)

1. 📱 Send a report with a photo. 🖥️ The drawer shows the photo and its check chip.
2. 📱 Send one with a 10-second video. 🖥️ It plays in the drawer.
3. 📱 Skip the photo. The report still sends.
4. Stop object storage, then 📱 send a photo. The report saves, and the app says the photo was not sent.

**Not built yet:** photos on guest reports; choosing from the gallery; more than one photo per report.

#### MOD-11 Precision GPS Capture · 📱 + 🗄️
**Purpose:** Records where the emergency is as precisely as the phone allows, and says how accurate the position is.
**Sign in as:** 📱 citizen, then a guest
**Go to:** 📱 the report flow → **Confirm Location** step

1. 📱 Start an SOS outdoors. The accuracy is shown. 🗄️ Table `incident_locations` gets a row once you send.
2. 📱 Deny location permission. A signed-in user can still continue.
3. 📱 As a guest with GPS off, you are blocked with the Bocaue message.
4. 📱 Use a mock location outside Bocaue. A warning appears.

**Not built yet:** dragging the pin to correct the position.

#### MOD-12 Location Context and Reverse Geocoding · 📱 + 🖥️
**Purpose:** Turns the GPS position into a readable address and barangay, so dispatchers know the place by name.
**Sign in as:** 📱 citizen · 🖥️ dispatcher1
**Go to:** 📱 **Confirm Location** step · 🖥️ **Incident Queue** (Barangay column)

1. 📱 Start an SOS in a known barangay. The address and barangay appear on the phone.
2. 📱 Submit. 🖥️ The **Barangay** column in **Incident Queue** is filled.
3. Block internet access to Nominatim, then 📱 report again. The coordinates still show and the report still sends.

#### MOD-13 Live Incident Location Tracking · 📱📱 + 🖥️
**Purpose:** Shares the responding unit's live position with the reporter and the Operations Center while the unit is on its way.
**Sign in as:** 📱 responder1 (Phone B) · 📱 citizen (Phone A) · 🖥️ dispatcher1
**Go to:** 📱 Phone A **Tracking** · 📱 Phone B **Missions → assignment** · 🖥️ **Dispatch**
**Before you start:** an incident reported from Phone A.

1. 🖥️ **Dispatch** ALPHA-1 with crew responder1. 📱 Phone B: **Accept** → **En Route**. 📱 Phone A: the **Tracking** marker moves with no refresh.
2. 🔌 As responder2 (not on the crew), `POST /v1/locations/track` for that incident is refused.
3. 📱 Phone B: stop location (airplane mode). After the threshold, Phone A's marker shows **signal lost**, not a frozen live marker.

### Cluster D — Alert Processing and Dispatch

#### MOD-14 Emergency Incident Record and Ticketing · 🔌 + 🗄️ + 🖥️
**Purpose:** Saves every report as one incident with a public reference (`INC-…`), even when the phone retries.
**Sign in as:** guest / dispatcher1
**Go to:** 🔌 Swagger `POST /v1/incidents` · 🗄️ `incident_events` · 🖥️ **Incident Queue**

1. 🔌 Send `POST /v1/incidents` twice with the same idempotency key. Only one incident is created.
2. 🔌 Send a guest report with no coordinates. It is refused.
3. 🗄️ A new incident has exactly one `SUBMITTED` row in `incident_events`.
4. 🖥️ **Incident Queue**: paging and the status filter work.

#### MOD-15 Incident Lifecycle State Management · 🔌 + 📱 + 🗄️
**Purpose:** Enforces the allowed order of statuses (Submitted → … → Closed) and who may change them, and records every change.
**Sign in as:** dispatcher1, responder1
**Go to:** 🔌 Swagger `PATCH /v1/incidents/:id/status` and `/close` · 🖥️ **Triage** · 📱 responder **assignment screen** · 🗄️ `incident_events`

1. 🔌 Change an incident from SUBMITTED to CLOSED. It is refused, and the response lists the allowed transitions.
2. 🔌 With a responder token, `/close` is refused (403).
3. 🖥️ Close an incident, then try any other transition. It is refused as terminal.
4. 🖥️ Go through Acknowledge → Assess → … and check 🗄️ `incident_events` has one row per step with the actor.
5. 📱 On a transport, marking it Resolved before **Arrived at hospital** is refused.

#### MOD-16 Emergency Contact Notification · 📱 + backend log
**Purpose:** Texts the reporter's emergency contacts when they send an SOS, without ever affecting the incident if the SMS fails.
**Sign in as:** a citizen with contacts; then a citizen with **no** contacts
**Go to:** 📱 **Home → SOS** · the backend console

1. 📱 *(Needs Textbee)* Send an SOS. The contacts receive the SMS.
2. With the Textbee variables unset, 📱 send a report. The incident saves, and the log shows SMS **skipped** (no endless retries).
3. 📱 Send as a citizen with zero contacts. Nothing is queued and there are no errors.

#### MOD-17 Multi-Channel Emergency Transmission Gateway · 📱 + backend log
**Purpose:** Sends every new report to the MDRRMO ops phone by SMS at the same time as over the internet, so it still arrives when data is down.
**Sign in as:** 📱 citizen
**Go to:** 📱 **Home → SOS** · the ops phone · the backend console

1. 📱 *(Needs Textbee + `MDRRMO_OPS_PHONE`)* Send an SOS. The ops phone gets an `AGAP|INC-…|lat,lng|…` SMS of under 160 characters within seconds.
2. Unset `MDRRMO_OPS_PHONE` and restart. 📱 Send a report. The log shows a warning and the incident is still created.
3. Use a wrong Textbee API key. 📱 Send a report. The incident still saves and the log shows a gateway-rejected warning.

#### MOD-18 Responder Assignment Notification and Dispatch Messaging · 🖥️🖥️ + 📱
**Purpose:** Tells the crew they've been assigned (push, plus the Missions list as a fallback) and keeps every dispatcher's screen in step.
**Sign in as:** 🖥️ dispatcher1 + dispatcher2 (two browsers) · 📱 responder1
**Go to:** 🖥️ **Dispatch** · 📱 **Missions**

1. 🖥️ Authorize a dispatch. Both dispatcher windows show it with no refresh.
2. 📱 With the responder app in the background, a **New assignment** push arrives, and tapping it opens the assignment. With notifications off, it still appears in **Missions** within about 15 s.
3. 📱 The responder goes **En Route** / **On Scene**. 🖥️ The dispatcher's bell updates.
4. 🖥️ Try to dispatch a unit that is already Dispatched. You get **"Resource is not available"**.

**Not built yet:** cancelling, reassigning, or changing the crew of a dispatch from a screen. (A second unit on an already-Dispatched incident works: see MOD-30 step 3.)

#### MOD-19 Real-Time Event / WebSocket Engine · 🖥️🖥️ + 📱
**Purpose:** Pushes every change to all open screens within a second or two, and shows clearly when that live link is down.
**Sign in as:** 🖥️ dispatcher1 + dispatcher2 · 📱 citizen
**Go to:** 🖥️ **Incident Queue** (both browsers; the connection indicator is at the top)

1. 🖥️ Both open **Incident Queue**. 📱 Send an SOS. It appears in both within 1–2 s.
2. Stop the backend briefly. 🖥️ The connection indicator shows **disconnected**. Restart it, and the indicator recovers.

#### MOD-20 Emergency Operations and Dispatch Dashboard · 🖥️
**Purpose:** The Operations Center's start page: live counts and recent incidents at a glance, each linking to the right screen.
**Sign in as:** dispatcher1 (then look at supervisor, admin, publisher and orgadmin to see their own dashboards)
**Go to:** 🖥️ **Dashboard** (`/dashboard`)

1. 🖥️ The KPI cards, recent incidents and connection indicator all render.
2. 📱 Send an SOS. 🖥️ Within 1–2 s, with no refresh, the Active count changes and its card gets a green ring for a few seconds. The report appears at the top of **Recent incidents**, highlighted with a **New** tag that fades after a few seconds.
3. 🖥️ In a second browser, change that incident's priority to **Critical** (incident drawer). On the dashboard the row's priority chip flips and the **Critical** count goes up live.
4. 🖥️ Leave the page open for a few minutes. "Updated … ago" counts up every second, and each row's "Reported" time keeps advancing (for example 1m ago → 2m ago).
5. 🖥️ Click each KPI card. Each opens the matching screen.
6. Stop the backend. 🖥️ The connection indicator shows disconnected. The page keeps retrying every 15 s, and a retry strip appears instead of a blank page. Restart the backend: the counts and the list catch up by themselves.

#### MOD-21 Real-Time Incident Map · 🖥️
**Purpose:** Shows every active incident on a Bocaue map, colored by priority, with flood-prone barangays marked.
**Sign in as:** dispatcher1
**Go to:** 🖥️ **Live Map** (`/operations/map`)

1. 🖥️ Incident markers are colored, and there is a flood-prone barangay overlay.
2. 📱 Send an SOS. 🖥️ A marker appears live. Click it. The incident drawer opens.

#### MOD-22 Incident Command Queue · 🖥️
**Purpose:** The dispatcher's working list of incidents, with filters to find the ones that need attention.
**Sign in as:** dispatcher1
**Go to:** 🖥️ **Incident Queue** (`/operations/incidents`)

1. 🖥️ Switch between **Active**, **Archive** and **All**. The counts match.
2. 🖥️ Combine the status, category, priority and barangay filters. The list narrows correctly.
3. 📱 Send an SOS. 🖥️ It appears under Active with no refresh.
4. 🖥️ Open `/operations/incidents?id=<incidentId>`. The drawer opens on that incident.

#### MOD-23 Emergency Severity and Priority Recommendation · 📱 + 🖥️
**Purpose:** Suggests a priority from the reporter's answers and explains why. The dispatcher can change it, with a note.
**Sign in as:** 📱 citizen · 🖥️ dispatcher1
**Go to:** 📱 the report flow · 🖥️ **Triage** and the incident drawer → **Overview** (priority)

1. 📱 Send a Road incident with "pinned / trapped" = Yes. 🖥️ It is created as **CRITICAL**.
2. 📱 Send a Road incident with no high-risk answers. 🖥️ It is **HIGH** (the category default).
3. 🖥️ **Triage**: where the recommendation differs from the current priority, the reasons are listed.
4. 🖥️ In the drawer, change the priority with a note. It saves. On a Resolved or Closed incident it is blocked.

### Cluster E — Monitoring and Escalation

#### MOD-24 Incident Triage and Validation · 🖥️
**Purpose:** Where the dispatcher confirms a report is real and moves it through Received → Acknowledged → Assessed, or marks it a false alert.
**Sign in as:** dispatcher1, then supervisor (for the Activity Log)
**Go to:** 🖥️ **Triage** (`/operations/triage`) · **Activity Log** (`/audit`)

1. 🖥️ **Triage**: select an incident → **Mark Received** → **Acknowledged** → **Assessed**. The status chip changes each time.
2. 🖥️ (supervisor) **Activity Log** has a timestamped row with the actor for each step.
3. 🖥️ **False Alert** is offered only on an Acknowledged or Assessed incident.

#### MOD-25 Duplicate Incident Detection and Merging · 📱📱 + 🖥️
**Purpose:** Spots several reports of the same emergency (same category, close in time and place) and lets the dispatcher merge them into one.
**Sign in as:** 📱 two reporters (citizen + guest or bystander) · 🖥️ dispatcher1
**Go to:** 🖥️ **Triage** → the newer incident → **Possible duplicates**

1. 📱📱 Send two reports of the **same category** within 15 minutes and 200 m. 🖥️ Open the newer one in **Triage**. The older one is listed under **Possible duplicates** with its distance.
2. 🖥️ Click **Merge** and confirm. The newer one becomes **Duplicate** and links to the master. Its timeline is kept and there is an audit row.

#### MOD-26 Emergency Organization and Resource Registry · 🖥️
**Purpose:** The list of organizations (MDRRMO, BFP, hospital) and the units they own. Each organization manages only its own units.
**Sign in as:** admin · dispatcher1 · orgadmin (MDRRMO)
**Go to:** 🖥️ **Fleet & Units → Registry** tab · **Organizations**

1. 🖥️ (admin) **Registry → Add Resource**: add a unit under MDRRMO. Edit one (pencil icon).
2. 🖥️ (dispatcher1) **Registry** has **no** Add or Edit buttons.
3. 🖥️ (orgadmin) editing a BFP unit (CHARLIE-1) is refused; editing an MDRRMO unit is allowed. The server enforces this.
4. 🖥️ **Organizations** lists MDRRMO, BFP and the hospital.
5. 🖥️ (admin) **Add Resource**: the Organization dropdown lists MDRRMO, BFP and the hospital, and the Registry organization filter has the same three. (orgadmin) The dropdown shows only MDRRMO.

#### MOD-27 Response Unit Availability and Readiness · 🖥️ + 📱
**Purpose:** Shows which units are available, busy or out of service, updated live from the dispatcher and from the crews' phones.
**Sign in as:** 🖥️ dispatcher1 · 📱 responder1
**Go to:** 🖥️ **Fleet & Units → Units & Personnel** · 📱 responder **Profile** (availability)

1. 🖥️ Change a unit to **Out of service (maintenance)**. The card's badge changes, the **Unavailable** tile goes up by one, and no error appears under the status box. Set it back to **Available**.
2. 🖥️ The status box lists Available, Dispatched, En route, On scene, Transporting, Returning, Out of service (maintenance), Offline and Reserved. There is no separate "Maintenance" status.
3. 📱 Toggle availability. 🖥️ The Fleet board updates with no refresh.

#### MOD-28 Incident-to-Response Capability Matrix · 🖥️
**Purpose:** Records what each unit can do (water rescue, firefighting…). An organization claims a capability; a Supervisor verifies it. Only verified ones count in dispatch recommendations.
**Sign in as:** dispatcher1 · orgadmin (MDRRMO) · supervisor
**Go to:** 🖥️ **Fleet & Units → Registry** (capability chips; the shield icon opens the **Capabilities** dialog) · **Dispatch**
**Before you start:** BRAVO-1 must be Available. You need an Assessed Rescue incident for steps 4–5.

1. 🖥️ **Registry**: the seeded units show capability chips. Verified ones are filled; unverified ones are outlined and say "unverified".
2. 🖥️ **Dispatch** on a Fire incident (for example `DEMO06` Industrial Assessed, or a new Assessed Fire). The BFP truck shows "Capability match: n/m required".
3. **Add.** 🖥️ (orgadmin) **Registry** → shield icon on BRAVO-1 → **Add a capability** → Rescue → Rope Rescue → **Add**. It shows as **Unverified**, and the table chip reads "Rope Rescue · unverified".
4. 🖥️ (dispatcher1) **Dispatch** on the Assessed **Rescue** incident. BRAVO-1's reason reads "Capability match: 1/2 required (SEARCH_AND_RESCUE) (1 unverified not counted)". The ranking is the same as before step 3.
5. **Verify.** 🖥️ (supervisor) **Fleet & Units → Registry** → shield icon on BRAVO-1 → **Verify** on Rope Rescue. Back on the same Rescue incident in **Dispatch**, BRAVO-1 now shows "2/2 required" and a higher score.
6. **Other organization.** 🖥️ (orgadmin) CHARLIE-1 (BFP) has no shield or edit icon. 🔌 `POST /v1/resources/<CHARLIE-1 id>/capabilities` as orgadmin returns 403.
7. 🖥️ (orgadmin) The dialog has no **Verify** button. 🔌 `PATCH …/capabilities/<id>/verify` as orgadmin returns 403.
8. 🖥️ (admin) **Audit Log**, entity `resource_capability`, module `MOD-29`: one row each for the add (`CREATE`), the verify (`UPDATE`, `is_verified` false → true) and, after you remove Rope Rescue again with the **X**, the remove (`DELETE`). Each names BRAVO-1 and ROPE_RESCUE.

#### MOD-29 Suitable Response Unit Recommendation · 🖥️
**Purpose:** Ranks the available units for an incident (distance, capability, unit type) with reasons. It only advises: the dispatcher decides.
**Sign in as:** dispatcher1
**Go to:** 🖥️ **Dispatch** (`/operations/dispatch`) → select an Assessed incident

1. 🖥️ Units are ranked with reasons (distance, capability, type).
2. 🖥️ Pick a lower-ranked unit. The dispatch still goes through, which shows the ranking is advisory.

#### MOD-30 Dispatcher Assignment and Dispatch Authorization · 🖥️ + 📱
**Purpose:** The dispatcher sends one or more units, with a named crew, to an incident. Every dispatch is authorized by a person and audited.
**Sign in as:** 🖥️ dispatcher1 · 📱 responder1, responder3
**Go to:** 🖥️ **Dispatch** → select the incident · **Fleet & Units** · **Activity Log** (supervisor) · 📱 **Missions**

1. 🖥️ Pick a unit, add crew, click **Authorize Dispatch**. The Activity Log records it.
2. 📱 The crew's phone gets the push. 🖥️ The unit shows **Dispatched** on **Fleet & Units**.
3. **Second unit.** 🖥️ On a Fire incident already dispatched to ALPHA-1 (with responder1), open it in **Dispatch**. The header shows "1 unit". Click **Dispatch another unit** under the tracking card, pick CHARLIE-1 (BFP) with responder3 as crew, then **Authorize Dispatch**. The panel closes, the tracking card stays and lists both units, and the header shows "2 units". The incident status does not change. 📱 Both crews get the assignment push.
4. 🖥️ Try to add responder1 as crew of the second unit. It is refused ("RESPONDER_ALREADY_ON_INCIDENT"). ALPHA-1 can't be picked again (it is no longer available).
5. 🖥️ The incident's **Timeline** shows "Additional unit CHARLIE-1 dispatched". **Activity Log** has two `DISPATCH` rows; the second has `additionalUnit: true`.
6. 🖥️ A Resolved or Closed incident has no **Dispatch another unit** button.

**Not built yet:** reassigning or cancelling a dispatch, adding or removing crew after dispatch, the responder **Decline** button. The backend routes exist but no screen uses them.

#### MOD-31 Responder / Ambulance Crew Mobile Interface · 📱 + 🖥️
**Purpose:** The crew's app: receive the assignment, update progress step by step, file field reports, ask for help, and finish their own unit's work.
**Sign in as:** 📱 responder1 (ambulance) · 📱 responder3 (BFP fire truck) · 🖥️ dispatcher1 · 📱 citizen (step 8)
**Go to:** 📱 **Missions → assignment screen** · responder **Profile** (availability) · 🖥️ **Dispatch**, **Fleet & Units**

1. 📱 responder1 with the app in the background: 🖥️ dispatch the unit. 📱 The push opens the assignment. **Accept** → **En Route** → **On Scene**.
2. 📱 On an ambulance assignment, **Patient Assessment**, **Transporting** and **Treating on scene** appear.
3. 📱 responder3 on CHARLIE-1 (Fire): submit a **Fire report** with "fireworks or explosives". 🖥️ The Fire card and a dispatcher notice appear. Repeat in airplane mode. It sends once you are back online.
4. 📱 On a rescue boat or truck assignment, record a **Rescue trip** with people still waiting, then finish. 🖥️ The dispatcher notice and running totals update.
5. 📱 **Request help → Ambulance**. 🖥️ The dispatcher's bell shows "Crew help requested".
6. 📱 Toggle availability. 🖥️ **Fleet & Units** updates live.
7. **Two units** (after MOD-30 step 3): ALPHA-1 is On Scene, then 📱 responder3 accepts CHARLIE-1 and marks **En Route** and **On Scene**. The incident stays On Scene. 📱 responder1 finishes ALPHA-1 (**Finish (your unit)**): the incident stays open. 📱 responder3 finishes CHARLIE-1: the incident resolves.
8. **Citizen map with two units** (after step 7 starts): 📱 on the reporter's phone, **Tracking** shows both units. The camera follows the one that updated most recently; the other has a smaller marker labelled with its call sign (for example "CHARLIE-1"), or "· signal lost" when its position is stale. **Fit route** frames both. During transport, a unit on the hospital leg is drawn only as the transport screen allows.

**Not built yet:** a responder viewing the patient's medical profile.

### Cluster F — Field Response and Coordination

#### MOD-32 Secure Incident Communication (chat) · 📱 + 🖥️
**Purpose:** One chat thread per incident between the reporter, the crew and the Operations Center. Senders show by role only, so the reporter's identity stays private.
**Sign in as:** 📱 citizen (the reporter) · 📱 responder1 (on the crew) · 🖥️ dispatcher1 or supervisor · admin (read-only)
**Go to:** 📱 citizen **Tracking → chat icon** · 📱 responder **assignment screen → Chat** · 🖥️ incident drawer → **Chat** tab

1. All three open the same thread.
2. Send a message from each. The others see it live.
3. The citizen's name and phone are never shown. Senders appear by role only.
4. 🔌 A responder **not** on the crew, or a different citizen, is refused when reading the thread.
5. 🗄️ Tables `incident_messages` and `message_reads` get rows.
6. **Reconnect.** With both phone chats open, restart the backend. Both show "Reconnecting… messages send when back online", then recover by themselves. A message sent from the web while the backend was coming back appears on both phones without reopening the chat.
7. **Token expiry.** Leave both phone chats open for more than 16 minutes (past the 15-minute access token), then send from each. Both still deliver both ways.
8. **Close the chat.** Close the chat and return to **Tracking**: the unit's position and status still update live.
9. **Same-phone account switch.** On Phone A, log out of the citizen account and log in as responder1. Open the same incident's chat: responder1's messages are green (own), the citizen's are white with a role label.

**Not built yet:** end-to-end encryption.

#### MOD-33 Multi-Agency Coordination · 🖥️
**Purpose:** Records which agencies (MDRRMO, BFP…) are working an incident, so everyone sees who is involved.
**Sign in as:** supervisor (or dispatcher1)
**Go to:** 🖥️ **Multi-Agency → Agencies** tab · **Activity Log**

1. 🖥️ Add BFP to an incident, then remove it. Both actions appear in **Activity Log**.
2. 🖥️ **Dispatch** the BFP fire truck (CHARLIE-1) to an incident. BFP appears as a participating agency automatically.

#### MOD-34 Resource Request and Mutual Aid · 🖥️
**Purpose:** Lets MDRRMO ask another organization for units, and lets that organization's administrator provide or deny them.
**Sign in as:** dispatcher1 or supervisor (MDRRMO) · orgadmin@bfp.bocaue.gov.ph · orgadmin@mdrrmo · admin
**Go to:** 🖥️ **Multi-Agency → Mutual Aid** tab (to ask) · **Requests** (`/resources/requests`, to answer)

1. 🖥️ (dispatcher1) **Mutual Aid**: pick an incident and enter the type, quantity, capabilities, priority and notes. The request is created as **Pending**.
2. 🖥️ (BFP org admin) **Requests**: the request is listed. Click **Provide** with a note. It becomes Accepted with BFP as the provider.
3. 🖥️ (orgadmin@mdrrmo) **Requests**: MDRRMO's own Pending request says "Your organization made this request" and has no buttons. Answered rows show no explanation. 🔌 Answering an already-answered request is refused.
4. 🖥️ The audit row exists in **Activity Log**.
5. 🖥️ (admin) **Requests**: the page says "You can view requests. An organization's administrator answers them." and has no Provide or Deny buttons. 🔌 `PATCH /v1/resources/requests/{id}/approve` as admin returns **403**.

#### MOD-35 Incident Command / ICS Support · 🖥️
**Purpose:** For a large incident, sets up an Incident Command System: objectives, situation notes and named positions such as Incident Commander.
**Sign in as:** supervisor
**Go to:** 🖥️ **Command / ICS** (`/operations/command`) → pick an incident

1. 🖥️ **Activate ICS** with objectives. Check the audit row (tagged with the old number, `MOD-36`).
2. 🖥️ **Add Position** → pick **Incident Commander** → **Assign to**: pick yourself (listed first as "You"). Then add **Operations Chief** for a responder, for example responder3 (BFP Bocaue). The **Assign to** list shows names grouped as You / Supervisors / Dispatchers / Responders, never user IDs. Someone who already holds a position shows it, for example "— now Incident Commander". The Position Assignments table shows each name and role.
3. 🖥️ Update the objectives and situation notes. More than 4000 characters is refused.
4. 🖥️ Remove a position, then **Deactivate ICS**.

#### MOD-36 On-Scene Patient Assessment · 📱 + 🖥️
**Purpose:** Lets the crew record the patient's condition on scene (symptoms, vitals, treatment). An unknown patient is allowed.
**Sign in as:** 📱 responder1 · 🖥️ dispatcher1
**Go to:** 📱 **assignment screen** (On Scene) → **Patient Assessment** · 🖥️ incident drawer → **Overview**

1. 📱 Fill in the patient (or "unknown"), a symptom, a vital sign, an observation and an intervention → submit.
2. 🖥️ The drawer shows the assessment, and **Activity Log** has its row.

#### MOD-37 Hospital Receiving Coordination · 🖥️ + 📱
**Purpose:** Refers a patient to a suitable hospital ahead of arrival, so the hospital can prepare and acknowledge.
**Sign in as:** 🖥️ dispatcher1 · 🖥️ `receiving@bocauehospital.gov.ph` (second browser) · 📱 responder1
**Go to:** 🖥️ incident drawer → **Refer to hospital** · Hospital Portal (`/hospitals`) → select the hospital → the referrals list on the right · 📱 **assignment screen**
**Before you start:** a dispatched incident.

1. 🖥️ Open **Refer to hospital**. Suggested hospitals come first, with reasons.
2. 🖥️ Send the referral. (hospital user) A notice appears and the referral is in the hospital's referrals list → **Acknowledge**.
3. 🖥️ Send the same referral again. It is refused while the first is pending.
4. 📱 The crew taps **Arrived at hospital**. 🖥️ The referral shows the patient arrived.

#### MOD-38 Hospital and Receiving Facility Registry · 🖥️
**Purpose:** The list of hospitals and facilities with their location and live capacity, used to suggest where to send patients.
**Sign in as:** orgadmin@bocauehospital.gov.ph · supervisor · receiving@…
**Go to:** 🖥️ **Hospitals & Facilities** (`/hospitals`)

1. 🖥️ (hospital org admin) Add a hospital with a map pin. It shows **Pending review**.
2. 🖥️ (supervisor) **Verify** its location.
3. 🖥️ (hospital user) **Update status → At Capacity**. It shows "Updated 0 h ago". A hospital user from another organization can't report for it.
4. 🖥️ In MOD-37's **Refer to hospital** dialog, that hospital now ranks lower.

**Not built yet:** editing a hospital after it is created.

#### MOD-39 Transport and Destination Tracking · 📱 + 🖥️
**Purpose:** Records the trip to the hospital: destination, start, estimated arrival and actual arrival.
**Sign in as:** 📱 responder1 · 🖥️ dispatcher1 + dispatcher2
**Go to:** 📱 **assignment screen → Transporting** · 🖥️ incident drawer → **Overview** (Transport section)

1. 📱 **Transporting** → pick a hospital in the Destination Picker (or "decide later" and set it afterwards) → **Arrived at hospital**.
2. 🖥️ The Transport section shows the destination, start time, an "est." arrival, and the arrival time. A dispatcher can change the destination mid-transport.
3. 📱 Turn on airplane mode → tap **Transporting** → reconnect. Exactly **one** transport is recorded.

### Cluster G — Status, Escalation, and Closure

#### MOD-40 Dispatcher SLA and Escalation Engine · 🖥️
**Purpose:** Watches the clock on each incident. If it isn't acknowledged, dispatched or reached in time, it escalates to a Supervisor and then higher.
**Sign in as:** 🖥️ supervisor · 🖥️ dispatcher1 · 📱 a citizen phone
**Go to:** 🖥️ **Escalations** (`/operations/escalations`, Supervisor only) · **Triage** · **Dispatch**
**Before you start:** in `backend/.env` set `DEFAULT_SLA_ACKNOWLEDGE_SECONDS=30`, `DEFAULT_SLA_DISPATCH_SECONDS=60` and `DEFAULT_SLA_RESPONSE_SECONDS=60`, then restart the backend. (Without them the defaults are 120 s to acknowledge, and 300 s for each later step.) Write down the old values and put them back when you finish.

How it works: 30 s after an incident is sent, the system checks whether it moved past Submitted. If not, it raises **L1 · Supervisor**. Only after a breach does it schedule the next check, 60 s later: not yet Dispatched raises **L2 · Incident Commander**; 60 s after that, not yet On Scene raises **L3 · Administrator**. A finished incident (Resolved, Closed, Cancelled, False alert, Duplicate, Unable to respond, Referred) never escalates.

1. **Ignored incident.** 📱 Send an incident and don't touch it. 🖥️ **Escalations** shows **L1 · Supervisor** after about 30 s, **L2 · Incident Commander** about 60 s later, and **L3 · Administrator** about 60 s after that. Each reason reads "SLA breach: ACKNOWLEDGEMENT / DISPATCH / RESPONSE … status was SUBMITTED at deadline". The supervisor's phone gets an "SLA Breach" push for each. Refresh the page if a row doesn't appear on its own.
2. **Acknowledged in time.** 📱 Send a second incident. 🖥️ (dispatcher1) acknowledge it in **Triage** within 30 s. No escalation appears, now or later. Later steps are only checked after a breach, so a slow dispatch on this incident raises nothing.
3. **Acknowledged late, not dispatched.** 📱 Send a third incident and wait for L1. 🖥️ (dispatcher1) acknowledge it but don't dispatch. **L2** still appears about 60 s after L1, with "status was ACKNOWLEDGED". Dispatch a unit before the next 60 s pass: no L3.
4. **Cancelled in time.** 📱 Send a fourth incident and cancel it (**Home → active incident card → Cancel**) before 30 s. No escalation appears.
5. **Acknowledge and resolve.** 🖥️ (supervisor) On an escalation from step 1, click **Acknowledge**. The row leaves the default **Active** filter. Switch the filter to **Acknowledged** and click **Resolve**. The row shows Resolved under the **Resolved** filter, and its timestamps update.
6. **Role check.** 🖥️ (dispatcher1) `/operations/escalations` shows "Not available for your role". The page isn't in the Dispatcher's sidebar.

#### MOD-41 User-Facing Emergency Status · 📱 + 🖥️
**Purpose:** Shows the reporter, in plain words, what is happening with their report: its status, the unit and the ETA.
**Sign in as:** 📱 citizen · 🖥️ dispatcher1
**Go to:** 📱 **Tracking** · **Incidents** → the report (tabs) · 🖥️ **Triage**, **Dispatch**

1. 📱 Send an incident; **Tracking** opens. 🖥️ Change its status in **Triage**. 📱 The status pill updates with no refresh.
2. 🖥️ Dispatch a responder. 📱 The ETA card and the map position update live.
3. 📱 **Incidents** → the report: check each tab (**Overview, Timeline, Notifications, Location, Resolution**).

#### MOD-42 Live ETA and Responder Tracking · 📱📱 + 🖥️
**Purpose:** Estimates when the unit will arrive from its live position. It is always labelled as an estimate.
**Sign in as:** 📱 responder1 · 📱 citizen · 🖥️ dispatcher1
**Go to:** 📱 citizen **Tracking** · 📱 responder **assignment screen** · 🖥️ **Live Map**

1. 📱 (responder1) Accept the dispatch. The unit's position appears on the citizen's **Tracking** screen and 🖥️ on **Live Map**.
2. 📱 Move (or mock-move) the responder. The ETA recalculates and is labelled as an estimate.
3. 📱 Stop the responder's location. **Signal lost** appears after the threshold.

#### MOD-43 Incident Handover · 🖥️🖥️
**Purpose:** At shift change, one operator formally hands an incident to another, with a summary and pending actions, and the receiver acknowledges it.
**Sign in as:** 🖥️ supervisor + a **second Supervisor** (second browser)
**Go to:** 🖥️ **Multi-Agency → Handover** tab → pick an incident → **+ Handover**, or **Command / ICS → Handover panel → Hand over** (to create) · **Command / ICS** (to acknowledge)
**Before you start:** only one Supervisor is seeded. As admin, open **Users & Accounts**, **Change role** on dispatcher2 to Supervisor, and sign in as it in a second browser. The **Acknowledge handover** button is only on **Command / ICS**, which only Supervisors can open.

1. 🖥️ Account 1: create a handover to account 2 with a summary and pending actions. The incoming-operator list picks by name. It shows every Dispatcher and Supervisor who can sign in, including accounts still pending verification (dispatcher1, dispatcher2). A suspended or deactivated account is not listed, and you never see yourself.
2. 🖥️ Account 2: a pending-handover banner appears on **Command / ICS** → **Acknowledge handover**.
3. 🖥️ The Handover panel shows the record and the acknowledged time.

**Not built yet:** a screen for a Dispatcher to acknowledge a handover (the API allows it).

#### MOD-44 Incident Resolution and Closure · 🖥️ + 📱
**Purpose:** Closes the incident with a recorded outcome, and shows that outcome to the reporter.
**Sign in as:** 🖥️ dispatcher1 · 📱 citizen
**Go to:** 🖥️ incident drawer → **Resolve & close** · 📱 **Incidents** → the report → **Resolution** tab

1. 🖥️ Take an incident to **RESOLVED** (for example `INC-2026-DEMO07`). In the drawer, **Resolve & close** with an outcome and disposition. It closes.
2. 🖥️ Try to resolve it again. You get an "already closed" rejection.
3. The reporter's **Verified Reporter** count goes up by 1. 📱 The citizen's **Resolution** tab shows the outcome.

**Not built yet:** reopening a closed incident; citizen feedback or ratings.

### Cluster H — Governance and Compliance

#### MOD-45 Immutable Audit Trail · 🖥️ + 🗄️
**Purpose:** A permanent record of who did what and when. Nobody can edit or delete an entry, not even through the database.
**Sign in as:** admin (Audit Log) · supervisor (Activity Log)
**Go to:** 🖥️ **Audit Log** / **Activity Log** (both `/audit`) · 🗄️ `audit_logs`

1. 🖥️ Filter by action and date range, and page through.
2. 🖥️ Filter to one incident. Only its entries show.
3. 🗄️ Run `DELETE FROM audit_logs WHERE id = '<test id>';`. It is refused ("audit_logs is append-only").
4. 🔌 Swagger has no update or delete endpoint for audit entries.

#### MOD-46 Role-Based Access Control · 🔌 + 🖥️
**Purpose:** Makes sure each role can only see and do what it is allowed to, enforced by the server, not just hidden in the screens.
**Sign in as:** dispatcher1, orgadmin, admin
**Go to:** 🔌 Swagger · 🖥️ **Roles & Permissions** (`/administration/permissions`, admin) · **Audit Log**

1. 🔌 With a Dispatcher token, `GET /v1/administration/users` is refused with 403. 🖥️ A dispatcher opening `/administration` gets "Not available for your role".
2. 🖥️ orgadmin (MDRRMO) editing a BFP unit is refused (same as MOD-26 step 3).
3. 🖥️ (admin) **Roles & Permissions**: grant a permission to a role, then revoke it. Both appear in **Audit Log**.
4. 🔌 Wait past the recent-auth window, then call a sensitive admin action (for example `POST /v1/administration/users/:id/unlock`). It asks for re-authentication.

#### MOD-47 Privacy, Consent and Medical Data Protection · 📱 + 🗄️
**Purpose:** Gives the citizen control over their medical data (consent, a log of who accessed it, an export) and keeps it encrypted.
**Sign in as:** `citizen@demo.agap`
**Go to:** 📱 **Profile → Privacy & Data** · 🗄️ `medical_profiles`

1. 📱 The **Medical Data Consent** toggle, **Access Log** and **Export My Data** are all there and work.
2. 🗄️ The `medical_profiles` values start with `v1.`. Compare with the readable values in the app.
3. 📱 Withdraw consent. **Medical Profile** (MOD-03) locks immediately.

#### MOD-48 System Administration and Account Management · 🖥️ + 🔌
**Purpose:** The System Administrator's tools: manage accounts and roles, check system health, and change configuration safely.
**Sign in as:** `admin@agap.local`
**Go to:** 🖥️ **Users & Accounts**, **Integrations**, **Configuration** · 🔌 Swagger (for unlock and temporary password)

1. 🖥️ **Users & Accounts**: search by role and by part of a name, email or phone.
2. 🖥️ **Change role** on a test user, and deactivate or activate a test user.
3. 🖥️ Delete an account that has audit history (for example dispatcher2). It is refused, and you are told to deactivate instead.
4. 🖥️ Deactivate or change your own admin account. It is refused.
5. 🖥️ **Integrations**: DB, Redis and queue health show, with no secrets.
6. 🖥️ **Configuration**: update a key. Sensitive values are masked as `[sensitive]` in the audit row.
7. 🔌 Unlock, temporary password and MFA reset have **no web button**. To have a locked account to unlock, enter a wrong password 5 times. `POST /v1/administration/users/:id/unlock` with a reason under 10 characters is refused; a valid reason works and creates an `ACCOUNT_UNLOCKED` audit row. After `POST /v1/administration/users/:id/temporary-password`, the user's old sessions stop working.

**Not built yet:** web buttons for unlock, temporary password and MFA reset; a "create user" screen.

### Cluster I — Analytics, Intelligence, and Surge

#### MOD-49 Emergency Response Analytics · 🖥️
**Purpose:** Charts response performance over time (volumes, response times, outcomes) for planning and reports.
**Sign in as:** supervisor
**Go to:** 🖥️ **Analytics** (`/analytics`)

1. 🖥️ Switch the range between 7, 30 and 90 days. The charts update.
2. 🖥️ A newly closed test incident is counted. An empty range shows **No data**, not 0%.

#### MOD-50 Emergency Intelligence and Risk Visualization · 🖥️
**Purpose:** Shows where incidents cluster and which areas are high-risk, so the LGU can prepare. A nightly job proposes new hotspots for approval.
**Sign in as:** supervisor (Risk Map) · admin (Risk Areas)
**Go to:** 🖥️ **Risk Map** (`/operations/risk`, supervisor) · **Risk Areas** (`/administration/risk-areas`, admin)

1. 🖥️ (supervisor) **Risk Map**: clustered points over recent incidents.
2. 🖥️ (admin) **Risk Areas**: create one with an invalid barangay name. It is refused. Create, update and delete a valid one. Each appears in **Audit Log** with before and after values.
3. 🖥️ The admin can open Risk Areas but **not** the Risk Map (Supervisor only).
4. *(Optional)* After the 2:30 AM nightly job, approve a hotspot proposal. A risk area and an audit row appear.

#### MOD-51 Disaster Surge and Mass-Casualty Mode · 🖥️ + 📱
**Purpose:** Switches operations into disaster mode during typhoons or explosions: recommends activation from river levels, runs a triage board, and broadcasts to crews.
**Sign in as:** 🖥️ supervisor · 📱 responder1 · a second browser
**Go to:** 🖥️ **Surge Mode** (`/operations/surge`) · 📱 **assignment screen → Patient Assessment**

1. 🖥️ Enter a river level of **11.6 m** (above the 11.50 m critical level). Within 5 minutes a "Surge mode recommended" notice and banner appear.
2. 🖥️ Click **Activate** on the banner. The form is prefilled.
3. 📱 The responder submits an on-scene assessment with a **Red** tag. 🖥️ It appears on the triage board in the second browser within seconds.
4. 🖥️ Send a **broadcast**. 📱 It reaches the responder app. 🖥️ **Deactivate** surge mode.

**Not built yet:** automatic activation (it only recommends); linking incidents to a surge from a screen.

### Cluster J — Municipal Broadcast

#### MOD-52 Municipal Announcements and Public Broadcast · 🖥️ + 📱
**Purpose:** One-way public notices from the LGU (advisories, river levels) to the app and by SMS to subscribers. It is not an emergency dispatch channel.
**Sign in as:** 🖥️ `announcements@lgu.bocaue.gov.ph` · 📱 citizen · 🖥️ supervisor (step 6)
**Go to:** 🖥️ **Announcements** (`/announcements`, compose at `/announcements/compose`) · **Publication History** · 📱 bottom bar **Announcements** (and its **Subscribe** card)

1. 🖥️ Compose from the **River level** template and save it as a draft.
2. 🖥️ Publish with the issuing office blank. It is refused. Fill it in and publish. 📱 It appears in **Announcements** (with a push if the phone has a token).
3. 🖥️ Schedule one 2 minutes ahead. It publishes by itself.
4. 🖥️ Cancel one with a note, then archive it. Check **Publication History**.
5. *(Needs Textbee)* 📱 **Announcements → Subscribe** a number. 🖥️ Publish. The SMS arrives, and the announcement drawer's **SMS** row shows "1 delivered". 📱 Unsubscribe. The next one skips that number.
6. *(Optional)* Set `ANNOUNCEMENT_APPROVAL_REQUIRED=true`. 🖥️ A CRITICAL advisory goes to the Supervisor's **Approvals** page.

**Not built yet:** SMS targeted by barangay; superseding a notice.

---

## 5. Checklist

Tick each one as it passes. ✅ pass · ⚠️ partial · ❌ fail.

| MOD | Name | Surface | Main account | Where to start | Assigned to | Result |
|---|---|---|---|---|---|---|
| 01 | Registration & Profile | 📱 | new / citizen | sign-in → Create Account | Justine R. Soliman | |
| 02 | Emergency Contacts | 📱 | citizen | Profile → Emergency Contacts | Vanessa Danielle T. Jose | |
| 03 | Medical Profile | 📱 🗄️ | new citizen | Profile → Medical Profile | Vanessa Danielle T. Jose | |
| 04 | Accessibility & Language | 📱 | citizen | Profile → Accessibility | Vanessa Danielle T. Jose | |
| 05 | Readiness & Permissions | 📱 | citizen | Profile → Emergency Readiness | Vanessa Danielle T. Jose | |
| 06 | SOS Trigger | 📱 🖥️ | citizen / guest | Home → SOS | Justine R. Soliman | |
| 07 | Shake-to-Alert | 📱 🖥️ | citizen | Home → shake chip | Justine R. Soliman | |
| 08 | Cancellation & False Alert | 📱 🖥️ | citizen, dispatcher1 | Home → Cancel · Triage | Vanessa Danielle T. Jose | |
| 09 | Incident Detail Capture | 📱 🖥️ | citizen | report flow · drawer | Vanessa Danielle T. Jose | |
| 10 | Photo & Evidence | 📱 🖥️ | citizen | report flow → photo | Justine R. Soliman | |
| 11 | Precision GPS | 📱 | citizen / guest | Confirm Location | Justine R. Soliman | |
| 12 | Reverse Geocoding | 📱 🖥️ | citizen | Confirm Location · Incident Queue | Justine R. Soliman | |
| 13 | Live Location Tracking | 📱 🖥️ | responder1, citizen | Tracking · Missions | Justine R. Soliman | |
| 14 | Incident Record & Ticketing | 🔌 🗄️ 🖥️ | dispatcher1 | Swagger · Incident Queue | Vanessa Danielle T. Jose | |
| 15 | Lifecycle State Mgmt | 🔌 📱 | dispatcher1, responder1 | Swagger · Triage | Justine R. Soliman | |
| 16 | Emergency Contact Notification | 📱 log | citizen | Home → SOS | Justine R. Soliman | |
| 17 | Transmission Gateway (SMS) | 📱 log | citizen | Home → SOS · ops phone | Jhobert S. Dionisio | |
| 18 | Assignment Notification | 🖥️ 📱 | dispatcher1/2, responder1 | Dispatch · Missions | Jhobert S. Dionisio | |
| 19 | WebSocket Engine | 🖥️ | dispatcher1/2 | Incident Queue | Jhobert S. Dionisio | |
| 20 | Ops Dashboard | 🖥️ | dispatcher1 | Dashboard | Jhobert S. Dionisio | |
| 21 | Real-Time Map | 🖥️ | dispatcher1 | Live Map | Jhobert S. Dionisio | |
| 22 | Incident Command Queue | 🖥️ | dispatcher1 | Incident Queue | Jhobert S. Dionisio | |
| 23 | Priority Recommendation | 📱 🖥️ | citizen, dispatcher1 | Triage · drawer | Jhobert S. Dionisio | |
| 24 | Triage & Validation | 🖥️ | dispatcher1, supervisor | Triage | Christian Joaquin | |
| 25 | Duplicate Detection & Merge | 📱 🖥️ | 2 reporters, dispatcher1 | Triage → Possible duplicates | Christian Joaquin | |
| 26 | Org & Resource Registry | 🖥️ | admin, orgadmin | Fleet & Units → Registry | Christian Joaquin | |
| 27 | Unit Availability | 🖥️ 📱 | dispatcher1, responder1 | Fleet & Units | Christian Joaquin | |
| 28 | Capability Matrix | 🖥️ | orgadmin, supervisor, dispatcher1 | Registry → shield icon | Christian Joaquin | |
| 29 | Unit Recommendation | 🖥️ | dispatcher1 | Dispatch | Christian Joaquin | |
| 30 | Dispatch Authorization | 🖥️ 📱 | dispatcher1, responder1 | Dispatch | Christian Joaquin | |
| 31 | Responder Mobile Interface | 📱 | responder1, responder3 | Missions → assignment | Christian Joaquin | |
| 32 | Secure Incident Chat | 📱 🖥️ | citizen, responder1, dispatcher1 | Tracking → chat · drawer → Chat | Aldrin Dela Cruz | |
| 33 | Multi-Agency Coordination | 🖥️ | supervisor | Multi-Agency → Agencies | Aldrin Dela Cruz | |
| 34 | Mutual Aid | 🖥️ | dispatcher1, BFP org admin | Multi-Agency → Mutual Aid · Requests | Aldrin Dela Cruz | |
| 35 | ICS Support | 🖥️ | supervisor | Command / ICS | Aldrin Dela Cruz | |
| 36 | On-Scene Assessment | 📱 🖥️ | responder1 | assignment → Patient Assessment | Aldrin Dela Cruz | |
| 37 | Hospital Receiving | 🖥️ 📱 | dispatcher1, receiving@ | drawer → Refer to hospital | Aldrin Dela Cruz | |
| 38 | Hospital Registry | 🖥️ | hospital org admin, supervisor | Hospitals & Facilities | Aldrin Dela Cruz | |
| 39 | Transport & Destination | 📱 🖥️ | responder1 | assignment → Transporting | Aldrin Dela Cruz | |
| 40 | SLA & Escalation | 🖥️ | supervisor | Escalations | Arjar Mauricio | |
| 41 | User-Facing Status | 📱 | citizen | Tracking · Incidents | Arjar Mauricio | |
| 42 | Live ETA | 📱 🖥️ | responder1, citizen | Tracking · Live Map | Arjar Mauricio | |
| 43 | Incident Handover | 🖥️ | 2 supervisors* | Multi-Agency → Handover · Command / ICS | Arjar Mauricio | |
| 44 | Resolution & Closure | 🖥️ 📱 | dispatcher1, citizen | drawer → Resolve & close | Arjar Mauricio | |
| 45 | Audit Trail | 🖥️ 🗄️ | admin | Audit Log | Arjar Mauricio | |
| 46 | RBAC | 🔌 🖥️ | dispatcher1, orgadmin, admin | Swagger · Roles & Permissions | Arjar Mauricio | |
| 47 | Privacy & Consent | 📱 🗄️ | citizen | Profile → Privacy & Data | Arjar Mauricio | |
| 48 | System Administration | 🖥️ 🔌 | admin | Users & Accounts | Aldrin Dela Cruz | |
| 49 | Analytics | 🖥️ | supervisor | Analytics | Arjar Mauricio | |
| 50 | Risk Visualization | 🖥️ | supervisor, admin | Risk Map · Risk Areas | Jhobert S. Dionisio | |
| 51 | Surge / Mass-Casualty | 🖥️ 📱 | supervisor, responder1 | Surge Mode | Christian Joaquin | |
| 52 | Announcements | 🖥️ 📱 | publisher, citizen | Announcements | Vanessa Danielle T. Jose | |

\* Only one Supervisor is seeded. Promote dispatcher2 to Supervisor first (MOD-43, "Before you start").

---

## 6. Gaps found while writing this guide

These are things the reports describe that you **cannot** fully test from a screen today:

| Area | Gap |
|---|---|
| MOD-18 / 30 | No screen to cancel or reassign a dispatch, change crew, or decline an assignment (backend routes only). |
| MOD-38 | No screen to edit a hospital after it is created. |
| MOD-48 | No web button for unlock, temporary password or MFA reset (Swagger only). No "create user" screen. |
| MOD-43 | The handover panel is only on the Supervisor-only Command page, so a Dispatcher who receives a handover can't acknowledge it from a screen. |
| MOD-40 | The Escalations page's message mentions the System Administrator, but only the Supervisor can open the page. |
| Seed | Only one Supervisor. MOD-43 needs a second one (promote dispatcher2). |
| MOD-06 / 09 | The citizen app has no "Medical" incident type (Road incident, Fire, Natural disaster only). |
