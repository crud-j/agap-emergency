'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { useTranslations } from '@/hooks/use-translations';
import { MfaApiError, mfaRequest, type TotpEnrollment as TotpEnrollmentData, type WebSession } from '@/lib/mfa';

export interface TotpConfirmed {
  backupCodes: string[];
  /** Present only on forced first sign-in enrollment (the mfaToken path). */
  session: WebSession | null;
}

interface TotpEnrollmentProps {
  /** Forced enrollment at sign-in. Omit when already signed in. */
  mfaToken?: string;
  /** Start straight away instead of waiting for the button. */
  autoStart?: boolean;
  onConfirmed: (result: TotpConfirmed) => void;
  /** The server says the sign-in is gone (expired/killed token). */
  onExpired?: () => void;
  onCancel?: () => void;
}

type Phase = 'idle' | 'starting' | 'scan' | 'confirming' | 'verified';

const primaryButton =
  'flex h-11 items-center justify-center rounded-lg bg-[#126247] px-4 text-sm font-semibold text-white hover:bg-[#0F543D] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20';

/** The seed in groups of four so it is easy to read aloud and type. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

export function TotpEnrollment({
  mfaToken,
  autoStart = false,
  onConfirmed,
  onExpired,
  onCancel,
}: TotpEnrollmentProps): JSX.Element {
  const all = useTranslations();
  const t = all.mfa;
  const cancelLabel = all.security.cancel;
  const [phase, setPhase] = useState<Phase>('idle');
  const [enrollment, setEnrollment] = useState<TotpEnrollmentData | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [keyCopied, setKeyCopied] = useState(false);
  const started = useRef(false);

  const start = useCallback(async () => {
    setError(null);
    setPhase('starting');
    try {
      const data = await mfaRequest<TotpEnrollmentData>('/auth/mfa/totp/enroll', {
        body: mfaToken ? { mfaToken } : {},
        auth: !mfaToken,
      });
      setEnrollment(data);
      setPhase('scan');
    } catch (cause: unknown) {
      if (mfaToken && cause instanceof MfaApiError && cause.status === 401) onExpired?.();
      setError(cause instanceof Error ? cause.message : t.expired);
      setPhase('idle');
    }
  }, [mfaToken, onExpired, t.expired]);

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void start();
    }
  }, [autoStart, start]);

  async function confirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPhase('confirming');
    try {
      const result = await mfaRequest<{ backupCodes: string[]; accessToken?: string; user?: WebSession['user'] }>(
        '/auth/mfa/totp/confirm',
        { body: { code: code.replace(/\s+/g, ''), ...(mfaToken ? { mfaToken } : {}) }, auth: !mfaToken },
      );
      setPhase('verified');
      // Let the green "Verified" state register before the next screen takes over.
      setTimeout(
        () =>
          onConfirmed({
            backupCodes: result.backupCodes,
            session: result.accessToken && result.user ? { accessToken: result.accessToken, user: result.user } : null,
          }),
        600,
      );
    } catch (cause: unknown) {
      if (mfaToken && cause instanceof MfaApiError && cause.status === 401) onExpired?.();
      setError(cause instanceof Error ? cause.message : t.expired);
      setShakeKey((k) => k + 1);
      setPhase('scan');
    }
  }

  async function copyKey(): Promise<void> {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 1600);
    } catch {
      // Clipboard blocked: the key is selectable text.
    }
  }

  if (phase === 'idle' || phase === 'starting') {
    return (
      <div>
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => void start()} disabled={phase === 'starting'} className={primaryButton}>
            {phase === 'starting' ? t.enrollStarting : t.enrollStart}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  const setup = all.setup;
  const submitting = phase === 'confirming';
  const verified = phase === 'verified';

  return (
    <form onSubmit={(event) => void confirm(event)} className="auth-in space-y-4">
      <p className="text-sm text-slate-700">{t.enrollScan}</p>
      {enrollment && (
        <>
          <div className="relative mx-auto aspect-square w-full max-w-[232px] overflow-hidden rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
            {/* A data: URL from our own server — next/image would add nothing here. */}
            <img src={enrollment.qrDataUrl} alt="" className="h-full w-full rounded-lg bg-white p-2" />
            <i aria-hidden="true" className="auth-scan-line pointer-events-none absolute inset-0" />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 pl-4 shadow-card ring-1 ring-slate-200">
            <p className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{setup.setupKey}</span>
              <code className="mt-0.5 block select-all break-all font-mono text-sm font-semibold tracking-wide text-slate-900">
                {groupSecret(enrollment.secret)}
              </code>
            </p>
            <button
              type="button"
              onClick={() => void copyKey()}
              className={`h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold hover:bg-slate-50 ${keyCopied ? 'text-emerald-700' : 'text-slate-700'}`}
            >
              {keyCopied ? setup.copied : setup.copy}
            </button>
          </div>
        </>
      )}

      <label className="block text-sm font-semibold text-slate-700">
        {t.enrollConfirm}
        <input
          key={shakeKey}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/D/g, ''));
            if (error) setError(null);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          required
          placeholder="000000"
          aria-invalid={error ? true : undefined}
          className={`mt-1.5 block w-full rounded-xl px-3 py-3 text-center font-mono text-lg font-semibold tracking-[0.4em] outline-none transition-shadow focus:bg-white focus:ring-[3px] ${
            error
              ? 'auth-shake bg-red-50/40 ring-[1.5px] ring-red-500 focus:ring-red-300'
              : 'bg-slate-50 ring-1 ring-slate-200 focus:ring-[#126247]/40'
          }`}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || verified || code.trim().length < 6}
          className={`flex h-11 flex-1 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed ${
            verified ? 'bg-emerald-600' : 'bg-[#126247] hover:bg-[#0F543D] disabled:opacity-60'
          } ${submitting ? 'auth-btn-loading' : ''}`}
        >
          {verified ? '✓ ' + setup.verified : submitting ? setup.verifying : setup.verifyContinue}
        </button>
        {onCancel && !verified && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </form>
  );
}
