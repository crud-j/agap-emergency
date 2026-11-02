import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgapWebSocketEvent,
  ResponderLocationUpdatedPayload,
  IncidentStatusChangedPayload,
  IncidentTransportUpdatedPayload,
  ResponderEtaUpdatedPayload,
  ResponderRouteUpdatedPayload,
} from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import { DISCONNECTED_POLL_MS, connectSocket, watchIncidentRoom } from '@/src/services/websocket/agap-socket';
import { getLatestTrackingPositions, type LatestUnitPosition } from '@/src/services/api/locations.api';
import { mergeRouteUpdate, mergeTrackingLocation, mergeTransportUpdate, selectPrimaryUnit } from '@/src/lib/incident-tracking';
import { deriveTransportView, type TransportView } from '@/src/lib/transport-view';
import type { DestinationNotice } from '@/src/lib/transport-target';

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
  /** The dispatch `responder` belongs to; the map draws the other units beside it. */
  responderDispatchId: string | null;
  hasAcceptedDispatch: boolean;
  callSign: string | null;
  unitName: string | null;
  etaSeconds: number | null;
  etaIsEstimate: boolean;
  seedFailed: boolean;
  /** Every accepted unit as seeded and patched (leg, destination and server route included). */
  units: LatestUnitPosition[];
  /** What the reporter screen shows about transport; only the server's payload decides it (C17). */
  transportView: TransportView;
  /** The unit `transportView` is about (hospital leg), if any. */
  transportUnit: LatestUnitPosition | null;
  /** By dispatch id: the last transport_updated warning. The responder banner reads it. */
  destinationNotices: Record<string, DestinationNotice>;
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
    responderDispatchId: null,
    hasAcceptedDispatch: false,
    callSign: null,
    unitName: null,
    etaSeconds: null,
    etaIsEstimate: true,
    seedFailed: false,
    units: [],
    transportView: 'TO_SCENE',
    transportUnit: null,
    destinationNotices: {},
  });

  const { data: seededUnits, isError: seedFailed, refetch } = useQuery({
    queryKey: trackingQueryKey(incidentId ?? ''),
    queryFn: () => {
      if (!incidentId || !token) throw new Error('Incident tracking requires an incident and active session.');
      return getLatestTrackingPositions(incidentId, token);
    },
    enabled: !!incidentId && !!token,
    refetchOnReconnect: true,
    // REST poll while the socket is down (plan §19); none while it is connected.
    refetchInterval: state.connected ? false : DISCONNECTED_POLL_MS,
  });

  useEffect(() => {
    if (!incidentId || !token) return;

    // The shared socket joins the room once per connect and leaves it only when the
    // last screen watching this incident (e.g. the chat over Tracking) releases it.
    const release = watchIncidentRoom(incidentId);
    const socket = connectSocket();

    const join = () => {
      setState((s) => ({ ...s, connected: true }));
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
    // Server route for the unit's current leg (Prompt 07/09). On the hospital leg only
    // the crew and a crew-confirmed reporter receive it (C17).
    const onRoute = (env: AgapWebSocketEvent<ResponderRouteUpdatedPayload>) => {
      const route = env.data;
      if (route.incidentId !== incidentId) return;
      queryClient.setQueryData<LatestUnitPosition[]>(
        trackingQueryKey(incidentId),
        (units) => mergeRouteUpdate(units, route),
      );
    };
    const onTransportUpdated = (env: AgapWebSocketEvent<IncidentTransportUpdatedPayload>) => {
      const transport = env.data;
      if (transport.incidentId !== incidentId) return;
      queryClient.setQueryData<LatestUnitPosition[]>(
        trackingQueryKey(incidentId),
        (units) => mergeTransportUpdate(units, transport),
      );
      // Each update replaces the dispatch's notice, so a later change without a warning clears it.
      const notice: DestinationNotice = { warning: transport.destinationWarning ?? null, receivedAt: Date.now() };
      setState((s) => ({ ...s, destinationNotices: { ...s.destinationNotices, [transport.dispatchId]: notice } }));
      // The crew's transport list (useTransportRoute) re-reads the hospital, like the web console.
      void queryClient.invalidateQueries({ queryKey: ['incident-transports', incidentId] });
    };
    const onStatus = (env: AgapWebSocketEvent<IncidentStatusChangedPayload>) => {
      setState((s) => ({ ...s, status: env.data.newStatus }));
    };

    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    socket.on('responder.location_updated', onResponderLocation);
    socket.on('responder.eta_updated', onEta);
    socket.on('responder.route_updated', onRoute);
    socket.on('incident.transport_updated', onTransportUpdated);
    socket.on('incident.status_changed', onStatus);

    return () => {
      release();
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      socket.off('responder.location_updated', onResponderLocation);
      socket.off('responder.eta_updated', onEta);
      socket.off('responder.route_updated', onRoute);
      socket.off('incident.transport_updated', onTransportUpdated);
      socket.off('incident.status_changed', onStatus);
    };
  }, [incidentId, token, queryClient, refetch]);

  const units = seededUnits ?? [];
  const selectedUnit = selectPrimaryUnit(units);
  const position = selectedUnit?.position ?? null;
  const transport = deriveTransportView(state.status ?? initialStatus, units);

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
    responderDispatchId: selectedUnit?.dispatchId ?? null,
    hasAcceptedDispatch: units.length > 0,
    callSign: selectedUnit?.callSign ?? null,
    unitName: selectedUnit?.unitName ?? null,
    etaSeconds: selectedUnit?.eta.seconds ?? null,
    etaIsEstimate: true,
    seedFailed,
    units,
    transportView: transport.view,
    transportUnit: transport.unit,
  };
}
