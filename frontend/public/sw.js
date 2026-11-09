/* AGAP — Operations Center service worker (production builds only).
 *
 * Purpose: make repeat page loads faster by serving the app's static files from a
 * local cache. Scope is deliberately narrow:
 *
 *   /_next/static/* with a hashed name: cache-first, the file never changes.
 *   /assets/*, /map-icons/*, root-level images, the MapLibre worker:
 *                     stale-while-revalidate: served from cache, refreshed in the background.
 *
 * Everything else goes straight to the network and is never cached:
 * pages, API calls (/v1/*), Socket.io, auth, uploads. Incident data must always be
 * live, so this worker never serves an old page or an old API response.
 */
const STATIC_CACHE = 'agap-static-v1';
const ASSET_CACHE = 'agap-assets-v1';
const KNOWN_CACHES = [STATIC_CACHE, ASSET_CACHE];
const MAX_STATIC_ENTRIES = 400;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('agap-') && !KNOWN_CACHES.includes(n)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// Only files whose name carries a content hash (production build output, e.g.
// chunks/6703-aed28dea5614255b.js, css/0a1b2c3d4e5f6a7b.css). `next dev` serves unhashed
// names (chunks/webpack.js, app/layout.css?v=…) on the same origin, and those change on
// every edit, so they are never cached: switching between `pnpm demo` and `pnpm dev`
// on localhost:3001 or the tunnel address can't serve old code.
// The build-id folder (_buildManifest.js, _ssgManifest.js) is unique per build too.
const HASHED_FILE = /\/(?:[^/]*-)?[0-9a-f]{12,}[^/]*\.(js|css|woff2?|ttf|png|svg|jpg|webp)$/;

function isHashedStatic(url) {
  const p = url.pathname;
  if (!p.startsWith('/_next/static/') || url.search) return false;
  if (p.includes('hot-update') || p.startsWith('/_next/static/development/')) return false;
  return HASHED_FILE.test(p) || /^\/_next\/static\/[A-Za-z0-9_-]{16,}\/_(build|ssg)Manifest\.js$/.test(p);
}

function isPublicAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/map-icons/') ||
    url.pathname === '/maplibre-gl-worker.mjs' ||
    /^\/[^/]+\.(png|svg|ico|webp)$/.test(url.pathname)
  );
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    await cache.put(request, res.clone());
    void trim(STATIC_CACHE, MAX_STATIC_ENTRIES);
  }
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then(async (res) => {
      if (res.ok && res.type === 'basic') await cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) return hit;
  const res = await refresh;
  return res || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHashedStatic(url)) {
    event.respondWith(cacheFirst(request));
  } else if (isPublicAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Anything else: not intercepted, the browser fetches it normally.
});
