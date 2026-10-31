'use client';

import { useState, type JSX } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { useTranslations } from '@/hooks/use-translations';
import { isPasskeyCancelled, mfaRequest, passkeysSupported } from '@/lib/mfa';

interface PasskeyRegistrationProps {
  /** Called after the server stored the new passkey. */
  onAdded?: () => void;
  /** Surfaces a failure to the parent; a dismissed browser prompt is not an error. */
  onError?: (message: string) => void;
}

/** Name-this-device field + "Add a passkey" button for a signed-in user. */
export function PasskeyRegistration({ onAdded, onError }: PasskeyRegistrationProps): JSX.Element {
  const t = useTranslations().security;
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function add(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const deviceLabel = label.trim() || undefined;
      const begin = await mfaRequest<{
        challengeId: string;
        options: Parameters<typeof startRegistration>[0]['optionsJSON'];
      }>('/auth/passkey/register/begin', { body: deviceLabel ? { deviceLabel } : {}, auth: true });
      
      const response = await startRegistration({ optionsJSON: begin.options });
      
      await mfaRequest('/auth/passkey/register/complete', {
        body: { challengeId: begin.challengeId, response, ...(deviceLabel ? { deviceLabel } : {}) },
        auth: true,
      });
      
      setLabel('');
      setNote(t.passkeyAdded);
      onAdded?.();
    } catch (cause: unknown) {
      if (!isPasskeyCancelled(cause)) {
        onError?.(cause instanceof Error ? cause.message : t.loadFailed);
      }
    }
    setBusy(false);
  }

  // Polished unsupported state
  if (!passkeysSupported()) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-slate-50/50 px-4 py-3 text-slate-500">
        <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 11v6M12 7.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className="text-sm leading-5">{t.passkeyUnsupported}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="device-label" className="text-[13px] font-semibold text-slate-700">
          {t.passkeyLabel}
        </label>
        
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Input Group */}
          <div className="group relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400 transition-colors group-focus-within:text-[#126247]" aria-hidden="true">
              {/* Laptop/Device Icon */}
              <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="12" rx="2" ry="2" />
                <line x1="2" y1="20" x2="22" y2="20" />
              </svg>
            </span>
            <input
              id="device-label"
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={150}
              placeholder={t.passkeyLabelPlaceholder}
              disabled={busy}
              className="h-[48px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.025)] outline-none transition-all duration-200 placeholder:text-slate-400 hover:border-slate-400 focus:border-[#126247] focus:ring-4 focus:ring-[#126247]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          
          {/* Action Button */}
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy}
            className="flex h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#157A58] to-[#126247] px-6 text-[14px] font-semibold text-white shadow-[0_4px_12px_rgba(18,98,71,0.16),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all duration-200 hover:from-[#136A4C] hover:to-[#0F543D] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#126247]/20 focus-visible:ring-offset-2 sm:w-auto"
          >
            {busy ? (
              <>
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                {t.passkeyAdding}
              </>
            ) : (
              <>
                {/* Fingerprint / Plus Icon */}
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                {t.passkeyAdd}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Note (Animated) */}
      {note && (
        <div role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 animate-in slide-in-from-top-2 fade-in duration-300">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-sm font-medium text-emerald-800">
            {note}
          </p>
        </div>
      )}
    </div>
  );
}