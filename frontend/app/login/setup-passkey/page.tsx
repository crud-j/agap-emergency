'use client';

import { useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingShell, useOnboardingSession } from '@/components/auth/OnboardingShell';
import { PasskeyRegistration } from '@/components/auth/PasskeyRegistration';
import { useTranslations } from '@/hooks/use-translations';
import { landingForRole, safeNextPath } from '@/lib/post-login';

const primaryButton =
  'flex h-11 w-full items-center justify-center rounded-lg bg-[#126247] px-4 text-sm font-semibold text-white hover:bg-[#0F543D] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20';
const outlineButton =
  'flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20';

/** Onboarding step 2 of 4 — optional. Skipping is always allowed. */
export default function SetupPasskeyPage(): JSX.Element | null {
  const router = useRouter();
  const t = useTranslations().setup;
  const [error, setError] = useState<string | null>(null);

  const destination = (): string => safeNextPath() ?? landingForRole(undefined);
  const { user, status, reload } = useOnboardingSession(() => router.replace(destination()));

  if (!user || !status) return null;

  const dashboard = safeNextPath() ?? landingForRole(user.role);
  const next = `/login/setup-authenticator?next=${encodeURIComponent(dashboard)}`;
  const added = status.passkeys > 0;

  return (
    <OnboardingShell current="passkey" title={t.passkeyHeading} subtitle={t.passkeySubheading}>
      <div className="space-y-4">
        {added ? (
          <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            ✓ {t.doneBadge}
          </p>
        ) : (
          <PasskeyRegistration onAdded={() => void reload()} onError={setError} />
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button type="button" onClick={() => router.replace(next)} className={added ? primaryButton : outlineButton}>
          {added ? t.next : t.skip}
        </button>
        <p className="text-xs text-slate-500">{t.laterHint}</p>
      </div>
    </OnboardingShell>
  );
}
