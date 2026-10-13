
'use client';

import { useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

function AgapMark({ className = 'h-10 w-10' }: { className?: string }): ReactElement {
  return <img src="/agap-mark.svg" alt="AGAP" className={className} />;
}

export default function LoginPage(): ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
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
        throw new Error((data as { message?: string }).message ?? 'Login failed');
      }
      const { accessToken, user } = await res.json() as { accessToken: string; user: { role?: string } };
      document.cookie = `agap_token=${accessToken}; path=/; samesite=strict`;
      router.push(landingForRole(user?.role));
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? (err.message.includes('Unexpected token') || err.message.includes('JSON')
            ? 'Could not reach the server. Is the backend running?'
            : err.message)
        : 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function landingForRole(role?: string): string {
    switch (role) {
      case 'DISPATCHER':
      case 'SUPERVISOR':      return '/operations/dispatch';
      case 'SYSTEM_ADMINISTRATOR': return '/administration';
      case 'HOSPITAL_USER':   return '/hospitals';
      case 'ANNOUNCEMENTS_PUBLISHER': return '/announcements';
      default:                return '/dashboard';
    }
  }

  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      {/* Branding and operations overview */}
      <section className="relative isolate flex min-h-[285px] flex-col overflow-hidden bg-[#103F30] px-6 py-7 text-white sm:px-10 sm:py-9 lg:min-h-screen lg:px-12 lg:py-12 xl:px-16 xl:py-14">
        {/* Subtle technical grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
        />

        {/* Ambient gradients */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-40 -z-10 h-[440px] w-[440px] rounded-full bg-emerald-400/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 -left-32 -z-10 h-[420px] w-[420px] rounded-full bg-teal-300/[0.09] blur-3xl"
        />

        {/* Decorative response-network illustration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-16 -z-10 hidden h-[440px] w-[440px] items-center justify-center lg:flex"
        >
          <div className="absolute h-[420px] w-[420px] rounded-full border border-white/[0.09]" />
          <div className="absolute h-[330px] w-[330px] rounded-full border border-white/[0.12]" />
          <div className="absolute h-[240px] w-[240px] rounded-full border border-white/[0.15]" />
          <div className="absolute h-[145px] w-[145px] rounded-full border border-emerald-300/20" />
          <div className="absolute h-px w-full bg-white/[0.10]" />
          <div className="absolute h-full w-px bg-white/[0.10]" />
          <div className="absolute h-[295px] w-[295px] rotate-45 border border-dashed border-white/[0.10]" />

          <div className="absolute left-[75px] top-[115px] flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-200 shadow-lg shadow-black/10">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path d="M12 3.5 20 7v5.2c0 4.2-3.2 7.2-8 8.8-4.8-1.6-8-4.6-8-8.8V7l8-3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="m8.5 12 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="absolute right-[65px] top-[180px] flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] text-white/80 shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path d="M3 12h4l2.1-6 4.1 12 2.1-6H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="absolute bottom-[65px] left-[115px] flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] text-white/80 shadow-lg">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>

          <div className="relative flex h-24 w-24 items-center justify-center rounded-[30px] border border-emerald-200/20 bg-[#1D6048]/80 shadow-2xl shadow-black/20 backdrop-blur-sm">
            <div className="absolute inset-2 rounded-[23px] border border-white/[0.08]" />
            <svg viewBox="0 0 48 48" fill="none" className="h-12 w-12 text-emerald-200">
              <path d="M24 5 41 12v11c0 10-6.7 16.4-17 20C13.7 39.4 7 33 7 23V12L24 5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              <path d="M21 14h6v7h7v6h-7v7h-6v-7h-7v-6h7v-7Z" fill="currentColor" />
            </svg>
          </div>
        </div>

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-3">
          <AgapMark className="h-12 w-12 shrink-0 rounded-2xl shadow-lg shadow-black/10" />
          <div>
            <p className="text-xl font-extrabold tracking-[0.16em] text-white">AGAP</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.19em] text-emerald-100/70">
              Operations Center
            </p>
          </div>
        </div>

        {/* Main message */}
        <div className="relative z-10 mt-10 max-w-xl sm:mt-12 lg:my-auto lg:-translate-y-3 lg:pr-5 xl:pr-10">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200/20 bg-white/[0.06] px-3 py-1.5 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-50/90">
              Emergency Management System
            </span>
          </div>

          <h1 className="max-w-lg text-[2rem] font-bold leading-[1.13] tracking-tight sm:text-4xl lg:text-5xl xl:text-[3.5rem]">
            One center.
            <br />
            <span className="text-emerald-200">Every response.</span>
          </h1>

          <p className="mt-5 max-w-md text-sm leading-6 text-emerald-50/75 sm:text-base sm:leading-7">
            Coordinate emergency response, connect essential services, and
            support informed decisions through one unified operations platform.
          </p>

          {/* Operational capabilities */}
          <div className="mt-8 hidden space-y-5 sm:block lg:mt-12">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-emerald-200">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12m0-12.72-2.12 2.12m-8.48 8.48-2.12 2.12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Coordinated response</p>
                <p className="mt-1 text-xs leading-5 text-emerald-50/60">
                  Keep operations and response teams connected.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-emerald-200">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path d="M4 19V5m0 14h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="m7 15 4-4 3 2 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15.5 7H19v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Centralized operations</p>
                <p className="mt-1 text-xs leading-5 text-emerald-50/60">
                  Access the tools and information your role requires.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Left panel footer */}
        <div className="relative z-10 mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 lg:mt-8 lg:pt-6">
          <div className="flex items-center gap-2 text-xs text-emerald-50/65">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0">
              <path d="M12 3.5 20 7v5.2c0 4.2-3.2 7.2-8 8.8-4.8-1.6-8-4.6-8-8.8V7l8-3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="m8.5 12 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Built for coordinated public service</span>
          </div>
          <span className="text-[10px] font-medium tracking-wide text-emerald-100/40">
            BOCAUE MDRRMO
          </span>
        </div>
      </section>

      {/* Login area */}
      <section className="relative flex min-h-[540px] flex-col justify-center overflow-hidden bg-[#F7F9F8] px-5 py-10 sm:px-10 sm:py-14 lg:min-h-screen lg:px-10 xl:px-16">
        {/* Soft background accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-28 -top-32 h-72 w-72 rounded-full bg-emerald-100/50 blur-3xl"
        />

        <div className="relative mx-auto w-full max-w-[410px]">
          {/* Mobile brand identifier */}
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <AgapMark className="h-10 w-10 rounded-xl shadow-md shadow-emerald-900/10" />
            <div>
              <p className="text-sm font-extrabold tracking-[0.15em] text-[#174C39]">AGAP</p>
              <p className="text-xs text-slate-500">Operations Center</p>
            </div>
          </div>

          {/* Form introduction */}
          <div className="mb-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#247653]">
              Welcome back
            </p>
            <h2 className="text-[1.8rem] font-bold tracking-tight text-slate-900 sm:text-3xl">
              Sign in to your account
            </h2>
            <p className="mt-2.5 text-sm leading-6 text-slate-500">
              Enter your credentials to access your operations workspace.
            </p>
          </div>

          {/* Authentication card */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_12px_40px_-20px_rgba(15,45,32,0.18)] sm:rounded-3xl sm:p-8">
            <div className="mb-7 flex items-center gap-3 border-b border-slate-100 pb-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF5EE] text-[#176548]">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="12" cy="15" r="1.3" fill="currentColor" />
                  <path d="M12 16.5V18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">Secure sign in</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Authorized personnel only
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1">
                <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 text-emerald-700">
                  <path d="m5 10 3.2 3.2L15.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[10px] font-semibold text-emerald-800">Protected</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  className="mb-2 block text-sm font-semibold text-slate-700"
                  htmlFor="email"
                >
                  Email address
                </label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 transition-colors group-focus-within:text-[#247653]">
                    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                      <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-11 pr-4 text-base text-slate-900 outline-none transition duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#247653] focus:bg-white focus:ring-4 focus:ring-emerald-700/10 sm:text-sm"
                    placeholder="dispatcher@bocaue.gov.ph"
                  />
                </div>
              </div>

              <div>
                <label
                  className="mb-2 block text-sm font-semibold text-slate-700"
                  htmlFor="password"
                >
                  Password
                </label>
                <div className="group relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 transition-colors group-focus-within:text-[#247653]">
                    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
                      <rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-11 pr-4 text-base text-slate-900 outline-none transition duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-[#247653] focus:bg-white focus:ring-4 focus:ring-emerald-700/10 sm:text-sm"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3.5"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <circle cx="12" cy="16" r="1" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-rose-800">
                      Sign-in unsuccessful
                    </p>
                    <p className="mt-1 break-words text-xs leading-5 text-rose-700">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              <div className="pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={loading}
                  className="w-full transition duration-200 hover:shadow-lg hover:shadow-emerald-900/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-700/20"
                >
                  Sign In
                </Button>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-400">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0">
                  <path d="M12 3.5 20 7v5.2c0 4.2-3.2 7.2-8 8.8-4.8-1.6-8-4.6-8-8.8V7l8-3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="m8.5 12 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Your access is protected by AGAP authentication.</span>
              </div>
            </form>
          </div>

          {/* Organization and emergency contact */}
          <div className="mt-7 space-y-4">
            <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-slate-400">
                <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 21v-4h4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>AGAP Operations Center · Bocaue MDRRMO</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white/70 px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                    <path d="M12 3 22 20H2L12 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M12 9v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="12" cy="17" r="1" fill="currentColor" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800">
                    Need emergency assistance?
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Call <strong className="font-bold text-slate-800">911</strong> or
                    contact the MDRRMO hotline directly.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-8 text-center text-[11px] text-slate-400">
            AGAP Operations Center
            <span className="mx-2 text-slate-300">·</span>
            Authorized access only
          </p>
        </div>
      </section>
    </main>
  );
}
