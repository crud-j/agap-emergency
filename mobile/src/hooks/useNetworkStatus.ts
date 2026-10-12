import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export type SyncState = 'idle' | 'syncing' | 'synced';

interface NetworkState {
  isOnline: boolean;
  syncState: SyncState;
  syncedCount: number;
}

// Module-level shared state — avoids a Context provider for a singleton concern.
const subscribers = new Set<(s: NetworkState) => void>();
let sharedState: NetworkState = { isOnline: true, syncState: 'idle', syncedCount: 0 };
let resetTimer: ReturnType<typeof setTimeout> | null = null;

function broadcast(patch: Partial<NetworkState>) {
  sharedState = { ...sharedState, ...patch };
  subscribers.forEach((fn) => fn(sharedState));
}

/** Call when a queue flush begins so the banner switches to "syncing". */
export function notifySyncing() {
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
  broadcast({ syncState: 'syncing', syncedCount: 0 });
}

/**
 * Call when a queue flush finishes.
 * count > 0  → shows success banner for 3 s, then resets.
 * count === 0 → silently resets (nothing was sent, no banner flash).
 */
export function notifySynced(count: number) {
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
  if (count > 0) {
    broadcast({ syncState: 'synced', syncedCount: count });
    resetTimer = setTimeout(() => {
      broadcast({ syncState: 'idle', syncedCount: 0 });
      resetTimer = null;
    }, 3000);
  } else {
    broadcast({ syncState: 'idle', syncedCount: 0 });
  }
}

export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>(sharedState);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const unsubNetInfo = NetInfo.addEventListener((netState) => {
      if (!mountedRef.current) return;
      const isOnline =
        netState.isConnected === true && netState.isInternetReachable !== false;
      broadcast({ isOnline });
    });

    const subscriber = (s: NetworkState) => {
      if (mountedRef.current) setState(s);
    };
    subscribers.add(subscriber);

    return () => {
      mountedRef.current = false;
      unsubNetInfo();
      subscribers.delete(subscriber);
    };
  }, []);

  return state;
}
