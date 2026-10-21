'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/AuthCard';
import { BackupCodesPanel } from '@/components/auth/BackupCodesPanel';
import { TotpEnrollment, type TotpConfirmed } from '@/components/auth/TotpEnrollment';
import { useTranslations } from '@/hooks/use-translations';
import { clearMfaChallenge, getMfaChallenge, type MfaChallenge } from '@/lib/mfa-challenge';
import { destinationAfterSignIn } from '@/lib/post-login';
import { startSession } from '@/lib/session';

const primaryButton =
  'flex h-11 w-full items-center justify-center rounded-lg bg-[#126247] px-4 text-sm font-semibold text-white hover:bg-[#0F543D] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20';

/**
 * First sign-in for a staff account that has no second factor yet (AUTH_MFA_ENFORCED).
 * The session is only handed to the console after the authenticator is confirmed AND the
 * user says they saved the backup codes.
 */
export default function EnrollPage(): JSX.Element | null {
  const router = useRouter();
  const t = useTranslations().mfa;

  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [ready, setReady] = useState(false);
  const [confirmed, setConfirmed] = useState<TotpConfirmed | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const current = getMfaChallenge();
    if (!current || !current.enrollmentRequired) {
      router.replace(current ? '/login/verify' : '/login');
      return;
    }
    setChallenge(current);
    setReady(true);
  }, [router]);

  if (!ready || !challenge) return null;

  function finish(): void {
    if (!confirmed?.session || !challenge) return;
    startSession(confirmed.session);
    const next = challenge.next;
    clearMfaChallenge();
    router.replace(destinationAfterSignIn(confirmed.session.user, next));
  }

  if (expired) {
    return (
      <AuthCard title={t.enrollHeading}>
        <p role="alert" className="mb-4 text-sm text-red-700">
          {t.expired}
        </p>
        <Link href="/login" onClick={() => clearMfaChallenge()} className={primaryButton}>
          {t.backToSignIn}
        </Link>
      </AuthCard>
    );
  }

  if (confirmed) {
    return (
      <AuthCard title={t.backupHeading} subtitle={t.backupSubheading}>
        <BackupCodesPanel
          codes={confirmed.backupCodes}
          acknowledged={acknowledged}
          onAcknowledgedChange={setAcknowledged}
        />
        <button type="button" onClick={finish} disabled={!acknowledged || !confirmed.session} className={`${primaryButton} mt-5`}>
          {t.backupContinue}
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t.enrollHeading} subtitle={t.enrollSubheading}>
      <TotpEnrollment
        mfaToken={challenge.mfaToken}
        autoStart
        onConfirmed={setConfirmed}
        onExpired={() => {
          clearMfaChallenge();
          setExpired(true);
        }}
      />
      <p className="mt-5 text-xs text-slate-500">{t.enrollPasskeyLater}</p>
      <Link
        href="/login"
        onClick={() => clearMfaChallenge()}
        className="mt-4 inline-block text-sm font-medium text-[#126247] underline-offset-2 hover:underline"
      >
        {t.backToSignIn}
      </Link>
    </AuthCard>
  );
}
