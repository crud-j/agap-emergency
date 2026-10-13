# MOD-19 Offline Sync — Fix Plan

**Goal:** Close the three known gaps so the offline queue actually flushes on reconnect and all event types are handled end-to-end.

---

## Gap Audit

| # | Gap | Status |
|---|-----|--------|
| 1 | `offline_event_queue` Prisma model missing | **CLOSED** — model exists at `schema.prisma:944` |
| 2 | `OfflineQueueService.processQueue()` never called on reconnect | **OPEN** |
| 3 | `INCIDENT_SUBMIT` event type unhandled in backend processor | **OPEN** |

---

## Fix 1 — Install NetInfo (mobile)

`@react-native-community/netinfo` is **not** in `mobile/package.json`. It is required to listen for real-time connectivity changes.

```bash
cd mobile
expo install @react-native-community/netinfo
```

Because AGAP uses a dev client (`expo-dev-client` is already a dep), this native module needs one rebuild after install:

```bash
eas build --profile development --platform android
# install the new APK on device
```

> **Why not `expo-network`?** `expo-network` only supports one-shot polling (`getNetworkStateAsync`), not a continuous listener. NetInfo's `addEventListener` gives the real-time `isConnected` transition needed to flush the queue at the exact moment connectivity is restored.

---

## Fix 2 — Create `useNetworkSync` hook (mobile)

**File to create:** `mobile/src/hooks/useNetworkSync.ts`

This hook subscribes to NetInfo and calls `processQueue` the moment the device goes from offline → online.

```ts
import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { OfflineQueueService } from '@/src/services/offline/offline-queue.service';
import { submitIncident } from '@/src/services/api/incidents.api';
import { useAuthStore } from '@/src/stores/auth.store';

export function useNetworkSync() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected && state.isInternetReachable !== false;

      if (!isOnline) {
        wasOffline.current = true;
        return;
      }

      // Only flush when transitioning from offline → online
      if (!wasOffline.current) return;
      wasOffline.current = false;

      OfflineQueueService.processQueue((payload) =>
        submitIncident(payload, accessToken ?? undefined),
      ).catch(() => {
        // processQueue is best-effort; failure is retried on the next
        // reconnect via the exponential backoff already in processQueue.
      });
    });

    return () => unsubscribe();
  }, [accessToken]);
}
```

**Key decisions:**
- `wasOffline` ref prevents flushing on every app launch when already online.
- `isInternetReachable !== false` guards against cases where `isConnected: true` but no actual internet (e.g. captive portal).
- Errors are silently caught — the queue survives, and the next reconnect retries. This follows the reliability rule: a failed sync must never cancel an incident.

---

## Fix 3 — Wire `useNetworkSync` into `_layout.tsx` (mobile)

**File to edit:** `mobile/app/_layout.tsx`

Add `useNetworkSync()` inside the existing `AuthGuard` component so it's mounted for the lifetime of the app.

```diff
 import { useAuthStore } from '../src/stores/auth.store';
 import { useAccessibilityStore } from '../src/stores/accessibility.store';
 import { homeRouteForRole } from '../src/lib/role-routing';
+import { useNetworkSync } from '../src/hooks/useNetworkSync';

 function AuthGuard() {
   const router = useRouter();
   const segments = useSegments();
   const { isAuthenticated, isLoading, loadFromStorage } = useAuthStore();
   const user = useAuthStore((s) => s.user);
   const loadAccessibility = useAccessibilityStore((s) => s.loadFromStorage);
   const accessibilityLoaded = useAccessibilityStore((s) => s.isLoaded);

+  useNetworkSync();

   useEffect(() => {
```

`AuthGuard` is the right place because:
- It already owns the auth lifecycle.
- It's rendered inside `QueryClientProvider`, so if a future version needs TanStack Query mutations it has access.
- It's always mounted — no screen navigation can unmount it.

---

## Fix 4 — Handle `INCIDENT_SUBMIT` in the backend processor

**File to edit:** `backend/src/jobs/processors/offline-sync.processor.ts`

The `queueSync()` service method sets `event_type: 'INCIDENT_SUBMIT'` but the processor falls through to `default` (logs a warning, does nothing). Add the case:

```diff
         case 'SOS':
           await this.emergencyAlertsService.createFromSos(
             { ...event.payload, clientEventId: event.client_event_id } as unknown as SosAlertDto,
             'SOS_BUTTON',
             (event.payload['userId'] as string | undefined) ?? undefined,
           );
           break;

+        case 'INCIDENT_SUBMIT':
+          // Legacy path: single-event queueSync() sets this type.
+          // Re-route through the same SOS creation path — payload shape is identical.
+          await this.emergencyAlertsService.createFromSos(
+            { ...event.payload, clientEventId: event.client_event_id } as unknown as SosAlertDto,
+            'SOS_BUTTON',
+            (event.payload['userId'] as string | undefined) ?? undefined,
+          );
+          break;

         case 'LOCATION_UPDATE':
```

> **Why reuse `createFromSos`?** The `queueSync()` payload is built from `CreateIncidentInput`, which has the same fields as `SosAlertDto`. The idempotency key (`clientEventId`) is passed through, so even if the backend processes the same event twice (e.g. both the mobile direct-submit and a flush arrive), the incident is only created once.

---

## Test Checklist

Once all four fixes are applied and the dev client is rebuilt:

- [ ] **Happy path online:** Submit incident → confirm it arrives at the backend immediately, no queue entry in `AsyncStorage`.
- [ ] **Go offline mid-submit:** Enable airplane mode → submit SOS → confirm "queued for retry" screen appears → check `AsyncStorage` contains one entry.
- [ ] **Reconnect flush:** Re-enable connectivity → confirm the app auto-flushes within ~1–2 seconds → incident appears in `GET /api/v1/incidents/mine`.
- [ ] **Idempotency:** Disconnect → submit → reconnect → reconnect a second time (simulate double-flush) → confirm only **one** incident is created on the backend.
- [ ] **Backend flush endpoint:** `POST /api/v1/offline-sync/flush` with `type: "INCIDENT_SUBMIT"` → confirm processor handles it without warnings.
- [ ] **Failed items stay in queue:** Simulate server 500 → confirm item remains in queue with `status: 'retrying'`, `attempts` incremented.
- [ ] **Max retries exhausted:** Set `attempts` to `MAX_OFFLINE_RETRY_ATTEMPTS` manually → confirm item moves to `status: 'failed'` and is not re-submitted.

---

## File Summary

| Action | File |
|--------|------|
| `expo install @react-native-community/netinfo` | `mobile/package.json` (auto-updated) |
| **Create** | `mobile/src/hooks/useNetworkSync.ts` |
| **Edit** `AuthGuard` — add `useNetworkSync()` | `mobile/app/_layout.tsx` |
| **Edit** processor — add `INCIDENT_SUBMIT` case | `backend/src/jobs/processors/offline-sync.processor.ts` |
