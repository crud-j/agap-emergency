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
  eyebrow,
  title,
  subtitle,
  aside,
  children,
}: {
  current: OnboardingStep;
  /** Small label above the title (e.g. "Two-step verification"). */
  eyebrow?: string;
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
  // Extra left-column content needs the room: tighten the tracker and title so it all fits one screen.
  const compact = Boolean(aside || eyebrow);

  return (
    <main className="grid min-h-[100svh] w-full animate-in fade-in duration-700 bg-[#F6F8F7] md:grid-cols-[4fr_6fr] lg:grid-cols-[3.5fr_6.5fr]">
      
      {/* Left pane: context & progress. */}
      <aside className="relative flex flex-col justify-between overflow-hidden bg-[#051610] px-6 py-8 text-white sm:px-10 sm:py-10 md:sticky md:top-0 md:h-[100svh] md:px-12 md:py-12">
        
        {/* Restrained, premium lighting effects */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-1/4 -top-1/4 h-[70%] w-[120%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-[60%] w-[100%] rounded-full bg-[#126247]/20 blur-[100px]" />

        <div className="relative z-10 flex h-full flex-col md:overflow-y-auto">
          {/* Brand Header */}
          <div className="animate-in slide-in-from-left-2 fade-in duration-500">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-400/20">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-emerald-400" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-[11px] font-bold tracking-[0.2em] text-emerald-300/80">
                AGAP SECURITY
              </p>
            </div>
          </div>

          {/* Mobile Progress Bar (Sleek pill design) */}
          <div className="mt-8 flex items-center justify-between md:hidden animate-in slide-in-from-top-2 fade-in duration-500 delay-150 fill-mode-both">
            <div className="flex gap-1.5">
              {STEP_ORDER.map((step, index) => (
                <div 
                  key={step} 
                  className={`h-1.5 rounded-full transition-all duration-700 ease-out ${
                    index === currentIndex ? 'w-6 bg-emerald-400' : index < currentIndex ? 'w-2 bg-emerald-400/40' : 'w-2 bg-white/10'
                  }`}
                />
              ))}
            </div>
            <span className="text-[11px] font-medium tracking-wide text-emerald-100/60">
              STEP {currentIndex + 1} OF {STEP_ORDER.length}
            </span>
          </div>

          {/* Desktop Progress Stepper (Minimalist vertical track) */}
          <ol aria-label={t.stepsLabel} className={`relative hidden flex-col md:flex animate-in ${compact ? 'mt-10' : 'mt-16'} slide-in-from-left-4 fade-in duration-500 delay-150 fill-mode-both`}>
            {STEP_ORDER.map((step, index) => {
              const done = index < currentIndex;
              const active = index === currentIndex;
              const last = index === STEP_ORDER.length - 1;
              
              return (
                <li key={step} aria-current={active ? 'step' : undefined} className="group flex items-start">
                  <div className="flex flex-col items-center">
                    <span
                      className={`relative flex h-6 w-6 items-center justify-center rounded-full transition-all duration-500 ease-out ${
                        done
                          ? 'bg-emerald-400/10 text-emerald-400 ring-1 ring-inset ring-emerald-400/30'
                          : active
                            ? 'bg-emerald-400 ring-4 ring-emerald-400/20'
                            : 'bg-transparent ring-1 ring-inset ring-white/20'
                      }`}
                    >
                      {done && (
                        <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-[#051610]" />}
                    </span>
                    {!last && (
                      <span className={`my-1.5 w-[1px] transition-colors ${compact ? 'h-6' : 'h-10'} duration-500 ${done ? 'bg-emerald-400/30' : 'bg-white/10'}`} aria-hidden="true" />
                    )}
                  </div>
                  <span className={`pl-5 pt-0.5 text-[14px] transition-all duration-500 ${
                    active ? 'font-semibold text-white translate-x-1' : done ? 'text-emerald-50/70 font-medium' : 'text-white/30'
                  }`}>
                    {labels[step]}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Dynamic Content Area */}
          <div className="relative mt-8 animate-in slide-in-from-bottom-4 fade-in duration-500 delay-300 fill-mode-both md:mt-auto md:pt-10">
            {eyebrow && (
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-300">{eyebrow}</p>
            )}
            <h1
              className={`font-semibold leading-[1.15] tracking-tight text-white ${
                compact ? 'text-2xl sm:text-[1.75rem]' : 'text-3xl sm:text-[2.25rem]'
              }`}
            >
              {title}
            </h1>
            <p className={`max-w-md text-[15px] leading-relaxed text-emerald-50/70 ${compact ? 'mt-3' : 'mt-4'}`}>
              {subtitle}
            </p>
            {aside && <div className="mt-6 max-w-md text-sm text-emerald-50/80">{aside}</div>}
          </div>
        </div>
      </aside>

      {/* Right pane: Action area */}
      <section className="relative flex items-center justify-center p-4 sm:p-6 md:p-12 lg:p-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/60 via-transparent to-transparent" />
        
        {/* Canvas container for the child forms */}
        <div className="w-full max-w-md animate-in zoom-in-[0.98] fade-in duration-700 delay-[400ms] fill-mode-both relative z-10">
          {children}
        </div>
      </section>
    </main>
  );
}