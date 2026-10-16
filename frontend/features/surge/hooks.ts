'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSurgeState,
  activateSurge,
  deactivateSurge,
  fetchTriageTags,
  fetchSurgeResources,
  sendSurgeBroadcast,
  type ActivateSurgeBody,
} from './api';

export function useSurgeState(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['surge-state'],
    queryFn: fetchSurgeState,
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: opts?.enabled ?? true,
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
    mutationFn: (surgeId: string) => deactivateSurge(surgeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surge-state'] }),
  });
}

export function useTriageTags() {
  return useQuery({
    queryKey: ['surge-triage'],
    queryFn: fetchTriageTags,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useSurgeResources() {
  return useQuery({
    queryKey: ['surge-resources'],
    queryFn: fetchSurgeResources,
    staleTime: 30_000,
  });
}

export function useSurgeBroadcast() {
  return useMutation({
    mutationFn: (body: { surgeId: string; message: string }) => sendSurgeBroadcast(body),
  });
}
