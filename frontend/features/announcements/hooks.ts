'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAnnouncementsForPublisher,
  fetchPublishedAnnouncements,
  fetchAnnouncement,
  fetchAnnouncementDelivery,
  fetchAnnouncementImageBlob,
  createAnnouncement,
  publishAnnouncement,
  scheduleAnnouncement,
  unscheduleAnnouncement,
  cancelAnnouncement,
  archiveAnnouncement,
  updateAnnouncement,
  uploadAnnouncementImage,
  fetchAnnouncementPolicy,
  fetchPendingApprovals,
  fetchApprovalImageBlob,
  submitAnnouncement,
  withdrawAnnouncement,
  approveAnnouncement,
  returnAnnouncement,
  type AnnouncementListParams,
  type CreateAnnouncementBody,
} from './api';

export function useAnnouncements(params?: AnnouncementListParams) {
  return useQuery({
    queryKey: ['announcements', 'publisher', params],
    queryFn: () => fetchAnnouncementsForPublisher(params),
    staleTime: 30_000,
  });
}

/** Public published feed used by operations surfaces that only need advisories. */
export function usePublishedAnnouncements(params?: { category?: string; barangay?: string }) {
  return useQuery({
    queryKey: ['announcements', 'published', params],
    queryFn: () => fetchPublishedAnnouncements(params),
    staleTime: 30_000,
  });
}

export function useAnnouncement(id: string | null) {
  return useQuery({
    queryKey: ['announcement', id],
    queryFn: () => fetchAnnouncement(id!),
    enabled: !!id,
  });
}

/** SMS delivery results; re-checks every 15 s while texts are still waiting on the gateway phone. */
export function useAnnouncementDelivery(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ['announcement-delivery', id],
    queryFn: () => fetchAnnouncementDelivery(id!),
    enabled: !!id && enabled,
    refetchInterval: (q) =>
      q.state.data?.some((s) => s.status === 'PENDING' || s.status === 'SENT') ? 15_000 : false,
  });
}

/**
 * Object URL for an announcement image. The Blob is cached by React Query; each
 * component owns (and revokes) its own object URL. `version` (e.g. updated_at)
 * busts the cache after a replacement upload.
 */
export function useAnnouncementImage(
  id: string | null,
  hasImage: boolean,
  version?: string,
  /** 'approval': the Supervisor's review endpoint (submissions only). */
  source: 'publisher' | 'approval' = 'publisher',
) {
  const query = useQuery({
    queryKey: ['announcement-image', id, version, source],
    queryFn: () => (source === 'approval' ? fetchApprovalImageBlob(id!) : fetchAnnouncementImageBlob(id!)),
    enabled: !!id && hasImage,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: 1,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!query.data) { setUrl(null); return; }
    const next = URL.createObjectURL(query.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [query.data]);
  return { url, isLoading: query.isLoading, isError: query.isError };
}

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ['announcements'] });
    if (id) qc.invalidateQueries({ queryKey: ['announcement', id] });
  };
}

export function useCreateAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateAnnouncementBody) => createAnnouncement(body),
    onSuccess: () => invalidate(),
  });
}

export function usePublishAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => publishAnnouncement(id),
    onSuccess: (_data, id) => invalidate(id),
  });
}

export function useScheduleAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      scheduleAnnouncement(id, scheduledAt),
    onSuccess: (_data, { id }) => invalidate(id),
  });
}

export function useUnscheduleAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => unscheduleAnnouncement(id),
    onSuccess: (_data, id) => invalidate(id),
  });
}

export function useCancelAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, correctionNote }: { id: string; correctionNote: string }) =>
      cancelAnnouncement(id, correctionNote),
    onSuccess: (_data, { id }) => invalidate(id),
  });
}

export function useArchiveAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => archiveAnnouncement(id),
    onSuccess: (_data, id) => invalidate(id),
  });
}

export function useUpdateAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CreateAnnouncementBody> }) =>
      updateAnnouncement(id, body),
    onSuccess: (_data, { id }) => invalidate(id),
  });
}

// ─── CRITICAL approval (Phase 7) ─────────────────────────────────────────────

/** Whether CRITICAL advisories go to MDRRMO; decided by the server's flag. */
export function useAnnouncementPolicy(enabled = true) {
  return useQuery({
    queryKey: ['announcements', 'policy'],
    queryFn: fetchAnnouncementPolicy,
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** Supervisor queue. Polled: the Supervisor's push needs a phone, the console does not. */
export function usePendingApprovals(enabled = true) {
  return useQuery({
    queryKey: ['announcements', 'approvals'],
    queryFn: fetchPendingApprovals,
    refetchInterval: 60_000,
    staleTime: 15_000,
    enabled,
  });
}

export function useSubmitAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt?: string }) => submitAnnouncement(id, scheduledAt),
    onSuccess: (_data, { id }) => invalidate(id),
  });
}

export function useWithdrawAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => withdrawAnnouncement(id),
    onSuccess: (_data, id) => invalidate(id),
  });
}

export function useApproveAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => approveAnnouncement(id),
    onSuccess: (_data, id) => invalidate(id),
  });
}

export function useReturnAnnouncement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => returnAnnouncement(id, note),
    onSuccess: (_data, { id }) => invalidate(id),
  });
}

export function useUploadAnnouncementImage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      uploadAnnouncementImage(id, file),
    onSuccess: (_data, { id }) => invalidate(id),
  });
}
