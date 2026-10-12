import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { OfflineQueueService } from '@/src/services/offline/offline-queue.service';
import { submitIncident } from '@/src/services/api/incidents.api';
import { useAuthStore } from '@/src/stores/auth.store';
import { useIncidentStore } from '@/src/stores/incident.store';
import { notifySyncing, notifySynced } from './useNetworkStatus';

export function useNetworkSync() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const setActiveIncidentId = useIncidentStore((s) => s.setActiveIncidentId);
  const router = useRouter();
  const wasOffline = useRef<boolean>(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline =
        state.isConnected === true && state.isInternetReachable !== false;

      if (!isOnline) {
        wasOffline.current = true;
        return;
      }

      if (!wasOffline.current) return;
      wasOffline.current = false;

      // Check queue before flushing — only show the syncing banner if there's
      // something to send, so the UI doesn't flash on every reconnect.
      OfflineQueueService.getPending()
        .then((pending) => {
          if (pending.length > 0) notifySyncing();
          return OfflineQueueService.processQueue((payload) =>
            submitIncident(payload, accessToken ?? undefined),
          );
        })
        .then(({ submittedIds }) => {
          notifySynced(submittedIds.length);
          if (submittedIds.length > 0) {
            const lastId = submittedIds[submittedIds.length - 1];
            setActiveIncidentId(lastId);
            router.push(`/incidents/${lastId}` as any);
          }
        })
        .catch(() => {
          notifySynced(0); // silently resets syncing state; queue retries on next reconnect
        });
    });

    return unsubscribe;
  }, [accessToken, setActiveIncidentId, router]);
}
