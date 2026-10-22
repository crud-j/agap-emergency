'use client';

import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getSessionUser, getToken } from '@/lib/auth';
import { mfaRequest, type MfaStatus } from '@/lib/mfa';
import { logout, redirectToLogin, refreshSession } from '@/lib/session';
import { landingForRole, safeNextPath } from '@/lib/post-login';
import { useAuthUser } from '@/lib/use-auth';

type PageState = 'checking' | 'ready' | 'unavailable';

export default function ChangePasswordPage(): JSX.Element {
  const router = useRouter();
  const user = useAuthUser();
  const [state, setState] = useState<PageState>('checking');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function restore(): Promise<void> {
      const result = getToken() ? 'ok' : await refreshSession();
      if (cancelled) return;
      if (result === 'unauthenticated') {
        redirectToLogin();
        return;
      }
      if (result === 'unavailable') {
        setState('unavailable');
        return;
      }
      const sessionUser = getSessionUser();
      if (!sessionUser) {
        redirectToLogin();
      } else if (!sessionUser.mustChangePassword) {
        router.replace(landingForRole(sessionUser.role));
      } else {
        setState('ready');
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    if (Array.from(newPassword).length < 12 || Array.from(newPassword).length > 128) {
      setError('Use a password between 12 and 128 characters.');
      return;
    }

    const token = getToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword }, token);
      const refreshed = await refreshSession();
      if (refreshed !== 'ok' || getSessionUser()?.mustChangePassword) {
        throw new Error('Password changed, but your session could not be refreshed. Sign in again.');
      }
      const destination = safeNextPath() ?? landingForRole(user?.role);
      // Offer (never force) a second step right after the new password is set.
      let offerSetup = false;
      try {
        const mfa = await mfaRequest<MfaStatus>('/auth/mfa/status', { method: 'GET', auth: true });
        offerSetup = !mfa.totp && mfa.passkeys === 0;
      } catch {
        // Status unavailable: skip the offer rather than block the console.
      }
      router.replace(
        offerSetup ? `/login/setup-passkey?next=${encodeURIComponent(destination)}` : destination,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error
        ? cause.message
        : 'Unable to change password. Please try again.');
      setSaving(false);
    }
  }

  if (state !== 'ready') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-agap-pearl p-6">
        <div className="w-full max-w-md rounded-2xl border border-agap-track/60 bg-white p-7 text-center shadow-card">
          {state === 'checking' ? (
            <p className="text-sm text-slate-600">Restoring your session…</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-800">Cannot reach the AGAP server</p>
              <p className="mt-2 text-sm text-slate-600">Reconnect to change your password.</p>
              <button
                type="button"
                onClick={() => {
                  setState('checking');
                  void refreshSession().then((result) => {
                    if (result === 'ok') {
                      const sessionUser = getSessionUser();
                      if (!sessionUser) redirectToLogin();
                      else if (!sessionUser.mustChangePassword) router.replace(landingForRole(sessionUser.role));
                      else setState('ready');
                    }
                    else if (result === 'unauthenticated') redirectToLogin();
                    else setState('unavailable');
                  });
                }}
                className="mt-4 rounded-lg bg-[#126247] px-4 py-2 text-sm font-semibold text-white"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-agap-pearl p-6">
      <section className="w-full max-w-md rounded-2xl border border-agap-track/60 bg-white p-7 shadow-card">
        <p className="text-xs font-bold tracking-[0.16em] text-[#126247]">AGAP · ACCOUNT SECURITY</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Change your password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Set a new password before continuing to the Operations Center.
        </p>
        <button
          type="button"
          onClick={() => {
            void logout().then(() => router.replace('/login'));
          }}
          className="mt-3 text-sm font-medium text-[#126247] underline"
        >
          Sign out
        </button>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
            <li>Use 12–128 characters; no character-composition rules are required.</li>
            <li>Avoid common passwords and anything containing your name, email, AGAP, or Bocaue.</li>
          </ul>

          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-[#126247] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </section>
    </main>
  );
}
