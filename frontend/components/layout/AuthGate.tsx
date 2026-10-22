'use client';

import { useCallback, useEffect, useState, type JSX, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { redirectToLogin, refreshSession } from '@/lib/session';
import { useAuthUser } from '@/lib/use-auth';
import { canOpen } from '@/lib/role-access';
import { IdleLockOverlay } from '@/components/auth/IdleLockOverlay';

type GateState = 'checking' | 'ready' | 'unavailable';

/**
 * Restores the in-memory session (from the HttpOnly refresh cookie) before any
 * Operations Center page renders, and scopes hospital users to their portal.
 * The backend still enforces every permission; this only shapes navigation.
 */
export function AuthGate({ children }: { children: ReactNode }): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthUser();
  const [state, setState] = useState<GateState>(() => (getToken() ? 'ready' : 'checking'));

  const restore = useCallback(async () => {
    setState('checking');
    const result = await refreshSession();
    if (result === 'ok') setState('ready');
    else if (result === 'unauthenticated') redirectToLogin();
    else setState('unavailable');
  }, []);

  useEffect(() => {
    if (!getToken()) void restore();
  }, [restore]);

  // Backend unreachable: keep retrying in the background (never fail silently).
  useEffect(() => {
    if (state !== 'unavailable') return;
    const timer = setTimeout(() => void restore(), 10_000);
    return () => clearTimeout(timer);
  }, [state, restore]);

  // Signed out in another tab / session ended: leave the console.
  useEffect(() => {
    if (state === 'ready' && !user && !getToken()) redirectToLogin();
  }, [state, user]);

  // Hospital users have no other console pages, so anything outside their portal
  // (and /account, their own sign-in security) goes straight back to it. Other roles
  // get RouteGuard's "Not available for your role" panel instead.
  useEffect(() => {
    if (user?.role === 'HOSPITAL_USER' && !canOpen(user.role, pathname)) {
      router.replace('/hospitals');
    }
  }, [user, pathname, router]);

  useEffect(() => {
    if (user?.mustChangePassword && pathname !== '/login/change-password') {
      router.replace('/login/change-password');
    }
  }, [user, pathname, router]);

  if (state === 'ready' && user?.mustChangePassword && pathname !== '/login/change-password') {
    return (
      <div className="flex h-screen items-center justify-center bg-agap-pearl p-6" aria-live="polite">
        <p className="text-sm text-slate-600">Redirecting to the required password change…</p>
      </div>
    );
  }

  if (state === 'ready') return <><>{children}</><IdleLockOverlay /></>;

  return (
    <div className="flex h-screen items-center justify-center bg-agap-pearl p-6" aria-live="polite">
      <div className="max-w-sm rounded-2xl border border-agap-track/60 bg-white p-6 text-center shadow-card">
        {state === 'checking' ? (
          <p className="text-sm text-slate-600">Restoring your session…</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-800">Cannot reach the AGAP server</p>
            <p className="mt-2 text-sm text-slate-600">
              Retrying automatically. For emergencies, use the MDRRMO hotline while the
              connection is down.
            </p>
            <button
              type="button"
              onClick={() => void restore()}
              className="mt-4 rounded-lg bg-[#126247] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0F543D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40"
            >
              Retry now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
