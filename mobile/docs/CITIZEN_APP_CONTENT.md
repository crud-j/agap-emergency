# AGAP Citizen Mobile App — Content Inventory

This document is a page-by-page inventory of the **exact on-screen content** (headings, body copy, button labels, placeholders, helper/error text, empty states) of the AGAP **citizen-facing** mobile app, for use as a reference when building a high-fidelity mockup. It does **not** cover the Responder app (`mobile/app/responder/*`).

Source of truth: the `mobile/` package source code, branch `main`, as of 2026-10-24. Where copy is pulled from the shared i18n dictionary (`mobile/src/i18n/translations.ts`), the real English string is quoted — not the translation key. Where a screen's content is dynamic/data-driven (populated from the backend), the field **labels** are listed instead of invented sample data, and this is called out explicitly.

---

## Bottom Navigation Bar

Persistent floating pill bar (`mobile/src/components/ui/bottom-nav.tsx`), shown on every tab-root screen (Home, Incidents, Announcements, Profile, Archive). 5 slots: **Home · Incidents · (center FAB) · Announcements · Profile**.

**Tab labels** (from `t.home.*`):
- Slot 0 — Home → route `/home` — label **`Home`**
- Slot 1 — Incidents → route `/incidents` — label **`Incidents`** (the pushed `/history` screen visually highlights this same slot)
- Slot 2 — center — reserved for the **+ (FAB)** button, no label
- Slot 3 — Announcements → route `/announcements` — label **`Announcements`**
- Slot 4 — Profile → route `/profile` — label **`Profile`** (the pushed `/archive` screen visually highlights this same slot)

Each tab icon has an outline (inactive) and filled (active) Ionicons variant; the active tab sits inside an animated green pill ("blob") that slides between tabs.

### Center FAB → "Quick Actions" panel

Tapping the **+** button (rotates to an **×** when open) opens a popover panel above the bar:

- **Panel header:** `Quick actions`
- **Primary tile** (red gradient, full-width):
  - If no active incident: **`Report Emergency`** / subtitle **`Send your location to responders`** — tapping starts an SOS draft and navigates to `/emergency/location`.
  - If an incident is active: **`View Active Incident`** / subtitle **`See live status and responders`** — tapping navigates to `/incidents/{id}`.
- **Secondary tiles** (two, side by side):
  - **`First Aid`** / subtitle **`Step-by-step guides`** → navigates to `/first-aid`.
  - **`Call MDRRMO`** / subtitle shows the hotline number **`0936 330 9020`** → dials `tel:09363309020` (the Bocaue MDRRMO hotline).

---

## Onboarding & Authentication

### `mobile/app/index.tsx` — Root entry
No tab. Renders a blank white screen while the animated splash plays and the auth guard decides where to route (onboarding, login, or home). No static copy.

### `mobile/app/onboarding/first-onbrd.tsx` — Onboarding 1 of 4
No tab (pre-auth flow).
- **Top bar:** progress dots (step 1 of 4) + **`Skip`** link (→ `/auth/login`)
- **Heading:** `Get Help When\nYou Need it.`
- **Body:** `In an emergency, your call matters. AGAP connects you with trained responders and helps ensure you get the care you need, faster.`
- **Button:** `Continue` → `/onboarding/second-onbrd`

### `mobile/app/onboarding/second-onbrd.tsx` — Onboarding 2 of 4
- **Top bar:** progress dots (step 2 of 4) + `Skip`
- **Heading:** `Share Your\nLocation Faster.`
- **Body:** `Help responders find you quickly and accurately, so you get the help you need, when you need it.`
- **Button:** `Continue` → `/onboarding/third-onbrd`

### `mobile/app/onboarding/third-onbrd.tsx` — Onboarding 3 of 4
- **Top bar:** progress dots (step 3 of 4) + `Skip`
- **Heading:** `Your Report Reaches\nthe Operations Center.`
- **Body:** `Your report is securely sent to the AGAP operations center, where it's reviewed, coordinated, and matched with the right responder in your area.`
- **Button:** `Continue` → `/onboarding/fourth-onbrd`

### `mobile/app/onboarding/fourth-onbrd.tsx` — Onboarding 4 of 4 (Language & Accessibility)
- **Top bar:** progress dots (step 4 of 4) + `Skip` (`t.common.skip`)
- **Eyebrow label:** `LANGUAGE & ACCESSIBILITY`
- **Heading:** `Choose your language and accessibility settings.`
- **Body:** `We want AGAP to be easy to use for everyone. You can change these settings anytime in your profile.`
- **Card — Language:** title `Language`, subtitle `Select your preferred language`; pill options **`English`** / **`Filipino`**
- **Card — Text Size:** title `Text Size`, subtitle `Adjust the size of text and labels.`; pill options **`Small`** / **`Medium`** / **`Large`**
- **Toggle — High Contrast:** title `High Contrast`, subtitle `Increases contrast for better readability.`
- **Toggle — Reduced Motion:** title `Reduced Motion`, subtitle `Minimizes animations and motion effects.`
- **Button:** `Continue` (`t.common.continue`) → `/auth/login`

*(Note: a 5th toggle, "Shake to Alert" — title `Shake to Alert`, subtitle `Shake your phone to start an emergency alert.` — exists in the translation dictionary under the same `onboarding4` group and is reused later on the Profile screen, but is not rendered on this particular onboarding screen.)*

### `mobile/app/auth/login.tsx` — Login
No tab (pre-auth).
- **Top-right:** language selector pill (`English` / `Filipino` dropdown)
- **Heading:** `Welcome back` (gradient text)
- **Body:** `Sign in to your AGAP account to continue keeping our communities safe and supported.`
- **Identifier toggle:** `Mobile` / `Email` tabs
  - Mobile placeholder: `Enter your phone number`
  - Email placeholder: `Enter your email address`
- **Passkey mode** (default if device supports passkeys):
  - Hint row: `Use your fingerprint, face or screen lock — no password needed.`
  - Button: `Sign in using passkey`
  - Switch-mode link: `Use password instead`
- **Password mode:**
  - Field label: `Password`, placeholder `Enter your password`
  - `Remember me` checkbox
  - `Forgot password?` link → `/auth/forgot-password`
  - `Send me an SMS code instead` link (mobile identifier only) → `/auth/verify-otp` (mode=login)
  - Button: `Login`
  - Switch-mode link: `Use passkey instead` (if supported)
- **Error banner (examples):** `Incorrect credentials. Please try again.` / `Could not connect. Check your internet connection.` / passkey errors: `No AGAP passkey found on this device. Sign in with your password, then add one from Profile.` / `Passkey sign-in failed. Please try again or use your password.`
- **Divider text:** `Don't have an account?`
- **Button:** `Create Account` → `/auth/registration`
- **Button (red/guest):** `Report an emergency as a guest`
- **Footer:** `Need help?`

### `mobile/app/auth/registration.tsx` — Registration
No tab (pre-auth). Two-phase screen: location/geo-fence gate, then the form.

**Phase 1 — Location gate** (steps, one shown at a time):
- `permission`: Heading `Location Required`; body `AGAP is available only within **Bocaue, Bulacan**. We need your precise location to confirm you are within the service area.`; subtext `Your location is used only for this one-time check and is not stored or shared.`; button `Allow Location Access`; link `Already have an account? Sign in`
- `permission_request` / `requesting`: Heading `Requesting location access…` / `Detecting your location…`; body `Allow location access in the prompt to check that you are within Bocaue.` / `Please wait a moment`
- `checking`: Heading `Verifying your location…`
- `denied`: Heading `Permission Required`; body `Location access was denied. Please enable it in your device settings to continue.`; button `Open Settings`; link `Try again`
- `gps_error`: Heading `Weak GPS Signal`; body `We couldn't determine your location. Move to an open area for a better signal and try again.`; button `Retry`
- `outside` (outside Bocaue): Heading `Service Not Available in Your Area`; body `AGAP is currently only available to residents and workers within **Bocaue, Bulacan**.`; subtext `If you need emergency help right now, please call:`; links `911 — National Emergency Hotline` and `Bocaue MDRRMO Hotline`; button `Try Again`
- `geo_error`: Heading `Unable to Verify Location`; body `We couldn't connect to our verification service. Please check your internet connection and try again.`; button `Retry`

**Phase 2 — Registration form** (once inside Bocaue):
- Top-right language selector
- **Heading:** `Create an account` (gradient text)
- **Body:** `Join AGAP and help build a safer, more prepared community.`
- **Badge:** `Location confirmed — Bocaue, Bulacan`
- **Fields:**
  - `Full Name` — placeholder `Enter your full name`
  - `Mobile Number` — prefix `+63`, placeholder `9XX XXX XXXX`; helper `We'll use this to verify your account and send important emergency updates.`
  - `Email Address` — placeholder `Enter your email address`; helper `Optional. Used for account recovery and login.`
  - `Password` — placeholder `Enter your password`; helper `Use at least 8 characters and include each requirement below.`
    - **Password requirements** list: `8 or more characters`, `No more than 128 characters`, `One lowercase letter`, `One uppercase letter`, `One number`, `One symbol (e.g. !, @, #)`; strength label `Strong` / `In progress`
  - `Confirm Password` — placeholder `Re-enter your password`; match status `Passwords match` / `Passwords do not match yet`
  - Terms checkbox: `I have read and agree to the **Terms of Service** and **Privacy Policy.**`; sub-note `Your information will be used only for emergency response and will be kept secure and confidential.`
- **Errors:** `This phone number is already registered.` / `Passwords do not match.`
- **Buttons:** `Save Profile & Create Account` (primary); divider `or`; `Emergency? Report without an Account` (red, guest report)
- **Footer:** `Already have an account? **Sign In**`
- **Submission modal states:** `Creating your account…` / `Please wait a moment` → success `Account Created!` / `Welcome, {name}!` / `We sent a 6-digit verification code to` / `Redirecting to verification…` → slow-network fallback `This is taking longer than expected` / `Your account request may still be processing. If you received a verification code, continue to enter it.` / button `Continue to verification`

### `mobile/app/auth/forgot-password.tsx` — Forgot Password
No tab (pre-auth).
- **Heading:** `Forgot password?`
- **Body:** `Enter your registered mobile number and we'll send you a reset code.`
- **Field:** `Mobile number`, placeholder `Enter your phone number`
- **Error:** `Enter a valid Philippine mobile number (e.g. 09XX XXX XXXX).`
- **Button:** `Send reset code`
- **Link:** `Back to Sign In`

### `mobile/app/auth/verify-otp.tsx` — Verify OTP
No tab (pre-auth).
- **Heading:** `Verify your number`
- **Body:** `We sent a 6-digit code to {masked phone}`
- **Input:** 6 individual OTP boxes
- **Resend row:** `Didn't receive a code?` / countdown `Resend in {n}s` / link `Resend code`
- **Errors:** `Invalid or expired code. Please try again.` / `This code has expired. Request a new one.` / `Service temporarily unavailable. Please try again in a moment.`
- **Button:** `Verify`

### `mobile/app/auth/reset-password.tsx` — Reset Password
No tab (pre-auth).
- **Heading:** `Create new password`
- **Body:** `Use 12–128 characters. Avoid common passwords and anything containing your name, email, AGAP, or Bocaue.`
- **Fields:** `New Password` (placeholder `Enter new password`) with strength bar (`Weak` / `Good` / `Strong`); `Confirm Password` (placeholder `Re-enter new password`)
- **Errors:** `Passwords do not match.` / `Password must be between 12 and 128 characters.`
- **Button:** `Reset Password`

---

## Home Tab

### `mobile/app/home/index.tsx` — Home
Tab: **Home**. Route `/home`.

- **Header:** AGAP logo (left); notification bell icon with unread-count badge → `/notifications`; avatar initial circle (with a dot badge if profile incomplete) → `/profile`
- **Optional surge banner** (if a CRITICAL announcement is active and not dismissed): label **`SURGE MODE ACTIVE`**; announcement title; dismiss action **`Mark as read`**
- **Greeting card** (deep-green):
  - Greeting line: **`Good Morning`** / **`Good Afternoon`** / **`Good Evening`** (time-based), followed by the user's first name
  - Subtitle: `Stay safe. Help is always near.`
  - If profile incomplete: link `Complete your profile →`
- **Active incident card** (shown only if the citizen has a live incident):
  - Title: **`YOUR EMERGENCY IS ACTIVE`** (with a pulsing dot)
  - Link: `View Status` → `/incidents/{id}`
  - Progress tracker labeled with: `Submitted`, `Acknowledged`, `Dispatched`, `En Route`, `On Scene`
  - ETA line: `Responder ETA ~{min} min (estimate)`
  - Button: `Cancel Emergency` → `/emergency/cancel`
- **SOS section** (shown only if there is **no** active incident):
  - The large press-and-hold **SOS dial** (`HoldToSOS` component — not separately documented here; holding it 3 seconds starts the emergency flow and routes to `/emergency/location`)
  - Heading: `In an Emergency?`
  - Body: `Press and hold the button to send an alert to the Operations Center.`
  - Shake-to-alert status chip: `Shake to alert: ON` / `Shake to alert: OFF` (toggle)
  - If an incident **is** active, this section instead shows a single button: `View Active Emergency`
- **Quick Actions section** — heading `Quick Actions`; a 2-column grid of 6 tiles:
  - `Contacts` / `Manage your emergency contacts` → `/contacts`
  - `Medical Profile` / `Allergies, conditions, medications` → `/medical`
  - `First Aid` / `Guides and emergency tips` → `/first-aid`
  - `Readiness` / `GPS, notifications & sensors` → `/settings/permissions`
  - `Incident History` / `View your reported incidents` → `/history`
  - `Notifications` / `You'll receive important updates` → `/notifications` (badge shows unread count)
- **MDRRMO Announcements section** — heading `MDRRMO Announcements`; link `See all` → `/announcements`; up to 2 non-critical announcement cards (severity chip + category + title + relative time), or empty-state text `No active announcements.`
- **Current Location card** — label `Current Location`; GPS status pill `Ready` / `Unavailable`; address text (or `Location unavailable` / loading text `Loading…`); link `View Bocaue coverage map` → `/coverage`

---

## Emergency / SOS Flow

Reached from the Home SOS dial, the FAB's "Report Emergency" tile, or Shake-to-Alert. No bottom tab is shown during this flow (full-screen task flow). All fields throughout this flow are optional — a report can always be sent with nothing filled in (Architectural Rule #5).

### `mobile/app/emergency/sos.tsx` — (Legacy/unused SOS confirmation screen)
This route exists in the codebase but is **not** part of the live navigation path — the Home dial and FAB go directly to `/emergency/location`. If referenced for completeness: dark background, title `AGAP Emergency`, subtitle `Press and hold to report an emergency`, a long-press `SOS` button, hint `Long press the button to activate`, and a confirm dialog titled `Confirm Emergency` with body `Are you sure you want to report an emergency?` and buttons `Cancel` / `Yes, Report Emergency`.

### `mobile/app/emergency/reporter-patient.tsx` — (Legacy/unused "Who needs help?" screen)
Also not in the live navigation path (superseded by the "Are you hurt or in danger yourself?" question inside Incident Details). If referenced: title `Who needs help?`, subtitle `This helps us provide the right assistance`, two option cards: `Me` / `I am the one who needs help`, and `Someone Else` / `Another person needs emergency assistance`.

### `mobile/app/emergency/location.tsx` — Step 1 of 3: Confirm Location
- **Header:** AGAP logo + tagline `Incident Management Platform`; progress bar (step 1 of 3); step label `Confirm Location`
- **Title:** `Getting your location...`
- **Subtitle:** `We're capturing your current location to help send the nearest responders.`
- **Optional warning banner** (e.g. guest outside Bocaue): `Guest emergency reports can only be sent from within Bocaue Municipality. Move into Bocaue and retry your GPS location.` or `Your GPS fix is outside Bocaue Municipality. Retry your location, or continue without precise GPS and describe the Bocaue location.`
- **Map preview card** with a floating pill showing the resolved barangay/address, or fallback texts `Locating you on the map...` / `Map preview unavailable`
- **Status rows:**
  - `GPS Status` — description varies by state (`Getting your location...\nThis may take a few seconds.` / `Location captured successfully.` / `Permission denied. You can continue without precise location.` / `Could not get GPS. You can continue without precise location.`; guest-specific: `A GPS fix inside Bocaue is required for a report without an account.`)
  - `Location Details` — shows resolved address or `Resolving address...` / `Not available yet`; hint `Will be shared with responders.`; `Ready` badge once available
  - `Improve Your Location (Optional)` — hint `You can add or adjust the location manually if needed.`; button `Edit` → inline text field, placeholder `e.g. 123 Main St, Brgy. Turo, Bocaue`; `Cancel` / `Save`
- **Guest retry button** (if applicable): `Retry GPS location` / `Getting GPS location…`
- **Info banner:** `Can't get a precise location?` / `You can still continue. Our team will assist you based on the information you provide.` (guest variant: `Guest reports are limited to Bocaue` / `A current GPS location inside Bocaue is required to send a report without an account.`)
- **Footer buttons:** `Continue` (primary) → `/emergency/incident-type`; `Continue without precise location` (registered users only)
- **Safety note:** `Your safety is our priority. Do not delay reporting an emergency.`

### `mobile/app/emergency/incident-type.tsx` — Step 2 of 3: Incident Type
- **Header:** AGAP logo + tagline; 4-dot progress (step 3 highlighted — numbering quirk in source); step label `Incident Type`
- **Title:** `What's\nhappening?`
- **Subtitle:** `Select the incident type that best describes the situation.`
- **Category cards** (select one):
  - `Road incident` — `Car, motorcycle, or\nother vehicle accident`
  - `Fire` — `Building, vehicle, or\nother fire incident`
  - `Natural disaster` — `Flooding, typhoon damage,\nfallen trees, collapse`
- **Footer:** button `Continue` (disabled until a type is picked) → `/emergency/incident-details`; note `You can still send the alert even if you skip these details`

### `mobile/app/emergency/incident-details.tsx` — Step 4 of 4: Rapid Incident Details
- **Header:** back button; AGAP logo; step badge `4 / 4`; full progress bar; type icon + eyebrow (`Road incident` / `Fire` / `Natural disaster` / fallback `Emergency`); title **`Tell responders what you see`**; note `Every question is optional. If it's urgent, send now.`
- **Section — Where is it?** GPS status row (`Getting your location…` / `GPS location captured (±{n} m)` / `GPS unavailable. Your report will still be sent.`); field `Nearest landmark` (or `Street or nearest landmark` if GPS unavailable), placeholder `e.g. Beside the barangay hall, Purok 3`; hint `Responders find you faster with a landmark than with GPS alone.`
- **Section — What's happening?** (badge shows "{n} of {total}" answered) — type-specific multiple-choice questions pulled from a shared catalog (vehicle type, what's burning, what kind of event, etc.); each may show `Select all that apply` and a hint row
- **Section — People:**
  - `How many are hurt or in danger?` — options `1` / `2–5` / `5+` / `Not sure`
  - `Are you hurt or in danger yourself?` — options `I'm safe` / `I'm reporting for others`, and `I need help too` / `I'm hurt or still in danger`
- **Section — Photo or video:** empty state `Add a photo or video` / `Only if it's safe to take one`; once captured: `Retake` / `Re-record`; video poster `Video captured` / `It will be sent with your report`
- **Section — Anything else?** free-text notes field; placeholder is type-specific example text (e.g. `e.g. Motorcycle and jeep collided, rider is on the road, near the Petron station` for road incidents; `e.g. Second floor of a two-storey house, black smoke, residents are outside` for fire; `e.g. Family of 5 on the roof, water still rising, road to the house is impassable` for natural disaster/flood; fallback `Anything responders should know before they arrive`); char counter `{n} / 1000`
- **Disclaimer:** `AGAP complements, never replaces, 911 and the Bocaue MDRRMO hotline.`
- **Footer (fixed) submit button:** `Send Emergency Report` / subtitle `Your answers go straight to the dispatcher` (or `You can send now, even without answers` if nothing filled)
- **Guest-outside-Bocaue alert:** title `Bocaue location required`; body `A report without an account can only be sent with a GPS location inside Bocaue Municipality.`; action `Retry location`

### `mobile/app/emergency/capture.tsx` — Photo/Video Capture
Full-screen camera UI, reached from the "Photo or video" section above.
- **Permission-denied state:** title `Camera access needed`; body `Allow camera access to capture the emergency. You can still report without a photo or video.`; buttons `Enable camera` / `Continue without media`
- **Live camera overlay:** capture hint `Capture the emergency` or `Tap to start · tap again to stop` (video mode); recording badge `REC {mm:ss}`; mode toggle `Photo` / `Video`; `Skip` link; large shutter button

### `mobile/app/emergency/transmission.tsx` — Transmission / Result
- **Submitting state:** heading `Sending Emergency Report`; subtitle `Connecting to MDRRMO Operations Center…`
- **Success state:** heading `Emergency Report Sent`; subtitle `The MDRRMO Operations Center has been notified.\nA dispatcher will review your report shortly.`; reference line `Report reference: {publicReference}`; live map preview (if GPS captured); responder-en-route note `A responder is on the way — tracking live (estimated {n} min).`; reassurance card `Your report was received. A dispatcher must review it and arrange a response. Keep your phone nearby.`
  - Media status card (one of): `Sending your photo/video to the Operations Center…` / `Your photo/video was delivered to the Operations Center.` / `Your report was sent, but the photo/video could not be uploaded. Responders can still help you.` / `Photos are only sent from signed-in accounts. Your report was still delivered.`
  - Guest-only link: `Sign in or create an account`
  - Signed-in, non-guest users auto-advance to `/tracking/{id}` after 2.5s.
- **Failed state:** heading `Transmission Failed`; subtitle shows the error or `We could not send your emergency report.`; hotline card `Call 911 or the MDRRMO Hotline immediately.`; buttons `Try Again` / `Go to Home`

### `mobile/app/emergency/cancel.tsx` — Cancel Report
- **Header:** `Cancel Report`
- **Pick-reason step:** question `Why are you cancelling this report?`; sub `This cannot be undone. If this is a real emergency, please call **911** or the **MDRRMO hotline**.`
  - Reason options: `Accidental trigger` / `I pressed the button by mistake.`; `Situation resolved` / `The situation has been handled or resolved.`; `Already reported` / `This emergency was already reported by someone else.`; `Wrong app / test` / `I used the app unintentionally or for testing.`; `Other reason` / `Another reason not listed above.`
  - Buttons: `Continue` / `Keep Active`
- **Confirm step:** icon + title `Confirm Cancellation`; body `You have selected: {reason label}`; warning `This will mark your report as cancelled. Responders who have not yet been dispatched will be notified. If this is a genuine emergency, do not cancel — call 911 instead.`; buttons `Cancel My Report` (destructive) / `← Change Reason`
- **Submitting state:** `Cancelling your report…`
- **Error state:** title `Cancellation failed`; hint `Your report is still active. If this is a real emergency, call 911.`; buttons `Try Again` / `Keep Active`

---

## Incidents Tab, History, Live Tracking & Chat

### `mobile/app/incidents/index.tsx` — Incidents (tab root)
Tab: **Incidents**. Route `/incidents`.
- **Header:** title `Incident History`; subtitle `View and track all your reported incidents.`
- Body is the shared incident list component (see below), with the bottom nav visible.

### Shared list body — `IncidentHistoryList` (used by both `/incidents` and the pushed `/history`)
- **Search field** placeholder: `Search by reference, type, or location…`
- **Filter chips:** `All` / `Ongoing` / `Resolved` / `Canceled` / `Archive`
- **Sort toggle:** `Latest` / `Oldest`
- **Signed-out state:** icon + title `Sign in to view history`; sub `Your reported incidents are linked to your account.`
- **Error state:** title `Could not load incidents`; sub `Check your connection and try again.`; button `Retry`
- **Empty state (no incidents at all):** title `No incidents yet`; sub `Emergencies you report will appear here so you can track them.`
- **Empty state (filtered, no matches):** title `No matching incidents`; sub `Try a different search or filter.`

### `mobile/app/incidents/[id].tsx` — Incident Details (tab-rooted)
No persistent bottom nav (full detail screen, reachable from the Incidents tab, Home's active-incident card, and notifications).
- **App bar:** back chevron; AGAP wordmark; online/offline chip (`Online` / `Offline`); notification bell → `/notifications`
- **Page header:** title `Incident Details`; button `Share Report`
- **Incident summary card:** type icon, `{Type} Incident`, public reference, reported date, short location; status badge (e.g. `Submitted`, `Acknowledged`, `Dispatched`, `En Route`, `On Scene`, `Resolved`, `Closed`, `Cancelled`, `False Alert`, `Duplicate`, `Unable to Respond`, `Referred`)
- **Stale-data banner** (if applicable): `Data may be stale` + `Refresh` link
- **Tabs:** `Overview` / `Timeline` / `Notifications` / `Location` / `Resolution`
- **Overview tab:**
  - If closed: a "Thank you for reporting" card (see Verified Reporter below)
  - Live-tracking banner (active incidents only): `Live tracking active` / `Live tracking`; `Responder ~{n} min away (estimate)` / `Responder location updated` / `Tap to open live map`
  - Progress track labeled `Submitted` / `Acknowledged` / `Dispatched` / `En Route` / `On Scene`
  - Card **`Incident Overview`** — description or italic `No description provided.`; rows: `Date & Time`, `Exact Location`, `Reported By` (shows `Guest (no account)` or `Anonymous` as fallback), `People Involved` (`{n} person(s)` or `—`), `Reference Source` (`Guest Report` / `Mobile App (Citizen Report)`)
  - Card **`Incident Timeline`** (last 4 entries) — each entry shows a status label, time, optional notes
  - Hotline reminder: `For immediate help, call **911** or the **MDRRMO hotline**.`
- **Timeline tab:** card title `Status Timeline`; subtitle `{n} events`; empty state `No timeline events yet.`
- **Notifications tab:** card title `Notifications Sent`; subtitle `{n} sent`; empty state `No notifications sent yet.`; each row shows channel (SMS/Push/Email/System), title, sent time, and a `Sent` / pending-status badge
- **Location tab:** card title `Incident Location`; map (or fallback `No coordinates recorded` / `Map unavailable` / `Map requires latest app build`); address + raw coordinates
- **Resolution tab:**
  - If resolved: badge `Resolved`; rows `Outcome`, `Disposition`, `Resolved By` (`MDRRMO Operations Center`), `Resolved At`, `Follow-up Required` (`Yes`/`No`)
  - If terminal-negative: badge with the status label; text `This incident was marked as {status}.`
  - If still active: `Incident is still active — resolution will appear here once it is closed.`
  - If cancellable: button `Cancel Report` → confirm alert `Cancel Emergency Report?` / `If this is a real emergency, call 911 or the MDRRMO hotline immediately.\n\nDo you still want to proceed with cancellation?` → `Keep Active` / `Proceed`
  - Hotline reminder (same as Overview)
- **Error / access states:** `This incident link is incomplete. Return to your incident list and open the report again.` / `Your session is no longer active. Sign in to view your incident details.` / `This incident belongs to a different account. Sign in with the account that submitted it.` / `This incident could not be found. It may have been removed or the link may be incorrect.` / `We could not reach the incident service. Check your connection and try again.` — with `Sign in` or `Retry` action.

### `mobile/app/history/index.tsx` — Incident History (pushed, from Home quick action)
No tab (pushed screen with its own back button).
- **Top bar:** back arrow; title `Incident History`
- Subtitle (as list header): `View and track all your reported incidents.`
- Body: same `IncidentHistoryList` as above.

### `mobile/app/history/[id].tsx` — Incident Details (pushed variant, from History)
A visually distinct but content-equivalent detail screen to `/incidents/[id]` (same tabs: Overview/Timeline/Notifications/Location/Resolution; same field labels and copy), with these additions/differences:
- **Page header subtitle:** `Complete information about this incident.`
- **Incident card** additionally shows a `Incident Type` chip with the short type label.
- **Track Transmission banner** (active incidents only): title `Track Transmission`; sub `Live responder location & ETA estimate` → `/tracking/{id}`
- **Overview tab** splits Location and Resolution into two side-by-side mini cards (`Location` / `Resolution`) each with a `Map` / `View on Map` link, in addition to the full tabs.
- **Location tab empty state:** `No location was captured for this incident.`
- **Resolution tab terminal-negative empty state:** `This incident was marked as {status}.`
- **Follow-up banner:** `Follow-up action required`

### `mobile/app/tracking/[id].tsx` — Live Tracking
No tab (full-screen map view, reached from Overview tabs or post-submission auto-redirect).
- **Header:** back chevron; AGAP logo; connectivity dot; chat icon → `/incident/chat/{id}`
- **Map:** incident pin + responder marker + route line, or fallback `Live map requires the latest app build.`
- **Bottom sheet:**
  - Public reference code
  - Status pill (e.g. `Submitted`, `En route`) + category text
  - If response complete: `Response complete` / `This incident is closed.` or `Responders have finished assisting.`
  - If arrived: `Responders on scene` / current status label
  - Otherwise: `Estimated arrival` / `{n} min` or `Calculating…`; small italic `estimate` tag
  - Unit row (if dispatch accepted): `Call sign {callsign}` or unit name
  - Hint row: `Responder last seen {n}s ago.` / `Responder signal lost — they are still assigned. Call 911 / MDRRMO if urgent.` / `Responder accepted — tracking will start shortly` / `Waiting for a responder to be dispatched.` / error `Could not refresh responder tracking. If urgent, call 911 / MDRRMO.`

### `mobile/app/incident/chat/[id].tsx` — Incident Chat
No tab (full-screen, reached from Tracking's chat icon).
- **Header:** back chevron; title `Incident Chat`; subtitle `Participants only`
- **Offline strip:** `Reconnecting… messages send when back online`
- **Empty state:** `No messages yet.`
- **Message bubbles:** own messages right-aligned (green); others show a sender role label
- **Input bar:** placeholder `Message participants…`; send button
- **No-incident fallback:** `No incident selected.`

---

## Announcements Tab & Archive

### `mobile/app/announcements/index.tsx` — Announcements (tab root)
Tab: **Announcements**. Route `/announcements`.
- **Header:** title `Announcements`; subtitle `Office of the Mayor · MDRRMO Bocaue`; button `Archive` → `/archive?tab=announcements`
- **Critical banners** (severity = CRITICAL): tag `CRITICAL`; title; optional summary
- **Category filter chips:** `All`, `Flood`, `Weather`, `Evacuation`, `Class`, `Road`, `Fire`, `Post-Disaster`, `Advisory`
- **Empty state:** icon + title `No announcements`; sub `Try a different category filter.` or `Official notices from the Mayor's Office and MDRRMO will appear here.`
- **Error state:** `Could not load announcements` / `Check your connection and try again.` / button `Retry`
- **Announcement cards:** severity chip (`Critical` / `Warning` / `Advisory` / `Info`) + category; title; preview text; optional image; footer pill showing area (`All of Bocaue` or `Brgy. {name}`) and issuing office
- **Footer CTA card:** `Get SMS alerts without an account` / `Enter your mobile number to receive critical MDRRMO announcements via SMS.` → `/announcements/subscribe`
- **Footer notice:** `One-way broadcast only. Not a substitute for 911 or MDRRMO hotline calls.`

### `mobile/app/announcements/[id].tsx` — Announcement Detail
No tab (pushed).
- **Header:** back chevron; category label as title; share icon
- **If cancelled:** box `This announcement was cancelled`; optional correction note and timestamp
- **Severity/priority badge:** e.g. `Critical · Urgent`, `Warning · Important`, `Advisory · Important`, `Info · Routine`
- **Title, summary**
- **Details card:** `Affected area` (value: `All of Bocaue` or `Brgy. {names}`), `Effective` / `Effective from` (date range), `Published` (date)
- **"What you need to do" card** (if action_required set): section label `What you need to do`; bullet list of actions
- **Hero image** (if present), or fallback: `The attached image could not be loaded. Check your connection and reopen this notice.`
- **Section label:** `Full announcement` — full body text (all-caps lines render as sub-headings)
- **Source card:** `Issued by` (fallback `Municipality of Bocaue`), optional `Source`, optional `Contact`
- **Footer notice:** `Official public information broadcast. **For emergencies, call 911 or the MDRRMO hotline immediately.**`
- **Error state:** `This announcement could not be loaded.` / buttons `Try again` / `Go back`

### `mobile/app/announcements/subscribe.tsx` — SMS Subscription (guest-accessible)
No tab (pushed).
- **Header:** `SMS Subscription`
- **Info block:** `No account required` / `Enter your Philippine mobile number to receive official Bocaue MDRRMO announcements by SMS — including flood alerts, evacuation orders, and class suspensions.`
- **Field — Mobile Number*** : phone prefix `🇵🇭 +63`; placeholder `9171234567`; hint `Enter as 09171234567 or 9171234567`
- **Field — Barangay (optional):** picker default `All barangays (municipality-wide)`; dropdown lists Bocaue barangays, flood-prone/industrial ones first: Lolomboy, Bunlo, Igulot, Bambang, Bundukan, Biñang 1st, Batia, Bolacan, Duhat, Ganap, Masile, Panghulo, Pugad, Saog, Turo, Wakas, Poblacion; hint `Choose your barangay to receive locally relevant alerts. Leave blank for all announcements.`
- **Consent checkbox:** `I consent to receive SMS messages from the Bocaue MDRRMO regarding official public announcements. I understand I can reply **STOP** to unsubscribe at any time.`
- **Errors:** `Please enter your mobile number.` / `Enter a valid Philippine mobile number (e.g. 09171234567).` / `Please confirm you consent to receiving SMS from MDRRMO.`
- **Button:** `Subscribe to SMS Alerts`
- **Footer notice:** `One-way broadcast only. SMS will never include personal or health data.`
- **Success state:** `You're subscribed!`; `You'll receive official MDRRMO announcements via SMS at {phone}.`; `Reply **STOP** to any SMS to opt out at any time.`; button `Done`

### `mobile/app/archive/index.tsx` — Archives
Tab: visually highlights the **Profile** slot (reached from Profile's "Announcement Archive" / "Incident History" rows, or the Announcements screen's "Archive" button). Route `/archive`.
- **Header:** title `Archives`; subtitle `Your incident history and past public notices.`
- **Tabs:** `Incident history` / `Announcements`
- **Incident history tab:** reuses the shared `IncidentHistoryList`.
- **Announcements tab:**
  - Each card shows a status label (`Cancelled notice` / `Superseded` / `Archived`), date, title, and preview.
  - **Error state:** `Could not load announcement archive` / `Check your connection and try again.` / `Retry`
  - **Empty state:** `No past announcements` / `Archived and withdrawn public notices will appear here.`

---

## Profile Tab & Sub-Pages

### `mobile/app/profile/index.tsx` — Profile (tab root)
Tab: **Profile**. Route `/profile`.
- **Top bar:** title `Profile`; language pill (toggles EN/FIL)
- **Identity card:** avatar initial; full name; role badge (`Citizen` or `Guest`); `Member since {month year}`; verification rows for phone/email (`Phone verified` / `Email verified` / `Verify`)
- **Verified Reporter badge** (non-guest citizens only): title `Verified Reporter`; sub `{n} verified report(s)` once earned, else `When an emergency you report is resolved and closed, you earn the Verified Reporter badge.`
- **Profile completeness card** (if < 100%): `Profile completeness` / `{n}%`; link `Complete your profile →`
- **Map icon card** (see Shared Components below)
- **Emergency Hotlines card:** title `Emergency Hotlines`; button `Call Bocaue Hotlines`; note `AGAP complements — it never replaces Bocaue Hotlines & MDRRMO.`
- **Section — Account & Safety:** rows `Emergency Contacts` / `People we alert when you send an SOS` → `/contacts`; `Medical Profile` / `Blood type, allergies, conditions` (sensitive) → `/medical`; `Emergency Readiness` / `Location, notifications & sensors` → `/settings/permissions`; `Passkeys` / `Sign in with fingerprint or face` (registered users only) → `/profile/passkeys`
- **Section — Archives:** `Incident History` / `Your past reports and status` → `/archive?tab=incidents`; `Announcement Archive` / `Previously released public notices` → `/archive?tab=announcements`
- **Section — Preferences:** `Language` (shows current value) — toggles EN/FIL; `Accessibility` / `Text size, contrast, motion` → `/profile/accessibility`; `Shake to Alert` toggle / `Shake your phone to start an emergency alert.`; `Notifications` / `Alerts and announcements` → `/notifications`; `First Aid Guides` / `Offline emergency instructions` → `/first-aid`
- **Section — Support & Legal:** `Privacy & Data` / `Consent and medical data protection` (sensitive) → `/profile/privacy`; `Help & Support` / `Get assistance using AGAP` → `/profile/help`; `About AGAP` / `Version and information` → `/profile/about`
- **Sign out button:** `Sign Out` → confirm alert `Sign out of AGAP?` / `You will need to log in again to report or track emergencies.` / `Cancel` / `Sign Out`
- **Footer wordmark:** `AGAP · Bocaue MDRRMO`

### `mobile/app/profile/about.tsx` — About AGAP
No tab (pushed, via `ScreenHeader`).
- **Header:** `About AGAP`
- **Body:** AGAP logo; `Version {app version}` (currently `0.1.0`); description `AGAP helps you reach the right responders faster with the correct information during an emergency in Bocaue, Bulacan.`; note card `AGAP complements — it never replaces Bocaue Hotlines & MDRRMO.`; footer `Bocaue MDRRMO · LGU Operations Center`

### `mobile/app/profile/accessibility.tsx` — Accessibility
No tab (pushed).
- **Header:** `Accessibility`
- **Field — Language:** `Select your preferred language`; segmented `English` / `Filipino`
- **Field — Text Size:** `Adjust the size of text and labels.`; segmented `Small` / `Medium` / `Large`
- **Toggle — High Contrast:** `Increases contrast for better readability.`
- **Toggle — Reduced Motion:** `Minimizes animations and motion effects.`
- **Toggle — Shake to Alert:** `Shake your phone to start an emergency alert.`

### `mobile/app/profile/help.tsx` — Help & Support
No tab (pushed). This is a placeholder scaffold screen (`PlaceholderScreen` component) — no feature-specific content yet.
- **Header:** `Help & Support`
- **Body:** icon; title `Help & Support`; description `Get assistance using AGAP`; status chip `In development`

### `mobile/app/profile/passkeys.tsx` — Passkeys
No tab (pushed).
- **Header:** `Passkeys`
- **Intro card:** `A passkey lets you sign in to AGAP with your phone screen lock (fingerprint, PIN, pattern or password) instead of a password. It never leaves this device.` (Android also shows: `Your phone decides which unlock methods it offers. To use your PIN, tap "Use PIN" or "Use screen lock" on the fingerprint prompt. Face unlock on many Android phones, including Samsung Galaxy, is not secure enough for passkeys, so it will not appear.`)
- **Notices (conditional):** `Passkeys are not available on this device or app build. You can still sign in with your password.` / `Create a full AGAP account to use passkeys.` / creation errors: `This device already has an AGAP passkey.` / `Could not create the passkey. Please try again.` / `No passkey manager is set up on this phone. Sign in to a Google account, or choose a provider under Settings > Passwords, passkeys and autofill, then try again.`
- **Button:** `Create a passkey` (busy label `Waiting for your device…`)
- **List — "Your passkeys":** empty state `You have no passkeys yet.`; each row shows device label, `Synced` chip (if backed up), `Added {date}`, `Last used {date}` / `Not used yet`, and a remove (trash) action → confirm `Remove this passkey?` / `You will no longer be able to sign in with it. Your password still works.`

### `mobile/app/profile/privacy.tsx` — Privacy & Consent
No tab (pushed, via `ScreenHeader`).
- **Header:** `Privacy & Consent`
- **Card — Medical Data Sharing:** status text `Checking…` / `Granted — responders can view your medical profile during an emergency.` / `Not granted — your medical profile is hidden from responders.`; legal note `Your blood type, allergies, and conditions are sensitive medical data. We only reveal them to responders assigned to your active incident, and every access is logged below.`; button `Withdraw Consent` or `Grant Consent`; withdraw confirm alert `Withdraw medical data consent?` / `Responders will no longer be able to view your medical profile in an emergency. You can grant it again anytime.`
- **Card — Export My Data:** `Create a portable copy of your profile, contacts, and consent history.`; buttons `CSV` / `PDF`; note `Your export contains personal information. Share it only with trusted recipients.`
- **Section — Access Log:** heading `Access Log`; sub `Who viewed your sensitive data, most recent first.`; empty state `No one has accessed your sensitive data.`; each row shows data type, purpose, accessor role, and timestamp.

---

## Emergency Contacts, Medical Profile, Readiness, Notifications

### `mobile/app/contacts/index.tsx` — Emergency Contacts
No tab (pushed, via `ScreenHeader`).
- **Header:** `Emergency Contacts`
- **Empty state:** icon; title `No emergency contacts yet`; body `Add trusted contacts who will receive an SMS alert when you report an emergency.`
- **Error state:** `Could not load contacts` / button `Retry`
- **Contact card:** numbered rank badge; name; relationship; phone; edit (pencil) and delete (trash) actions
- **Delete confirm:** `Remove Contact` / `Remove {name} from your emergency contacts?` / `Cancel` / `Remove`
- **FAB:** `+` → `/contacts/add`

### `mobile/app/contacts/add.tsx` — Add Contact
No tab (pushed).
- **Header:** `Add Contact`
- **Fields:** `Full Name *` (placeholder `e.g. Maria dela Cruz`); `Relationship` (placeholder `e.g. Spouse, Parent, Sibling`); `Phone Number *` (placeholder `e.g. 09171234567`); `Email (optional)` (placeholder `e.g. maria@example.com`)
- **Errors:** `Name is required` / `Phone number is required`
- **Button:** `Save Contact`

### `mobile/app/contacts/[id].tsx` — Edit Contact
No tab (pushed).
- **Header:** `Edit Contact`
- Same fields as Add Contact.
- **Not-found state:** `Contact not found.`
- **Button:** `Save Changes`

### `mobile/app/medical/index.tsx` — Medical Profile
No tab (pushed, via `ScreenHeader`).
- **Header:** `Medical Profile`
- **Consent-gated state:** icon; title `Medical Profile`; body `Store optional medical info that responders can view in an emergency — with your consent.`; gate note `Grant medical data consent so responders can view this in an emergency.`; button `Manage Consent` → `/profile/privacy`
- **Load-error state:** `Couldn't load your profile` / `Check your connection and try again.` / `Try Again`
- **Summary (read) view:**
  - Hero: blood-type badge; label `Blood type`; value or `Not recorded`; chip `Sharing with responders`; `Profile completeness` `{n} of {total}`; `Last reviewed {date}`
  - Review nudge (if stale): `It's been over 6 months since you reviewed this. Check that it's still accurate.`
  - Section cards, each title + optional count, content or `None added` / `Add`:
    - `Allergies` — `Medicines, foods, or materials that cause a reaction.`
    - `Medical Conditions` — `Ongoing conditions responders should know about.`
    - `Current Medications` — `Include the dose if you know it.`
    - `Disabilities & Accessibility` — `Needs that affect how responders should help or move you.`
    - `Notes for Responders`
  - Button: `Edit Medical Profile`
  - Privacy note: `Shown only to authorized responders during an emergency. Every access is logged.` + link `View access log`
- **Editor view:**
  - First-time intro: `Your emergency medical card` / `Every field is optional. Add what you know — responders see it only during an emergency.`
  - Returning-edit note: `Changes save automatically as you go.`
  - Blood type picker: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, `Not sure`, `Other`; help text `Check your donor card or lab results. If unsure, choose Not sure — a wrong value is worse than none.`
  - Each list field: placeholder examples (`e.g. Penicillin`, `e.g. Asthma`, `e.g. Metformin 500 mg`, `e.g. Uses a wheelchair`), quick-add suggestion chips, `Maximum of {n} items reached. Remove one to add another.`
  - Notes field: placeholder `Add a short note for first responders`; counter `{n}/500`
  - Save-status line: `Changes save automatically` / `Saving…` / `Unsaved changes` / `Saved {time}` / `Not saved`
  - Error card: `Your latest changes weren't saved` + `Retry save` link
  - Button: `Done`

### `mobile/app/settings/permissions.tsx` — Emergency Readiness
No tab (pushed, via `ScreenHeader`).
- **Header:** `Emergency Readiness`
- **Loading:** `Checking your device…`
- **Overall status hero:** `You're ready` / `Partly ready` / `Action needed`, each with its own body text (`AGAP can find you, reach you, and keep you updated.` / `SOS works, but some features are limited. Review the items below.` / `Fix the essential items below so responders can find and update you.`); `{n} of {total} checks passed`; `Checked {time}`; button `Check again`
- **Sync banners (if applicable):** `No internet. Showing checks from this device only.` / `Couldn't reach AGAP servers. Showing checks from this device only.`; `Last synced {time}.`
- **Reassurance banner:** `You can always send an SOS, even if some checks fail.`
- **Tiers:** `Essential` / `Needed to find and update you quickly`; `Recommended` / `Helps responders and your family reach you`; `Optional` / `Extra features. Never required to send an SOS`
- **Checks** (title + status copy per state), covering: Location access, Notifications, Internet connection, Emergency contacts, Mobile number, Camera, Motion sensor, Medical profile. Example copy: `AGAP can share your precise location in an emergency.` / `Location is blocked. Responders may not find you quickly.` / `Your contacts will be notified when you send an SOS.` / `Add at least one person to notify when you send an SOS.` / etc. Each actionable item shows a pill (`Ready` / `Limited` / `Action needed`) and a contextual action button (`Allow`, `Open Settings`, `Turn On`, `Register device`, `Check again`, `Add contact`, `Go to profile`, `Manage consent`, `Set up`).
- **Account-unknown note** (Recommended tier, offline): `Connect to the internet to check your contacts, mobile number, and medical profile.`
- **Hotline card:** title `In a life-threatening emergency`; body `Call Bocaue Hotlines or the Bocaue MDRRMO hotline. AGAP supports these hotlines; it does not replace them.`; button `Call Bocaue Hotlines`

### `mobile/app/notifications/index.tsx` — Notifications
No tab (pushed, own header).
- **Header:** back arrow; title `Notifications`; subtitle `Emergency and community updates`; button `Mark read` (shown when there are unread items)
- **Summary card:** `{n} unread update(s)` / `You're all caught up`; sub `Review important updates below.` / `New updates will appear here.`
- **Filter tabs:** `All` / `Unread` (with unread count badge)
- **Loading:** `Loading your updates…`
- **Error state:** `Could not load notifications` / `Check your connection and try again.` / `Retry`
- **Empty states:** `No notifications yet` / `Incident and announcement updates will appear here.`; or (Unread filter) `You're all caught up` / `You have no unread updates right now.` + link `View all notifications`
- **Date section headers:** `Today`, `Yesterday`, or full date
- **Notification type labels** (examples): `Dispatched`, `Dispatch update`, `New incident`, `Incident update`, `Escalation`, `Status change`, `Announcement`, `Assignment`, `Report received`, `On the way`, `Arrived`, `Transporting`, `Assisting`, `Resolved`, `Closed`, `Referred`, `Unable to respond`, `False alert`, `Merged`, generic fallback `Notification`

---

## Other

### `mobile/app/coverage.tsx` — Bocaue Coverage Map
No tab (pushed from Home's location card).
- Full-screen municipality-locked map (pan/zoom clamped to Bocaue)
- **Floating header:** back button; title chip `Bocaue, Bulacan`
- **Fallbacks:** `Map failed to render on this device.` + `Retry`; or `Live map requires the latest app build.`

### `mobile/app/first-aid/index.tsx` — First Aid Guides
No tab (pushed, via `ScreenHeader`).
- **Header:** `First Aid`
- **Subtitle:** `Simple steps you can do while help is on the way.`
- **Emergency banner:** `In a life-threatening emergency, call bocaue hotlines or the MDRRMO hotline first.`; button `Call Emergency Hotline`
- **Offline hint:** `Available offline`
- **Search placeholder:** `Search guides…`
- **Filter chips:** `All`, `Life-Saving`, `Road`, `Fire`, `Flood`
- **Empty state:** `No guides match your search.`
- Guide cards list (title/summary are bilingual content from the bundled guide data, not further detailed here).

### `mobile/app/first-aid/[id].tsx` — First Aid Guide Detail
No tab (pushed).
- **Header:** guide title; EN/FIL language toggle (per-screen, independent of the app-wide language setting)
- **Urgency tag:** `Critical` / `Important` / `Good to know`
- **Label:** `While help is on the way`
- **Emergency call banner:** `Call Emergency Hotline`
- **Section — `Steps`:** numbered steps (caution-flagged steps show an `Important` badge)
- **Section — `Do`:** checklist
- **Section — `Don't`:** checklist
- **Section — `Call for help right away if`:** bullet list
- **Disclaimer:** `This is basic first-aid guidance, not a medical diagnosis. Always follow the dispatcher's instructions.`
- **Not-found state:** `Guide not found.`

---

## Shared Components Referenced Across Screens

- **`MapIconCard`** (shown on Profile and Medical Profile): lets a non-guest citizen optionally pick a reporter map icon (Male / Female / Prefer not to say). Title `Your map icon` (or, first-time prompt: `Choose your map icon` / `Helps responders spot you when they arrive. Optional — you can skip this.` / dismiss `Not now`); help text `Used only for your icon on the responder's map.`; privacy note `Not part of your medical info and not shared with other citizens. Only dispatchers and your assigned responders see it.`; save error `Could not save your choice. Check your connection and try again.`
- **`VerifiedReporterBadge` / `ReporterThanksCard`** (Profile, Incident Details-Overview): badge title `Verified Reporter`; earned state `{n} verified report(s)`; unearned state `When an emergency you report is resolved and closed, you earn the Verified Reporter badge.`; thanks card (shown once an incident closes) title `Thank you for reporting`; body `Your report helped responders reach someone in need. It now counts toward your Verified Reporter badge.`
