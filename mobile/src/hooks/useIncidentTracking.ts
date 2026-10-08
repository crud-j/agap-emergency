import { useEffect, useState } from 'react';
import type {
  AgapWebSocketEvent,
  ResponderLocationUpdatedPayload,
  IncidentStatusChangedPayload,
} from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import { connectSocket } from '@/src/services/websocket/agap-socket';

export interface ResponderPosition {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt: string;
}

export interface IncidentTrackingState {
  connected: boolean;
  status: string | null;
  responder: ResponderPosition | null;
  etaSeconds: number | null;
  etaIsEstimate: boolean;
}

// Backend emits { dispatchId, etaSeconds, isEstimate, calculatedAt } on this event.
interface EtaUpdatedPayload {
  dispatchId?: string;
  etaSeconds?: number | null;
  isEstimate?: boolean;
}

/**
 * Live incident tracking (MOD-13 / MOD-42 / MOD-43). Joins the incident's room
 * and keeps the latest responder position, ETA, and status in sync over the
 * WebSocket. Citizens only ever receive their own incident's events (enforced
 * server-side). Falls back silently when offline — the socket reconnects.
 */
export function useIncidentTracking(
  incidentId?: string,
  initialStatus?: string | null,
): IncidentTrackingState {
  const token = useAuthStore((s) => s.accessToken);
  const [state, setState] = useState<IncidentTrackingState>({
    connected: false,
    status: initialStatus ?? null,
    responder: null,
    etaSeconds: null,
    etaIsEstimate: true,
  });

  useEffect(() => {
    if (!incidentId || !token) return;

    const socket = connectSocket(token);

    const join = () => {
      setState((s) => ({ ...s, connected: true }));
      socket.emit('join:incident', { incidentId });
    };
    const onDisconnect = () => setState((s) => ({ ...s, connected: false }));

    const onResponderLocation = (env: AgapWebSocketEvent<ResponderLocationUpdatedPayload>) => {
      const p = env.data;
      setState((s) => ({
        ...s,
        responder: {
          lat: p.lat,
          lng: p.lng,
          ...(p.heading !== undefined ? { heading: p.heading } : {}),
          ...(p.speed !== undefined ? { speed: p.speed } : {}),
          updatedAt: p.updatedAt,
        },
      }));
    };
    const onEta = (env: AgapWebSocketEvent<EtaUpdatedPayload>) => {
      setState((s) => ({
        ...s,
        etaSeconds: env.data?.etaSeconds ?? null,
        etaIsEstimate: env.data?.isEstimate ?? true,
      }));
    };
    const onStatus = (env: AgapWebSocketEvent<IncidentStatusChangedPayload>) => {
      setState((s) => ({ ...s, status: env.data.newStatus }));
    };

    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    socket.on('responder.location_updated', onResponderLocation);
    socket.on('responder.eta_updated', onEta);
    socket.on('incident.status_changed', onStatus);

    return () => {
      socket.emit('leave:incident', { incidentId });
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      socket.off('responder.location_updated', onResponderLocation);
      socket.off('responder.eta_updated', onEta);
      socket.off('incident.status_changed', onStatus);
    };
  }, [incidentId, token]);

  return state;
}
