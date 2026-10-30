import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

/** Gemini's reading of a barangay's free-text SMS reply (AI Assist, C4). */
export interface AiReading {
  status: 'SEEN' | 'ON_THE_WAY' | 'ON_SCENE' | 'HANDLED' | 'NEEDS_BACKUP' | 'UNCLEAR';
  confidence: number;
  english: string;
}

/** An open suggestion: PENDING_REVIEW can be accepted; INFO is a reading only. */
export interface AiSuggestion {
  id: string;
  kind: string;
  status: 'PENDING_REVIEW' | 'INFO';
  createdAt: string;
  reading: AiReading | null;
  /** The barangay's own words. */
  sourceText: string | null;
  receivedAt: string | null;
}

/**
 * Open AI suggestions for the incident, newest first. Empty when AI Assist is off. The
 * `ai.suggestion_created` and `barangay.notice_updated` events refresh it (socket-provider).
 */
export function useAiSuggestions(incidentId: string | null) {
  return useQuery({
    queryKey: ['ai-suggestions', incidentId],
    queryFn: () => api.get<AiSuggestion[]>(`/incidents/${incidentId}/ai-suggestions`, getToken()),
    enabled: !!incidentId,
    staleTime: 30_000,
  });
}

/** Records the reading as the barangay's report, under the dispatcher (audited). */
export function useAcceptSuggestion(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) =>
      api.post<{ id: string; status: 'ACCEPTED'; recorded: string }>(`/ai-suggestions/${suggestionId}/accept`, {}, getToken()),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['ai-suggestions', incidentId] });
      qc.invalidateQueries({ queryKey: ['incident-barangay', incidentId] });
      qc.invalidateQueries({ queryKey: ['incident', incidentId] });
    },
  });
}

/** Hides the suggestion. Changes nothing else (audited). */
export function useDismissSuggestion(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (suggestionId: string) =>
      api.post<{ id: string; status: 'DISMISSED' }>(`/ai-suggestions/${suggestionId}/dismiss`, {}, getToken()),
    onSettled: () => qc.invalidateQueries({ queryKey: ['ai-suggestions', incidentId] }),
  });
}
