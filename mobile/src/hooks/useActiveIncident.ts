import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ACTIVE_INCIDENT_STATUSES } from '@agap/shared';
import { useIncidentStore } from '../stores/incident.store';
import { useAuthStore } from '../stores/auth.store';
import { getIncidentStatus } from '../services/api/incidents.api';

const ACTIVE = new Set<string>(ACTIVE_INCIDENT_STATUSES);

export function useActiveIncident() {
  const activeIncidentId = useIncidentStore((s) => s.activeIncidentId);
  const setActiveIncidentId = useIncidentStore((s) => s.setActiveIncidentId);
  const accessToken = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['active-incident', activeIncidentId],
    queryFn: () => getIncidentStatus(activeIncidentId!, accessToken ?? undefined),
    enabled: !!activeIncidentId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  // Once the incident is resolved, closed or otherwise ended, it is no longer the
  // active one: home drops its card and the SOS button goes back to "Report".
  // A failed fetch (offline) keeps it, so an emergency is never hidden by mistake.
  const status = (query.data as { status?: string } | undefined)?.status;
  const ended = !!status && !ACTIVE.has(status);
  useEffect(() => {
    if (ended) setActiveIncidentId(null);
  }, [ended, setActiveIncidentId]);

  return {
    incident: ended ? null : query.data ?? null,
    isLoading: query.isLoading,
    isStale: query.isStale,
    refetch: query.refetch,
  };
}
