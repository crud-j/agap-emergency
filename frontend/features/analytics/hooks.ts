'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchAnalyticsOverview,
  fetchResponseTimes,
  fetchVolumeByCategory,
  fetchVolumeByBarangay,
  fetchSlaStats,
  type AnalyticsParams,
} from './api';

export function useAnalyticsOverview(params?: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics-overview', params],
    queryFn: () => fetchAnalyticsOverview(params),
    staleTime: 60_000,
  });
}

export function useResponseTimes(params?: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics-response-times', params],
    queryFn: () => fetchResponseTimes(params),
    staleTime: 60_000,
  });
}

export function useVolumeByCategory(params?: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics-volume-category', params],
    queryFn: () => fetchVolumeByCategory(params),
    staleTime: 60_000,
  });
}

export function useVolumeByBarangay(params?: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics-volume-barangay', params],
    queryFn: () => fetchVolumeByBarangay(params),
    staleTime: 60_000,
  });
}

export function useSlaStats(params?: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics-sla', params],
    queryFn: () => fetchSlaStats(params),
    staleTime: 60_000,
  });
}
