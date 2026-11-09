'use client';

import { useEffect, useRef } from 'react';
import { useAuthUser } from '@/lib/use-auth';
import { navForRole } from '@/lib/role-access';

/**
 * Background helpers that make moving between console pages smoother. Renders nothing.
 *
 * - Development: starts public/route-warmup-worker.js once per sign-in, which asks the
 *   dev server to compile the role's sidebar pages ahead of the first click.
 * - Production: registers public/sw.js, which caches only the build's static files
 *   (scripts, styles, icons). Pages, API data and live updates are never cached.
 *   In development any old registration is removed so it never serves stale code.
 */
export function PerformanceWorkers(): null {
  const user = useAuthUser();
  const warmedFor = useRef<string | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Optional: the console works the same without it.
      });
    } else {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          if (reg.active?.scriptURL.endsWith('/sw.js')) void reg.unregister();
        }
      });
    }
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || typeof Worker === 'undefined' || !user?.role) return;
    const key = `${user.role}:${user.orgType ?? ''}`;
    if (warmedFor.current === key) return;

    const here = window.location.pathname;
    const routes = [...new Set(navForRole(user.role, user.orgType).flatMap((g) => g.items.map((i) => i.href)))].filter(
      (href) => href !== here,
    );
    if (!routes.length) return;

    let worker: Worker | null = null;
    // Start after the current page has settled, so its own compile and data load go first.
    const timer = window.setTimeout(() => {
      try {
        // Marked here, not before the timer: React strict mode (dev) runs this effect
        // twice and the first run's timer is cancelled.
        warmedFor.current = key;
        worker = new Worker('/route-warmup-worker.js');
        worker.postMessage({ routes });
      } catch {
        worker = null;
      }
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      worker?.terminate();
    };
  }, [user?.role, user?.orgType]);

  return null;
}
