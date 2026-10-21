'use client';

import { useCallback, useEffect, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import { BackupCodesPanel } from '@/components/auth/BackupCodesPanel';
import { PasskeyRegistration } from '@/components/auth/PasskeyRegistration';
import { TotpEnrollment } from '@/components/auth/TotpEnrollment';
import { useTranslations } from '@/hooks/use-translations';
import {
  mfaRequest,
  type MfaStatus,
  type PasskeyCredential,
} from '@/lib/mfa';

type Pending = 'regenerate' | 'remove' | null;
type ActiveSession = {
  id: string;
  device: string;
  ipAddress: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  current: boolean;
};

const outlineButton =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40';
const primaryButton =
  'rounded-lg bg-[#126247] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0F543D] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40';
const dangerButton =
  'rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300';

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <section className="rounded-2xl border border-agap-track/60 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Badge({ on, children }: { on: boolean; children: ReactNode }): JSX.Element {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${on ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}
    >
      {children}
    </span>
  );
}

function PasswordPrompt({
  busy,
  error,
  danger,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  danger?: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const t = useTranslations().security;
  const [password, setPassword] = useState('');
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onConfirm(password);
  }
  return (
    <form onSubmit={submit} className="mt-3 max-w-sm space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="block text-sm font-medium text-slate-700">
        {t.passwordPrompt}
        <input
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !password} className={danger ? dangerButton : primaryButton}>
          {busy ? t.working : t.confirm}
        </button>
        <button type="button" onClick={onCancel} className={outlineButton}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

function when(value: string | null, fallback: string): string {
  return value ? new Date(value).toLocaleString() : fallback;
}

export default function AccountSecurityPage(): JSX.Element {
  const t = useTranslations().security;

  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [enrolling, setEnrolling] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, p] = await Promise.all([
        mfaRequest<MfaStatus>('/auth/mfa/status', { method: 'GET', auth: true }),
        mfaRequest<PasskeyCredential[]>('/auth/passkey/credentials', { method: 'GET', auth: true }),
      ]);
      const activeSessions = await mfaRequest<ActiveSession[]>('/auth/sessions', { method: 'GET', auth: true });
      setStatus(s);
      setPasskeys(p);
      setSessions(activeSessions);
    } catch (cause: unknown) {
      setLoadError(cause instanceof Error ? cause.message : t.loadFailed);
    }
  }, [t.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  function closePrompt(): void {
    setPending(null);
    setActionError(null);
  }

  async function withPassword(path: string, method: 'POST' | 'DELETE', password: string): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      const result = await mfaRequest<{ backupCodes?: string[] }>(path, { method, body: { password }, auth: true });
      closePrompt();
      if (result.backupCodes) {
        setAcknowledged(false);
        setNewCodes(result.backupCodes);
      }
      await load();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : t.loadFailed);
    }
    setBusy(false);
  }

  async function removePasskey(id: string): Promise<void> {
    setActionError(null);
    try {
      await mfaRequest(`/auth/passkey/credentials/${id}`, { method: 'DELETE', auth: true });
      await load();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : t.loadFailed);
    }
  }

  async function removeTrusted(id: string): Promise<void> {
    setActionError(null);
    try {
      await mfaRequest(`/auth/trusted-devices/${id}`, { method: 'DELETE', auth: true });
      await load();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : t.loadFailed);
    }

  }

  async function revokeSession(id: string): Promise<void> {
    setActionError(null);
    try {
      await mfaRequest(`/auth/sessions/${id}`, { method: 'DELETE', auth: true });
      await load();
    } catch (cause: unknown) {
      setActionError(cause instanceof Error ? cause.message : t.loadFailed);
    }
  }

  if (loadError && !status) {
    return (
      <div className="max-w-xl">
        <p role="alert" className="text-sm text-red-700">
          {t.loadFailed} {loadError}
        </p>
        <button type="button" onClick={() => void load()} className={`${outlineButton} mt-3`}>
          {t.retry}
        </button>
      </div>
    );
  }
  if (!status) return <p className="text-sm text-slate-600">{t.loading}</p>;

  const enrolled = status.totp || status.passkeys > 0;

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl font-bold text-slate-900">{t.heading}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.subheading}</p>
      </header>

      {!enrolled && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {status.enforced ? t.enforcedNotice : t.notEnrolledNotice}
        </p>
      )}
      {actionError && !pending && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {newCodes && (
        <Section title={t.backupHeading}>
          <BackupCodesPanel codes={newCodes} acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
          <button type="button" disabled={!acknowledged} onClick={() => setNewCodes(null)} className={`${primaryButton} mt-4`}>
            {t.done}
          </button>
        </Section>
      )}

      <Section title={t.passkeysHeading}>
        {passkeys.length === 0 ? (
          <p className="text-sm text-slate-600">{t.passkeysEmpty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {passkeys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-900">{key.device_label ?? t.passkeysHeading}</p>
                  <p className="text-xs text-slate-500">
                    {t.passkeyLastUsed}: {when(key.last_used_at, t.passkeyNeverUsed)}
                  </p>
                </div>
                <button type="button" onClick={() => void removePasskey(key.id)} className={dangerButton}>
                  {t.passkeyRemove}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <PasskeyRegistration onAdded={() => void load()} onError={setActionError} />
        </div>
      </Section>

      <Section title={t.totpHeading} aside={<Badge on={status.totp}>{status.totp ? t.totpOn : t.totpOff}</Badge>}>
        {!status.totp && !status.totpAvailable && <p className="text-sm text-slate-600">{t.totpUnavailable}</p>}

        {!status.totp && status.totpAvailable && !enrolling && (
          <button type="button" onClick={() => setEnrolling(true)} className={primaryButton}>
            {t.totpSetUp}
          </button>
        )}
        {!status.totp && enrolling && (
          <div className="max-w-sm">
            <TotpEnrollment
              autoStart
              onCancel={() => setEnrolling(false)}
              onConfirmed={({ backupCodes }) => {
                setEnrolling(false);
                setAcknowledged(false);
                setNewCodes(backupCodes);
                void load();
              }}
            />
          </div>
        )}

        {status.totp && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-slate-700">
                {t.backupHeading}: <span className="font-semibold">{status.backupCodesRemaining}</span> {t.backupRemaining}
              </p>
              {status.backupCodesLow && <span className="text-sm font-medium text-amber-700">{t.backupLow}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setActionError(null); setPending('regenerate'); }} className={outlineButton}>
                {t.backupRegenerate}
              </button>
              <button type="button" onClick={() => { setActionError(null); setPending('remove'); }} className={dangerButton}>
                {t.totpRemove}
              </button>
            </div>
            {pending === 'regenerate' && (
              <>
                <p className="text-xs text-slate-500">{t.backupRegenerateHint}</p>
                <PasswordPrompt
                  busy={busy}
                  error={actionError}
                  onCancel={closePrompt}
                  onConfirm={(password) => void withPassword('/auth/mfa/backup-codes/regenerate', 'POST', password)}
                />
              </>
            )}
            {pending === 'remove' && (
              <PasswordPrompt
                danger
                busy={busy}
                error={actionError}
                onCancel={closePrompt}
                onConfirm={(password) => void withPassword('/auth/mfa/totp', 'DELETE', password)}
              />
            )}
          </div>
        )}
      </Section>

      <Section title={t.trustedHeading}>
        <p className="mb-3 text-xs text-slate-500">{t.trustedHint}</p>
        {status.trustedDevices.length === 0 ? (
          <p className="text-sm text-slate-600">{t.trustedEmpty}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {status.trustedDevices.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {device.label ?? '—'}
                    {device.current && (
                      <span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
                        {t.trustedThis}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t.trustedExpires}: {when(device.expiresAt, '—')}
                  </p>
                </div>
                <button type="button" onClick={() => void removeTrusted(device.id)} className={dangerButton}>
                  {t.trustedRemove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Active sessions">
        <p className="mb-3 text-xs text-slate-500">Review browsers signed in to your AGAP account. Revoking a session takes effect immediately.</p>
        <ul className="divide-y divide-slate-100">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {session.device}
                  {session.current && <span className="ml-2 rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">Current</span>}
                </p>
                <p className="text-xs text-slate-500">Last active: {when(session.lastActiveAt, '—')} · IP: {session.ipAddress ?? '—'}</p>
              </div>
              <button type="button" onClick={() => void revokeSession(session.id)} className={dangerButton}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
