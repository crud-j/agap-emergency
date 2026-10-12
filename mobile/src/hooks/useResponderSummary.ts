import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ResponderAvailability } from '@agap/shared';
import { useAuthStore } from '../stores/auth.store';
import {
  getMySummary,
  updateMyAvailability,
  type ResponderSummary,
  type UpdateAvailabilityResponse,
} from '../services/api/responders.api';

/**
 * Server state for the authenticated responder's identity, availability, and
 * active assignment count. Query key `['responder-me']`.
 */
export function useResponderSummary() {
  const token = useAuthStore((s) => s.accessToken);

  return useQuery<ResponderSummary, Error>({
    queryKey: ['responder-me'],
    queryFn: () => getMySummary(token as string),
    enabled: Boolean(token),
    // Poll so the profile self-heals if the backend was starting when the app
    // first loaded, without requiring a manual retry tap.
    refetchInterval: 30_000,
  });
}

/**
 * Mutation for `PATCH /v1/responders/me/availability`. On success, invalidates
 * `['responder-me']` so the confirmed status is refetched from the server.
 * Duty changes require an online request — do not queue on offline.
 */
export function useUpdateAvailability() {
  const token = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();

  return useMutation<
    UpdateAvailabilityResponse,
    Error,
    { status: ResponderAvailability }
  >({
    mutationFn: ({ status }) => updateMyAvailability(status, token as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['responder-me'] });
    },
  });
}
