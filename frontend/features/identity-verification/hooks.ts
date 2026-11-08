'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IdCardReleaseReason, IdDocumentType, IdRejectionReason } from '@agap/shared';
import {
  approveIdReview,
  fetchIdImage,
  fetchIdReviews,
  findIdCardHolder,
  rejectIdReview,
  releaseIdCard,
  type IdReviewParams,
} from './api';

const QUEUE_KEY = 'id-reviews';

export function useIdReviews(params?: IdReviewParams) {
  return useQuery({
    queryKey: [QUEUE_KEY, params],
    queryFn: () => fetchIdReviews(params),
    staleTime: 15_000,
  });
}

/**
 * The ID image as an object URL, fetched only after `show()` (the reviewer's click). Each fetch
 * is audited server-side, so it is never retried automatically or refetched on focus. Each
 * `show()` or `hide()` starts a new query key: showing again, or after an error, is a new audited
 * request, and hiding drops the image from memory (gcTime 0). The URL is revoked on hide and unmount.
 */
export function useIdImage(id: string) {
  const [request, setRequest] = useState({ count: 0, enabled: false });
  const { enabled } = request;
  const query = useQuery({
    queryKey: ['id-review-image', id, request.count],
    queryFn: () => fetchIdImage(id),
    enabled,
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const show = () => setRequest((r) => ({ count: r.count + 1, enabled: true }));
  const hide = () => setRequest((r) => ({ count: r.count + 1, enabled: false }));

  const [url, setUrl] = useState<string | null>(null);
  const blob = enabled ? query.data : undefined;
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return { url, isLoading: enabled && query.isFetching, error: enabled ? query.error : null, show, hide };
}

/** gcTime 0: a card number typed for approval isn't kept in the mutation cache. */
export function useApproveIdReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cardNumber }: { id: string; cardNumber?: string | undefined }) => approveIdReview(id, cardNumber),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [QUEUE_KEY] }),
    gcTime: 0,
  });
}

/** gcTime 0: the number typed from the card isn't kept in the mutation cache. */
export function useFindIdCardHolder() {
  return useMutation({
    mutationFn: ({ pin, documentType }: { pin: string; documentType: IdDocumentType }) => findIdCardHolder(pin, documentType),
    gcTime: 0,
  });
}

export function useReleaseIdCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: IdCardReleaseReason }) => releaseIdCard(id, reason),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [QUEUE_KEY] }),
  });
}

export function useRejectIdReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: IdRejectionReason }) => rejectIdReview(id, reason),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [QUEUE_KEY] }),
  });
}
