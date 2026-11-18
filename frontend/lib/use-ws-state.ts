'use client';

import { useState, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from './websocket';

export type WsState = 'connected' | 'connecting' | 'offline';

/**
 * Where the socket really is right now. `active` is true while Socket.IO is connecting or
 * will retry on its own; after a server-side disconnect it is false, so that reads as
 * offline instead of a "Connecting…" that never finishes.
 */
function currentState(s: Socket): WsState {
  if (s.connected) return 'connected';
  return s.active ? 'connecting' : 'offline';
}

/** Tracks the live socket connection state for display in ConnectionIndicator. */
export function useWsState(): WsState {
  const [state, setState] = useState<WsState>('connecting');

  useEffect(() => {
    const s = getSocket();
    // Read after this commit's effects: SocketProvider (a parent) starts the connection in
    // its own effect, which runs after this one.
    const initial = setTimeout(() => setState(currentState(s)), 0);

    const onConnect = () => setState('connected');
    const onDisconnect = () => setState(currentState(s));
    const onError = () => setState('offline');
    const onRetry = () => setState('connecting');

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onError);
    s.io.on('reconnect_attempt', onRetry);

    return () => {
      clearTimeout(initial);
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onError);
      s.io.off('reconnect_attempt', onRetry);
    };
  }, []);

  return state;
}
