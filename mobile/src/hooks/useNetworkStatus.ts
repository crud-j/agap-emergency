import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

interface NetworkState {
  isOnline: boolean;
}

// Module-level shared state — avoids a Context provider for a singleton concern.
const subscribers = new Set<(s: NetworkState) => void>();
let sharedState: NetworkState = { isOnline: true };

function broadcast(patch: Partial<NetworkState>) {
  sharedState = { ...sharedState, ...patch };
  subscribers.forEach((fn) => fn(sharedState));
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
