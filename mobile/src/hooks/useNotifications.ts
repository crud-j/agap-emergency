import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from '../services/api/notifications.api';
import { useAuthStore } from '../stores/auth.store';

export function useNotificationList(page = 1) {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['notifications', page],
    queryFn: () => getNotifications(token!, page),
    enabled: !!token,
    staleTime: 20_000,
  });
}

export function useUnreadCount() {
  const token = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => getUnreadCount(),
    enabled: !!token,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: (id: string) => markRead(id, token!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.accessToken);
  return useMutation({
    mutationFn: () => markAllRead(token!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
