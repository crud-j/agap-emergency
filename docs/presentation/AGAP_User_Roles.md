# AGAP Users and Their Roles

Who uses AGAP, where they use it, and what each one is for. AGAP has two apps:

- **Mobile app:** for people at or near the emergency (residents, bystanders and response crews).
- **Web console:** for the people who receive, manage and support the response (the Operations Center, hospitals, administrators and the LGU).

Every role signs in through the same account system. The server checks each action against the role, so hiding a screen is never the only protection.

For the full page-by-page rules of the web roles, see [AGAP_Role_Rules_and_Dashboard_Content.md](../AGAP_Role_Rules_and_Dashboard_Content.md).

## At a glance

| Role | App | In one line | Demo account |
|---|---|---|---|
| Citizen | 📱 Mobile | A registered Bocaue resident who can call for help in one press | `citizen@demo.agap` |
| Bystander / Guest | 📱 Mobile | Anyone who reports an emergency, with or without an account | `bystander@demo.agap`, or no account |
| Responder | 📱 Mobile | The ambulance, rescue or fire crew sent to the scene | `responder1@…`, `responder2@mdrrmo.bocaue.gov.ph`, `responder3@bfp…` |
| Dispatcher | 🖥️ Web | Receives reports and sends the right unit | `dispatcher1@mdrrmo.bocaue.gov.ph` |
| Supervisor | 🖥️ Web | Oversees the dispatchers, handles escalations and big incidents | `supervisor@mdrrmo.bocaue.gov.ph` |
| Hospital User | 🖥️ Web (Hospital Portal) | Hospital staff preparing to receive the patient | `receiving@bocauehospital.gov.ph` |
| Organization Administrator | 🖥️ Web | Keeps one agency's units and records up to date | `orgadmin@mdrrmo…`, `orgadmin@bfp…`, `orgadmin@bocauehospital…` |
| Announcements Publisher | 🖥️ Web | LGU officer posting public notices for the Office of the Mayor | `announcements@lgu.bocaue.gov.ph` |
| System Administrator | 🖥️ Web | Keeps the platform running, secure and configured | `admin@agap.local` |

---

## 📱 Mobile users

### Citizen
**Purpose:** a resident who gets help fast and tells responders what they need to know, even when the network is weak.

**What they do:**
- **Register and set up.**
  - Sign up with a phone number confirmed by an SMS code (OTP).
  - Add **emergency contacts**, who are texted when an SOS is sent.
  - Optionally fill in a **medical profile**: blood type, allergies, conditions. It is locked until the citizen gives separate consent, and stored encrypted.
  - Check **Emergency Readiness** (location, notifications, sensors), and choose a language (English or Filipino) and text size.
- **Call for help.**
  - Hold the **SOS** button for 3 seconds. A short tap does nothing, which prevents accidental alerts.
  - Or **shake the phone** when tapping is hard. A countdown gives time to cancel.
  - The app confirms the location, asks the type (road incident, fire, natural disaster) and a few quick questions, and lets them add an optional photo.
  - The report goes out over the internet **and** by SMS at the same time.
- **Follow the response.**
  - A live map shows the unit coming, the status in plain words and an ETA that is always marked as an estimate.
  - They can chat with the crew and the Operations Center.
  - They can see the timeline and the final outcome.
- **Stay informed.** They receive municipal **announcements** such as river levels and evacuation notices, and can read first-aid guides.
- **Control their data.** **Privacy & Data** lets them withdraw consent, which locks the medical profile immediately.

**Cannot:** see other people's incidents, or change an incident's status other than cancelling their own report.

### Bystander and Guest reporter
**Purpose:** let **anyone** report an emergency they witness, including one involving a stranger. Getting help never depends on having an account.

**What they do:**
- On the sign-in screen, tap **Report an emergency as a guest**. No account is needed.
- Send the same report as a citizen: location, type, quick questions, optional photo. Then follow its status.
- The person reporting (**reporter**) and the person who needs help (**patient**) are always kept separate. The patient may be unknown, and that never blocks dispatch.
- A bystander can also have an account (the demo has `bystander@demo.agap`), which signs in to the same app screens as a citizen.

**Cannot:** see the identity of the patient or of any nearby AGAP user. AGAP never reveals who someone is to a stranger.

### Responder (ambulance, rescue and fire crews)
**Purpose:** the crew sent to the scene. The app gives them the job, the way there and the tools to report from the field.

**What they do:**
- **Set availability:** Available or Unavailable, so dispatchers only assign crews who can go.
- **Receive the assignment:** a push notification and the **Missions** list, then **Accept Assignment**. Accepting starts sharing their location with the Operations Center and the reporter.
- **Update the status from the field:** **Mark En Route → Mark On Scene → Transporting / Treating on Scene → Arrived at hospital → Mark Resolved**. Each step is timestamped and shown to the dispatcher and the reporter.
- **Field work by unit type:**
  - **Ambulances:** a patient assessment (an unknown patient is allowed), then choosing the receiving hospital.
  - **Fire crews:** a fire report.
  - **Rescue boats:** a record of each rescue trip.
- **Ask for backup** (another ambulance, a fire or rescue unit, more personnel) and **chat** with the Operations Center and the reporter.

**Cannot:** close an incident (closing is the dispatcher's decision), assign themselves to incidents, or see incidents they aren't assigned to.

---

## 🖥️ Web console users

### Dispatcher (MDRRMO Operations Center)
**Purpose:** the first person to act on a report. They turn a report into the right unit moving with the right information.

**What they do:**
- **Watch reports arrive live** on the Dashboard, Incident Queue and Live Map, with no refresh.
- **Triage each report.**
  - Mark it received, acknowledge it and assess it. Each step is timestamped and attributed.
  - Merge duplicates, or mark it a false alert.
- **Review the suggested priority** and the reasons behind it, and change it if needed.
- **Dispatch.**
  - AGAP ranks the available units by distance, capability and type.
  - The **dispatcher chooses** the unit and crew and authorizes the dispatch. AGAP never dispatches on its own.
- **Coordinate.**
  - Refer the patient to a hospital, and add partner agencies such as BFP.
  - Chat with the crew and reporter, and track the unit to the hospital.
- **Close the incident** with a recorded outcome.

**Cannot:** manage accounts, change permissions, edit the audit history, or publish announcements.

### Supervisor (MDRRMO Operations Supervisor)
**Purpose:** oversees the whole operation, steps in when something is late, and runs large incidents. On a night shift they can do everything a dispatcher does.

**What they do:**
- **Everything a dispatcher can do,** including dispatching.
- **Escalations.** Reports nobody acted on in time are escalated automatically: to the Supervisor, then the Incident Commander, then the Administrator. The Supervisor acknowledges and resolves them.
- **Activity Log:** every action in the system, with who did it and when. It can't be edited or deleted.
- **Command / ICS:** activate the Incident Command System on a big incident and assign the **Incident Commander**. Incident Commander is a position given per incident, not a separate login.
- **Multi-Agency:**
  - Add agencies to an incident.
  - Request units from other agencies (mutual aid).
  - Hand over shifts formally.
- **Surge Mode** for typhoons or mass-casualty events. For example, it is recommended when the Bocaue River passes the 11.50 m critical level.
- **Analytics and Risk Map:** response times and where incidents cluster.
- **Approvals:** approve or return CRITICAL advisories from the LGU before they are published.

**Cannot:** manage accounts or system configuration, or silently change a dispatcher's recorded decision.

### Hospital User (Hospital Portal)
**Purpose:** staff at a receiving hospital, getting ready before the ambulance arrives.

**What they do:**
- See **incoming referrals** for their hospital and **acknowledge** them.
- Update the hospital's **receiving status**, for example **At capacity**. Hospitals at capacity rank lower when dispatchers choose where to send patients.
- Mark when the patient has arrived.

**Cannot:** open any other Operations Center page. The Hospital Portal is their only screen.

### Organization Administrator
**Purpose:** looks after **one** agency's records: MDRRMO, BFP, or a hospital organization.

**What they do:**
- **Fleet & Units → Registry:**
  - Add and edit their organization's response units.
  - Add capabilities such as Rope Rescue. A capability counts for dispatch only after a Supervisor verifies it.
- **Requests:** answer mutual-aid requests addressed to their agency (**Provide** or **Deny**).
- **Organizations:** keep the agency's profile current.
- **Hospital organizations:** register their own hospitals. MDRRMO reviews them before crews can choose them.
- **MDRRMO:** maintain the **Barangay Directory** (barangay hotlines).

**Cannot:** dispatch, triage or change incidents, or touch another organization's units. They see those as **View only**.

### Announcements Publisher (LGU Information Officer)
**Purpose:** publishes official public notices on behalf of the Office of the Mayor. This is **one-way broadcast only**, never an emergency or dispatch channel.

**What they do:**
- **Compose announcements** from ready templates: Bocaue River water level, PAGASA rainfall advisory, flood advisory, evacuation order, class suspension, road closure and public advisory. They can schedule, publish, archive or replace them.
- Citizens receive them in the mobile app's **Announcements** tab.
- **CRITICAL advisories** wait for MDRRMO Supervisor approval before release, when approval is switched on.
- **Municipal overview:** totals per barangay and category, trends and response times. It contains no names, addresses, locations or medical data.

**Cannot:** see the incident queue or any personal or medical details, dispatch, or manage accounts.

### System Administrator
**Purpose:** keeps AGAP healthy, secure and correctly set up. Supports the operation but **is not a dispatcher**.

**What they do:**
- **Users & Accounts:** create, activate or deactivate accounts, and change roles. Unlocking accounts and resetting passwords exist in the API, but have no web buttons yet.
- **System health and Integrations:** status of the server, database, SMS gateway (Textbee), push notifications and maps. Secrets are never shown.
- **Configuration:** system settings and reference data, such as risk areas and the barangay directory.
- **Security Events and Audit Log:** failed logins, lockouts and every recorded action, read-only.

**Cannot:** change incidents, dispatch, resolve escalations, activate surge mode, or open medical profiles.

---

## People who use AGAP without an account

| Who | How they're involved |
|---|---|
| **Patient** | The person who needs help. They never need an AGAP account, and their identity may stay unknown. |
| **Emergency contact** | Gets an SMS when the citizen who listed them sends an SOS. |
| **Barangay officials** | Get an SMS alert with an access code for reports in their barangay, and open a status page with it. No login is needed. |
| **MDRRMO operations phone** | Receives the short `AGAP\|INC-…` SMS for every report, as a backup when the internet is down. |

AGAP **adds to** the 911 and MDRRMO hotlines; it never replaces them.
