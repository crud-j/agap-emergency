'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchResponseTimes,
  fetchVolume,
  fetchSlaCompliance,
  fetchFalseAlertRate,
  fetchDailySummary,
  fetchMunicipalOverview,
  fetchDispatchSummary,
  type AnalyticsRange,
} from './api';

export function useResponseTimes(range: AnalyticsRange) {
  return useQuery({
    queryKey: ['analytics-response-times', range],
    queryFn: () => fetchResponseTimes(range),
    staleTime: 60_000,
  });
}

export function useVolume(range: AnalyticsRange) {
  return useQuery({
    queryKey: ['analytics-volume', range],
    queryFn: () => fetchVolume(range),
    staleTime: 60_000,
  });
}

export function useSlaCompliance(range: AnalyticsRange) {
  return useQuery({
    queryKey: ['analytics-sla-compliance', range],
    queryFn: () => fetchSlaCompliance(range),
    staleTime: 60_000,
  });
}

export function useFalseAlertRate(range: AnalyticsRange) {
  return useQuery({
    queryKey: ['analytics-false-alert-rate', range],
    queryFn: () => fetchFalseAlertRate(range),
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

/** Dispatcher dashboard counts; SocketProvider invalidates on incident and dispatch events. */
export function useDispatchSummary() {
  return useQuery({
    queryKey: ['dispatch-summary'],
    queryFn: fetchDispatchSummary,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
