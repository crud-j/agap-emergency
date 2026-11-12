'use client';

import { useState, useEffect, useRef, type ReactElement, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { WebAuthnAbortService, startAuthentication } from '@simplewebauthn/browser';
import { AccountPicker } from '@/components/auth/AccountPicker';
import { PasskeySignInOverlay, type PasskeyOverlayState } from '@/components/auth/PasskeySignInOverlay';
import bocaueLogo from '@/assets/Bocaue-logo.png';
import bgImage from '@/assets/login-page-background.png';
import agapIcon from '@/assets/agap-solo-icon.png';
import { useAccessibilityStore } from '@/lib/accessibility.store';
import { useTranslations } from '@/hooks/use-translations';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { forgetAccount, getRememberedAccounts, type RememberedAccount } from '@/lib/remembered-accounts';
import { WEB_CLIENT_HEADERS, refreshSession, startSession } from '@/lib/session';
import { setMfaChallenge, type MfaMethod } from '@/lib/mfa-challenge';
import { MfaApiError, isPasskeyCancelled, mfaRequest, passkeysSupported, type WebSession } from '@/lib/mfa';
import { destinationAfterSignIn, safeNextPath } from '@/lib/post-login';

/** What POST /auth/login returns when the password was right but a second step is owed. */
interface MfaRequiredResponse {
  mfaRequired: true;
  mfaToken: string;
  methods: MfaMethod[];
  enrollmentRequired: boolean;
}

export default function LoginPage(): ReactElement {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyStage, setPasskeyStage] = useState<PasskeyOverlayState | null>(null);

  const cancelledByUser = useRef(false);
  const [accounts, setAccounts] = useState<RememberedAccount[]>([]);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [view, setView] = useState<'picker' | 'form'>('form');
  // Same as the mobile app: email first, then a passkey; "Use password instead" is the fallback.
  const [mode, setMode] = useState<'passkey' | 'password'>('passkey');
  const { language, setLanguage } = useAccessibilityStore();
  const t = useTranslations();

  useEffect(() => {
    // Rehydrate the persisted language preference from localStorage
    useAccessibilityStore.persist.rehydrate();
    // No router.prefetch of the console here: signed out, middleware answers a prefetch with
    // a redirect to /login, the router caches it (staleTimes), and the router.replace after
    // sign-in then lands back on /login until a reload. Pages are warmed after sign-in instead
    // (components/layout/PerformanceWorkers.tsx).
    if (!passkeysSupported()) setMode('password');

    // "Choose an account": people who have signed in on this browser before.
    const remembered = getRememberedAccounts();
    if (remembered.length === 0) return;
    setAccounts(remembered);
    setView('picker');
    // Mark the one that still has a live session (the refresh cookie is HttpOnly, so ask the server).
    let cancelled = false;
    void refreshSession().then((result) => {
      if (!cancelled && result === 'ok') setActiveEmail(getSessionUser()?.email?.toLowerCase() ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  /** Real password sign-in. Returns what to do next (so callers can animate first); throws on failure. */
  async function login(identifier: string, secret: string): Promise<() => void> {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const res = await fetch(`${apiBase}/v1/auth/login`, {
      method: 'POST',
      // The backend sets the HttpOnly refresh cookie; the access token stays in memory.
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...WEB_CLIENT_HEADERS },
      body: JSON.stringify({ identifier, password: secret }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { message?: string }).message ?? t.login.errorGeneric);
    }

    const body = await res.json() as MfaRequiredResponse | { accessToken: string; user: SessionUser };

    // Correct password, but this role owes a second step (or first-time enrollment).
    // The mfaToken stays in memory only — see lib/mfa-challenge.ts.
    if ('mfaRequired' in body) {
      setMfaChallenge({
        mfaToken: body.mfaToken,
        methods: body.methods,
        enrollmentRequired: body.enrollmentRequired,
        next: safeNextPath(),
        identifier,
      });
      return () => router.push(body.enrollmentRequired ? '/login/enroll' : '/login/verify');
    }

    startSession(body);
    return () => router.replace(destinationAfterSignIn(body.user, safeNextPath()));
  }

  function friendlyError(err: unknown): string {
    if (!(err instanceof Error)) return t.login.errorGeneric;
    return err.message.includes('Unexpected token') || err.message.includes('JSON') ? t.login.errorServer : err.message;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const proceed = await login(email, password);
      setPassword('');
      proceed();
    } catch (err: unknown) {
      setError(friendlyError(err));
      setLoading(false);
    }
  }

  async function pickerSignIn(accountEmail: string, secret: string): Promise<() => void> {
    try {
      return await login(accountEmail, secret);
    } catch (err: unknown) {
      throw new Error(friendlyError(err));
    }
  }

  function continueLiveSession(): void {
    const user = getSessionUser();
    if (user) router.replace(destinationAfterSignIn(user, safeNextPath()));
  }

  /**
   * Passkey-first sign-in: a full login with no extra step, because the passkey itself is
   * device possession + biometric/PIN (userVerification: 'required'). If an email was typed
   * the prompt is scoped to that account's passkeys; otherwise the browser offers its own.
   */
  function cancelPasskey(): void {
    // Aborts the pending browser ceremony; handlePasskey's catch then clears the overlay.
    cancelledByUser.current = true;
    WebAuthnAbortService.cancelCeremony();
    setPasskeyStage(null);
  }

  /** `forEmail` comes from "Choose an account"; otherwise the email typed in the form. */
  async function handlePasskey(forEmail?: string) {
    setError(null);
    const identifier = (forEmail ?? email).trim();
    if (!identifier || !identifier.includes('@')) {
      setError(t.login.passkeyNeedsEmail);
      return;
    }
    if (!passkeysSupported()) {
      setMode('password');
      setError(t.login.passkeyUnsupported);
      return;
    }
    setPasskeyBusy(true);
    setPasskeyStage('waiting');
    try {
      const begin = await mfaRequest<{ challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>(
        '/auth/passkey/authenticate/begin',
        { body: { identifier } },
      );
      const assertion = await startAuthentication({ optionsJSON: begin.options });
      setPasskeyStage('verifying');
      const session = await mfaRequest<WebSession>('/auth/passkey/authenticate/complete', {
        body: { challengeId: begin.challengeId, response: assertion },
      });
      startSession(session);
      // Let the green "Signed in" state land before the console takes over.
      setPasskeyStage('success');
      setTimeout(() => router.replace(destinationAfterSignIn(session.user, safeNextPath())), 900);
    } catch (err: unknown) {
      setPasskeyStage(null);
      if (cancelledByUser.current) cancelledByUser.current = false;
      else if (isPasskeyCancelled(err)) setError(t.login.passkeyCancelled);
      else if (err instanceof MfaApiError) setError(err.status === 401 ? t.login.passkeyNotFound : err.message);
      else setError(t.login.errorGeneric);
      setPasskeyBusy(false);
    }
  }

  return (
    <main className="relative isolate flex h-dvh min-h-0 flex-col overflow-hidden bg-[#071510]">

      {/* ── Background ── */}
      <Image
        src={bgImage}
        alt=""
        fill
        className="object-cover object-center scale-[1.02]"
        priority
        aria-hidden="true"
      />

      {/* ── Dark gradient overlay — left side heavier, fades right ── */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,18,25,0.92)_0%,rgba(5,24,31,0.78)_36%,rgba(8,27,31,0.42)_67%,rgba(8,27,31,0.16)_100%)]"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(3,16,19,0.46)_0%,transparent_24%,transparent_76%,rgba(3,16,19,0.12)_100%)]" />

      {/* ── All content sits above background ── */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col animate-in fade-in duration-700">

        {/* ── Top nav bar ── */}
        <header className="mx-auto flex w-full max-w-[1480px] shrink-0 items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8 lg:px-10 xl:px-12">

          {/* Left: Bocaue logo + divider + portal label */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <img
              src={bocaueLogo.src}
              alt="Bocaue RiverTown Wonders"
              width={bocaueLogo.width}
              height={bocaueLogo.height}
              className="h-9 w-auto object-contain drop-shadow-sm sm:h-12 lg:h-14"
            />
            <div className="hidden h-10 w-px bg-white/25 sm:block" />
            <div>
              <p className="text-[10px] font-bold tracking-[0.16em] text-white/90 sm:text-[11px] sm:tracking-[0.18em]">
                AGAP&nbsp;&nbsp;•&nbsp;&nbsp;BOCAUE MDRRMO
              </p>
              <p className="mt-1 text-[9px] tracking-[0.14em] text-white/55 sm:text-[10px] sm:tracking-[0.18em]">
                {t.login.portalLabel}
              </p>
            </div>
          </div>

          {/* Right: Public Announcements + language toggle */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">

            {/* EN / FIL toggle */}
            <div className="flex items-center gap-0.5 rounded-full border border-white/20 bg-slate-950/20 p-1 shadow-sm backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                aria-pressed={language === 'en'}
                className={
                  language === 'en'
                    ? 'min-h-11 min-w-11 rounded-full bg-[#1B5E3B] px-3 py-1 text-xs font-semibold text-white shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071510]'
                    : 'min-h-11 min-w-11 rounded-full px-3 py-1 text-xs text-white/80 transition-all duration-200 hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071510]'
                }
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('fil')}
                aria-pressed={language === 'fil'}
                className={
                  language === 'fil'
                    ? 'min-h-11 min-w-11 rounded-full bg-[#1B5E3B] px-3 py-1 text-xs font-semibold text-white shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071510]'
                    : 'min-h-11 min-w-11 rounded-full px-3 py-1 text-xs text-white/80 transition-all duration-200 hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071510]'
                }
              >
                FIL
              </button>
            </div>
          </div>
        </header>

        {/* ── Main row: hero left + card right ── */}
        <div className="mx-auto grid min-h-0 w-full max-w-[1360px] flex-1 grid-cols-1 content-center items-center gap-4 overflow-hidden px-4 py-2 sm:gap-7 sm:px-8 sm:py-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14 lg:px-10 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-20 xl:px-12 max-[1100px]:gap-8">

          {/* ── Left: Hero ── */}
          <div className="hidden w-full max-w-[480px] min-w-0 text-center lg:block lg:text-left">
            {/* Brand tagline stays in Filipino — it is the AGAP slogan */}
            <div className="mb-4 flex items-center justify-center gap-3 lg:justify-start">
              <span className="h-[2px] w-7 rounded-full bg-emerald-300" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/80">A safer, stronger Bocaue</span>
            </div>
            <h1 className="text-4xl font-bold leading-[1.04] tracking-[-0.045em] text-white drop-shadow-sm sm:text-5xl xl:text-[3.55rem]">
              Sa Mas Ligtas
              <br />
              na{' '}
              <span className="text-[#69E3A2] drop-shadow-[0_2px_16px_rgba(105,227,162,0.3)]">Bocaue.</span>
            </h1>

            <p className="mx-auto mt-4 max-w-[410px] text-sm leading-6 text-white/80 sm:text-[15px] sm:leading-6 lg:mx-0">
              {t.login.heroBody}
            </p>

            {/* Compact service highlights */}
            <div className="mt-6 grid max-w-[440px] grid-cols-1 gap-2 text-left sm:grid-cols-3 lg:grid-cols-1 lg:gap-2">
              <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/12 bg-[#061C20]/35 px-3 py-2 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-[#061C20]/60 hover:shadow-[0_8px_16px_-6px_rgba(0,0,0,0.3)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-400/12 text-emerald-200 transition-transform duration-300 group-hover:scale-110">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t.login.featureFaster}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-white/70">From alert to dispatch, in minutes.</p>
                </div>
              </div>
              <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/12 bg-[#061C20]/35 px-3 py-2 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-[#061C20]/60 hover:shadow-[0_8px_16px_-6px_rgba(0,0,0,0.3)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-400/12 text-emerald-200 transition-transform duration-300 group-hover:scale-110">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M12 3.5 20 7v5.2c0 4.2-3.2 7.2-8 8.8-4.8-1.6-8-4.6-8-8.8V7l8-3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="m8.5 12 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t.login.featureAccurate}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-white/70">Real-time location and incident data.</p>
                </div>
              </div>
              <div className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/12 bg-[#061C20]/35 px-3 py-2 backdrop-blur-md transition-all duration-300 hover:border-white/20 hover:bg-[#061C20]/60 hover:shadow-[0_8px_16px_-6px_rgba(0,0,0,0.3)]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-400/12 text-emerald-200 transition-transform duration-300 group-hover:scale-110">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t.login.featureStronger}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-white/70">A safer Bocaue for everyone.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Login card ── */}
          <div className="relative mx-auto w-full max-w-[420px] min-w-0 shrink-0 overflow-hidden rounded-[24px] border border-white/80 bg-white/95 p-4 shadow-[0_24px_48px_-12px_rgba(2,12,18,0.4)] backdrop-blur-2xl backdrop-saturate-[1.1] transition-shadow duration-300 sm:p-6 lg:p-6 [@media(max-height:800px)]:p-4 [@media(max-height:700px)]:p-3">
            {passkeyStage && <PasskeySignInOverlay state={passkeyStage} onCancel={cancelPasskey} />}
            {/* Subtle glass highlights */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(135deg,rgba(255,255,255,0.32)_0%,rgba(255,255,255,0.08)_42%,rgba(222,239,232,0.10)_100%)]" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-white/90" />
            <div className="relative">

            {/* AGAP icon */}
            <div className="mb-2 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-500 hover:scale-105">
                <Image
                  src={agapIcon}
                  alt="AGAP"
                  width={56}
                  height={56}
                  priority
                />
              </div>
            </div>

            {/* Card heading */}
            <div className="mb-4 text-center">
              <p className="text-xs font-bold tracking-[0.16em] text-emerald-900">
                BOCAUE MDRRMO
              </p>
              <h2 className="mt-1.5 text-2xl font-bold tracking-[-0.03em] text-slate-950 sm:text-[1.7rem]">
                {view === 'picker' ? t.login.pickerHeading : t.login.cardHeading}
              </h2>
              <p className="mt-1 text-[15px] leading-5 text-slate-600">
                {view === 'picker' ? t.login.pickerSubheading : t.login.cardSubheading}
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm animate-in slide-in-from-top-2 fade-in duration-300"
              >
                <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="1" fill="currentColor" />
                </svg>
                <p className="break-words">{error}</p>
              </div>
            )}

            {view === 'picker' ? (
              <AccountPicker
                accounts={accounts}
                activeEmail={activeEmail}
                onSignIn={pickerSignIn}
                passkeyAvailable={passkeysSupported()}
                passkeyBusy={passkeyBusy}
                onPasskey={(accountEmail) => void handlePasskey(accountEmail)}
                onContinueSession={continueLiveSession}
                onRemove={(removed) => {
                  const remaining = forgetAccount(removed);
                  setAccounts(remaining);
                  if (remaining.length === 0) setView('form');
                }}
                onUseAnother={() => {
                  setError(null);
                  setView('form');
                }}
              />
            ) : (
              <>
            {accounts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setView('picker');
                }}
                className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#1B5E3B] underline-offset-2 transition-all hover:underline active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1B5E3B]"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                {t.login.pickerBackToAccounts}
              </button>
            )}
            <form
              onSubmit={(e) => {
                if (mode === 'passkey') {
                  e.preventDefault();
                  void handlePasskey();
                } else {
                  void handleSubmit(e);
                }
              }}
              noValidate
              className="space-y-3"
            >

              {/* Work Email */}
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-800">
                  {t.login.emailLabel}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                      <path d="m2 7 10 7 10-7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username webauthn"
                    inputMode="email"
                    placeholder={t.login.emailPlaceholder}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base text-slate-950 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-500 hover:border-slate-400 focus:border-[#176B4B] focus:ring-4 focus:ring-[#176B4B]/15"
                  />
                </div>
              </div>

              {mode === 'password' ? (
                <>
              {/* Password */}
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-800">
                  {t.login.passwordLabel}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                      <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="12" cy="15.5" r="1.5" fill="currentColor" />
                    </svg>
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder={t.login.passwordPlaceholder}
                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-12 text-base text-slate-950 shadow-sm outline-none transition-all duration-200 placeholder:text-slate-500 hover:border-slate-400 focus:border-[#176B4B] focus:ring-4 focus:ring-[#176B4B]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:text-slate-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B5E3B]"
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Forgot password */}
              <div className="flex items-center justify-end">
                <Link
                  href="/login/forgot"
                  className="text-sm text-[#1B5E3B] underline-offset-2 transition-all hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1B5E3B]"
                >
                  {t.login.forgotPassword}
                </Link>
              </div>

                </>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-900/[0.07] bg-emerald-50/60 px-3.5 py-3 text-[#1B5E3B] transition-colors hover:bg-emerald-50/90">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M14 13.12c0 2.38 0 6.38-1 8.88" /><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" /><path d="M2 12a10 10 0 0 1 18-6" /><path d="M2 16h.01" /><path d="M21.8 16c.2-2 .131-5.354 0-6" /><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" /><path d="M8.65 22c.21-.66.45-1.32.57-2" /><path d="M9 6.8a6 6 0 0 1 9 5.2v2" /></svg>
                  <p className="text-sm text-slate-600">{t.login.passkeyHint}</p>
                </div>
              )}

              {mode === 'passkey' ? (
                <>
                  <button type="submit" disabled={passkeyBusy || loading} className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#157A58] to-[#126247] text-sm font-semibold text-white shadow-[0_4px_12px_rgba(18,98,71,0.16),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all duration-200 hover:from-[#136A4C] hover:to-[#0F543D] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20 focus-visible:ring-offset-2">
                    {passkeyBusy ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                        {t.login.passkeyWaiting}
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M14 13.12c0 2.38 0 6.38-1 8.88" /><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" /><path d="M2 12a10 10 0 0 1 18-6" /><path d="M2 16h.01" /><path d="M21.8 16c.2-2 .131-5.354 0-6" /><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" /><path d="M8.65 22c.21-.66.45-1.32.57-2" /><path d="M9 6.8a6 6 0 0 1 9 5.2v2" /></svg>
                        {t.login.passkeySignIn}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={passkeyBusy}
                    onClick={() => {
                      setError(null);
                      setMode('password');
                    }}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#126247]/30 bg-white/60 text-sm font-semibold text-[#126247] shadow-sm transition-all duration-200 hover:bg-white/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20 focus-visible:ring-offset-2"
                  >
                    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] shrink-0" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.7" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                    {t.login.usePasswordInstead}
                  </button>
                </>
              ) : (
                <>
                  <button type="submit" disabled={loading} className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#157A58] to-[#126247] text-sm font-semibold text-white shadow-[0_4px_12px_rgba(18,98,71,0.16),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all duration-200 hover:from-[#136A4C] hover:to-[#0F543D] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20 focus-visible:ring-offset-2">
                    {loading ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                        {t.login.signingIn}
                      </>
                    ) : (
                      <>
                        {t.login.signIn}
                        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                          <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </>
                    )}
                  </button>
                  {passkeysSupported() && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setError(null);
                        setMode('passkey');
                      }}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#126247]/30 bg-white/60 text-sm font-semibold text-[#126247] shadow-sm transition-all duration-200 hover:bg-white/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20 focus-visible:ring-offset-2"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M14 13.12c0 2.38 0 6.38-1 8.88" /><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" /><path d="M2 12a10 10 0 0 1 18-6" /><path d="M2 16h.01" /><path d="M21.8 16c.2-2 .131-5.354 0-6" /><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" /><path d="M8.65 22c.21-.66.45-1.32.57-2" /><path d="M9 6.8a6 6 0 0 1 9 5.2v2" /></svg>
                      {t.login.usePasskeyInstead}
                    </button>
                  )}
                </>
              )}

            </form>
              </>
            )}

            {/* Security note */}
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-900/[0.07] bg-emerald-50/60 px-3.5 py-2.5 transition-colors hover:bg-emerald-50/90">
              <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-[#1B5E3B]" aria-hidden="true">
                <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="15.5" r="1.5" fill="currentColor" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-[#1B4A30]">{t.login.securityTitle}</p>
                <p className="text-xs text-slate-500">{t.login.securityBody}</p>
              </div>
            </div>

            </div>
          </div>
        </div>

        {/* ── Bottom information rail ── */}
        <footer className="mx-auto hidden w-full max-w-[1480px] shrink-0 flex-col gap-3 px-5 pb-3 sm:px-8 lg:flex lg:flex-row lg:items-end lg:justify-between lg:px-10 xl:px-12 max-[900px]:hidden [@media(max-height:800px)]:hidden">
          <div className="grid grid-cols-1 gap-2 text-white/85 sm:grid-cols-3 sm:gap-4">
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" stroke="currentColor" strokeWidth="1.7"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7"/></svg>
              <div><p className="text-xs font-semibold">Bocaue, Bulacan</p><p className="mt-0.5 text-[10px] text-white/55">Prepared. Responsive. United.</p></div>
            </div>
            <div className="flex items-center gap-2.5 sm:border-l sm:border-white/20 sm:pl-5">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M3 12h5l2-3 3.5 6 2-3H21" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              <div><p className="text-xs font-semibold">24/7</p><p className="mt-0.5 text-[10px] text-white/55">Emergency coordination</p></div>
            </div>
            <div className="flex items-center gap-2.5 sm:border-l sm:border-white/20 sm:pl-5">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true"><circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.7"/><path d="M3 20v-1.5A4.5 4.5 0 0 1 7.5 14h3a4.5 4.5 0 0 1 4.5 4.5V20M17 4.5a3 3 0 0 1 0 5.8M18 14h.5a3.5 3.5 0 0 1 3.5 3.5V20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
              <div><p className="text-xs font-semibold">MDRRMO</p><p className="mt-0.5 text-[10px] text-white/55">Bocaue Operations Center</p></div>
            </div>
          </div>
          <p className="border-l-2 border-emerald-300 pl-3 text-xs italic text-white/75 lg:max-w-[230px] lg:text-right lg:border-l-0 lg:border-r-2 lg:pr-3 lg:pl-0">
            “Bocaue, Handa. Ligtas. Magkasama.”
          </p>
        </footer>
      </div>
    </main>
  );
}
