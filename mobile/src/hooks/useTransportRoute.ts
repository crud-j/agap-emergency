import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/src/stores/auth.store';
import { listTransports, type TransportRecord } from '@/src/services/api/transport.api';
import { useIncidentTracking } from '@/src/hooks/useIncidentTracking';
import { useRouteLine } from '@/src/hooks/useRouteLine';
import {
  isDestinationDeactivated,
  isRouteLastKnown,
  selectRouteTarget,
  type LatLngPoint,
  type RouteTarget,
} from '@/src/lib/transport-target';

export interface TransportRouteState {
  /** This crew's transports on the incident, newest first. */
  ownTransports: TransportRecord[];
  /** The open one, else the latest (arrived) one, else null. */
  myTransport: TransportRecord | null;
  /** True once the transport list has loaded at least once (or failed). */
  transportsKnown: boolean;
  refetchTransports: () => Promise<unknown>;
  target: RouteTarget;
  /** The hospital to mark on the map during transport (open or arrived), when it has coordinates. */
  destinationMarker: (LatLngPoint & { label: string }) | null;
  /** The open transport's hospital was deactivated: show the banner (isDestinationDeactivated). */
  destinationDeactivated: boolean;
  route: {
    geometry: Array<[number, number]> | null;
    distanceMeters: number | null;
    durationSeconds: number | null;
    /** The server route is stale or older than 120 s: draw it dimmed with a banner. */
    lastKnown: boolean;
    source: 'server' | 'client' | 'none';
  };
}

/**
 * The responder's leg-aware route (plan §15, Prompt 10): the hospital during an open
 * transport, otherwise the scene. Prefers the server route for this dispatch (REST seed
 * plus responder.route_updated, through useIncidentTracking) and falls back to the
 * client route (useRouteLine) only while the server route is null. Shared by the
 * assignment screen and the Map tab so both always show the same target.
 */
export function useTransportRoute({
  dispatchId,
  incidentId,
  incidentStatus,
  scene,
  myPoint,
  enabled,
}: {
  dispatchId: string | undefined;
  incidentId: string | undefined;
  incidentStatus: string | null | undefined;
  scene: LatLngPoint | null;
  myPoint: LatLngPoint | null;
  /** Routing and live tracking run only while the crew shares its location and a map is shown. */
  enabled: boolean;
}): TransportRouteState {
  const token = useAuthStore((s) => s.accessToken);

  const { data: transports, isFetched, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['incident-transports', incidentId],
    queryFn: () => listTransports(incidentId as string, token as string),
    enabled: !!incidentId && !!token,
    refetchInterval: 10_000,
  });

  const ownTransports = (transports ?? []).filter((transport) => transport.dispatch_id === dispatchId);
  const myTransport = ownTransports.find((transport) => !transport.arrived_at) ?? ownTransports[0] ?? null;
  const target = selectRouteTarget({ status: incidentStatus, myTransport, scene });

  const facility = incidentStatus === 'TRANSPORTING' ? myTransport?.facilities ?? null : null;
  const destinationMarker =
    facility && facility.latitude != null && facility.longitude != null
      ? { lat: Number(facility.latitude), lng: Number(facility.longitude), label: facility.name }
      : null;

  const live = useIncidentTracking(enabled ? incidentId : undefined);
  const unit = live.units.find((u) => u.dispatchId === dispatchId);
  const openTransport = myTransport && !myTransport.arrived_at ? myTransport : null;
  const destinationDeactivated = isDestinationDeactivated({
    transporting: incidentStatus === 'TRANSPORTING' && !!openTransport,
    facility: openTransport?.facilities,
    notice: dispatchId ? live.destinationNotices[dispatchId] : null,
    transportsFetchedAt: dataUpdatedAt,
  });
  // Use the server route only when it is for the leg (and hospital) this screen targets.
  const serverRoute =
    unit?.route &&
    ((target.kind === 'SCENE' && unit.leg === 'TO_SCENE') ||
      (target.kind === 'FACILITY' && unit.leg === 'TO_FACILITY' && unit.destination?.name === target.label))
      ? unit.route
      : null;

  const fallback = useRouteLine(
    enabled && !serverRoute ? myPoint : null,
    enabled && !serverRoute ? target.point : null,
  );

  const route: TransportRouteState['route'] = serverRoute
    ? {
        geometry: serverRoute.geometry,
        distanceMeters: serverRoute.distanceMeters,
        durationSeconds: serverRoute.durationSeconds,
        lastKnown: isRouteLastKnown(serverRoute),
        source: 'server',
      }
    : {
        ...fallback,
        lastKnown: false,
        source: fallback.geometry ? 'client' : 'none',
      };

  return {
    ownTransports,
    myTransport,
    transportsKnown: isFetched,
    refetchTransports: refetch,
    target,
    destinationMarker,
    destinationDeactivated,
    route,
  };
}
