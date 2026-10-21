import type { JSX, ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** The plain card the post-password steps share (verify, enroll, forgot). */
export function AuthCard({ title, subtitle, children }: AuthCardProps): JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center bg-agap-pearl p-6">
      <section className="w-full max-w-md rounded-2xl border border-agap-track/60 bg-white p-7 shadow-card">
        <p className="text-xs font-bold tracking-[0.16em] text-[#126247]">AGAP · ACCOUNT SECURITY</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}
