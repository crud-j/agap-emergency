'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchResponseTimes,
  fetchVolume,
  fetchSlaCompliance,
  fetchFalseAlertRate,
  fetchDailySummary,
  fetchMunicipalOverview,
} from './api';

export function useResponseTimes() {
  return useQuery({
    queryKey: ['analytics-response-times'],
    queryFn: fetchResponseTimes,
    staleTime: 60_000,
  });
}

export function useVolume() {
  return useQuery({
    queryKey: ['analytics-volume'],
    queryFn: fetchVolume,
    staleTime: 60_000,
  });
}

export function useSlaCompliance() {
  return useQuery({
    queryKey: ['analytics-sla-compliance'],
    queryFn: fetchSlaCompliance,
    staleTime: 60_000,
  });
}

export function useFalseAlertRate() {
  return useQuery({
    queryKey: ['analytics-false-alert-rate'],
    queryFn: fetchFalseAlertRate,
    staleTime: 60_000,
  });
}

export function useDailySummary(date?: string) {
  return useQuery({
    queryKey: ['analytics-daily', date],
    queryFn: () => fetchDailySummary(date),
    staleTime: 60_000,
  });
}

/**
 * Municipal overview counts. Polls every 60 s: the LGU account is not in the ops
 * socket room, so it gets no incident events. For Dispatcher and Supervisor the
 * SocketProvider also invalidates this on incident.created / status_changed.
 */
export function useMunicipalOverview() {
  return useQuery({
    queryKey: ['municipal-overview'],
    queryFn: fetchMunicipalOverview,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
