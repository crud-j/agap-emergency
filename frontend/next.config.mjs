import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Keep the maplibre-gl worker in public/ in sync with the installed package.
// maplibre-gl v6 is pure ESM — Next.js webpack cannot resolve its internal
// new Worker(new URL(..., import.meta.url)) call inside node_modules.
// setWorkerUrl('/maplibre-gl-worker.mjs') in lib/maplibre-setup.ts points the
// library at this static file instead.
try {
  const src = path.join(__dirname, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
  const dest = path.join(__dirname, 'public/maplibre-gl-worker.mjs');
  const srcMtime = fs.existsSync(src) ? fs.statSync(src).mtimeMs : 0;
  const destMtime = fs.existsSync(dest) ? fs.statSync(dest).mtimeMs : 0;
  if (srcMtime > destMtime) fs.copyFileSync(src, dest);
} catch {
  // Non-fatal: e.g. in CI environments where node_modules may be absent.
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@agap/shared'],
  images: {
    domains: [],
  },
  experimental: {
    // Client-side Router Cache (Next 14.2+). By default dynamic routes aren't
    // cached (dynamic: 0), so every sidebar navigation re-fetches the RSC payload
    // and feels slow. Caching visited/prefetched pages for 30s makes re-navigating
    // between ops pages effectively instant; WebSocket events still keep the
    // underlying TanStack Query data fresh.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async rewrites() {
    return [
      // Silence the browser source-map request for the copied MapLibre worker.
      // The .map file is not bundled; this rewrite absorbs the 404 in dev.
      {
        source: '/maplibre-gl-worker.mjs.map',
        destination: '/maplibre-gl-worker.mjs',
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
