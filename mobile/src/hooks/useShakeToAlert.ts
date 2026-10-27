import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ShakeDetector } from '../services/shake-detector/shake-detector.service';

interface UseShakeToAlertOptions {
  enabled: boolean;
  hasActiveIncident: boolean;
  onShake: () => void;
}

/**
 * Keeps the accelerometer subscription scoped to the focused home screen and
 * the foreground. A shake cannot start a second report while one is active.
 */
export function useShakeToAlert({
  enabled,
  hasActiveIncident,
  onShake,
}: UseShakeToAlertOptions): void {
  const callbackRef = useRef(onShake);
  const detectorRef = useRef<ShakeDetector | null>(null);
  const focusedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    callbackRef.current = onShake;
  }, [onShake]);

  const stop = useCallback(() => {
    detectorRef.current?.stop();
    detectorRef.current = null;
  }, []);

  const sync = useCallback(() => {
    const shouldRun =
      focusedRef.current &&
      appStateRef.current === 'active' &&
      enabled &&
      !hasActiveIncident;

    if (!shouldRun) {
      stop();
      return;
    }
    if (!detectorRef.current) {
      const detector = new ShakeDetector();
      detector.start(() => callbackRef.current());
      detectorRef.current = detector;
    }
  }, [enabled, hasActiveIncident, stop]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      sync();
      return () => {
        focusedRef.current = false;
        stop();
      };
    }, [stop, sync]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
      sync();
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [stop, sync]);

  useEffect(() => {
    sync();
  }, [sync]);
}
