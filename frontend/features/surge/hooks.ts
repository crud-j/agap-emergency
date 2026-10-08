'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSurgeState,
  activateSurge,
  deactivateSurge,
  type ActivateSurgeBody,
} from './api';

export function useSurgeState() {
  return useQuery({
    queryKey: ['surge-state'],
    queryFn: fetchSurgeState,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useActivateSurge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ActivateSurgeBody) => activateSurge(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surge-state'] }),
  });
}

export function useDeactivateSurge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deactivateSurge,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surge-state'] }),
  });
}
