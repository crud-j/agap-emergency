'use client';

import { useEffect } from 'react';
import { onIncidentEvent } from '@/lib/websocket';
import { getSocket } from '@/lib/websocket';
import type { AgapEventName } from '@agap/shared';

/**
 * Subscribe to a specific AGAP WebSocket event from any component.
 * The listener is automatically removed when the component unmounts.
 *
 * Use this for component-level reactions (e.g. playing a sound, showing
 * a toast) that don't fit neatly into the global Query cache updates
 * performed by SocketProvider.
 */
export function useIncidentEvent<T>(
  event: AgapEventName | string,
  handler: (payload: T) => void,
): void {
  useEffect(() => {
    const off = onIncidentEvent<T>(event, handler);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

/**
 * Join an incident-scoped WS room so the component receives events for
 * that specific incident (e.g. citizen status screen, responder view).
 * Leaves the room on unmount or when incidentId changes.
 */
export function useJoinIncidentRoom(incidentId: string | null): void {
  useEffect(() => {
    if (!incidentId) return;
    const s = getSocket();
    const join = () => s.emit('join:incident', { incidentId });
    if (s.connected) join();
    else s.once('connect', join);
    return () => {
      s.emit('leave:incident', { incidentId });
    };
  }, [incidentId]);
}
