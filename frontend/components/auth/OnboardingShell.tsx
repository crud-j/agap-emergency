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
  fixedViewport = false,
  children,
}: {
  current: OnboardingStep;
  /** Small label above the title (e.g. "Two-step verification"). */
  eyebrow?: string;
  title: string;
  subtitle: string;
  /** Extra left-column content (e.g. how-to steps). Switches the shell to a two-column layout. */
  aside?: ReactNode;
  /** Keep this onboarding view within the viewport instead of allowing page scrolling. */
  fixedViewport?: boolean;
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
    <main className={`grid w-full animate-in fade-in duration-700 bg-[#F3F6F4] motion-reduce:animate-none md:grid-cols-[4fr_6fr] lg:grid-cols-[3.5fr_6.5fr] ${fixedViewport ? 'h-dvh min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-rows-[minmax(0,1fr)]' : 'min-h-[100svh]'}`}>
      
      {/* Left pane: context & progress. */}
      <aside className={`relative flex flex-col justify-between overflow-hidden border-b border-emerald-950/10 bg-[linear-gradient(145deg,#061A12_0%,#08251B_55%,#0A3023_100%)] text-white md:sticky md:top-0 md:h-[100svh] md:border-b-0 md:border-r md:border-white/5 ${fixedViewport ? 'max-h-[34svh] justify-start px-5 py-3 sm:px-8 md:max-h-none md:justify-between md:px-12 md:py-10' : 'px-5 py-7 sm:px-10 sm:py-10 md:px-12 md:py-12'}`}>
        
        {/* Restrained, premium lighting effects */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-1/4 -top-1/4 h-[70%] w-[120%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-[60%] w-[100%] rounded-full bg-[#126247]/20 blur-[100px]" />

        <div className={`relative z-10 flex h-full flex-col ${fixedViewport ? 'overflow-hidden' : 'md:overflow-y-auto'}`}>
          {/* Brand Header */}
          <div className="animate-in slide-in-from-left-2 fade-in duration-500">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-emerald-400" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-xs font-bold tracking-[0.18em] text-emerald-200">
                AGAP SECURITY
              </p>
            </div>
          </div>

          {/* Mobile Progress Bar (Sleek pill design) */}
          <div role="status" aria-label={`${t.stepsLabel}: ${labels[current]}`} className={`flex items-center justify-between md:hidden animate-in slide-in-from-top-2 fade-in duration-500 delay-150 fill-mode-both ${fixedViewport ? 'mt-3' : 'mt-7'}`}>
            <div className="flex gap-2" aria-hidden="true">
              {STEP_ORDER.map((step, index) => (
                <div 
                  key={step} 
                  className={`h-1.5 rounded-full transition-all duration-700 ease-out ${
                    index === currentIndex ? 'w-8 bg-emerald-300' : index < currentIndex ? 'w-2 bg-emerald-300/70' : 'w-2 bg-white/25'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs font-semibold tracking-wide text-emerald-50/85">
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
                            : 'bg-transparent ring-1 ring-inset ring-white/35'
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
                    active ? 'translate-x-1 font-semibold text-white' : done ? 'font-medium text-emerald-50/85' : 'text-white/60'
                  }`}>
                    {labels[step]}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Dynamic Content Area */}
          <div className={`relative animate-in slide-in-from-bottom-4 fade-in duration-500 delay-300 fill-mode-both ${fixedViewport ? 'mt-3 md:mt-auto md:pt-8' : 'mt-8 md:mt-auto md:pt-10'}`}>
            {eyebrow && (
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">{eyebrow}</p>
            )}
            <h1
              className={`font-semibold leading-[1.15] tracking-tight text-white ${
                fixedViewport ? 'text-xl leading-tight sm:text-2xl md:text-[1.75rem]' : compact ? 'text-2xl sm:text-[1.75rem]' : 'text-3xl sm:text-[2.25rem]'
              }`}
            >
              {title}
            </h1>
            <p className={`max-w-md leading-relaxed text-emerald-50/80 ${fixedViewport ? 'mt-1.5 text-sm md:mt-3 md:text-base' : `text-base ${compact ? 'mt-3' : 'mt-4'}`}`}>
              {subtitle}
            </p>
            {aside && <div className={`mt-6 max-w-md text-sm text-emerald-50/80 ${fixedViewport ? 'hidden md:block' : ''}`}>{aside}</div>}
          </div>
        </div>
      </aside>

      {/* Right pane: Action area */}
      <section className={`relative flex items-center justify-center bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.9),transparent_55%)] ${fixedViewport ? 'min-h-0 overflow-hidden p-3 sm:p-4 md:p-8' : 'px-4 py-8 sm:p-6 md:p-12 lg:p-16'}`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(20,120,78,0.04),transparent_48%)]" />
        
        {/* Canvas container for the child forms */}
        <div className={`relative z-10 w-full max-w-md animate-in zoom-in-[0.98] fade-in duration-700 delay-[400ms] fill-mode-both motion-reduce:animate-none ${fixedViewport ? 'max-h-full' : ''}`}>
          {children}
        </div>
      </section>
    </main>
  );
}
