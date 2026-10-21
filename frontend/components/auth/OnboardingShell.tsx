'use client';

import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/hooks/use-translations';
import { getSessionUser, getToken, type SessionUser } from '@/lib/auth';
import { mfaRequest, type MfaStatus } from '@/lib/mfa';
import { redirectToLogin, refreshSession } from '@/lib/session';

export type OnboardingStep = 'passkey' | 'authenticator';

const STEP_ORDER = ['password', 'passkey', 'authenticator', 'dashboard'] as const;

/**
 * Restores the session for an onboarding page and loads the sign-in security status.
 * The steps are optional, so a failed status call lets the user straight through
 * (`onSkipAll`) instead of trapping them on this screen.
 */
export function useOnboardingSession(onSkipAll: () => void): {
  user: SessionUser | null;
  status: MfaStatus | null;
  reload: () => Promise<void>;
} {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<MfaStatus | null>(null);

  async function reload(): Promise<void> {
    setStatus(await mfaRequest<MfaStatus>('/auth/mfa/status', { method: 'GET', auth: true }));
  }

  useEffect(() => {
    let cancelled = false;
    async function init(): Promise<void> {
      const result = getToken() ? 'ok' : await refreshSession();
      if (cancelled) return;
      const current = result === 'ok' ? getSessionUser() : null;
      if (!current) {
        redirectToLogin();
        return;
      }
      if (current.mustChangePassword) {
        router.replace('/login/change-password');
        return;
      }
      try {
        await reload();
      } catch {
        onSkipAll();
        return;
      }
      if (!cancelled) setUser(current);
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { user, status, reload };
}

/** Reset Password → Passkey → Authenticator → Dashboard, with the current step marked. */
export function OnboardingShell({
  current,
  title,
  subtitle,
  aside,
  children,
}: {
  current: OnboardingStep;
  title: string;
  subtitle: string;
  /** Extra left-column content (e.g. how-to steps). Switches the shell to a two-column layout. */
  aside?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const t = useTranslations().setup;
  const labels: Record<(typeof STEP_ORDER)[number], string> = {
    password: t.stepPassword,
    passkey: t.stepPasskey,
    authenticator: t.stepAuthenticator,
    dashboard: t.stepDashboard,
  };
  const currentIndex = STEP_ORDER.indexOf(current);

  return (
    <main className="grid min-h-screen w-full bg-agap-pearl md:grid-cols-[5fr_6fr]">
      {/* Left pane: progress + context. Full height, edge to edge. */}
      <aside className="relative flex flex-col overflow-hidden bg-[#0B2E22] px-7 py-8 text-white md:px-12 md:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#126247]/40 blur-3xl" />

        <p className="relative text-xs font-bold tracking-[0.18em] text-emerald-300">AGAP · ACCOUNT SECURITY</p>

        <ol aria-label={t.stepsLabel} className="relative mt-8 flex gap-3 md:flex-col md:gap-0">
          {STEP_ORDER.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;
            const last = index === STEP_ORDER.length - 1;
            return (
              <li
                key={step}
                aria-current={active ? 'step' : undefined}
                className="flex flex-1 items-start gap-3 md:flex-none"
              >
                <span className="flex flex-col items-center self-stretch">
                  <span
                    className={`grid h-7 w-7 flex-none place-items-center rounded-full text-xs font-bold transition-colors ${
                      done
                        ? 'bg-emerald-400 text-[#0B2E22]'
                        : active
                          ? 'bg-white text-[#0B2E22] ring-4 ring-white/20'
                          : 'bg-white/10 text-white/50'
                    }`}
                  >
                    {done ? '✓' : index + 1}
                  </span>
                  {!last && (
                    <span
                      aria-hidden="true"
                      className={`my-1 hidden min-h-5 w-0.5 flex-1 rounded-full md:block ${done ? 'bg-emerald-400/70' : 'bg-white/15'}`}
                    />
                  )}
                </span>
                <span
                  className={`hidden pt-1 text-sm md:block ${active ? 'font-semibold text-white' : done ? 'text-white/70' : 'text-white/40'}`}
                >
                  {labels[step]}
                </span>
                <span className={`pt-1 text-xs md:hidden ${active ? 'font-semibold text-white' : 'sr-only'}`}>{labels[step]}</span>
              </li>
            );
          })}
        </ol>

        <div className="relative mt-8 md:mt-auto">
          <h1 className="text-3xl font-bold leading-tight tracking-tight">{title}</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/70">{subtitle}</p>
          {aside && <div className="mt-8">{aside}</div>}
        </div>
      </aside>

      {/* Right pane: the actual action, centered, full height. */}
      <section className="flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
