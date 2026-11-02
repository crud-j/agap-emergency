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

const backendUrl = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3000';

// In dev (and with PROXY_API=true) the browser calls the API and Socket.io on the web app's
// own origin, and Next forwards them to the backend. One address then works from
// localhost and through a tunnel (scripts/dev/share.ps1) at the same time. It has to be
// one origin: the web refresh cookie is SameSite=Strict, and two tunnel hostnames are two sites.
// A production build keeps using NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL.
const proxyApi = process.env.NODE_ENV !== 'production' || process.env.PROXY_API === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empty base URL = same origin. Overrides any NEXT_PUBLIC_API_URL from .env files.
  ...(proxyApi ? { env: { NEXT_PUBLIC_API_URL: '', NEXT_PUBLIC_WS_URL: '' } } : {}),
  // Socket.io's path ends in a slash (/socket.io/?EIO=4…); Next would redirect it away.
  ...(proxyApi ? { skipTrailingSlashRedirect: true } : {}),
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
      // The barangay status page (/b/<token>, opened from the alert SMS) talks to these two
      // public endpoints through the web app's own origin. That way a single public address
      // (a Cloudflare tunnel, or the production domain) is enough: no CORS, and nothing else
      // of the API is exposed through it.
      {
        source: '/v1/public/barangay/:path*',
        destination: `${backendUrl}/v1/public/barangay/:path*`,
      },
      ...(proxyApi
        ? [
            { source: '/v1/:path*', destination: `${backendUrl}/v1/:path*` },
            // Exact path: a :path* rule would drop the trailing slash Socket.io requires.
            { source: '/socket.io/', destination: `${backendUrl}/socket.io/` },
          ]
        : []),
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
