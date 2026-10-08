import { TurboModuleRegistry } from 'react-native';

/**
 * True only when the MapLibre native module is present in the running binary
 * (a dev/production build that includes @maplibre/maplibre-react-native).
 *
 * MapLibre calls `TurboModuleRegistry.getEnforcing` at import time, which throws
 * a hard invariant — defeating React error boundaries — when the native module
 * is missing (Expo Go, or a dev client built before the library was added). We
 * probe with the non-throwing `get` so map screens can fall back to a placeholder
 * and never import MapLibre when it isn't available.
 */
export function isNativeMapAvailable(): boolean {
  try {
    const get = (TurboModuleRegistry as unknown as { get?: (name: string) => unknown }).get;
    if (typeof get !== 'function') return false;
    return Boolean(get('MLRNMapViewModule') || get('MLRNCameraModule'));
  } catch {
    return false;
  }
}
