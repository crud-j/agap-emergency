'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { useTranslations } from '@/hooks/use-translations';

/**
 * Staff passwords are reset by a person, not by an emailed link or a texted code: there is
 * no mailer, and a stolen SIM must not be enough to take over a console account. The
 * Supervisor/administrator override (issue a temporary password, unlock) arrives in Phase 4.
 */
export default function ForgotPasswordPage(): JSX.Element {
  const t = useTranslations().mfa;
  return (
    <AuthCard title={t.forgotHeading}>
      <p className="text-sm leading-6 text-slate-700">{t.forgotBody}</p>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {t.forgotNote}
      </p>
      <Link
        href="/login"
        className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-[#126247] px-4 text-sm font-semibold text-white hover:bg-[#0F543D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20"
      >
        {t.forgotBack}
      </Link>
    </AuthCard>
  );
}
