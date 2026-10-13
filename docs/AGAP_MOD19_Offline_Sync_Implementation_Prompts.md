# MOD-19 Offline Sync — Step-by-Step Implementation Prompts

Use each prompt below **in order**, one conversation turn at a time.
Each prompt is self-contained — paste it directly and the agent has all the context it needs.

---

## Step 1 — Install `@react-native-community/netinfo`

```
In the AGAP monorepo at C:\Users\githu\Music\agap-emergency, install the
@react-native-community/netinfo package into the mobile workspace.

Run:
  cd mobile && expo install @react-native-community/netinfo

Confirm the package was added to mobile/package.json under "dependencies".
Do NOT run a build yet — just install and confirm.
```

---

## Step 2 — Create `useNetworkSync` hook

```
In the AGAP monorepo at C:\Users\githu\Music\agap-emergency, create a new
file at:

  mobile/src/hooks/useNetworkSync.ts

This hook is the reconnect trigger for MOD-19 (Offline Emergency Queue and
Retry). When the device transitions from offline to online it calls
OfflineQueueService.processQueue() to flush any queued emergency incidents.

Requirements:
- Import NetInfo from @react-native-community/netinfo
- Import OfflineQueueService from @/src/services/offline/offline-queue.service
- Import submitIncident from @/src/services/api/incidents.api
- Import useAuthStore from @/src/stores/auth.store
- Use a useRef<boolean> (wasOffline) so the queue only flushes on a genuine
  offline→online transition, not on every app mount when already online.
- Guard against captive portals: only treat the device as online when both
  state.isConnected === true AND state.isInternetReachable !== false.
- Call OfflineQueueService.processQueue((payload) =>
    submitIncident(payload, accessToken ?? undefined))
  when the transition fires.
- Catch and discard errors from processQueue — a failed flush must never
  throw; the queue survives and retries on the next reconnect.
- Export the hook as a named export: export function useNetworkSync().

Do not modify any other file in this step.
```

---

## Step 3 — Wire `useNetworkSync` into `_layout.tsx`

```
In the AGAP monorepo at C:\Users\githu\Music\agap-emergency, edit:

  mobile/app/_layout.tsx

The file exports a RootLayout with an AuthGuard component inside it.
AuthGuard already calls useEffect for auth and accessibility loading.

Changes needed:
1. Import useNetworkSync from ../src/hooks/useNetworkSync
2. Add a single call  useNetworkSync();  inside the AuthGuard function body,
   alongside the existing hooks. Place it after the existing hook declarations
   so it does not interrupt the auth/accessibility logic.

That is the only change. Do not modify the JSX, the Stack screens, or any
other logic in this file.

After editing, confirm the file still compiles cleanly by checking for
TypeScript errors with:
  cd mobile && npx tsc --noEmit
```

---

## Step 4 — Add `INCIDENT_SUBMIT` case to the backend processor

```
In the AGAP monorepo at C:\Users\githu\Music\agap-emergency, edit:

  backend/src/jobs/processors/offline-sync.processor.ts

The process() method has a switch on event.type. It currently handles:
  - 'SOS'           → emergencyAlertsService.createFromSos(...)
  - 'LOCATION_UPDATE' → locationsService.trackResponder(...)
  - 'STATUS_UPDATE'   → log and skip
  - default           → logger.warn (unhandled)

The offline-sync service sets event_type: 'INCIDENT_SUBMIT' for events
submitted via the legacy queueSync() path, but the processor has no case
for it — it falls through to the default warn and does nothing.

Add a new case immediately after the 'SOS' case:

  case 'INCIDENT_SUBMIT':
    await this.emergencyAlertsService.createFromSos(
      { ...event.payload, clientEventId: event.client_event_id } as unknown as SosAlertDto,
      'SOS_BUTTON',
      (event.payload['userId'] as string | undefined) ?? undefined,
    );
    break;

Reason: INCIDENT_SUBMIT payload shape is identical to SosAlertDto (both come
from CreateIncidentInput). The clientEventId is the idempotency key, so even
if the same event is replayed twice the backend creates only one incident.

After editing, confirm the backend still compiles cleanly:
  cd backend && npx tsc --noEmit
```

---

## Step 5 — Rebuild the dev client

```
The mobile app uses expo-dev-client. @react-native-community/netinfo added
in Step 1 is a native module and requires a new dev build to take effect.

Run the EAS development build for Android:
  cd mobile && eas build --profile development --platform android

This will produce a new APK. Once the build finishes, download and install
the APK on the test device (Galaxy S21 or emulator).

Do NOT skip this step — without a rebuild the NetInfo import will crash at
runtime because the native module is not linked.

After installing the APK, start the Expo dev server:
  cd mobile && npx expo start --dev-client --clear

Then open the app on the device.
```

---

## Step 6 — Smoke test the offline queue end-to-end

```
With the AGAP app running on a physical Android device and the backend
running locally (tunneled via ngrok at
benevolent-semirhythmically-tova.ngrok-free.dev), run the following manual
test sequence:

--- TEST A: Happy path (online submit) ---
1. Ensure device has internet.
2. Open the app, log in as a citizen.
3. Trigger an SOS → go through location → transmission screen.
4. Confirm the transmission screen shows "Emergency reported successfully".
5. Check GET /api/v1/incidents/mine — the incident must appear.
6. Check AsyncStorage — queue must be empty (0 pending entries).

--- TEST B: Offline queue ---
1. Enable airplane mode on the device.
2. Trigger a new SOS.
3. Confirm the transmission screen shows "No connection — queued for retry".
4. Check AsyncStorage via the Expo dev tools or a debug log —
   confirm one entry with status: 'pending'.

--- TEST C: Reconnect flush ---
1. While the queued incident from TEST B is still in AsyncStorage,
   disable airplane mode.
2. Wait up to 5 seconds.
3. Confirm the app automatically flushes — the incident must appear in
   GET /api/v1/incidents/mine without any manual action.
4. Confirm AsyncStorage queue is now empty.

--- TEST D: Idempotency (double-flush) ---
1. Repeat TEST B (queue one incident offline).
2. Reconnect → wait for flush (TEST C).
3. Reconnect again (toggle airplane mode off/on/off).
4. Confirm GET /api/v1/incidents/mine still shows exactly ONE incident
   for that idempotency key — not two.

--- TEST E: Backend flush endpoint ---
Using curl or Postman, POST to:
  POST https://benevolent-semirhythmically-tova.ngrok-free.dev/api/v1/offline-sync/flush
  Authorization: Bearer <citizen JWT>
  Content-Type: application/json
  Body:
  {
    "events": [{
      "client_event_id": "test-incident-submit-001",
      "type": "INCIDENT_SUBMIT",
      "payload": {
        "type": "MEDICAL",
        "idempotencyKey": "test-incident-submit-001",
        "reporter": { "type": "REGISTERED_CITIZEN" }
      }
    }]
  }

Confirm response is 201 with accepted: 1, and that no warning appears in
the backend logs for "Unknown offline event type".

Report: pass/fail for each test, and any error messages observed.
```

## Quick Reference — Files Touched

| Step | File | Action |
|------|------|--------|
| 1 | `mobile/package.json` | `expo install @react-native-community/netinfo` |
| 2 | `mobile/src/hooks/useNetworkSync.ts` | Create |
| 3 | `mobile/app/_layout.tsx` | Add `useNetworkSync()` call in `AuthGuard` |
| 4 | `backend/src/jobs/processors/offline-sync.processor.ts` | Add `INCIDENT_SUBMIT` case |
| 5 | — | EAS dev build + install APK |
| 6 | — | Manual end-to-end test |
