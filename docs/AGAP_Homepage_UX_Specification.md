# AGAP Citizen Mobile — Homepage UI/UX Specification

**Document type:** Screen specification + gap analysis
**Surface:** Mobile app — Citizen role (`mobile/app/(home)/index.tsx`)
**Prepared from:** Mockup v1, `AGAP_Complete_Master_Enterprise_Architecture.md`, and all 53 module docs
**Bocaue MDRRMO context applies throughout.**

---

## 1. Mockup Gap Analysis (What's Present vs. What's Missing)

### ✅ What the Mockup Already Has

| Element | Module(s) |
|---|---|
| AGAP logo + notification bell + profile avatar in header | MOD-01 |
| Personalized greeting ("Good Morning, Justine Soliman") | MOD-01 |
| Hero SOS press-and-hold button | MOD-06 |
| "In an Emergency?" instruction copy | MOD-06 |
| Quick Actions grid (Contacts, Medical Profile, First Aid, Location, Incident History, Notifications) | MOD-02, MOD-03, MOD-09, MOD-11, MOD-14, MOD-16 |
| Current Location banner + mini-map thumbnail + "View Map" | MOD-11, MOD-12 |
| Bottom tab bar (Home, Incidents, SOS, Map, Profile) | Navigation |

### ❌ What's Missing from the Mockup

| Missing Element | Why It Must Exist | Module(s) |
|---|---|---|
| **Active incident status card** | If the user has a live emergency in progress, that is the most important thing on the screen. It must show current lifecycle state, responder ETA, and a link to full status. Without it, the user has no feedback after pressing SOS. | MOD-42, MOD-43 |
| **Announcements feed strip** | LGU/MDRRMO publishes flood alerts, class suspensions, evacuation orders, and road closures. Citizens must see these on the home screen — not hidden in a separate tab. MOD-53 explicitly states the feed must be accessible without login. | MOD-53 |
| **Disaster / Surge Mode banner** | When Bocaue MDRRMO activates mass-casualty or flood surge mode, every citizen must see a high-visibility warning banner at the top of the screen with the active emergency type, affected barangays, and a link to read more. | MOD-52 |
| **Connectivity + readiness indicator** | AGAP must never silently fail. A persistent small indicator for GPS permission status, notification permission, and online/offline state is required — especially for flood-zone users on degraded connectivity. | MOD-05 |
| **Profile completeness nudge** | Incomplete profiles (no medical info, no emergency contacts) reduce response quality. A dismissible progress bar or card prompts users to complete their setup until the profile is 100%. | MOD-01, MOD-02, MOD-03 |
| **Shake-to-Alert status toggle** | MOD-07 requires the citizen to know whether the shake gesture is active and be able to quickly enable/disable it to prevent accidental triggers. | MOD-07 |

---

## 2. Complete Homepage Content — Section by Section

The homepage is a **vertically scrollable feed**. Sections are ordered by urgency and operational importance.

---

### Section 0 — Surge/Disaster Mode Banner *(conditional, topmost)*

**Shown when:** MDRRMO activates disaster/surge mode (MOD-52).
**Hidden when:** No active surge event.

```
┌─────────────────────────────────────────────────────────┐
│  🔴  SURGE MODE ACTIVE — FLOOD OPERATIONS               │
│  Lolomboy · Bunlo · Igulot · Bambang affected           │
│  Bocaue River: 11.2 m  |  [ View Emergency Brief ]      │
└─────────────────────────────────────────────────────────┘
```

**Rules:**
- Background: solid red for CRITICAL / amber for WARNING severity
- Uses both icon + text (never color alone) — accessibility requirement from all module specs
- Non-dismissible while surge is active
- Tapping "View Emergency Brief" navigates to the MOD-53 full announcement + the MOD-52 public status page

---

### Section 1 — Header Bar *(fixed, always visible)*

```
[ AGAP Logo ]                    [ 🔔 (badge) ]  [ Avatar ]
```

| Element | Behavior |
|---|---|
| AGAP logo | Non-interactive; brand mark |
| Notification bell | Badge shows unread count; taps open notifications drawer (MOD-16) |
| Avatar | Taps open profile sheet; shows profile completeness ring around avatar if < 100% |

**Connectivity pill** — pinned to the right of the logo, small:

| State | Display |
|---|---|
| Online, GPS active | Green dot — no text |
| Online, GPS off | Amber dot · "GPS off" |
| Offline | Red pill · "Offline — SOS queued" |
| Degraded | Amber pill · "Weak signal" |

This satisfies MOD-05 and the architectural rule: *"The system must never silently fail — every connectivity state needs a clear UI indicator."*

---

### Section 2 — Personalized Greeting Card

```
┌──────────────────────────────────────────────────────┐
│  👤  Good Morning, Justine Soliman                   │
│      Stay safe. Help is always near.                 │
│                             [Complete your profile →]│  ← only if < 100%
└──────────────────────────────────────────────────────┘
```

- Time-aware greeting: Good Morning / Good Afternoon / Good Evening
- Profile completeness inline CTA only shown if `profile_completeness < 100` (MOD-01 field)
- No CTA when profile is complete — card stays clean

---

### Section 3 — Active Incident Status Card *(conditional)*

**Shown when:** The user has a live incident (status not CLOSED / CANCELLED / FALSE_ALERT).
**Hidden when:** No active incident.

This is the **highest-priority content block** when it is present. It slides in above the SOS button.

```
┌──────────────────────────────────────────────────────┐
│  🚑  YOUR EMERGENCY IS ACTIVE          [View Status] │
│                                                      │
│  ●──────●────────○────────○────────○                 │
│  Submitted  Acknowledged  Dispatched  En Route  On Scene
│                 ✓            ✓                        │
│                                                      │
│  Responder assigned · ETA ~8 min (estimate)          │
│  Last updated: just now                              │
│                                                      │
│  [ Cancel Emergency ]  (secondary, smaller)          │
└──────────────────────────────────────────────────────┘
```

**Content:**
| Field | Source | Notes |
|---|---|---|
| Incident reference | `public_reference` e.g. INC-2026-001234 | Never expose internal UUID |
| Lifecycle progress bar | `incident_status` (MOD-15 enum) | Shows 5 citizen-visible states only |
| Responder ETA | MOD-43 output | Always labelled "estimate" — architectural rule 13 |
| Last updated timestamp | WebSocket push (MOD-20) | Shows staleness if no update > 60 s |
| Cancel button | MOD-08 | Secondary style; requires confirmation flow |

**States to handle:**
- `SUBMITTED` — "Waiting for Operations Center to receive…"
- `ACKNOWLEDGED` — "Operations Center has received your alert"
- `DISPATCHED / EN_ROUTE` — show ETA
- `ON_SCENE` — "Responders are on scene"
- `TRANSPORTING` — "You are being transported"
- `RESOLVED / CLOSED` — card dismisses; moves to Incident History
- No connectivity — show last known state + "Offline — showing last known status"

---

### Section 4 — Hero SOS Button

```
                 ┌──────────────────────┐
                 │                      │
                 │    ⚠  (large icon)   │
                 │                      │
                 └──────────────────────┘
              In an Emergency?
   Press and hold the button to send an alert
          to the Operations Center.
```

**Behavior (MOD-06):**
- Press-and-hold (not single tap) to prevent accidental triggers — debounce
- 3-second hold with circular progress ring before confirmation
- On hold complete → brief confirmation modal → incident creation → status card appears (Section 3)
- While active incident exists: button is replaced with **"View Active Emergency"** — user cannot double-submit

**Shake-to-Alert status chip** — shown directly below SOS button copy:

```
  🤙  Shake to alert: ON   [Tap to change]
```

- Shows whether MOD-07 shake detection is enabled
- One-tap toggle to enable/disable (with brief explanation why it helps)

---

### Section 5 — Quick Actions Grid

Six fixed tiles in a 3×2 grid. "View all" link navigates to a full actions list.

| Tile | Icon | Description | Destination | Module |
|---|---|---|---|---|
| Contacts | `people-outline` | Manage your emergency contacts | `/contacts` | MOD-02 |
| Medical Profile | `pulse-outline` | Allergies, conditions, medications | `/medical` | MOD-03 |
| First Aid | `medkit-outline` | Guides and emergency tips | `/first-aid` | MOD-09 |
| Location | `location-outline` | Share your location | GPS share sheet | MOD-11 |
| Incident History | `document-text-outline` | Your reported incidents | `/incidents` | MOD-14 |
| Notifications | `notifications-outline` | Important updates | `/notifications` | MOD-16 |

**Badge indicators:**
- **Contacts** tile: amber badge if no emergency contacts set (zero contacts)
- **Medical Profile** tile: amber badge if no consent record / empty profile
- **Notifications** tile: red badge with unread count

These nudges are actionable answers to the profile completeness problem from MOD-01/02/03.

---

### Section 6 — Municipal Announcements Strip

**Always visible** (MOD-53 states the feed must be accessible without login). This section is **not emergency dispatch** — it is official LGU/MDRRMO broadcast only.

```
┌──────────────────────────────────────────────────────┐
│  📢  MDRRMO Announcements              [See all →]   │
│─────────────────────────────────────────────────────│
│  ⚠️  FLOOD ADVISORY · WARNING                        │
│  Bocaue River at 10.8 m — monitor levels             │
│  Lolomboy, Bunlo, Igulot, Bambang · 2 hours ago     │
│─────────────────────────────────────────────────────│
│  ℹ️  CLASS SUSPENSION · INFORMATIONAL                 │
│  All public schools suspended tomorrow               │
│  Municipality-wide · 5 hours ago                    │
└──────────────────────────────────────────────────────┘
```

**Display rules:**
- Show latest 2 announcements sorted by severity (CRITICAL first), then recency
- Each card shows: severity icon + label, category, title, scope, relative time
- CRITICAL severity: red left border
- WARNING severity: amber left border
- INFORMATIONAL: teal/neutral left border
- Tapping any card navigates to full announcement detail
- "See all →" navigates to the full public announcements feed (`/announcements`)

**Why this must be on the homepage:**
Bocaue flood-prone barangays (Lolomboy, Bunlo, Igulot, Bambang) need flood advisories surfaced immediately — not buried in a separate tab. Bocaue River critical level is 11.50 m; an advisory at 10.8 m must be impossible to miss.

---

### Section 7 — Current Location Bar

```
┌──────────────────────────────────────────────────────┐
│  📍  Current Location               [View Map →]     │
│      Villa Zaragoza, Turo, Bocaue, Bulacan           │
│      [minimap thumbnail ──────────────────────]      │
└──────────────────────────────────────────────────────┘
```

**Content (MOD-11, MOD-12):**
- Reverse-geocoded address from current GPS position
- Mini-map thumbnail (static image or live map fragment)
- "View Map" navigates to the full incident map (`/map`)
- If GPS permission denied: shows "Location unavailable — [Enable GPS]" with link to settings (MOD-05)
- If GPS unavailable (indoors / no signal): shows last known location + "Last known · X min ago" staleness label

---

### Section 8 — Bottom Tab Navigation *(fixed, not scrollable)*

| Tab | Icon | Label | Notes |
|---|---|---|---|
| Home | `home-outline` / `home` | Home | Current screen |
| Incidents | `document-text-outline` | Incidents | MOD-14 incident history list |
| SOS | Large red circle button (raised) | SOS | Duplicate fast-access to MOD-06; same hold-to-trigger behavior |
| Map | `map-outline` | Map | MOD-22 live incident map |
| Profile | `person-outline` | Profile | MOD-01 profile / settings |

The center SOS tab button is raised/floating (as in the mockup) — this matches the urgency hierarchy.

---

## 3. Complete Section Layout Order (Scroll Top → Bottom)

```
┌─────────────────────────────────────┐
│  [0] Surge/Disaster Banner          │  ← conditional, always topmost
│  [1] Header Bar + Connectivity Pill │  ← fixed
├─────────────────────────────────────┤
│  [2] Greeting Card                  │
│  [3] Active Incident Card           │  ← conditional, replaces/overrides SOS if active
│  [4] Hero SOS Button                │
│       Shake-to-Alert chip           │
│  [5] Quick Actions Grid (3×2)       │
│  [6] Announcements Strip            │
│  [7] Current Location Bar           │
├─────────────────────────────────────┤
│  [Nav] Bottom Tab Bar               │  ← fixed
└─────────────────────────────────────┘
```

---

## 4. Module Coverage Matrix

| Module | Homepage Element |
|---|---|
| MOD-01 User Registration / Profile | Greeting card, avatar, profile completeness ring + nudge |
| MOD-02 Emergency Contacts | Quick Actions tile (with badge if empty) |
| MOD-03 Medical Profile | Quick Actions tile (with badge if empty) |
| MOD-05 Readiness / Permission Status | Connectivity pill, GPS error state in location bar |
| MOD-06 Immediate SOS Trigger | Hero SOS button (Section 4) + SOS tab |
| MOD-07 Shake-to-Alert | Shake chip below SOS button |
| MOD-09 Rapid Incident Detail | "First Aid" Quick Action tile |
| MOD-11 Precision GPS | Current Location bar |
| MOD-12 Reverse Geocoding | Address text in Location bar |
| MOD-14 Incident Record | "Incident History" Quick Action tile |
| MOD-15 Lifecycle State Management | Active Incident status bar (Section 3) |
| MOD-16 Emergency Contact Notification | Notifications Quick Action tile + bell badge |
| MOD-20 WebSocket Engine | Live push of incident status updates to Section 3 |
| MOD-42 User-Facing Emergency Status | Active Incident Card (Section 3) |
| MOD-43 Live ETA / Responder Tracking | ETA label inside Active Incident Card |
| MOD-52 Disaster Surge Mode | Surge banner (Section 0) |
| MOD-53 Municipal Announcements | Announcements strip (Section 6) |

---

## 5. State Variations (Full Screen Behavior)

### State A — Clean State (No active incident, no surge, profile complete)
Sections shown: 1 → 2 → 4 → 5 → 6 → 7

### State B — Active Incident in Progress
Sections shown: 1 → 2 → **3 (prominent)** → 4 (dimmed, shows "View Active Emergency") → 5 → 6 → 7

### State C — Surge/Disaster Mode Active
Sections shown: **0 (topmost, red/amber)** → 1 → 2 → 3 (if incident) → 4 → 5 → **6 (surge announcement pinned first)** → 7

### State D — Offline
- Section 3: shows last known incident state + "Offline" badge
- Section 4: SOS button still pressable → queued offline (MOD-19)
- Header: Red "Offline" connectivity pill
- Section 7: "Last known location · X min ago"
- Section 6: Cached announcements with "Last synced X" timestamp

### State E — Profile Incomplete
- Avatar has amber completeness ring
- Greeting card shows inline "Complete your profile →" CTA
- Contacts tile has amber badge (if 0 contacts)
- Medical Profile tile has amber badge (if no consent / empty)

---

## 6. Design Rules (from Architecture + Module Specs)

| Rule | Source |
|---|---|
| SOS must never require optional data (GPS, medical, photo) before it submits | Architectural Rule 5 |
| Active incident status must reflect server state, not optimistic client state | Architectural Rule 6 |
| ETA is always labelled as an "estimate" — never a guarantee | Architectural Rule 13 |
| Status indicators must use icon + label, never color alone | All module UI/UX requirements |
| Offline state must be explicitly visible — never silently fail | Reliability Rules |
| Announcement strip is read-only — tapping SOS from it must not be possible | MOD-53 boundary rule 16 |
| Reporter and patient are separate — SOS never auto-identifies a nearby user as patient | Architectural Rule 2, 15 |
| Profile data shown in greeting must not expose medical or contact data | Privacy classification |
| 911 / MDRRMO hotline reminder must be accessible from the help/support link | Architectural Rule 9 |
