'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from './api';
import { onIncidentEvent } from '@/lib/websocket';

export function useNotifications(page = 1) {
  return useQuery({
    queryKey: ['notifications', page],
    queryFn: () => fetchNotifications(page),
    staleTime: 20_000,
  });
}

export function useUnreadCount() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    staleTime: 20_000,
    refetchInterval: 60_000,
  });

  // Bump the unread count + invalidate list when the server pushes a new notification
  useEffect(() => {
    return onIncidentEvent('notification.created', () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    });
  }, [qc]);

  return query;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
