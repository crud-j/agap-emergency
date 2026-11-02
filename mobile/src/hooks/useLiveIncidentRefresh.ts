import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import type { AgapWebSocketEvent, NotificationCreatedPayload } from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import { connectSocket } from '@/src/services/websocket/agap-socket';

/**
 * App-wide refresh when an incident changes (MOD-42). Every status step sends the
 * reporter a feed row (`notification.created` on their private room) and a push,
 * so either signal refetches home, history, the SOS state, the badge and the
 * responder tabs, whichever screen is open. Refetching only marks queries stale;
 * unmounted ones load fresh next time they're shown.
 */
export function useLiveIncidentRefresh(): void {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!token) return;

    const refresh = (incidentId?: unknown) => {
      for (const key of [
        'notifications',
        'my-incidents',
        'active-incident',
        'reporter-standing',
        'responder-assignments',
        'responder-assignment',
        'responder-me',
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
      if (typeof incidentId === 'string') {
        void qc.invalidateQueries({ queryKey: ['incident', incidentId] });
        void qc.invalidateQueries({ queryKey: ['incident-detail', incidentId] });
      }
    };

    const socket = connectSocket();
    const onNotification = (env: AgapWebSocketEvent<NotificationCreatedPayload>) =>
      refresh(env?.data?.incidentId);
    socket.on('notification.created', onNotification);

    // A push that arrives while the app is open (the socket may be reconnecting).
    const sub = Platform.OS === 'web'
      ? null
      : Notifications.addNotificationReceivedListener((n) => refresh(n.request.content.data?.incidentId));

    return () => {
      socket.off('notification.created', onNotification);
      sub?.remove();
    };
  }, [token, qc]);
}
