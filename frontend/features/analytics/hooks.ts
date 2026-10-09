'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchResponseTimes,
  fetchVolume,
  fetchSlaCompliance,
  fetchFalseAlertRate,
  fetchDailySummary,
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
