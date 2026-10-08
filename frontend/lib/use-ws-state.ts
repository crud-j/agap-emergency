'use client';

import { useState, useEffect } from 'react';
import { getSocket } from './websocket';

export type WsState = 'connected' | 'connecting' | 'offline';

/** Tracks the live socket connection state for display in ConnectionIndicator. */
export function useWsState(): WsState {
  const [state, setState] = useState<WsState>('connecting');

  useEffect(() => {
    const s = getSocket();
    if (s.connected) setState('connected');

    const onConnect = () => setState('connected');
    const onDisconnect = () => setState('offline');
    const onError = () => setState('offline');

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onError);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('connect_error', onError);
    };
  }, []);

  return state;
}
