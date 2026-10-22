'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchOversightSummary,
  fetchWorkload,
  fetchExceptions,
  fetchPendingHandovers,
  fetchMajorIncidents,
  fetchActivity,
} from './api';

// All under ['oversight', …] so SocketProvider can refresh them in one call on
// incident, dispatch and escalation events. The poll is the fallback for missed events
// and for clock-driven changes (an incident crossing the waiting threshold).

export function useOversightSummary() {
  return useQuery({
    queryKey: ['oversight', 'summary'],
    queryFn: fetchOversightSummary,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useWorkload() {
  return useQuery({
    queryKey: ['oversight', 'workload'],
    queryFn: fetchWorkload,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useExceptions() {
  return useQuery({
    queryKey: ['oversight', 'exceptions'],
    queryFn: fetchExceptions,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function usePendingHandovers() {
  return useQuery({
    queryKey: ['oversight', 'handovers'],
    queryFn: fetchPendingHandovers,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ['oversight', 'activity'],
    queryFn: fetchActivity,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function useMajorIncidents() {
  return useQuery({
    queryKey: ['oversight', 'major-incidents'],
    queryFn: fetchMajorIncidents,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
