'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAnnouncements,
  fetchAnnouncement,
  createAnnouncement,
  publishAnnouncement,
  archiveAnnouncement,
  type AnnouncementListParams,
  type CreateAnnouncementBody,
} from './api';

export function useAnnouncements(params?: AnnouncementListParams) {
  return useQuery({
    queryKey: ['announcements', params],
    queryFn: () => fetchAnnouncements(params),
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

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAnnouncementBody) => createAnnouncement(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function usePublishAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishAnnouncement(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcement', id] });
    },
  });
}

export function useArchiveAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveAnnouncement(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcement', id] });
    },
  });
}
