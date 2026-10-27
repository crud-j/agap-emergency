# AGAP — Module Explanation Scripts (2026-10-24)

**What this file is for:** word-for-word speaking scripts for the oral defense of each assigned module. Where [`Instructor_Presentation_and_Demo_Guide_2026-10-24.md`](Instructor_Presentation_and_Demo_Guide_2026-10-24.md) tells you *what to click*, this file tells you *what to say* — covering the full content of each module's report: Description, Purpose, Input (AS-IS vs TO-BE), Technology Used, Process Flow (AS-IS vs TO-BE), and Outputs, exactly as written in [`docs/module-reports/`](module-reports/).

**How to use this:**
- Each module has four parts: a one-line **Introduction**, the **Module Description & Purpose**, the **AS-IS** (how MDRRMO does it today without AGAP), and the **TO-BE** (how AGAP does it now, folding in Input, Technology Used, Process Flow and Outputs). Read it in that order — AS-IS first, then TO-BE — because that contrast *is* the argument for why the module exists.
- Say it in your own words once you're comfortable with it; don't read it like a robot. The instructor is checking that you understand the module, not that you memorized a script.
- After the TO-BE paragraph, switch to the live system and run the matching demo steps from the Demo Guide. The script ends; the proof begins.
- If the instructor interrupts with "why not just do X automatically" — the answer is almost always one of AGAP's non-negotiable rules: a human (dispatcher, responder, supervisor) always makes the final call; AGAP recommends, verifies, and records, it does not decide.

---

## 1. Jhobert Dionisio — MOD-37, 48, 40, 39, 50

### MOD-37 — On-Scene Patient Assessment (Cluster F — Field Response and Coordination)

**Introduction:** "My first module is MOD-37, On-Scene Patient Assessment."

**Description & Purpose:** This module gives the responder on scene a structured way to record what they find on the patient — symptoms, observations, vital signs, interventions given, and the exact time of each — instead of carrying it all in their head or on a scrap of paper. It supports more than one patient per incident, and it explicitly supports an *unknown* patient, because in a real emergency the responder sometimes doesn't know who they're treating yet. The purpose is to improve the flow of information from the scene to the rest of the system — it does not and cannot guarantee a medical outcome; that's a clinical matter, not a software one.

**AS-IS (before AGAP):** Today, this information travels by radio, by phone, or on a paper patient-care form the responder fills out by hand. The operator or responder writes down whatever the caller or the patient's companions say, checks it against whatever records are on hand, and coordinates the next step verbally. The result ends up in a logbook or a spreadsheet, and any follow-up — a status change, an exception — is relayed again by voice. Nothing is structured, and nothing is searchable later.

**TO-BE (with AGAP):** Now, the responder opens the assessment screen on their assigned incident in the AGAP mobile app. They enter the patient's reference (or mark the patient as unknown), symptoms, vitals, observations, and interventions, each one timestamped automatically. The app and the backend validate the fields, confirm the responder is signed in and actually authorized for this incident, and then the NestJS assessment service persists the record permanently to PostgreSQL, linked to the incident and the responder. Once saved, it's visible to the dispatcher and supervisor through the incident's record, and the save itself is written to the audit trail. What this module does *not* claim to be is a full clinical chart, a diagnosis tool, or a medical-device integration — it's a structured field note, not an electronic patient-care record.

---

### MOD-48 — Privacy, Consent and Medical Data Protection (Cluster H — Governance and Compliance)

**Introduction:** "My second module is MOD-48, Privacy, Consent and Medical Data Protection."

**Description & Purpose:** This module protects personal, location, and medical data for its entire lifecycle inside AGAP — classifying what's sensitive, requiring explicit consent before medical data can even exist, enforcing least-privilege access, logging who accessed what, and handling retention. The purpose is to make sure AGAP earns the trust that comes with holding medical information, without ever claiming to be a certified legal-compliance product — this is a technical protection layer, not a law firm's sign-off.

**AS-IS (before AGAP):** Without this module, sensitive details — a caller's medical history, a patient's condition — are collected the same way everything else is: verbally, over the phone or radio, written into a logbook that anyone with physical access can read, with no record of who looked at what or when, and no consent step at all. If a citizen wanted to know who had seen their information, there would be no way to answer that.

**TO-BE (with AGAP):** Now, before any medical data is even accepted, the backend requires a separate, explicit consent record — granted or withdrawn, with a timestamp — completely apart from normal account registration. Every medical value that gets saved is classified and, in the case of the medical profile, encrypted at rest with AES-256-GCM, so the database itself can't be read without the application's key. Access to sensitive data is logged: a citizen can open their own Privacy screen and see an access log and export their own data. All of this runs through NestJS REST services with validation, authentication, and role/ownership checks, persisted in PostgreSQL, with consequential actions written to the audit trail. What it doesn't claim: legal compliance certification, guaranteed deletion across every backup copy, or automatic consent propagation to every system that might ever touch the data — those are organizational and legal commitments, not something code alone can promise.

---

### MOD-40 — Transport and Destination Tracking (Cluster F — Field Response and Coordination)

**Introduction:** "My third module is MOD-40, Transport and Destination Tracking."

**Description & Purpose:** This module tracks a patient's transport from pickup all the way through to the destination hospital and the handover — which hospital, when transport started, the estimated time of arrival, whether the destination changed mid-transport, and the actual arrival. The purpose is to give both the dispatcher and the receiving hospital visibility into where a patient is headed, without ever pretending to guarantee travel time or automatically picking the "best" hospital on its own.

**AS-IS (before AGAP):** Previously, once an ambulance leaves the scene, its destination and status exist only in the crew's head and whatever they relay by radio. The dispatcher finds out where the patient is going only when someone calls it in, and the hospital finds out only when the ambulance arrives at the door — there's no advance notice, no ETA, and no record of a destination change if one happens along the way.

**TO-BE (with AGAP):** Now, once the responder marks the dispatch as Transporting, the mobile app prompts for a destination — a specific hospital, chosen from the registry, or "decide later" if it's not yet clear. The backend records the transport's origin, destination, departure time, and a routing-based estimated arrival, always labeled as an estimate. If circumstances change, a dispatcher or supervisor can update the destination, and that change is audited. When the responder arrives, one tap records the arrival and closes the transport — only one transport can be open per dispatch at a time. All of this is persisted with identifiers and timestamps in PostgreSQL, and where authorized, pushed live over Socket.io so the operations dashboard and the receiving hospital both see it update in real time. What it doesn't claim: automatic vehicle telemetry (the system isn't reading the ambulance's GPS by itself) and it doesn't automatically choose the destination for the crew.

---

### MOD-39 — Hospital and Receiving Facility Registry (Cluster F — Field Response and Coordination)

**Introduction:** "My fourth module is MOD-39, Hospital and Receiving Facility Registry."

**Description & Purpose:** This module maintains the master list of hospitals and receiving facilities AGAP knows about — their profile, location, receiving contact, capabilities, current status, and when they were last verified. It exists so every other module that needs to know "which hospital can take this patient" — the destination picker in MOD-40, hospital referrals — has one accurate, administered source of truth instead of everyone keeping their own list.

**AS-IS (before AGAP):** Before this, hospital information lives in whoever's memory or whoever's phone contacts has it — a name and a number scribbled somewhere, updated only when someone happens to notice it's wrong. There's no shared list, so different staff might have different, outdated contact numbers for the same hospital, and capability information (can this facility handle trauma? burns?) is just institutional knowledge.

**TO-BE (with AGAP):** Now, hospitals and facilities are registered records in the system — a profile with location, a receiving contact, their capabilities, a status flag, and a last-verified date — maintained through the Hospitals page in the Operations Center web app. An authorized user can search the list, create a new facility, and edit an existing one, with every field validated and every change authenticated and persisted in PostgreSQL. This is the registry MOD-40's destination picker reads from when it sorts hospitals by distance, and the one hospital referrals point into. What it doesn't claim: live, automatic synchronization with each hospital's own internal capacity system — status here is as current as the last person who updated it, not a live feed from the hospital's bed-management software.

---

### MOD-50 — Emergency Response Analytics (Cluster I — Analytics, Intelligence, and Surge)

**Introduction:** "My fifth and last module is MOD-50, Emergency Response Analytics."

**Description & Purpose:** This module turns every timestamp the other 52 modules generate into metrics MDRRMO can actually use — incident volume, response times, dispatch performance, workload, SLA compliance, outcomes, and trends, filterable and exportable. The purpose is accountability and continuous improvement: showing, with numbers, whether the office is actually getting faster and better, not just busier.

**AS-IS (before AGAP):** Without this, any sense of "how are we doing" comes from memory, from flipping back through logbooks, or not at all. There's no reliable way to say how many incidents happened last month, how long it typically took to acknowledge a report, or whether SLA targets were being met, because nothing was captured in a structured, queryable form to begin with.

**TO-BE (with AGAP):** Now, every incident's timestamps — submitted, received, acknowledged, dispatched, resolved, closed — are already sitting in PostgreSQL because the rest of the system wrote them there as a side effect of doing its job. The analytics service aggregates those into charts for a 7, 30, or 90-day window: incident volume, response-time distribution, dispatch performance, SLA compliance measured against the active SLA policy, and the false-alert rate. An empty date range correctly shows "No data" rather than a misleading zero percent. All of it runs through authenticated, role-checked NestJS services, surfaced on the Analytics page of the Operations Center. What it doesn't claim: predictive or causal analytics — it reports what happened, it does not forecast or diagnose why — and the false-alert rate specifically counts false-alert *records*, not distinct incidents, which is worth stating plainly if asked.

---

## 2. Vanessa Danielle T. Jose — MOD-02, 03, 05, 09, 53

### MOD-02 — Emergency Contact Management (Cluster A — User and Identity)

**Introduction:** "My first module is MOD-02, Emergency Contact Management."

**Description & Purpose:** This module lets a signed-in citizen keep a list of people — family, trusted neighbors — who should be told if they ever report an emergency, with a simple on/off switch per contact for whether that person gets alerted. The purpose is simple but important: have the right people recorded *before* the emergency happens, so nobody has to be looked up or called from memory while something urgent is happening.

**AS-IS (before AGAP):** Today, when an emergency happens, the operator or responder has to ask the caller or bystander, on the spot, who the patient's relatives are. The caller tries to recall numbers from memory or looks them up on a phone, the operator writes down whatever is given in a logbook, and staff then call each relative one at a time. If the patient is alone or unconscious, relatives often can't be identified or reached at all until much later — and none of this is kept for the next emergency.

**TO-BE (with AGAP):** Now, the citizen opens Profile, then Emergency Contacts, in the AGAP app. The screen lists their active contacts — name, relationship, phone number, and an "Alert" badge — pulled from a backend that confirms the sign-in token and returns only *that* citizen's own contacts. Adding a contact means entering a full name and phone number (required), with relationship and email optional, and a "Notify on alert" switch that defaults on. The backend validates the fields, saves the record linked to the citizen's account through a NestJS REST API backed by PostgreSQL, and the same ownership check applies to editing and removing — a contact can be deactivated but its history isn't erased. When that citizen later submits an emergency report, the backend automatically reads the active, alert-on contacts and queues an SMS to each of them through the notification module — this never blocks or delays the emergency report itself. What it doesn't do yet: validate that a phone number is actually in valid Philippine format, and reordering contact priority has no screen yet even though the backend supports it.

---

### MOD-03 — Medical Profile (Cluster A — User and Identity)

**Introduction:** "My second module is MOD-03, Medical Profile."

**Description & Purpose:** This module lets a citizen optionally record medical information — blood type, allergies, conditions, current medications, disabilities, and notes for responders — but only after giving a separate, explicit consent for medical data specifically. Every field is optional, and critically, a missing medical profile must never block an emergency report or a dispatch — that's one of AGAP's non-negotiable rules.

**AS-IS (before AGAP):** Right now, responders reach a patient with no advance medical information at all. They ask the patient if conscious, or companions if not, look for medicine bottles or an ID card on the person, and if nobody knows anything, staff try calling relatives for the medical history. Whatever is learned gets written by hand on the paper patient-care form and relayed verbally at hospital handover — and if the patient can't speak and nobody's there, that information is simply missing.

**TO-BE (with AGAP):** Now, the citizen opens Profile, then Medical Profile. If medical data consent hasn't been granted yet, the screen explains why and routes to Privacy to grant it — a consent record with a Granted timestamp is saved first, separately from everything else. Only then can the citizen pick a blood type and add allergies, conditions, medications, and disabilities, each validated for length and list size (up to 20 items, 60 characters each). Before saving, the backend encrypts every medical entry with AES-256-GCM bound to that citizen, so only encrypted ciphertext — not readable text — ever sits in the database; only the app, using the citizen's identity, can decrypt it back for display. Editing re-encrypts and updates the review date; withdrawing consent locks the screen again immediately. What it doesn't do yet: there's no screen for a responder to actually view this profile in the field (the backend endpoint exists, with an access log, but nothing calls it), and there's no in-app delete button yet either.

---

### MOD-05 — Emergency Readiness and Permission Status (Cluster A — User and Identity)

**Introduction:** "My third module is MOD-05, Emergency Readiness and Permission Status."

**Description & Purpose:** This module checks, ahead of time, whether a citizen's phone and account are actually ready to send an emergency alert — location, notifications, internet connection, camera, motion sensor, emergency contacts, a verified phone number, and a medical profile — and gives one overall status: Ready, Limited, or Not Ready. The purpose is to catch a problem like location permission being off *before* the emergency, while there's still time to fix it. It never blocks sending a report; it's purely advisory.

**AS-IS (before AGAP):** Without this, there's no readiness check at all — a resident finds out their phone has a problem (dead battery, no signal, no load) only at the exact moment they need to call for help, then has to scramble to find another working phone or ask a neighbor, delaying the call for help by however long that takes.

**TO-BE (with AGAP):** Now, opening Profile → Emergency Readiness runs a live check: the app reads the device's location permission and GPS status, notification and camera permissions, motion sensor availability, and internet connection, and sends that report, with a device ID, to the backend. The backend combines it with account-level facts — contacts on file, phone verified, medical consent and profile — and rates each item Ready, Limited, or Action Needed. The overall status follows clear rules: Not Ready if any Essential item (location, notifications, connection) needs action; Limited if a Recommended item (contacts, verified phone) isn't ready; Optional items like camera, motion sensor, or medical profile never lower the overall score. The latest report is saved per device in PostgreSQL, replacing the previous one, and — importantly — the exact same rules run on the phone itself when there's no internet, so the citizen still sees what to fix even offline. Each item links straight to the screen that fixes it. What it doesn't check: battery level or SMS load — those aren't among the signals this module reads.

---

### MOD-09 — Rapid Incident Detail Capture (Cluster C — Location and Tracking)

**Introduction:** "My fourth module is MOD-09, Rapid Incident Detail Capture."

**Description & Purpose:** This is the "tell responders what you see" screen inside the emergency report — a short set of tap-to-answer questions chosen specifically for the incident type, plus a nearest landmark, how many people are hurt, whether the reporter themselves is in danger, and free-text notes. Every single question is optional, and the report can be sent at any point, because the whole design principle is: optional data must never delay or block a report.

**AS-IS (before AGAP):** Today, the operator has to ask the caller what happened, where, and how many are hurt, then improvise follow-up questions from experience — and important ones sometimes get missed, especially with a panicking caller giving long, unstructured descriptions. The operator writes a summary into the logbook, and the details reach responders only through a verbal briefing, where something can get lost in translation.

**TO-BE (with AGAP):** Now, after picking an incident type, the reporter sees questions specific to that type, pulled from one shared question list used by the app, the backend, and the web dashboard alike — vehicles, injuries, someone pinned, fuel or fire for a road incident; what's burning, people trapped, spreading, explosions, chemicals for a fire; what's happening, people stranded, people needing extra help for a natural disaster, with a flooding follow-up for water depth and trend. The reporter optionally adds a landmark, a people-hurt count, "I'm safe" or "I need help too," and notes, then sends. The backend keeps only the answers the shared list actually defines — nothing unexpected gets through — and a natural-disaster report with flooding ticked gets automatically re-filed as a Flood incident. Those answers feed directly into the priority recommendation module, and the dispatcher sees them, in plain readable language, in the web incident drawer, along with exactly which answers raised the priority. What it doesn't offer: there's no Medical incident type in this screen — only Road incident, Fire, and Natural disaster — and, again, no answer is ever required.

---

### MOD-53 — Municipal Announcements and Public Broadcast (Cluster J — Municipal Broadcast)

**Introduction:** "My fifth and last module is MOD-53, Municipal Announcements and Public Broadcast."

**Description & Purpose:** This module lets the authorized Announcements Publisher at the LGU or MDRRMO write official public notices — river level, rainfall, flood, evacuation, class suspension, road closure — from standard Bocaue templates, publish them immediately or schedule them, and reach residents through the app, push notifications, and SMS all at once. The purpose is fast, consistent, official communication during events like typhoons and floods, with a complete record of who issued what and when. It is explicitly a one-way broadcast — never an emergency dispatch channel.

**AS-IS (before AGAP):** Right now, staff receive a source bulletin — a PAGASA advisory, a river-level reading, a DepEd order — and draft the wording by hand, with phrasing that varies from person to person. The draft gets brought or messaged to the Mayor's Office or MDRRMO head for approval, then posted to the official Facebook page, while staff separately text barangay officials one by one from their own phones, who then relay it by megaphone, public address, or printed posting. Corrections just become new posts, with old versions still circulating, and there's no central record of what was sent, to whom, or when.

**TO-BE (with AGAP):** Now, the publisher signs in to the web console, opens Compose, and picks a template — say, Bocaue River water level. They fill in the template's fields: category, severity, scope, affected barangays, issuing office, source, effective time, language, and an optional image; the console builds the title, body, and summary automatically. The backend validates the role, the field lengths, and before it can go out, checks that required details — a source reference for hazard categories, affected barangays for barangay-specific notices — are actually filled in, refusing to publish otherwise. The publisher chooses Publish now or Schedule for later; a background job sweeps for due notices every minute and releases them automatically. On publish, the backend broadcasts the event live over Socket.io, queues a push notification through Firebase, and queues an SMS through Textbee to every active subscriber, cut to 160 characters — and a failed push or SMS never undoes the publish. Residents read it in the app's Announcements list and can subscribe to SMS alerts with just a phone number. If something's wrong, the publisher cancels it with a correction note, and old notices get archived. What it doesn't do yet: STOP replies aren't processed so there's no real unsubscribe path yet, SMS currently goes to every subscriber regardless of barangay preference, and the publisher currently approves their own notice — there's no separate approver role active.

---

## 3. Aldrin Dela Cruz — MOD-20, 25, 27, 31, 32

### MOD-20 — Real-Time Event / WebSocket Engine (Cluster D — Alert Processing and Dispatch)

**Introduction:** "My first module is MOD-20, the Real-Time Event / WebSocket Engine."

**Description & Purpose:** This module is the nervous system of the whole operations side — it distributes real-time events (a new incident, a status change, a unit's updated position) to every authorized client the instant something happens, instead of making screens poll or refresh. The purpose is situational awareness that's actually *live*, which matters enormously when minutes count.

**AS-IS (before AGAP):** Without something like this, every status update has to be relayed manually — a phone call, a radio call, someone physically telling the next person. Whoever isn't on that specific call or radio channel simply doesn't know yet, and there's no way to be sure everyone who needed the update actually got it.

**TO-BE (with AGAP):** Now, every client that connects — a dispatcher's browser, a responder's phone — does so over an authenticated Socket.io connection; the connection itself is rejected if the user isn't signed in. Clients join "rooms" scoped to what they're allowed to see: their own incident, their organization's operations room, nothing more. When something changes — incident created, status changed, a unit's location updated, a dispatch created — the backend emits the event into the right room(s), and every open, authorized screen updates immediately, with no manual refresh. Underneath, every event is still backed by the authoritative database write; the socket is a notification layer, not the source of truth, and if a broadcast somehow fails, the underlying action it describes is never blocked by that failure. What it doesn't guarantee: if a client is disconnected, it does not durably replay missed events or guarantee delivery — an API call to refresh the current state covers the gap, and the client reconnects and re-fetches rather than relying on a backlog of missed socket messages.

---

### MOD-25 — Incident Triage and Validation (Cluster E — Monitoring and Escalation)

**Introduction:** "My second module is MOD-25, Incident Triage and Validation."

**Description & Purpose:** This module lets a trained dispatcher verify and improve an incident's information before anything gets dispatched — acknowledging it, verifying the location, validating the category, clarifying the patient, checking for hazards, and adding triage notes. The purpose is a quality gate: catching a wrong category or an unclear location *before* a unit is sent to the wrong place, while being explicit that this is operational triage, not certified clinical or medical triage.

**AS-IS (before AGAP):** Previously, this verification happens informally and verbally — a dispatcher might call back to confirm a location, or might not, depending on how busy things are, and whatever gets confirmed is only as reliable as whoever remembered to write it in the logbook.

**TO-BE (with AGAP):** Now, incoming incidents land in a structured Triage queue with clear states: Submitted, Received, Acknowledged. The dispatcher works through the queue with explicit actions — Mark Received, Mark Acknowledged, Mark Assessed — each one authenticated, role-checked, and written to the audit trail with a timestamp. The same page (and the incident drawer) also exposes False Alert, for a report that turns out not to be real, blocked unless the incident is actually in a state where that makes sense (Acknowledged or Assessed). Every transition is persisted to PostgreSQL and broadcast live, so the rest of operations sees the incident move through triage in real time. What it doesn't claim: the result is operational decision support for dispatchers, not a clinical diagnosis or a certified medical triage protocol.

---

### MOD-27 — Emergency Organization and Resource Registry (Cluster E — Monitoring and Escalation)

**Introduction:** "My third module is MOD-27, Emergency Organization and Resource Registry."

**Description & Purpose:** This module registers every emergency organization — MDRRMO, BFP, the hospital — and every operational resource or unit they own, with coverage area, capabilities, contacts, ownership, and status. The purpose is one authoritative source of "who exists and who owns what" that dispatch, fleet, and the resource-matching modules all read from, instead of everyone keeping separate, possibly conflicting lists.

**AS-IS (before AGAP):** Without a registry, "who has what" is institutional knowledge — whoever has been working there longest knows which agency has which trucks, and that knowledge doesn't transfer cleanly when staff change, nor is ownership of a given unit ever enforced; anyone could, in principle, claim or edit anyone else's resource.

**TO-BE (with AGAP):** Now, organizations and their resources are records: created, edited, and filterable through the web console's Organizations and Resources/Fleet pages. Every unit visibly belongs to an organization, and critically, ownership is enforced at the authorization layer, not just shown in the UI — an Org Administrator can edit only their own organization's units; trying to edit another organization's unit is refused by the backend, not just hidden in the interface. Every record is validated, authenticated, and persisted in PostgreSQL with identifiers and timestamps. What it doesn't claim: automatic synchronization with every outside municipal, hospital, or agency master system — this registry is as accurate as whoever maintains it here, not a live feed from external government systems.

---

### MOD-31 — Dispatcher Assignment and Dispatch Authorization (Cluster E — Monitoring and Escalation)

**Introduction:** "My fourth module is MOD-31, Dispatcher Assignment and Dispatch Authorization."

**Description & Purpose:** This module controls who actually gets sent to an incident and records that decision — unit selection, assignment, authorization, acceptance, reassignment, recall, all timestamped and audited. The purpose ties directly into one of AGAP's core rules: dispatch recommendations assist the dispatcher, they never decide on their own. A human always clicks to authorize.

**AS-IS (before AGAP):** Today, a dispatch decision is made verbally — over radio or phone — with the reasoning living only in the dispatcher's head and whatever gets jotted in a logbook afterward. If a unit needs to be swapped or recalled, that's another radio call, with no structured record of why.

**TO-BE (with AGAP):** Now, from an incident that's been validated (Acknowledged or Assessed), the dispatcher opens the Dispatch screen, where a ranked list of suitable units is already presented (that ranking is a different module's job — MOD-30 — but this module is where the decision gets made). The dispatcher picks a unit, can add or remove crew, and must click to **confirm** the dispatch — that explicit click is the authorization; nothing is sent automatically before it. If circumstances change, the dispatcher can reassign to a different unit or cancel the dispatch outright, and every one of these actions — assignment, authorization, acceptance, reassignment, cancellation — is persisted with timestamps and written to the audit trail, with authorized clients notified live. What it doesn't claim: it doesn't talk to any outside radio/CAD dispatch system, and it never mobilizes a unit automatically — authorization is always a human decision.

---

### MOD-32 — Responder / Ambulance Crew Mobile Interface (Cluster E — Monitoring and Escalation)

**Introduction:** "My fifth and last module is MOD-32, the Responder / Ambulance Crew Mobile Interface."

**Description & Purpose:** This module is the responder's entire operational workspace on their phone — an assignment inbox, the incident summary, navigation, status updates, their live location, the on-scene assessment, and transport/handover. The purpose is to give the crew everything they need in the field without a separate radio call for each step, while being honest that this is not a full electronic patient-care record or a vehicle-telemetry product.

**AS-IS (before AGAP):** Right now, a responder learns about an assignment by radio or phone call, navigates using their own knowledge of the area or a separate consumer map app, and reports status changes — en route, on scene, transporting — verbally back to dispatch, with no structured trail of when each step actually happened.

**TO-BE (with AGAP):** Now, the responder opens the AGAP app and sees their assignment inbox, refreshed every 15 seconds and immediately after any action they take. They accept the assignment, see the incident summary (including only the patient data they're permitted to see), and step through status updates — en route, on scene, transporting or assisting, resolved — each one timestamped, persisted, and broadcast live to the dispatcher's screen. Navigation and the live map are built in, and the same screens connect to the assessment module and the transport/destination module for a complete chain. One limit worth stating plainly: there's no push notification for a brand-new assignment yet — the inbox relies on that 15-second refresh, which is a documented, accepted limit, not a hidden bug. What it doesn't claim: it is not a complete electronic patient-care record system, and it doesn't integrate with vehicle telemetry or clinical devices.

---

## 4. Christian Joaquin — MOD-06, 08, 10, 11, 12

### MOD-06 — Immediate SOS Trigger / One-Button SOS (Cluster B — Alert Triggering)

**Introduction:** "My first module is MOD-06, the Immediate SOS Trigger, also called One-Button SOS."

**Description & Purpose:** This is the large SOS button on the AGAP home screen — hold it for three seconds, and a short guided flow (location, incident type, details) sends the report straight to the MDRRMO Operations Center. A person without an account can report too, as long as they're inside Bocaue. The purpose is one fast, hard-to-trigger-by-accident way to get help moving, with accurate information attached from the start — and it's explicitly a complement to 911 and the MDRRMO hotline, never a replacement.

**AS-IS (before AGAP):** Today, reporting an emergency means calling the MDRRMO hotline or 911, describing what happened and where in words, with the operator writing it into a logbook and relaying it to responders by radio — and if the line is busy or the call drops, the caller just has to call again from the start.

**TO-BE (with AGAP):** Now, pressing and holding SOS for three full seconds — with vibration and sound feedback while holding, and the hold cancels if released early — starts a new report tagged with a unique key, so that if it's ever resent, the backend recognizes the key and returns the *same* incident instead of creating a duplicate. The flow then captures the GPS location, asks for an incident type — Road incident, Fire, or Natural disaster — and moves to an all-optional details screen before sending. On submit, the backend validates that latitude and longitude are both present and inside Bocaue, checks the report key for duplicates, and in one database transaction saves the incident with its public reference number, the reporter record kept separate from any patient record, the location, and the first timeline event — then immediately pushes it live to the Operations Center dashboard, queues the MDRRMO SMS, and notifies the citizen's emergency contacts. If sending fails for any reason, the app shows a clear failure screen with the 911 and MDRRMO hotline numbers and a Try Again button using that same report key. What it doesn't offer: there's no Medical incident type in the app itself (only Road incident, Fire, and Natural disaster), and there's no save-now-send-later queue — that offline queue module was deliberately eliminated from the system.

---

### MOD-11 — Precision GPS Capture (Cluster C — Location and Tracking)

**Introduction:** "My second module is MOD-11, Precision GPS Capture."

**Description & Purpose:** This is the "Confirm Location" step of the report — it takes several GPS readings within a few seconds, keeps the most accurate one, shows it on a map, and checks that it falls inside Bocaue. The purpose is to send responders to the *exact* spot instead of a verbal description, while never letting a weak signal or a denied permission stop someone from still asking for help.

**AS-IS (before AGAP):** Right now, the operator asks the caller where they are, the caller names a street or landmark — often unclear while panicking — and the operator has to guess the exact spot from memory of the area, sometimes requiring responders to call again en route just to confirm.

**TO-BE (with AGAP):** Now, right after SOS starts, the app requests location permission if needed and takes up to three high-accuracy GPS readings within six seconds, stopping early the moment one is accurate to within 20 meters. It keeps the best reading, checks it against the official Bocaue boundary, and shows it on a map with the accuracy figure next to it. If permission is denied, no reading arrives, or the position falls outside Bocaue, the screen explains clearly and offers Retry, Edit (type a location instead), and — only for a signed-in citizen — "Continue without precise location." A person reporting without an account, though, cannot proceed without a valid Bocaue GPS fix — that's the one case where location truly is mandatory, because there's no account to fall back on for verification. On submission, the backend re-checks that the coordinates are present together and inside Bocaue, then saves them with the incident along with how they were obtained: GPS, GPS with address, or manual. What it doesn't offer: there's no draggable pin to manually correct a position — only a typed location as a fallback — and this module doesn't track the reporter's location continuously after the report; that's a different module tracking the *responder's* position instead.

---

### MOD-12 — Location Context and Reverse Geocoding (Cluster C — Location and Tracking)

**Introduction:** "My third module is MOD-12, Location Context and Reverse Geocoding."

**Description & Purpose:** This module turns raw GPS coordinates into something a human can actually read — a street address — and tags the incident with its official Bocaue barangay. The purpose is letting dispatchers and responders work with "this street, this barangay" instead of a pair of numbers, and routing the incident to the right barangay for coordination and reporting.

**AS-IS (before AGAP):** Currently, the caller gives a street, purok, or landmark name verbally, and the operator has to work out which barangay that actually falls in using local knowledge, writing both into the logbook — and mistakes about the barangay are often only discovered once responders are already on the way or the wrong barangay gets called.

**TO-BE (with AGAP):** Now, as soon as a GPS position is captured, the app sends the coordinates to the backend, which checks they're inside Bocaue and asks an external geocoding service (Nominatim/OpenStreetMap, with a 5-second timeout) for a readable street address, barangay, municipality, and province. That shows up on the Confirm Location screen, with an Edit option if the reporter wants to correct it by typing. If the lookup fails or times out, the app simply keeps the coordinates and continues — the report is never held up waiting on a third-party service. On submission, the backend saves the address with the location, and separately runs its own boundary check — finding which official barangay polygon actually contains the point, or the nearest one marked approximate if the point sits right at a border — and that backend-verified barangay, not whatever the phone displayed, is what dispatchers see in the Incident Queue and drawer. What it doesn't offer: this module only works coordinates-to-address, not the other way around — a typed address is saved as plain text, not converted back into coordinates.

---

### MOD-10 — Incident Photo and Evidence Capture (Cluster C — Location and Tracking)

**Introduction:** "My fourth module is MOD-10, Incident Photo and Evidence Capture."

**Description & Purpose:** This module lets the reporter attach one live photo or a short video, up to 60 seconds, captured directly through the in-app camera — never from the gallery — as part of the report. The purpose is to show dispatchers what the scene actually looks like, while flagging anything that doesn't look like a genuine, current, on-scene capture, so staff can judge for themselves rather than trusting a photo blindly.

**AS-IS (before AGAP):** Today, if a photo reaches staff at all, it's sent separately by text message or Messenger to a personal phone, completely disconnected from the logbook entry, and there's no way to tell whether that photo was actually taken at the time and place of the emergency, or is an old photo from somewhere else entirely.

**TO-BE (with AGAP):** Now, on the Details screen, the reporter can tap to open the in-app camera — with a hint that says to only do this if it's safe — take a photo or record up to 60 seconds of video, retake if needed, or skip entirely. The app captures the time and, if location is allowed, the GPS position at the moment of capture. The file uploads only *after* the report itself is already saved, so a slow or failed upload never delays or blocks the emergency report — if the upload fails, the reporter is simply told the report went through but the photo didn't. On the backend, the uploader is verified to be the incident's own reporter, the file type and size are checked, the file is stored in object storage, and the system scores the capture for authenticity — was it genuinely live, taken near the reported time and place, inside Bocaue — saving that score and its reasons alongside the file. Dispatchers see the photo or video in the incident drawer with a chip: Verified, Review, or Suspect, plus the plain-language reasons behind that score. What it doesn't offer: photos aren't accepted from reports made without an account, there's no gallery picker — only live capture — and only one photo per report from the app; and importantly, the authenticity check is advisory only, the dispatcher makes the final judgment, not the algorithm.

---

### MOD-08 — Emergency Cancellation and False Alert Management (Cluster B — Alert Triggering)

**Introduction:** "My fifth and last module is MOD-08, Emergency Cancellation and False Alert Management."

**Description & Purpose:** This module handles reports that shouldn't lead to an actual response — a reporter can cancel their own report, with a stated reason, right up until a unit is dispatched; separately, a dispatcher or supervisor can classify an already-acknowledged report as a false alert. The purpose is keeping responders from being sent somewhere that no longer needs them, while still keeping a complete, honest record of every cancelled or false report for later review.

**AS-IS (before AGAP):** Right now, if a caller reported by mistake or the situation resolved itself, they'd have to call the hotline again, the operator finds the original entry in the logbook and notes it, and if responders were already sent, they get recalled by radio — with prank or mistaken calls judged informally, if they're noted at all, and no reliable count of how often this happens.

**TO-BE (with AGAP):** Now, the reporter can open their own incident in the app and tap Cancel; the app first warns them to call 911 or the MDRRMO hotline if it's a genuine ongoing emergency, then asks them to confirm, pick one of five reasons (accidental trigger, situation resolved, already reported, wrong app or test, other), and confirm again. The backend checks that the person cancelling is actually the incident's reporter and that the incident's current status still allows cancelling — once a unit has been dispatched, cancellation from the app is refused. On a valid cancel, the status becomes Cancelled, the reason is written into the timeline, an audit entry is created, and the dashboard updates live. Separately, a dispatcher reviewing an Acknowledged (or Assessed) report can tap False Alert — from the Triage page with one tap, or from the incident drawer with a confirming second tap — and the backend enforces that this is only allowed from the right status. A valid false alert sets the status, creates a false-alert record, writes an audit entry, updates the dashboard live, and notifies the original reporter that their report was closed as a false alert, along with the same reminder to call 911 if it's real. What it doesn't offer: there's no app notice sent to a reporter who cancels their own report (they already know — they just did it), neither action collects additional notes beyond the preset reasons, and cancellation is never available from the app once dispatch has already happened.

---

## 5. Arjay Mauricio — MOD-30, 26, 52, 22, 28

### MOD-30 — Suitable Response Unit Recommendation (Cluster E — Monitoring and Escalation)

**Introduction:** "My first module is MOD-30, Suitable Response Unit Recommendation."

**Description & Purpose:** This module ranks the units best suited to respond to a specific incident — filtered by capability, scored by readiness, proximity, a travel estimate, and current workload — and presents that ranking, with its reasons, to the dispatcher for consideration. The purpose is decision support: the system never decides which unit goes, it only makes the choice faster and better-informed. The dispatcher can always override it.

**AS-IS (before AGAP):** Without this, a dispatcher picks a unit from memory or by calling around to ask who's free and how far they are — reasonable when there are only a couple of units, but slow and inconsistent as the number of organizations and units grows.

**TO-BE (with AGAP):** Now, when an incident reaches the dispatch stage, the backend filters candidate units by whether their capabilities actually match the incident's category (a required-capability matrix defines this per category), checks each candidate's current readiness, calculates real distance using PostGIS, factors in unit type and current workload, and returns a ranked list with the reasoning spelled out — something like "1.2 km away, BLS-capable, currently available." That ranking appears directly on the Dispatch screen the dispatcher is already using. Nothing here auto-assigns anything; it's explicitly advisory, surfaced before the authorization step that a different module (dispatch authorization) actually executes. What it doesn't claim: it's not AI-validated and it doesn't guarantee the mathematically "optimal" choice — real-world factors a dispatcher knows and the software doesn't can always override it, and that's by design.

---

### MOD-26 — Duplicate Incident Detection and Merging (Cluster E — Monitoring and Escalation)

**Introduction:** "My second module is MOD-26, Duplicate Incident Detection and Merging."

**Description & Purpose:** During any real event, the same emergency often gets reported more than once — by different bystanders, from different phones. This module finds those probable duplicates using time and location closeness (via PostGIS), category similarity, and text similarity, ranks the candidates, and lets a dispatcher review and confirm any merge — nothing merges automatically.

**AS-IS (before AGAP):** Today, if the same emergency is called in twice, it's entirely up to the operator's memory or a lucky cross-check of the logbook to notice — and if they don't notice, two separate responses can get mobilized for one single event, wasting a scarce resource.

**TO-BE (with AGAP):** Now, when a new incident comes in, the duplicate-detection service compares it against recent open incidents by distance, time window, category, and description similarity, and surfaces likely candidates to the dispatcher directly in the incident workflow. The dispatcher reviews the candidate, and only on their explicit confirmation does the system merge the two — designating one as the master incident and preserving the other's history rather than deleting it, so nothing is lost even after a merge. Every candidate match and every merge decision is recorded with an audit trail. What it doesn't claim: detection isn't perfect — it surfaces *probable* duplicates for a human to judge, not a guaranteed match — and merging is never automatic or lossless; it's a reviewed, human-confirmed action.

---

### MOD-52 — Disaster Surge and Mass-Casualty Mode (Cluster I — Analytics, Intelligence, and Surge)

**Introduction:** "My third module is MOD-52, Disaster Surge and Mass-Casualty Mode."

**Description & Purpose:** For a disaster or mass-casualty event — the kind of scenario Bocaue plans for with its fireworks industry and flood-prone barangays — this module gives a supervisor a controlled surge mode: grouping a major incident, handling multiple patients with rapid triage tags, tracking a resource surge, coordinating mutual aid, supporting command structure, and managing operational periods until deactivation.

**AS-IS (before AGAP):** Without it, a mass-casualty event is managed the same way a single incident is — one record, one set of radio calls — which doesn't scale when there are suddenly dozens of patients and multiple agencies converging on one scene at once; coordination becomes ad hoc and verbal very quickly.

**TO-BE (with AGAP):** Now, a supervisor can activate Surge Mode for a major incident from the Operations Center, which groups it as a major event the rest of the dashboard treats specially. Multiple patients can be logged with rapid triage tags, a resources summary shows what's available across the municipality at a glance, and a broadcast can be sent out, all tied to that one surge event. Deactivation closes out the operational period cleanly. One limit worth stating up front if asked: the triage-tag list refreshes every 30 to 60 seconds rather than updating instantly — a stated, accepted limit, not a defect. What it doesn't claim: this is partial operational support for a real mass-casualty event, not a complete, certified mass-casualty command system, and it doesn't integrate with any external emergency-operations center software.

---

### MOD-22 — Real-Time Incident Map (Cluster D — Alert Processing and Dispatch)

**Introduction:** "My fourth module is MOD-22, the Real-Time Incident Map."

**Description & Purpose:** This module gives the Operations Center geographic situational awareness — every active incident and every responding unit's live position, shown on an actual map of Bocaue, color-coded by priority, with operational overlays like flood-prone barangays. The purpose is letting a dispatcher or supervisor see the whole municipal picture at a glance, not just a list of rows in a table.

**AS-IS (before AGAP):** Today, "where is everything" lives only in whoever's mental model of the municipality is sharpest, built from printed maps and memory — there's no way to glance at a screen and see every active incident and every unit's position at once.

**TO-BE (with AGAP):** Now, the Operations Map, built on MapLibre, plots every incident as a marker colored by its priority, every responding unit's position updated live, and overlays like the flood-prone-barangay boundaries (Lolomboy, Bunlo, Igulot, Bambang) laid over the base map. Clicking any marker opens that incident directly. Because this reads from the same real-time event engine used across operations, a new incident appears on the map the moment it's submitted, with no refresh needed, and a responder's marker moves as their phone reports a new position. What it doesn't claim: it's not an authoritative GIS system, it's not 3D mapping, map tiles aren't guaranteed to always load instantly, and there's no universal offline map mode — this is an operational live-situation view, not a surveying tool.

---

### MOD-28 — Response Unit Availability and Readiness (Cluster E — Monitoring and Escalation)

**Introduction:** "My fifth and last module is MOD-28, Response Unit Availability and Readiness."

**Description & Purpose:** This module maintains, in real time, every unit's current status — available, assigned, en route, on scene, unavailable, or in maintenance — along with crew/vehicle readiness, location, and timestamps. The purpose is a single, always-current board the dispatcher can check before recommending or authorizing any dispatch, instead of having to call around to ask who's free.

**AS-IS (before AGAP):** Without this, unit availability is tracked by memory or by calling each unit directly to ask if they're free — slow, and prone to sending a request to a unit that's actually already busy or in maintenance.

**TO-BE (with AGAP):** Now, the Fleet board on the web shows a live status summary and a dropdown to change any unit's status manually from the operations side. On the other end, a responder's own phone has an availability toggle, and when they flip it, that update reaches the Fleet board immediately through the same real-time event engine — proving the mobile and web sides are genuinely one connected system, not two separate tools. This status feed is exactly what the unit-recommendation module reads when it filters candidates by readiness, and what the dispatch-authorization module checks before a unit can be assigned. What it doesn't claim: it doesn't guarantee the unit's *physical* readiness (fuel, equipment, actual crew health) — that's still a human judgment — and it isn't reading live vehicle telemetry or automatic fleet GPS; a human still has to confirm status changes, whether from the web board or the phone.

---

## Closing notes for every presenter

- End each module's spoken part with one short sentence connecting it to the next presenter's topic, if you're running the chained demo from the Demo Guide — e.g., Christian's MOD-08 can close with "...and once a report is validated instead of cancelled, it moves into triage, which is where Aldrin picks up."
- If the instructor asks "what happens if this fails" for any module, the honest AGAP-wide answer is almost always the same: a failed notification, SMS, ETA calculation, or background job never deletes, cancels, or blocks the underlying incident — only a human action (cancel, false alert, closure) changes an incident's fate. That's a system-wide rule, not a module-specific exception.
- If asked to compare AS-IS and TO-BE in one sentence for any module: the AS-IS column is always "manual, verbal, undocumented, and dependent on someone remembering correctly"; the TO-BE column is always "structured, validated, timestamped, authenticated, and audited." That contrast is the entire thesis of AGAP — say it plainly if you get stuck.
