import { useQuery } from '@tanstack/react-query';
import { useIncidentStore } from '../stores/incident.store';
import { useAuthStore } from '../stores/auth.store';
import { getIncidentStatus } from '../services/api/incidents.api';

export function useActiveIncident() {
  const activeIncidentId = useIncidentStore((s) => s.activeIncidentId);
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['active-incident', activeIncidentId],
    queryFn: () => getIncidentStatus(activeIncidentId!, accessToken ?? undefined),
    enabled: !!activeIncidentId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return {
    incident: query.data ?? null,
    isLoading: query.isLoading,
    isStale: query.isStale,
    refetch: query.refetch,
  };
}
