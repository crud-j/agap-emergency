'use client';

import { useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

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
    <div className="min-h-screen flex items-center justify-center bg-agap-pearl">
      {/* Card */}
      <div className="w-full max-w-md mx-4">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-agap-green shadow-green mb-4">
            <span className="text-white text-xl font-extrabold tracking-tight">AG</span>
          </div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">AGAP</h1>
          <p className="text-sm text-agap-textSub mt-0.5">Operations Center</p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card p-8">
          <h2 className="text-lg font-bold text-agap-textMain mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-agap-textMid mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full h-10 px-3 rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface text-agap-textMain text-sm placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green focus:ring-offset-1 focus:border-agap-green transition-colors"
                placeholder="dispatcher@bocaue.gov.ph"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-agap-textMid mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full h-10 px-3 rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface text-agap-textMain text-sm placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green focus:ring-offset-1 focus:border-agap-green transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-xl bg-agap-dangerSoft border border-[rgba(212,72,88,0.22)] px-4 py-3">
                <p className="text-sm text-agap-danger font-medium">{error}</p>
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
              Sign In
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-agap-textSub">
            AGAP Operations Center · Bocaue MDRRMO
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-agap-textSub">
          Emergency? Call <strong>911</strong> or MDRRMO hotline directly.
        </p>
      </div>
    </div>
  );
}
