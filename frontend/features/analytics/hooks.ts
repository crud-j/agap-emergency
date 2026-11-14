'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAiSummary,
  generateAiSummary,
  reviewAiSummary,
  type AiSummaryState,
  type GenerateAiSummaryResult,
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
/**
 * Socket events refresh the counts as they happen; the interval only rolls the 24 h
 * windows forward. Callers pass a shorter one while the socket is down.
 */
export function useDispatchSummary(opts?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ['dispatch-summary'],
    queryFn: fetchDispatchSummary,
    staleTime: 15_000,
    refetchInterval: opts?.refetchInterval ?? 60_000,
  });
}

const aiSummaryKey = (range: AnalyticsRange) => ['analytics-ai-summary', range] as const;

/** The latest AI summary for a period of this length, and whether AI is on (MOD-50). */
export function useAiSummary(range: AnalyticsRange) {
  return useQuery({
    queryKey: aiSummaryKey(range),
    queryFn: () => fetchAiSummary(range),
    staleTime: 60_000,
    // The card is optional: a failure here just hides it.
    retry: false,
  });
}

/** Writes a summary of the range. TOO_FEW and FAILED come back as results, not errors. */
export function useGenerateAiSummary(range: AnalyticsRange) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => generateAiSummary(range),
    onSuccess: (result: GenerateAiSummaryResult) => {
      if (result.outcome === 'CREATED' || result.outcome === 'REUSED') {
        qc.setQueryData<AiSummaryState>(aiSummaryKey(range), { enabled: true, summary: result.summary });
      }
    },
  });
}

/** Accept (reviewed, fit for reports) or dismiss. Both are audited on the server. */
export function useReviewAiSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'dismiss' }) => reviewAiSummary(id, action),
    onSettled: () => qc.invalidateQueries({ queryKey: ['analytics-ai-summary'] }),
  });
}
