'use client';

import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { useTranslations } from '@/hooks/use-translations';

export type PasskeyOverlayState = 'waiting' | 'verifying' | 'success';

const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Fingerprint({ size, width }: { size: number; width: number }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} strokeWidth={width} {...stroke} aria-hidden="true">
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
    </svg>
  );
}

function Chip({ delay, icon, children }: { delay: string; icon: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <span
      className="pk-chip inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white py-1.5 pl-2.5 pr-3 text-[11px] font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200"
      style={{ animationDelay: delay }}
    >
      <span className="text-[#126247]">{icon}</span>
      {children}
    </span>
  );
}

/**
 * "Waiting for your device" panel that covers the login card only (the card must be
 * `relative`). Purely presentational: the WebAuthn ceremony runs in the login page.
 */
export function PasskeySignInOverlay({
  state,
  onCancel,
}: {
  state: PasskeyOverlayState;
  onCancel: () => void;
}): JSX.Element {
  const t = useTranslations().login;
  const success = state === 'success';

  // Don't paint for requests that fail within a blink (wrong RP ID, offline, no passkey
  // found): they would flash the animation and snap back. Real waits show it.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmed(true), 280);
    return () => clearTimeout(id);
  }, []);
  if (!armed) return <div aria-hidden="true" />;

  const title = success ? t.passkeySuccess : state === 'verifying' ? t.passkeyVerifying : t.passkeyPromptTitle;

  return (
    <div
      role="dialog"
      aria-label={t.passkeyPromptTitle}
      className="pk-fade absolute inset-0 z-30 flex flex-col items-center justify-center rounded-[inherit] bg-[#F3FAF6]/[0.97] px-6 py-8 text-center"
    >
      {/* Ring + disc */}
      <div className="relative mb-6 h-[176px] w-[176px] flex-none">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 220 220" aria-hidden="true">
          <circle cx="110" cy="110" r="102" fill="none" strokeWidth="5" className="stroke-emerald-900/10" />
          <circle
            cx="110"
            cy="110"
            r="102"
            pathLength={1}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={success ? '1 0' : '0.28 0.72'}
            className={`pk-arc ${success ? 'stroke-emerald-500' : 'stroke-[#126247]'}`}
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.32,0.72,0,1), stroke 0.5s ease' }}
          />
        </svg>

        <span className="pk-disc absolute inset-[20px] grid place-items-center overflow-hidden rounded-full bg-white text-[#126247] shadow-card ring-1 ring-slate-200">
          <span
            className={`col-start-1 row-start-1 grid place-items-center transition-all duration-500 ${success ? 'scale-50 opacity-0' : 'scale-100 opacity-100'}`}
          >
            <Fingerprint size={58} width={1.5} />
          </span>
          <span
            className={`col-start-1 row-start-1 grid place-items-center text-emerald-600 transition-all duration-500 ${success ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
          >
            <svg viewBox="0 0 24 24" width="54" height="54" strokeWidth="2.2" {...stroke} aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          {state === 'waiting' && (
            <i aria-hidden="true" className="pk-beam absolute left-[16%] right-[16%] h-[3px] rounded-full bg-[#126247] opacity-0" />
          )}
        </span>
      </div>

      <h2 className="text-xl font-bold tracking-tight text-slate-900" aria-live="polite">
        {title}
      </h2>
      {!success && <p className="mt-2 max-w-[17rem] text-sm leading-5 text-slate-600">{t.passkeyPromptBody}</p>}

      {!success && (
        <>
          <div className="mt-5 flex flex-wrap justify-center gap-2" aria-hidden="true">
            <Chip delay="0s" icon={<Fingerprint size={14} width={2} />}>
              {t.passkeyFingerprint}
            </Chip>
            <Chip
              delay="-2s"
              icon={
                <svg viewBox="0 0 24 24" width="14" height="14" strokeWidth="2" {...stroke}>
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <path d="M9 9h.01" />
                  <path d="M15 9h.01" />
                </svg>
              }
            >
              {t.passkeyFace}
            </Chip>
            <Chip
              delay="-4s"
              icon={
                <svg viewBox="0 0 24 24" width="14" height="14" strokeWidth="2" {...stroke}>
                  <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
                  <circle cx="16.5" cy="7.5" r=".5" />
                </svg>
              }
            >
              {t.passkeyKey}
            </Chip>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="mt-6 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20"
          >
            {t.passkeyCancel}
          </button>
        </>
      )}
    </div>
  );
}
