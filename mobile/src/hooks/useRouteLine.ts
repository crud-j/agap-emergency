import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/src/stores/auth.store';
import { getRoute, type LatLng } from '@/src/services/api/locations.api';

export interface RouteLine {
  geometry: Array<[number, number]> | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
}

// ~11 m precision — avoids refetching on GPS jitter while a unit is moving.
const round = (n: number) => n.toFixed(4);

/**
 * Fetches the driving route between two points for the in-app route line, and
 * refreshes periodically as the origin moves (MOD-43). Keyed on rounded
 * coordinates so small GPS jitter doesn't spam the routing provider. Best-effort:
 * a failure just yields no line (the map and markers still render).
 */
export function useRouteLine(from: LatLng | null, to: LatLng | null): RouteLine {
  const token = useAuthStore((s) => s.accessToken);
  const key = from && to ? `${round(from.lat)},${round(from.lng)}->${round(to.lat)},${round(to.lng)}` : null;

  const { data } = useQuery({
    queryKey: ['route-line', key],
    queryFn: () => getRoute(from as LatLng, to as LatLng, token as string),
    enabled: !!from && !!to && !!token,
    refetchInterval: 20000,
    staleTime: 15000,
  });

  return {
    geometry: data?.geometry ?? null,
    distanceMeters: data?.distanceMeters ?? null,
    durationSeconds: data?.durationSeconds ?? null,
  };
}
