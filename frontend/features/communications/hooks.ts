'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMessages, postMessage, type IncidentMessage } from './api';

export function useIncidentMessages(incidentId: string | null) {
  return useQuery({
    queryKey: ['incident-messages', incidentId],
    queryFn: () => fetchMessages(incidentId!),
    enabled: !!incidentId,
    staleTime: 15_000,
  });
}

export function useSendMessage(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageText: string) => postMessage(incidentId, messageText),
    onSuccess: (msg) => {
      // Optimistically append; the WS echo is de-duplicated by id.
      qc.setQueryData<IncidentMessage[]>(['incident-messages', incidentId], (old) =>
        old && old.some((m) => m.id === msg.id) ? old : [...(old ?? []), msg],
      );
    },
  });
}
