'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchResponders,
  fetchResponder,
  updateResponderStatus,
  type ResponderListParams,
} from './api';

export function useResponders(params?: ResponderListParams, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['responders', params],
    queryFn: () => fetchResponders(params),
    staleTime: 30_000,
    enabled: opts?.enabled ?? true,
  });
}

export function useResponder(id: string | null) {
  return useQuery({
    queryKey: ['responder', id],
    queryFn: () => fetchResponder(id!),
    enabled: !!id,
  });
}

export function useUpdateResponderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateResponderStatus(id, status),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['responders'] });
      qc.invalidateQueries({ queryKey: ['responder', id] });
      qc.invalidateQueries({ queryKey: ['available-units'] });
    },
  });
}
