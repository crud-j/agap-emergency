import type { Map as MapLibreMap } from 'maplibre-gl';
import type { MapRef } from 'react-map-gl/maplibre';

const installed = new WeakSet<MapLibreMap>();

/**
 * Some configured MapLibre styles reference sprite images (e.g. "exit_2", "pet")
 * that are not in the style's sprite sheet. Resolve them with a transparent 1×1
 * placeholder so the map stays usable without a console warning per icon.
 *
 * Use as the `<Map ref>` callback: it runs as soon as the map exists, before the
 * style's first tiles ask for icons (an `onLoad` install is too late for those).
 * Idempotent per map instance.
 */
export function resolveMissingStyleImages(ref: MapRef | null): void {
  const map = ref?.getMap();
  if (!map || installed.has(map)) return;
  installed.add(map);
  map.setMissingStyleImageResolver((imageId: string) => {
    // An empty sprite reference cannot be registered as a MapLibre image; ignore it.
    if (!imageId?.trim() || map.hasImage(imageId)) return;
    map.addImage(imageId, { width: 1, height: 1, data: new Uint8Array(4) });
  });
}
