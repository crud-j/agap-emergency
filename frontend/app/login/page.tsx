'use client';

import { useState, useEffect, type ReactElement, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import bocaueLogo from '@/assets/Bocaue-logo.png';
import bgImage from '@/assets/login-page-background.png';
import agapIcon from '@/assets/agap-solo-icon.png';
import { useAccessibilityStore } from '@/lib/accessibility.store';
import { useTranslations } from '@/hooks/use-translations';

export default function LoginPage(): ReactElement {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { language, setLanguage } = useAccessibilityStore();
  const t = useTranslations();

  useEffect(() => {
    // Rehydrate the persisted language preference from localStorage
    useAccessibilityStore.persist.rehydrate();
    router.prefetch('/dashboard');
    router.prefetch('/operations/dispatch');
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${apiBase}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? t.login.errorGeneric);
      }

      const { accessToken, user } = await res.json() as {
        accessToken: string;
        user: { role?: string };
      };

      document.cookie = `agap_token=${accessToken}; path=/; samesite=strict`;
      router.replace(landingForRole(user?.role));
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? (err.message.includes('Unexpected token') || err.message.includes('JSON')
            ? t.login.errorServer
            : err.message)
        : t.login.errorGeneric;
      setError(msg);
      setLoading(false);
    }
  }

  function landingForRole(role?: string): string {
    switch (role) {
      case 'DISPATCHER':
      case 'SUPERVISOR':
        return '/operations/dispatch';
      case 'SYSTEM_ADMINISTRATOR':
        return '/administration';
      case 'HOSPITAL_USER':
        return '/hospitals';
      case 'ANNOUNCEMENTS_PUBLISHER':
        return '/announcements';
      default:
        return '/dashboard';
    }
  }

  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-hidden bg-[#071510]">

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
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,18,25,0.90)_0%,rgba(5,24,31,0.76)_34%,rgba(8,27,31,0.34)_65%,rgba(8,27,31,0.10)_100%)]"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(3,16,19,0.46)_0%,transparent_24%,transparent_76%,rgba(3,16,19,0.12)_100%)]" />

      {/* ── All content sits above background ── */}
      <div className="relative z-10 flex min-h-screen flex-1 flex-col">

        {/* ── Top nav bar ── */}
        <header className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12 xl:px-16">

          {/* Left: Bocaue logo + divider + portal label */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <img
              src={bocaueLogo.src}
              alt="Bocaue RiverTown Wonders"
              width={bocaueLogo.width}
              height={bocaueLogo.height}
              className="h-11 w-auto object-contain drop-shadow-sm sm:h-12 lg:h-14"
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
            <button
              type="button"
              className="hidden items-center gap-2 rounded-full border border-white/20 bg-slate-950/20 px-4 py-2.5 text-xs font-medium text-white/90 shadow-sm backdrop-blur-xl transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 sm:flex sm:text-sm"
            >
              {/* Megaphone */}
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path d="M3 10v4a1 1 0 0 0 1 1h2l4 4V5L6 9H4a1 1 0 0 0-1 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M20 7c.83 1.37 1.25 2.87 1.25 5S20.83 15.63 20 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M17 9a5 5 0 0 1 0 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {t.login.publicAnnouncements}
              {/* External link */}
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* EN / FIL toggle */}
            <div className="flex items-center gap-0.5 rounded-full border border-white/20 bg-slate-950/20 p-1 shadow-sm backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                aria-pressed={language === 'en'}
                className={
                  language === 'en'
                    ? 'rounded-full bg-[#1B5E3B] px-3 py-1 text-xs font-semibold text-white transition-colors'
                    : 'px-3 py-1 text-xs text-white/60 transition-colors hover:text-white/90'
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
                    ? 'rounded-full bg-[#1B5E3B] px-3 py-1 text-xs font-semibold text-white transition-colors'
                    : 'px-3 py-1 text-xs text-white/60 transition-colors hover:text-white/90'
                }
              >
                FIL
              </button>
            </div>
          </div>
        </header>

        {/* ── Main row: hero left + card right ── */}
        <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col items-center justify-center gap-10 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-12 lg:py-8 xl:gap-20 xl:px-16">

          {/* ── Left: Hero ── */}
          <div className="w-full max-w-[540px] text-center lg:text-left">
            {/* Brand tagline stays in Filipino — it is the AGAP slogan */}
            <div className="mb-5 flex items-center justify-center gap-3 lg:justify-start">
              <span className="h-[2px] w-7 rounded-full bg-emerald-300" aria-hidden="true" />
              <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/80">A safer, stronger Bocaue</span>
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.02] tracking-[-0.05em] text-white drop-shadow-sm sm:text-5xl xl:text-[4.25rem]">
              Sa Mas Ligtas
              <br />
              na{' '}
              <span className="text-[#69E3A2]">Bocaue.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-[440px] text-sm leading-7 text-white/75 sm:text-base sm:leading-7 lg:mx-0">
              {t.login.heroBody}
            </p>

            {/* Compact service highlights */}
            <div className="mt-8 grid max-w-[430px] grid-cols-1 gap-3 text-left md:grid-cols-3 lg:grid-cols-1 lg:gap-4">
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#061C20]/35 px-3.5 py-3 backdrop-blur-md">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200/15 bg-emerald-400/15 text-emerald-200">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t.login.featureFaster}</p>
                  <p className="mt-0.5 text-xs leading-5 text-white/65">From alert to dispatch, in minutes.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#061C20]/35 px-3.5 py-3 backdrop-blur-md">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200/15 bg-emerald-400/15 text-emerald-200">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M12 3.5 20 7v5.2c0 4.2-3.2 7.2-8 8.8-4.8-1.6-8-4.6-8-8.8V7l8-3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="m8.5 12 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t.login.featureAccurate}</p>
                  <p className="mt-0.5 text-xs leading-5 text-white/65">Real-time location and incident data.</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#061C20]/35 px-3.5 py-3 backdrop-blur-md">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-emerald-200/15 bg-emerald-400/15 text-emerald-200">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t.login.featureStronger}</p>
                  <p className="mt-0.5 text-xs leading-5 text-white/65">A safer Bocaue for everyone.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: Login card ── */}
          <div className="w-full max-w-[440px] shrink-0 rounded-[1.75rem] border border-white/70 bg-white/[0.91] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.30)] ring-1 ring-white/50 backdrop-blur-2xl sm:p-8 lg:p-9">

            {/* AGAP icon */}
            <div className="mb-5 flex justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl">
                <Image
                  src={agapIcon}
                  alt="AGAP"
                  width={90}
                  height={90}
                  priority
                />
              </div>
            </div>

            {/* Card heading */}
            <div className="mb-6 text-center">
              <p className="text-[10px] font-bold tracking-[0.22em] text-emerald-800/70">
                BOCAUE MDRRMO
              </p>
              <h2 className="mt-1.5 text-[1.8rem] font-bold tracking-[-0.04em] text-slate-950">
                {t.login.cardHeading}
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                {t.login.cardSubheading}
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="1" fill="currentColor" />
                </svg>
                <p className="break-words">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-[1.125rem]">

              {/* Work Email */}
              <div>
                <label htmlFor="email" className="mb-2 block text-[13px] font-semibold text-slate-700">
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
                    autoComplete="username"
                    inputMode="email"
                    placeholder={t.login.emailPlaceholder}
                    className="h-[3.15rem] w-full rounded-xl border border-slate-200/90 bg-slate-50/60 pl-11 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:border-[#176B4B] focus:bg-white focus:ring-4 focus:ring-[#176B4B]/10"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="mb-2 block text-[13px] font-semibold text-slate-700">
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
                    className="h-[3.15rem] w-full rounded-xl border border-slate-200/90 bg-slate-50/60 pl-11 pr-12 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:border-[#176B4B] focus:bg-white focus:ring-4 focus:ring-[#176B4B]/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-3.5 flex items-center text-slate-400 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B5E3B]"
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

              {/* Remember device + Forgot password */}
              <div className="flex items-center justify-between">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-[#1B5E3B]"
                  />
                  {t.login.rememberDevice}
                </label>
                <button
                  type="button"
                  className="text-sm text-[#1B5E3B] underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B5E3B] focus-visible:ring-offset-1"
                >
                  {t.login.forgotPassword}
                </button>
              </div>

              {/* Sign in */}
              <button
                type="submit"
                disabled={loading}
                className="mt-1 flex h-[3.15rem] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#176B4B] to-[#0F5942] text-sm font-semibold text-white shadow-[0_5px_14px_rgba(23,107,75,0.18)] transition-all hover:-translate-y-0.5 hover:from-[#145D42] hover:to-[#0C4C39] hover:shadow-[0_8px_20px_rgba(23,107,75,0.24)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20 focus-visible:ring-offset-2"
              >
                {loading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
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

            </form>

            {/* Or divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            {/* Google Workspace */}
            <button
              type="button"
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/60"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              {t.login.googleSignIn}
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Security note */}
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-100/80 bg-[#F0F8F3] px-4 py-3.5">
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

        {/* ── Bottom information rail ── */}
        <footer className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-5 pb-5 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-12 xl:px-16">
          <div className="grid grid-cols-1 gap-3 text-white/85 sm:grid-cols-3 sm:gap-5">
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
