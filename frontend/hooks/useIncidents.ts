import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { IncidentStatus } from '@agap/shared';

export function useIncidents(params?: { status?: IncidentStatus; page?: number }) {
  return useQuery({
    queryKey: ['incidents', params],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.page) qs.set('page', String(params.page));
      return api.get(`/incidents?${qs}`);
    },
    refetchInterval: 15000,
  });
}

export function useIncident(id: string) {
  return useQuery({
    queryKey: ['incident', id],
    queryFn: () => api.get(`/incidents/${id}`),
    enabled: !!id,
  });
}
