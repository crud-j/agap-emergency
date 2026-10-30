'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSurgeState,
  activateSurge,
  deactivateSurge,
  fetchTriageTags,
  fetchSurgeResources,
  sendSurgeBroadcast,
  fetchSurgeRules,
  updateSurgeRule,
  fetchRiverLevel,
  setRiverLevel,
  type ActivateSurgeBody,
  type SurgeRecommendationData,
  type SurgeRuleChanges,
} from './api';
import { useNotifications } from '@/features/notifications/hooks';
import type { AppNotification } from '@/features/notifications/api';

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

/** Only meaningful during an active surge: the backend answers 400 "No active surge incident" otherwise. */
export function useTriageTags(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['surge-triage'],
    queryFn: fetchTriageTags,
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: opts?.enabled ?? true,
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

// ─── Surge recommendation (AUTOMATION_NEEDS_PLAN Phase 2, C2) ────────────────

/** Supervisor only: the backend answers 403 for other roles. */
export function useSurgeRules(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['surge-rules'],
    queryFn: fetchSurgeRules,
    staleTime: 60_000,
    enabled: opts?.enabled ?? true,
  });
}

export function useUpdateSurgeRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: SurgeRuleChanges }) => updateSurgeRule(id, changes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['surge-rules'] }),
  });
}

export function useRiverLevel() {
  return useQuery({
    queryKey: ['surge-river-level'],
    queryFn: fetchRiverLevel,
    staleTime: 60_000,
  });
}

export function useSetRiverLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meters: number) => setRiverLevel(meters),
    onSuccess: (data) => qc.setQueryData(['surge-river-level'], data),
  });
}

/** A recommendation older than this no longer shows as a banner (the notice stays in the bell). */
const RECOMMENDATION_BANNER_MS = 3 * 60 * 60 * 1000;

export interface SurgeRecommendation {
  notification: AppNotification;
  data: SurgeRecommendationData;
}

/**
 * The newest unread SURGE_RECOMMENDED notice from the last 3 hours, if any. The
 * `surge.recommended` event refreshes the notifications list (socket-provider.tsx).
 */
export function useSurgeRecommendation(): SurgeRecommendation | null {
  const notifications = useNotifications(1);
  const latest = (notifications.data?.data ?? [])
    .filter((n) => n.event_type === 'SURGE_RECOMMENDED' && n.status === 'PENDING')
    .filter((n) => Date.now() - new Date(n.created_at).getTime() < RECOMMENDATION_BANNER_MS)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!latest || !latest.data_payload || typeof latest.data_payload.ruleKey !== 'string') return null;
  return { notification: latest, data: latest.data_payload as unknown as SurgeRecommendationData };
}
