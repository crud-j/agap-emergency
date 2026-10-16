import { setWorkerUrl } from 'maplibre-gl';

// maplibre-gl v6 is pure ESM with a separate worker file. Next.js webpack
// cannot resolve new Worker(new URL(..., import.meta.url)) inside node_modules,
// so we point the library at the static copy in public/ instead.
// The file is kept in sync by next.config.mjs at server start.
if (typeof window !== 'undefined') {
  setWorkerUrl('/maplibre-gl-worker.mjs');
}
