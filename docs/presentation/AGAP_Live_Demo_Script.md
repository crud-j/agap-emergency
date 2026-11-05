# AGAP Live Demo Script

How the team demonstrates all 52 modules on the running system in **one hour**: **one live emergency** that everyone takes part in, followed by a **short solo demo** from each member for the modules the main run doesn't reach.

- Module numbers follow the **52-module list** in [MODULE_TESTING_GUIDE.md](../module-reports/MODULE_TESTING_GUIDE.md). The old Offline Queue module was removed, so old MOD-20 to MOD-53 are now MOD-19 to MOD-52.
- For full click-by-click checks and expected results, see §4 of that guide. This script covers only what to **say** and what to **show**.
- **Passwords:**
  - **Phone accounts** (`citizen@demo.agap`, `responder2@…`, `bystander@demo.agap`) use `AgapDev2026!`.
  - **Web accounts** use the **team password** chosen in §1 step 3.
  - **Admin** uses `INITIAL_ADMIN_PASSWORD` from `backend/.env` until step 3 changes it.

| Member | Modules |
|---|---|
| Justine R. Soliman | 01, 06, 07, 10, 11, 12, 13, 15, 16 |
| Vanessa Danielle T. Jose | 02, 03, 04, 05, 08, 09, 14, 52 |
| Jhobert S. Dionisio | 17, 18, 19, 20, 21, 22, 23, 50 |
| Christian Joaquin | 24, 25, 26, 27, 28, 29, 30, 31, 51 |
| Aldrin Dela Cruz | 32, 33, 34, 35, 36, 37, 38, 39, 48 |
| Arjay Mauricio | 40, 41, 42, 43, 44, 45, 46, 47, 49 |

## The hour at a glance

| Time | What | Notes |
|---|---|---|
| 0:00–0:03 | Introduction, then Step 0 and the river reading | Two quick background actions. The SLA escalation chain and the surge check both need time to run. |
| 0:03–0:28 | Main run, Steps 1–8 (§3) | About 25 minutes. Keep each step moving. |
| 0:28–0:52 | Solo demos (§4) | About 4 minutes per member, about 1 minute per module. Rows marked *optional* are the first to skip. |
| 0:52–1:00 | Questions | Buffer. If the run is late, cut from here first, then the optional rows. |

---

## 1. Before demo day

1. **Same code everywhere.** Everyone pulls the same commit.
2. **Fresh data on the morning of the demo, at least 30 minutes before it starts:** `cd backend && pnpm db:reset-data && pnpm db:seed`.
   - The seeded incidents' times are relative to when the seed runs, so seeding the day before makes them look a day old.
   - Seeding at least 30 minutes early keeps them out of the duplicate check (15 minutes) and the surge volume rule (30 minutes).
3. **Sign in to every web account once, after the reset.**
   - When the change-password screen appears, set a shared **team password**. It must be at least 12 characters and must **not** contain "agap", "bocaue", or the account's name or email. `AgapDev2026!` is refused.
   - Do this for: admin, `dispatcher1`, `supervisor`, `receiving@bocauehospital…`, `orgadmin@mdrrmo…`, `orgadmin@bfp…`, `announcements@lgu…`.
   - A reset brings the change-password screen back, so redo this after every reset.
4. **Give the citizen an emergency contact.** The seeded citizen has none. On Phone A → **Profile → Emergency Contacts**, add a teammate's real number. Without it, Step 1 has nothing to show and MOD-16 sends no SMS.
5. **Check `backend/.env`:**
   - `BARANGAY_ALERTS_ENABLED=false`, or set `BARANGAY_SMS_TEST_OVERRIDE_PHONE` to a team phone, so no real barangay hotline is texted.
   - No `DEFAULT_SLA_*_SECONDS` overrides, so the escalation timers stay at 2, 5 and 5 minutes.
   - Restart the backend after any change.
6. **Web console as a production build** (pages open instantly instead of compiling on first visit):
   - Stop `pnpm dev`.
   - In `frontend`, run `set "PROXY_API=true"`, then `pnpm build`, then `pnpm start`.
   - If a tunnel is used, run `pnpm share` and restart the backend afterwards.
7. **Phones:**
   - Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WS_URL` to the laptop's LAN IP.
   - Put every device on the same Wi-Fi and restart Expo with `-c`.
   - Location must be on, and **inside Bocaue**.
8. **Textbee:** make sure the gateway phone has load. If it doesn't, show the backend log for MOD-16/17 instead.
9. **Rehearse the main run once, end to end, with a clock.** Then reset (step 2) and redo step 3, so the demo starts clean.

## 2. Devices

| Device | Signed in as | Used for |
|---|---|---|
| Laptop on projector: Browser 1 | `dispatcher1@mdrrmo.bocaue.gov.ph` | Operations Center (main screen) |
| Laptop: Browser 2 (Incognito) | `supervisor@mdrrmo.bocaue.gov.ph` | Second live screen, Activity Log, Escalations, Surge Mode |
| Laptop: Browser 3 (other profile) | `receiving@bocauehospital.gov.ph` | Hospital Portal |
| Phone A | `citizen@demo.agap` | Reporter |
| Phone B | `responder2@mdrrmo.bocaue.gov.ph` | Ambulance crew (ALPHA-2) |
| Phone C | Guest first, then `bystander@demo.agap` | Ignored report for the escalation demo (guest), then the duplicate report (bystander) |
| Ops phone (Textbee recipient) | — | Receives the `AGAP\|INC-…` SMS |

> **Why responder2 and ALPHA-2?** The demo data already sends ALPHA-1 and responder1 to `INC-2026-DEMO01`, so they're busy. AGAP only dispatches available units.
>
> **No "Medical" type in the citizen app.** The choices are Road incident, Fire and Natural disaster. Use **Road incident** with an injured person. That still sends an ambulance and shows the full patient flow.

---

## 3. Main run: one emergency, start to finish (~25 min)

Each step names the presenter and the modules it proves. Say the one-line explanation, show it, and move on.

### Step 0. Start the clocks: Arjay and Christian (MOD-40, MOD-51 setup)
- 📱 Phone C, **signed out** → **Report an emergency as a guest** → **Fire**. **Nobody touches this report.** Then sign Phone C in as the bystander.
  - With the default timers, the report escalates to **Supervisor** after about 2 minutes, to **Incident Commander** about 5 minutes later, and to **Administrator** about 5 minutes after that.
  - Arjay shows this in Step 8.
  - It's a different category from the main report, so it won't be flagged as a duplicate. Sending it as a guest keeps the bystander account free for the duplicate report in Step 4.
- 🖥️ Browser 2 → **Surge Mode** → Bocaue River **New reading** **11.6 m**, then save. The surge check runs every 5 minutes, so the "Surge recommended" banner will be waiting when Christian does his solo demo.

### Step 1. Before the emergency: Vanessa (MOD-05, 02, 03, 04)
📱 Phone A → **Profile**:
- **Emergency Readiness** shows whether the phone is ready to send an alert (location, notifications, sensors). *(05)*
- **Emergency Contacts**: the people texted when an SOS is sent. Show the teammate added in §1 step 4. *(02)*
- **Medical Profile** stays locked until the citizen gives separate consent, and the data is stored encrypted. *(03)*
- **Language** (tap to switch to Filipino) and **Accessibility → Text Size**, then switch back. *(04)*

### Step 2. The SOS: Justine (MOD-06, 11, 12, 10, 16)
📱 Phone A → **Home** → hold **SOS** for 3 seconds. A short tap does nothing, which prevents accidental alerts. *(06)*
1. **Confirm Location** comes first. It shows GPS accuracy *(11)* plus the readable address and barangay *(12)*.
2. Pick **Road incident** and answer the questions (Vanessa explains these in Step 3).
3. On the same screen, add a **photo**. It's optional and never blocks the report. *(10)*
4. Send it, and read out the `INC-…` reference. The phone opens the tracking screen.
5. *(If Textbee is on)* The emergency contact's phone receives an SMS. *(16)*

### Step 3. The report arrives: Jhobert, then Vanessa (MOD-19, 20, 21, 22, 17, 09, 14, 23)
🖥️ Browser 1, **with no refresh**:
- **Dashboard**: the Active count rises and the report appears at the top with a **New** tag. *(20)*
- It also appears in Browser 2 at the same moment, through one live connection to every screen. *(19)*
- Open the incident drawer and click **Mark received** right away.
  - This has to happen within 2 minutes of the SOS, or the main report escalates too and crowds the Step 8 Escalations screen.
  - Say: *"If nobody picks it up in 2 minutes, a Supervisor is alerted. We'll see that at the end."*
- **Live Map**: a new marker appears, colored by priority, over the flood-prone barangays. *(21)*
- **Incident Queue**: it sits under Active. Show the filters briefly. *(22)*
- The ops phone receives the `AGAP|INC-…|lat,lng|…` SMS, sent at the same time as the internet report in case data is down. *(17)*

Open the incident drawer → **Overview**. Vanessa takes over:
- The quick answers from the phone appear here. *(09)*
- One incident, one public reference, saved before anything else happens. Retries never create a second record. *(14)*

Jhobert: the **priority suggestion** and the reasons behind it. The dispatcher can change it. *(23)*

### Step 4. Triage and dispatch: Christian (MOD-25, 24, 29, 28, 30, 27)
- 📱 Phone C (bystander) sends a **second Road incident** from the same room. It must be within 15 minutes and 200 m of the first report to count as a possible duplicate.
- 🖥️ **Triage** → the newer report → **Possible duplicates** → **Merge** → **Confirm merge**. Two reports become one incident. Merge right away: an unmerged report also escalates after 2 minutes. *(25)*
- On the main report: **Acknowledge → Assess · ready for dispatch**. Together with Step 3's **Mark received**, each step is timestamped and attributed to the dispatcher. *(24)*
- 🖥️ **Dispatch**: units are ranked by distance, capability and type, with reasons. *(29)* The capability-match line shows only **verified** capabilities. *(28)*
- Pick **ALPHA-2**, open **Assign Crew** → **responder2**, then **Authorize Dispatch**. Say: *"The system suggests; the dispatcher decides."* *(30)*
- **Fleet & Units**: ALPHA-2 now shows **Dispatched**. *(27)*

### Step 5. The crew is notified: Jhobert, then Christian (MOD-18, 31)
- 📱 Phone B gets a **New assignment** push. If it doesn't, the assignment appears in **Missions** within about 15 seconds. *(18)*
- Christian, on the responder phone: **Accept Assignment → Mark En Route → Mark On Scene**. *(31)*

### Step 6. The reporter sees help coming: Justine, then Arjay (MOD-13, 41, 42, 15)
📱 Phone A → **Tracking** (it opened after sending):
- Justine: the unit's marker updates live from the crew's phone. Indoors it barely moves, so say that it follows the ambulance on the road. *(13)*
- Arjay: the status in plain words *(41)* and the **ETA, always labeled as an estimate** *(42)*.
- Justine: 📱 **Incidents** → open the report → **Timeline** tab. Every status change appears in the allowed order, each one recorded. The drawer's **Timeline** tab in Browser 1 shows the same. *(15)*

### Step 7. On scene and to the hospital: Aldrin (MOD-32, 33, 36, 37, 39)
- **Chat**: Phone A, Phone B and the drawer's **Chat** tab exchange messages. The reporter appears by role only, never by name. *(32)*
- 📱 Phone B → **Patient Assessment**. "Unknown patient" is allowed. It appears in the drawer. *(36)*
- 🖥️ Drawer → **Refer to hospital**: suggested hospitals come first, with reasons. Browser 3 (hospital) → **Acknowledge**. *(37)*
- 📱 Phone B → **Transporting** → pick the hospital → **Arrived at hospital**. The drawer's Transport section shows the destination, an estimated arrival and the actual arrival time. *(39)*
- 🖥️ **Multi-Agency → Agencies**: add BFP to the incident to show coordination. *(33)*

### Step 8. Closing and accountability: Arjay (MOD-44, 45, 40)
- 📱 Phone B → **Mark Resolved**. 🖥️ Drawer → **Resolve & close** with an outcome. 📱 Phone A → **Incidents** → the report → **Resolution** tab shows the outcome. *(44)*
- 🖥️ Browser 2 → **Activity Log**: every step we just did, with who did it and when. Entries can't be edited or deleted. *(45)*
- 🖥️ Browser 2 → **Escalations**: the ignored Fire report from Step 0 escalated on its own, level by level. The third level (Administrator) needs about 12 minutes from Step 0. *(40)*

---

## 4. Solo demos (~4 min per member, after the main run)

The modules the main run doesn't show. About one minute per row. Skip rows marked *optional* if the run is late.

### Justine
| MOD | Say | Show |
|---|---|---|
| 01 | Residents register with a verified phone number. | 📱 **Create Account** with a number that isn't registered yet → OTP → lands on Home. The OTP arrives by SMS; if Textbee is off, read it from the backend log. Registering the same number again is refused. |
| 07 | Shaking the phone starts an SOS when tapping is hard. | 📱 Profile → turn on **Shake to Alert**, shake → countdown → **Cancel**. Nothing is sent. |
| 15 *(optional)* | Statuses can only move in the allowed order. | 🖥️ Open the main-run incident (now closed): no status buttons are offered. On any open report, the drawer offers only the next allowed step. |

### Vanessa
| MOD | Say | Show |
|---|---|---|
| 08 | A mistaken report can be cancelled, and dispatchers can mark false alerts. Both are recorded. | 📱 Send a report → **Cancel** with a reason. 🖥️ The Timeline shows the cancel note. (This is a real report: the ops phone gets its SMS.) |
| 52 | The LGU can publish one-way public notices. This is not an emergency channel. | 🖥️ `announcements@…` → Compose from the **Bocaue River water level** template → Publish. 📱 It appears under **Announcements**. |

### Jhobert
| MOD | Say | Show |
|---|---|---|
| 50 | Shows where incidents cluster, so the LGU can prepare. | 🖥️ Supervisor → **Risk Map**. |
| 17 *(optional)* | *(Only if Textbee was off)* The SMS path runs alongside the data path and never blocks the incident. | Backend log shows the SMS attempt, and the incident still saved. |

### Christian
| MOD | Say | Show |
|---|---|---|
| 26 | Each organization manages only its own units. | 🖥️ `orgadmin@mdrrmo…` → **Fleet & Units → Registry**. MDRRMO units have **Edit**; BFP units are **View only**. |
| 28 | A capability counts only after a Supervisor verifies it. | 🖥️ orgadmin → BRAVO-1 → **Capabilities** → tap **+ Rope Rescue** (it shows as unverified) → supervisor → the same dialog → **Verify**. |
| 51 | Disaster mode for typhoons or explosions. | 🖥️ Supervisor → **Surge Mode**. The **Surge recommended** banner from Step 0's 11.6 m reading (above the 11.50 m critical level) is there → **Activate** → **Deactivate**. |

### Aldrin
| MOD | Say | Show |
|---|---|---|
| 34 | MDRRMO can request units from another agency. | 🖥️ **Multi-Agency → Mutual Aid** → request. `orgadmin@bfp…` → **Requests** → **Provide**. |
| 35 | Large incidents can use the Incident Command System. | 🖥️ Supervisor → **Command / ICS** → **Activate ICS** → assign an **Incident Commander**. |
| 38 | Hospital list with live capacity. | 🖥️ Hospital user → **Update status → At capacity**. It ranks lower in referrals. |
| 48 | Admin tools for accounts and system health. | 🖥️ admin → **Users & Accounts** (search, change role) → **Integrations** (health, no secrets shown). |

### Arjay
| MOD | Say | Show |
|---|---|---|
| 43 | Formal shift handover between operators. | 🖥️ Browser 2 (supervisor) → **Multi-Agency → Handover** → pick an incident → hand over to **dispatcher1** with a summary → Browser 1 (dispatcher1) → **Multi-Agency → Handover** → same incident → **Acknowledge**. |
| 46 | Each role sees only its own pages, and the server refuses the same actions even if someone calls the API directly. | 🖥️ dispatcher1 opens `/administration` → "Not available for your role". (The server-side refusal is covered by the automated tests.) |
| 47 | Citizens control their medical data. | 📱 **Privacy & Data** → withdraw consent. **Medical Profile** locks immediately. |
| 49 | Response performance over time. | 🖥️ Supervisor → **Analytics** → switch between 7, 30 and 90 days. |

---

## 5. If something goes wrong

- **Live step fails:** say what should happen and move on. Don't let one screen use up the group's time.
- **No internet or a phone crashes:** use the seeded incidents (`INC-2026-DEMO01` is dispatched with crew; `DEMO04` is On Scene; `DEMO07` is Resolved).
- **Escalations page is empty:** refresh it. Rows don't always appear on their own.
- **The main report also shows on Escalations:** it wasn't marked received within 2 minutes. Say that this is the SLA working, and point to the Fire report's three levels.
- **No "Surge recommended" banner yet:** the check runs every 5 minutes after the reading. Activate from the form instead; it shows the critical-level warning for 11.6 m right away.
- **Locked account:** five wrong passwords locks it for 15 minutes. This is why every account is pre-signed-in, and why everyone must know the team password.

**If asked what isn't built yet, answer honestly:** a Medical type in the citizen app; cancelling, reassigning or declining a dispatch from a screen; editing a hospital after it's created; web buttons for unlock and password reset (they exist in the API only). See §6 of the testing guide.
