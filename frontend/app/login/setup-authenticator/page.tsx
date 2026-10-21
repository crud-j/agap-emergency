'use client';

import { useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { BackupCodesPanel } from '@/components/auth/BackupCodesPanel';
import { OnboardingShell, useOnboardingSession } from '@/components/auth/OnboardingShell';
import { TotpEnrollment } from '@/components/auth/TotpEnrollment';
import { useTranslations } from '@/hooks/use-translations';
import { landingForRole, safeNextPath } from '@/lib/post-login';

const primaryButton =
  'flex h-11 w-full items-center justify-center rounded-lg bg-[#126247] px-4 text-sm font-semibold text-white hover:bg-[#0F543D] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20';
const outlineButton =
  'flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20';

type Phase = 'scan' | 'codes' | 'done';

function Tick(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Onboarding step 3 of 4 — optional. Skipping goes straight to the dashboard. */
export default function SetupAuthenticatorPage(): JSX.Element | null {
  const router = useRouter();
  const all = useTranslations();
  const t = all.setup;

  const [phase, setPhase] = useState<Phase>('scan');
  const [enrolling, setEnrolling] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);

  const { user, status, reload } = useOnboardingSession(() => router.replace(safeNextPath() ?? landingForRole(undefined)));

  if (!user || !status) return null;

  const goToDashboard = (): void => router.replace(safeNextPath() ?? landingForRole(user.role));
  const alreadyOn = status.totp && phase === 'scan';

  if (phase === 'codes') {
    return (
      <OnboardingShell
        current="authenticator"
        title={t.codesHeading}
        subtitle={t.codesLead}
        aside={
          <ul className="space-y-3 text-sm text-white/85">
            {[t.codesTip1, t.codesTip2, t.codesTip3].map((tip) => (
              <li key={tip} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/20 text-emerald-300">
                  <Tick />
                </span>
                {tip}
              </li>
            ))}
          </ul>
        }
      >
        <div className="auth-in rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200">
          <BackupCodesPanel codes={backupCodes} acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
          <button type="button" disabled={!acknowledged} onClick={() => setPhase('done')} className={`${primaryButton} mt-4`}>
            {t.backupContinue}
          </button>
        </div>
      </OnboardingShell>
    );
  }

  if (phase === 'done' || alreadyOn) {
    return (
      <OnboardingShell
        current="authenticator"
        title={t.successHeading}
        subtitle={t.successBody}
        aside={
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">{t.authEyebrow}</p>
        }
      >
        <div className="auth-in rounded-2xl bg-white p-8 text-center shadow-card ring-1 ring-slate-200">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <svg className="auth-check" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path pathLength={1} d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h2 className="mt-4 text-xl font-bold text-slate-900">{t.successHeading}</h2>
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-left ring-1 ring-slate-200">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-[#126247]">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
                <path d="M12 18h.01" />
              </svg>
            </span>
            <p className="flex-1">
              <span className="block text-sm font-semibold text-slate-900">{t.successDevice}</span>
              <span className="block text-xs text-slate-500">{t.successAdded}</span>
            </p>
            <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" aria-hidden="true" />
          </div>
          <button type="button" onClick={goToDashboard} className={`${primaryButton} mt-6`}>
            {t.finish}
          </button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      current="authenticator"
      title={t.authTitle}
      subtitle={t.totpSubheading}
      aside={
        <div>
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">{t.authEyebrow}</p>
          <ol className="space-y-3">
            {[t.authHow1, t.authHow2, t.authHow3].map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-sm text-white/85">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-white/10 text-xs font-bold text-emerald-200">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-white/50">{t.laterHint}</p>
        </div>
      }
    >
      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200">
        {!status.totpAvailable ? (
          <p className="text-sm text-slate-600">{t.totpUnavailable}</p>
        ) : enrolling ? (
          <TotpEnrollment
            autoStart
            onCancel={() => setEnrolling(false)}
            onConfirmed={({ backupCodes: codes }) => {
              setAcknowledged(false);
              setBackupCodes(codes);
              setPhase('codes');
              void reload();
            }}
          />
        ) : (
          <button type="button" onClick={() => setEnrolling(true)} className={primaryButton}>
            {all.security.totpSetUp}
          </button>
        )}

        {!enrolling && (
          <button type="button" onClick={goToDashboard} className={`${outlineButton} mt-3`}>
            {t.skip}
          </button>
        )}
      </div>
    </OnboardingShell>
  );
}
