'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSlaPolicies, updateSlaPolicy, type SlaPolicyUpdate } from './api';

export function useSlaPolicies() {
  return useQuery({
    queryKey: ['sla-policies'],
    queryFn: fetchSlaPolicies,
    staleTime: 5 * 60_000,
  });
}

export function useUpdateSlaPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SlaPolicyUpdate }) => updateSlaPolicy(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sla-policies'] });
      // Compliance figures are measured against these targets.
      qc.invalidateQueries({ queryKey: ['analytics-sla-compliance'] });
    },
  });
}
