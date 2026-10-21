import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgapWebSocketEvent,
  ResponderLocationUpdatedPayload,
  IncidentStatusChangedPayload,
  ResponderEtaUpdatedPayload,
} from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import { connectSocket } from '@/src/services/websocket/agap-socket';
import { getLatestTrackingPositions, type LatestUnitPosition } from '@/src/services/api/locations.api';
import { mergeTrackingLocation } from '@/src/lib/incident-tracking';

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
  hasAcceptedDispatch: boolean;
  callSign: string | null;
  unitName: string | null;
  etaSeconds: number | null;
  etaIsEstimate: boolean;
  seedFailed: boolean;
}

const trackingQueryKey = (incidentId: string) => ['incident-tracking-latest', incidentId] as const;

/**
 * Live incident tracking (MOD-13 / MOD-42 / MOD-43). Joins the incident's room,
 * seeds the latest accepted-unit state from REST, then patches it over the
 * WebSocket. Reconnects re-seed from PostgreSQL so missed positions are restored.
 */
export function useIncidentTracking(
  incidentId?: string,
  initialStatus?: string | null,
): IncidentTrackingState {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const [state, setState] = useState<IncidentTrackingState>({
    connected: false,
    status: initialStatus ?? null,
    responder: null,
    hasAcceptedDispatch: false,
    callSign: null,
    unitName: null,
    etaSeconds: null,
    etaIsEstimate: true,
    seedFailed: false,
  });

  const { data: seededUnits, isError: seedFailed, refetch } = useQuery({
    queryKey: trackingQueryKey(incidentId ?? ''),
    queryFn: () => {
      if (!incidentId || !token) throw new Error('Incident tracking requires an incident and active session.');
      return getLatestTrackingPositions(incidentId, token);
    },
    enabled: !!incidentId && !!token,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!incidentId || !token) return;

    const socket = connectSocket(token);

    const join = () => {
      setState((s) => ({ ...s, connected: true }));
      socket.emit('join:incident', { incidentId });
      void refetch();
    };
    const onDisconnect = () => setState((s) => ({ ...s, connected: false }));

    const onResponderLocation = (env: AgapWebSocketEvent<ResponderLocationUpdatedPayload>) => {
      const p = env.data;
      if (p.incidentId && p.incidentId !== incidentId) return;
      queryClient.setQueryData<LatestUnitPosition[]>(
        trackingQueryKey(incidentId),
        (units) => mergeTrackingLocation(units, p),
      );
    };
    const onEta = (env: AgapWebSocketEvent<ResponderEtaUpdatedPayload>) => {
      const eta = env.data;
      if (eta.incidentId !== incidentId) return;
      queryClient.setQueryData<LatestUnitPosition[]>(
        trackingQueryKey(incidentId),
        (units) => units?.map((unit) =>
          unit.dispatchId === eta.dispatchId
            ? {
                ...unit,
                eta: {
                  seconds: eta.etaSeconds,
                  isEstimate: true,
                  calculatedAt: eta.calculatedAt,
                },
              }
            : unit,
        ),
      );
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
  }, [incidentId, token, queryClient, refetch]);

  const units = seededUnits ?? [];
  const selectedUnit =
    units.filter((unit) => unit.position).sort((a, b) =>
      Date.parse(b.position?.updatedAt ?? '') - Date.parse(a.position?.updatedAt ?? ''),
    )[0] ??
    units[0] ??
    null;
  const position = selectedUnit?.position ?? null;

  return {
    ...state,
    responder: position
      ? {
          lat: position.lat,
          lng: position.lng,
          ...(position.heading != null ? { heading: position.heading } : {}),
          updatedAt: position.updatedAt,
        }
      : null,
    hasAcceptedDispatch: units.length > 0,
    callSign: selectedUnit?.callSign ?? null,
    unitName: selectedUnit?.unitName ?? null,
    etaSeconds: selectedUnit?.eta.seconds ?? null,
    etaIsEstimate: true,
    seedFailed,
  };
}
