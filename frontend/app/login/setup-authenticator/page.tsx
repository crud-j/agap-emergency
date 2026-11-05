'use client';

import { useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { BackupCodesPanel } from '@/components/auth/BackupCodesPanel';
import { OnboardingShell, useOnboardingSession } from '@/components/auth/OnboardingShell';
import { TotpEnrollment } from '@/components/auth/TotpEnrollment';
import { useTranslations } from '@/hooks/use-translations';
import { landingForRole, safeNextPath } from '@/lib/post-login';

const focusRing = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20';
const primaryButton = `flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#126247] px-4 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-150 hover:bg-[#0F543D] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none disabled:active:scale-100 motion-reduce:transform-none ${focusRing}`;
const outlineButton = `flex h-11 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-[background-color,transform] duration-150 hover:bg-slate-50 active:scale-[0.98] motion-reduce:transform-none ${focusRing}`;
const card = 'auth-in rounded-2xl bg-white p-3 shadow-card ring-1 ring-slate-200 sm:p-4';

type Phase = 'scan' | 'codes' | 'done';

function Tick(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Left-pane list on a subtle panel; numbered steps get a connecting rail. */
function GuideList({ items, numbered }: { items: string[]; numbered?: boolean }): JSX.Element {
  const List = numbered ? 'ol' : 'ul';
  return (
    <List className="space-y-4 rounded-2xl bg-white/[0.04] p-5 ring-1 ring-inset ring-white/10">
      {items.map((item, index) => (
        <li key={item} className="relative flex gap-3.5">
          {numbered && index < items.length - 1 && (
            <span aria-hidden="true" className="absolute -bottom-4 left-3 top-7 w-px bg-white/10" />
          )}
          <span className="relative grid h-6 w-6 flex-none place-items-center rounded-full bg-emerald-400/15 text-xs font-bold text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
            {numbered ? index + 1 : <Tick />}
          </span>
          <span className="pt-0.5 text-sm leading-snug text-white/85">{item}</span>
        </li>
      ))}
    </List>
  );
}

function PhoneIcon({ size = 18 }: { size?: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function ArrowRight(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Onboarding step 3 of 4 — optional. Skipping goes straight to the dashboard. */
export default function SetupAuthenticatorPage(): JSX.Element {
  const router = useRouter();
  const all = useTranslations();
  const t = all.setup;

  const [phase, setPhase] = useState<Phase>('scan');
  const [enrolling, setEnrolling] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);

  const { user, status, reload } = useOnboardingSession(() => router.replace(safeNextPath() ?? landingForRole(undefined)));

  // Session restore + security status: show progress instead of a blank screen.
  if (!user || !status) {
    return (
      <main className="grid h-dvh min-h-0 place-items-center overflow-hidden bg-[#F6F8F7] p-4">
        <p role="status" className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <svg className="h-5 w-5 animate-spin text-[#126247] motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          {all.security.loading}
        </p>
      </main>
    );
  }

  const goToDashboard = (): void => router.replace(safeNextPath() ?? landingForRole(user.role));
  const alreadyOn = status.totp && phase === 'scan';

  if (phase === 'codes') {
    return (
      <OnboardingShell
        current="authenticator"
        fixedViewport
        title={t.codesHeading}
        subtitle={t.codesLead}
        eyebrow={t.authEyebrow}
        aside={<GuideList items={[t.codesTip1, t.codesTip2, t.codesTip3]} />}
      >
        <div className={card}>
          <BackupCodesPanel codes={backupCodes} acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
          <button
            type="button"
            disabled={!acknowledged}
            aria-describedby={acknowledged ? undefined : 'codes-ack-hint'}
            onClick={() => setPhase('done')}
            className={`${primaryButton} mt-5`}
          >
            {t.backupContinue}
            <ArrowRight />
          </button>
          {!acknowledged && (
            <p id="codes-ack-hint" className="mt-2 text-center text-xs text-slate-500">
              {t.codesAckHint}
            </p>
          )}
        </div>
      </OnboardingShell>
    );
  }

  if (phase === 'done' || alreadyOn) {
    return (
      <OnboardingShell
        current="authenticator"
        fixedViewport
        title={t.successHeading}
        subtitle={t.successBody}
        eyebrow={t.authEyebrow}
      >
        <div className={`${card} text-center`}>
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-8 ring-emerald-50/60">
            <svg className="auth-check" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path pathLength={1} d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <p role="status" className="mt-4 text-lg font-semibold text-slate-900">
            {t.verified}
          </p>
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-left ring-1 ring-slate-200">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-emerald-50 text-[#126247]">
              <PhoneIcon />
            </span>
            <p className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{t.successDevice}</span>
              {/* "Added just now" is only true when it was added on this visit. */}
              <span className="block text-xs text-slate-600">{phase === 'done' ? t.successAdded : t.successAlready}</span>
            </p>
            <span className="h-2 w-2 flex-none rounded-full bg-emerald-500 ring-4 ring-emerald-500/15" aria-hidden="true" />
          </div>
          <button type="button" onClick={goToDashboard} className={`${primaryButton} mt-6`}>
            {t.finish}
            <ArrowRight />
          </button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      current="authenticator"
      fixedViewport
      title={t.authTitle}
      subtitle={t.totpSubheading}
      eyebrow={t.authEyebrow}
      aside={<GuideList numbered items={[t.authHow1, t.authHow2, t.authHow3]} />}
    >
      <div className={card}>
        {!status.totpAvailable ? (
          <>
            <div role="status" className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 flex-none text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <p>{t.totpUnavailable}</p>
            </div>
            {/* Nothing to set up here, so moving on is the main action. */}
            <button type="button" onClick={goToDashboard} className={`${primaryButton} mt-5`}>
              {t.finish}
              <ArrowRight />
            </button>
          </>
        ) : enrolling ? (
          <TotpEnrollment
            autoStart
            compact
            onCancel={() => setEnrolling(false)}
            onConfirmed={({ backupCodes: codes }) => {
              setAcknowledged(false);
              setBackupCodes(codes);
              setPhase('codes');
              void reload();
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 flex-none place-items-center rounded-xl bg-emerald-50 text-[#126247] ring-1 ring-emerald-100">
                <PhoneIcon size={22} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#126247]">{t.authEyebrow}</p>
                <h2 className="text-base font-semibold text-slate-900">{t.totpHeading}</h2>
              </div>
            </div>
            <button type="button" onClick={() => setEnrolling(true)} className={`${primaryButton} mt-6`}>
              {all.security.totpSetUp}
            </button>
            <button type="button" onClick={goToDashboard} className={`${outlineButton} mt-3`}>
              {t.skip}
            </button>
            <p className="mt-4 text-center text-xs leading-5 text-slate-500">{t.laterHint}</p>
          </>
        )}
      </div>
    </OnboardingShell>
  );
}
