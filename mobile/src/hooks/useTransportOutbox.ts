import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/src/stores/auth.store';
import { useNetworkStatus } from '@/src/hooks/useNetworkStatus';
import {
  dismissOutboxDrops,
  flushTransportOutbox,
  getOutboxSnapshot,
  openOutbox,
  pendingFor,
  queueOutboxItem,
  subscribeOutbox,
  type EnqueueResult,
  type OutboxItem,
} from '@/src/services/offline/transport-outbox';

/**
 * While something waits: try again this often. "Online" can come before the server is
 * reachable (NetInfo reports it first), so one try on reconnect is not enough.
 */
export const OUTBOX_RETRY_MS = 15_000;

/** Sends what waits; after a send, the screens reload from the server (plan §19 "authoritative refresh"). */
function useOutboxFlush() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const token = useAuthStore((s) => s.accessToken);
  const qc = useQueryClient();
  return useCallback(async () => {
    if (!userId || !token) return;
    const result = await flushTransportOutbox(userId, token);
    if (!result || result.removed.length === 0) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['responder-assignment'] }),
      qc.invalidateQueries({ queryKey: ['incident-transports'] }),
      qc.invalidateQueries({ queryKey: ['fire-reports'] }),
      qc.invalidateQueries({ queryKey: ['rescue-summary'] }),
      qc.invalidateQueries({ queryKey: ['responder-assignments'] }),
      qc.invalidateQueries({ queryKey: ['responder-me'] }),
    ]);
  }, [userId, token, qc]);
}

/**
 * Mounted once in the responder layout, so the outbox is sent whichever tab is open:
 * on sign-in (items saved before the app was closed), on reconnect, and every 15 s
 * while something waits.
 */
export function useTransportOutboxSender() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { isOnline } = useNetworkStatus();
  const snapshot = useSyncExternalStore(subscribeOutbox, getOutboxSnapshot);
  const waiting = snapshot.userId === userId ? snapshot.state.items.length : 0;
  const flush = useOutboxFlush();

  useEffect(() => {
    if (userId) void openOutbox(userId);
  }, [userId]);

  useEffect(() => {
    if (!isOnline || waiting === 0) return;
    void flush();
    const timer = setInterval(() => void flush(), OUTBOX_RETRY_MS);
    return () => clearInterval(timer);
  }, [isOnline, waiting, flush]);
}

/**
 * One dispatch's transport outbox (plan §19): what is waiting, what the server
 * refused, `queue`, and `flush` ("Send now", or right after a queue).
 */
export function useTransportOutbox(dispatchId: string | undefined) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { isOnline } = useNetworkStatus();
  const snapshot = useSyncExternalStore(subscribeOutbox, getOutboxSnapshot);
  const state = snapshot.userId === userId ? snapshot.state : null;
  const pending = state && dispatchId ? pendingFor(state, dispatchId) : [];
  const drops = state && dispatchId ? state.drops.filter((d) => d.dispatchId === dispatchId) : [];
  const flush = useOutboxFlush();

  // Signed out, nothing can be saved for later; the screens need a session anyway.
  const queue = useCallback(
    async (item: OutboxItem): Promise<EnqueueResult> => (userId ? queueOutboxItem(userId, item) : 'FULL'),
    [userId],
  );

  const dismiss = useCallback(() => {
    if (userId && dispatchId) void dismissOutboxDrops(userId, dispatchId);
  }, [userId, dispatchId]);

  return { isOnline, pending, drops, queue, dismiss, flush };
}
