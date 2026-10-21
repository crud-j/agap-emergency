'use client';

import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { startAuthentication } from '@simplewebauthn/browser';
import { AuthCard } from '@/components/auth/AuthCard';
import { useTranslations } from '@/hooks/use-translations';
import { clearMfaChallenge, getMfaChallenge, type MfaChallenge, type MfaMethod } from '@/lib/mfa-challenge';
import { MfaApiError, isPasskeyCancelled, mfaRequest, passkeysSupported, type WebSession } from '@/lib/mfa';
import { destinationAfterSignIn } from '@/lib/post-login';
import { startSession } from '@/lib/session';

type CodeMethod = Exclude<MfaMethod, 'passkey'>;

const CODE_ORDER: CodeMethod[] = ['totp', 'backup_code', 'sms'];

const primaryButton =
  'flex h-11 w-full items-center justify-center rounded-lg bg-[#126247] px-4 text-sm font-semibold text-white hover:bg-[#0F543D] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176B4B]/20';
const linkButton =
  'text-sm font-medium text-[#126247] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40';

export default function VerifyPage(): JSX.Element | null {
  const router = useRouter();
  const all = useTranslations();
  const t = all.mfa;

  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [ready, setReady] = useState(false);
  const [method, setMethod] = useState<CodeMethod | null>(null);
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dead, setDead] = useState(false);

  // The challenge lives in module memory (never storage), so read it after mount: a
  // refresh or a direct visit finds nothing and returns to /login.
  useEffect(() => {
    const current = getMfaChallenge();
    if (!current) {
      router.replace('/login');
      return;
    }
    if (current.enrollmentRequired) {
      router.replace('/login/enroll');
      return;
    }
    setChallenge(current);
    setMethod(CODE_ORDER.find((m) => current.methods.includes(m)) ?? null);
    setReady(true);
  }, [router]);

  if (!ready || !challenge) return null;

  const hasPasskey = challenge.methods.includes('passkey') && passkeysSupported();
  const codeMethods = CODE_ORDER.filter((m) => challenge.methods.includes(m));
  const otherMethods = codeMethods.filter((m) => m !== method);

  const methodLabel: Record<CodeMethod, string> = {
    totp: t.useAuthenticator,
    backup_code: t.useBackup,
    sms: t.useSms,
  };

  function finish(session: WebSession): void {
    startSession(session);
    const next = challenge?.next ?? null;
    clearMfaChallenge();
    router.replace(destinationAfterSignIn(session.user, next));
  }

  /** A dead sign-in (expired, too many wrong codes) can't be retried — go back to the password. */
  function handleFailure(cause: unknown): void {
    if (cause instanceof MfaApiError) {
      if (cause.status === 401 && /sign in again/i.test(cause.message)) {
        clearMfaChallenge();
        setDead(true);
      }
      setError(cause.message);
    } else if (isPasskeyCancelled(cause)) {
      setError(all.login.passkeyCancelled);
    } else {
      setError(t.expired);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!method || !challenge) return;
    setError(null);
    setBusy(true);
    try {
      const session = await mfaRequest<WebSession>('/auth/mfa/verify', {
        body: { mfaToken: challenge.mfaToken, method, code: code.trim(), trustDevice: trust },
      });
      finish(session);
    } catch (cause: unknown) {
      handleFailure(cause);
      setCode('');
      setBusy(false);
    }
  }

  async function passkey(): Promise<void> {
    if (!challenge) return;
    setError(null);
    setBusy(true);
    try {
      const begin = await mfaRequest<{
        challengeId: string;
        options: Parameters<typeof startAuthentication>[0]['optionsJSON'];
      }>('/auth/mfa/passkey/begin', { body: { mfaToken: challenge.mfaToken } });
      const response = await startAuthentication({ optionsJSON: begin.options });
      const session = await mfaRequest<WebSession>('/auth/mfa/passkey/complete', {
        body: { mfaToken: challenge.mfaToken, challengeId: begin.challengeId, response, trustDevice: trust },
      });
      finish(session);
    } catch (cause: unknown) {
      handleFailure(cause);
      setBusy(false);
    }
  }

  async function sendSms(): Promise<void> {
    if (!challenge) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await mfaRequest('/auth/mfa/sms/send', { body: { mfaToken: challenge.mfaToken } });
      setNotice(t.smsSent);
    } catch (cause: unknown) {
      handleFailure(cause);
    }
    setBusy(false);
  }

  function switchTo(next: CodeMethod): void {
    setMethod(next);
    setCode('');
    setError(null);
    setNotice(null);
  }

  const label = method === 'backup_code' ? t.backupLabel : method === 'sms' ? t.smsLabel : t.codeLabel;
  const hint = method === 'backup_code' ? t.backupHint : method === 'sms' ? t.smsHint : t.codeHint;

  return (
    <AuthCard title={t.stepUpHeading} subtitle={t.stepUpSubheading}>
      {challenge.identifier && (
        <p className="-mt-3 mb-4 text-xs text-slate-500">
          {t.signedInAs} <span className="font-semibold text-slate-700">{challenge.identifier}</span>
        </p>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {dead ? (
        <Link href="/login" className={primaryButton}>
          {t.backToSignIn}
        </Link>
      ) : (
        <div className="space-y-5">
          {hasPasskey && (
            <button type="button" onClick={() => void passkey()} disabled={busy} className={primaryButton}>
              {t.usePasskey}
            </button>
          )}

          {method && (
            <form onSubmit={(event) => void submit(event)} className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                {label}
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode={method === 'backup_code' ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={method === 'backup_code' ? 16 : 7}
                  required
                  placeholder={method === 'backup_code' ? 'xxxxx-xxxxx' : '123456'}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.3em]"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>
              </label>

              {method === 'sms' && (
                <button
                  type="button"
                  onClick={() => void sendSms()}
                  disabled={busy}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {t.smsSend}
                </button>
              )}

              <button type="submit" disabled={busy || code.trim().length < 6} className={primaryButton}>
                {busy ? t.verifying : t.verify}
              </button>
            </form>
          )}

          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={trust}
              onChange={(event) => setTrust(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#1B5E3B]"
            />
            <span>
              {t.trustBrowser}
              <span className="block text-xs text-slate-500">{t.trustBrowserHint}</span>
            </span>
          </label>

          {otherMethods.length > 0 && (
            <div className="flex flex-col items-start gap-1.5">
              {otherMethods.map((m) => (
                <button key={m} type="button" onClick={() => switchTo(m)} className={linkButton}>
                  {methodLabel[m]}
                </button>
              ))}
            </div>
          )}

          <Link href="/login" onClick={() => clearMfaChallenge()} className={linkButton}>
            {t.backToSignIn}
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
