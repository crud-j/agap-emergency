'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchAnnouncementsForPublisher,
  fetchAnnouncement,
  createAnnouncement,
  publishAnnouncement,
  scheduleAnnouncement,
  archiveAnnouncement,
  updateAnnouncement,
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

export function useScheduleAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      scheduleAnnouncement(id, scheduledAt),
    onSuccess: (_data, { id }) => {
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

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CreateAnnouncementBody> }) =>
      updateAnnouncement(id, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcement', id] });
    },
  });
}
