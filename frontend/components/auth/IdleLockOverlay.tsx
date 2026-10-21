'use client';

import { useEffect, useRef, useState, type JSX } from 'react';
import { getSessionUser, setSession } from '@/lib/auth';
import { mfaRequest } from '@/lib/mfa';

const IDLE_MS: Record<string, number> = {
  SYSTEM_ADMINISTRATOR: 15 * 60_000,
  default: 60 * 60_000,
};
const DEFAULT_IDLE_MS = 60 * 60_000;

export function IdleLockOverlay(): JSX.Element | null {
  const user = getSessionUser();
  const timeout = IDLE_MS[user?.role ?? 'default'] ?? DEFAULT_IDLE_MS;
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    const markActivity = () => {
      if (!locked) lastActivity.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'mousemove', 'touchstart'];
    const requireStepUp = () => setLocked(true);
    events.forEach((event) => window.addEventListener(event, markActivity, { passive: true }));
    window.addEventListener('agap-step-up-required', requireStepUp);
    const timer = window.setInterval(() => {
      if (!locked && Date.now() - lastActivity.current >= timeout) setLocked(true);
    }, 5_000);
    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, markActivity));
      window.removeEventListener('agap-step-up-required', requireStepUp);
    };
  }, [locked, timeout]);

  if (!locked) return null;

  async function unlock(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const session = await mfaRequest<{ accessToken: string; user: NonNullable<typeof user> }>(
        '/auth/step-up',
        { method: 'POST', body: { password }, auth: true },
      );
      setSession(session);
      lastActivity.current = Date.now();
      setPassword('');
      setLocked(false);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to unlock the console');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-6" role="dialog" aria-modal="true">
      <form onSubmit={(event) => { event.preventDefault(); void unlock(); }} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-agap-green">AGAP console locked</p>
        <h2 className="mt-2 text-xl font-bold text-slate-900">Unlock to continue</h2>
        <p className="mt-2 text-sm text-slate-600">Your session was locked after inactivity. New incident alerts continue in the background.</p>
        <label className="mt-5 block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            required
          />
        </label>
        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !password} className="mt-5 w-full rounded-lg bg-[#126247] px-4 py-2 font-semibold text-white disabled:opacity-60">
          {busy ? 'Unlocking…' : 'Unlock console'}
        </button>
      </form>
    </div>
  );
}
