# MOD-07 — Shake-to-Alert Trigger

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-07 |
| Version | 1.0 |
| Module Name | Shake-to-Alert Trigger |
| Module Cluster | Cluster B — Alert Triggering |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
A second way to start an emergency report: shaking the phone hard while the AGAP home screen is open. A five-second countdown with vibration appears first, so an accidental shake can be cancelled. When the countdown ends, the same SOS flow as the button starts, and the incident is recorded as triggered by a shake.

**Purpose**
Help a resident who cannot easily look at or press the screen (for example while running from a fire or holding a child in rising water) start a report quickly, while the countdown keeps false alarms low.

**Tasks Performed**
1. Listens for a strong shake (about 2.5 g) only while the home screen is open, the app is in front, the setting is on and no incident is active.
2. Shows a five-second countdown with vibration, a Cancel button and a Send now button.
3. Starts the SOS flow (MOD-06) when the countdown ends or Send now is tapped.
4. Records the report's trigger as "Shake" so dispatchers can see how it was sent.
5. Lets the citizen turn the feature on or off from the home screen chip or Accessibility settings.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Phone call to the hotline, which needs the caller's hands and attention | Phone shake detected by the accelerometer |
| 2 | Caller's verbal description of the emergency | Shake to Alert setting (on or off) |
| 3 | | Cancel or Send now tap during the countdown (optional) |
| 4 | | The SOS flow inputs that follow (MOD-06) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Mobile phone (voice call) | AGAP Citizen mobile app (Expo, React Native, Expo Router) |
| 2 | MDRRMO hotline / 911 | Expo Sensors (accelerometer) shake detector, 2-second debounce |
| 3 | | Expo Haptics / Vibration for the countdown |
| 4 | | Zustand stores (setting, report draft) and Expo Secure Store |
| 5 | | NestJS REST API (`POST /v1/incidents` with `triggerMethod`) |
| 6 | | PostgreSQL (`incidents.trigger_method`) and the web incident drawer |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A resident in danger must unlock the phone and dial the MDRRMO hotline or 911. |
| 2 | They must talk to the operator and describe what is happening and where. |
| 3 | If their hands are busy or they are moving to safety, the call is delayed or not made. |
| 4 | The operator records the call in the logbook. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Logbook entry, when the call gets through |
| 2 | Delayed or missed reports when the caller cannot use the phone normally |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The citizen keeps Shake to Alert on (the default) from the home screen chip or Profile, then Accessibility. | User Action |
| 2 | While the home screen is open and the app is in front, the app listens to the accelerometer. It stops listening on other screens, in the background, when the setting is off, or while an incident is active. | Processing |
| 3 | The citizen shakes the phone hard. A shake stronger than about 2.5 g is detected; further shakes within two seconds are ignored. | User Action |
| 4 | A countdown opens: five seconds with vibration, a large Cancel button and Send now. | Notification |
| 5 | Cancel closes the countdown and returns to the home screen; nothing is created. | Validation |
| 6 | When the countdown ends, or Send now is tapped, the app starts a new report with the trigger "Shake" and opens Confirm Location. | Processing |
| 7 | The citizen completes the same flow as the SOS button (MOD-06). | User Action |
| 8 | The backend accepts only the trigger values the app may send (SOS button, Shake, Manual) and saves the incident with trigger "Shake". | Database |
| 9 | In the web incident drawer, the dispatcher sees "Trigger: Shake" in the Overview. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Countdown screen after a shake, with Cancel and Send now |
| 2 | Emergency report started through the standard SOS flow |
| 3 | Incident saved with trigger method "Shake" |
| 4 | Trigger shown to the dispatcher in the incident drawer |

---

## Owner notes (not part of the report)

**Test before signing (fix plan, Phase 1 "Done when"):**
1. With the setting on, shake the phone on the home screen; the countdown appears. Tap Cancel; nothing is created.
2. Shake again and let the countdown run out; Confirm Location opens. Submit, then check the drawer shows "Trigger: Shake".
3. Hold the SOS button instead; the drawer shows "SOS button".
4. Turn the setting off, open another screen, or keep an incident active; shaking does nothing.
5. Tap the home chip; its label and the Accessibility switch change together.

**Do not claim:**
- Shake detection while the app is closed, in the background or on the lock screen.
- Countdown text in Filipino. The countdown is English only for now.
- `POST /v1/emergency-alerts/shake`. It exists but no screen uses it.
