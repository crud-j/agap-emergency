'use client';

import { useCallback, useEffect, useState, type FormEvent, type JSX, type ReactNode } from 'react';
import {
  AlertTriangle, Fingerprint, KeyRound, Monitor, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, Laptop, type LucideIcon,
} from 'lucide-react';
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

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1';
const buttonBase = `inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
const outlineButton = `${buttonBase} border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50 focus-visible:ring-[#126247]/40`;
const primaryButton = `${buttonBase} bg-[#126247] font-semibold text-white hover:bg-[#0F543D] focus-visible:ring-[#126247]/40`;
const dangerButton = `${buttonBase} border border-red-200 bg-white font-medium text-red-700 hover:bg-red-50 focus-visible:ring-red-300`;
const dangerSolidButton = `${buttonBase} bg-red-600 font-semibold text-white hover:bg-red-700 focus-visible:ring-red-300`;

function Section({
  id, icon: Icon, title, description, aside, children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  aside?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 rounded-2xl border border-agap-track/60 bg-white shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#126247]">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] leading-5 text-slate-600">{description}</p>}
          </div>
        </div>
        {aside}
      </div>
      <div className="px-5 py-4 sm:px-6">{children}</div>
    </section>
  );
}

function Badge({ on, children }: { on: boolean; children: ReactNode }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        on ? 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {children}
    </span>
  );
}

function CurrentTag({ children }: { children: ReactNode }): JSX.Element {
  return (
    <span className="ml-2 inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-emerald-800">
      {children}
    </span>
  );
}

function deviceIcon(label: string | null | undefined): LucideIcon {
  if (!label) return Monitor;
  if (/iphone|android|mobile|ipad|phone/i.test(label)) return Smartphone;
  if (/mac|laptop/i.test(label)) return Laptop;
  return Monitor;
}

/** One row of a device list: icon, name, detail line and its action. */
function DeviceRow({
  icon: Icon, name, tag, detail, action,
}: {
  icon: LucideIcon;
  name: string;
  tag?: ReactNode;
  detail: ReactNode;
  action: ReactNode;
}): JSX.Element {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon size={17} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">
          <span className="break-words">{name}</span>
          {tag}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
      </div>
      <div className="ml-12 sm:ml-0">{action}</div>
    </li>
  );
}

/**
 * Removing a passkey, a trusted browser or a session cannot be undone, so the first
 * click asks; the second does it.
 */
function ConfirmAction({
  label, confirmLabel, hint, onConfirm,
}: {
  label: string;
  confirmLabel?: string;
  hint?: string;
  onConfirm: () => Promise<void>;
}): JSX.Element {
  const t = useTranslations().security;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={dangerButton}>
        {label}
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label={label}>
      {hint && <span className="w-full text-right text-xs text-red-700 sm:w-auto">{hint}</span>}
      <button
        type="button"
        autoFocus
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void onConfirm().finally(() => {
            setBusy(false);
            setAsking(false);
          });
        }}
        className={dangerSolidButton}
      >
        {busy ? t.working : confirmLabel ?? `${t.confirm} · ${label}`}
      </button>
      <button type="button" disabled={busy} onClick={() => setAsking(false)} className={outlineButton}>
        {t.cancel}
      </button>
    </div>
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
    <form
      onSubmit={submit}
      className={`mt-3 max-w-sm space-y-3 rounded-xl border p-4 ${danger ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-slate-50'}`}
    >
      <label className="block text-sm font-medium text-slate-700">
        {t.passwordPrompt}
        <input
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'password-prompt-error' : undefined}
          className="mt-1.5 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#126247] focus:ring-2 focus:ring-[#126247]/20"
        />
      </label>
      {error && (
        <p id="password-prompt-error" role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || !password} className={danger ? dangerSolidButton : primaryButton}>
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

function PageSkeleton({ label }: { label: string }): JSX.Element {
  return (
    <div className="max-w-3xl space-y-5" aria-busy="true">
      <p role="status" className="sr-only">{label}</p>
      <div className="space-y-2">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-agap-track/70 motion-reduce:animate-none" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-agap-track/50 motion-reduce:animate-none" />
      </div>
      {[112, 176, 176].map((h, i) => (
        <div key={i} style={{ height: h }} className="animate-pulse rounded-2xl bg-white shadow-card ring-1 ring-agap-track/50 motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export default function AccountSecurityPage(): JSX.Element {
  const all = useTranslations();
  const t = all.security;

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
      <div className="max-w-xl rounded-2xl border border-red-200 bg-white p-6 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <div role="alert">
            <p className="text-sm font-semibold text-slate-900">{t.loadFailed}</p>
            <p className="mt-1 text-sm text-slate-600">{loadError}</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} className={`${outlineButton} mt-4`}>
          <RefreshCw size={14} aria-hidden="true" />
          {t.retry}
        </button>
      </div>
    );
  }
  if (!status) return <PageSkeleton label={t.loading} />;

  const enrolled = status.totp || status.passkeys > 0;

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-[22px] font-bold leading-tight tracking-tight text-slate-900">{t.heading}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.subheading}</p>
      </header>

      {/* ── Overview: is a second step on, and which ones ─────────────────── */}
      <section
        aria-label={enrolled ? t.statusOn : t.statusOff}
        className={`overflow-hidden rounded-2xl border shadow-card ${enrolled ? 'border-emerald-200 bg-white' : 'border-amber-200 bg-white'}`}
      >
        <div className={`flex items-start gap-3.5 px-5 py-4 sm:px-6 ${enrolled ? 'bg-emerald-50/60' : 'bg-amber-50/70'}`}>
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              enrolled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {enrolled ? <ShieldCheck size={22} aria-hidden="true" /> : <ShieldAlert size={22} aria-hidden="true" />}
          </span>
          <div className="min-w-0" role="status">
            <p className={`text-[15px] font-semibold ${enrolled ? 'text-emerald-900' : 'text-amber-900'}`}>
              {enrolled ? t.statusOn : t.statusOff}
            </p>
            <p className={`mt-0.5 text-[13px] leading-5 ${enrolled ? 'text-emerald-800' : 'text-amber-900'}`}>
              {enrolled ? t.statusOnBody : status.enforced ? t.enforcedNotice : t.notEnrolledNotice}
            </p>
          </div>
        </div>
        <nav aria-label={t.heading} className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <FactorLink
            href="#passkeys"
            icon={Fingerprint}
            label={t.passkeysHeading}
            value={status.passkeys > 0 ? String(status.passkeys) : t.totpOff}
            on={status.passkeys > 0}
          />
          <FactorLink
            href="#authenticator"
            icon={Smartphone}
            label={t.totpHeading}
            value={status.totp ? t.totpOn : t.totpOff}
            on={status.totp}
          />
          <FactorLink
            href="#authenticator"
            icon={KeyRound}
            label={t.backupHeading}
            value={status.totp ? `${status.backupCodesRemaining} ${t.backupRemaining}` : '—'}
            on={status.totp && !status.backupCodesLow}
            warn={status.totp && status.backupCodesLow}
          />
        </nav>
      </section>

      {actionError && !pending && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          {actionError}
        </p>
      )}

      {newCodes && (
        <Section id="new-backup-codes" icon={KeyRound} title={t.backupHeading} description={all.mfa.backupSubheading}>
          <BackupCodesPanel codes={newCodes} acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
          <button type="button" disabled={!acknowledged} onClick={() => setNewCodes(null)} className={`${primaryButton} mt-4`}>
            {t.done}
          </button>
        </Section>
      )}

      <Section
        id="passkeys"
        icon={Fingerprint}
        title={t.passkeysHeading}
        description={all.setup.passkeySubheading}
        aside={<Badge on={passkeys.length > 0}>{passkeys.length > 0 ? `${passkeys.length}` : t.totpOff}</Badge>}
      >
        {passkeys.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-600">
            {t.passkeysEmpty}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {passkeys.map((key) => (
              <DeviceRow
                key={key.id}
                icon={Fingerprint}
                name={key.device_label ?? t.passkeysHeading}
                detail={`${t.passkeyLastUsed}: ${when(key.last_used_at, t.passkeyNeverUsed)}`}
                action={<ConfirmAction label={t.passkeyRemove} onConfirm={() => removePasskey(key.id)} />}
              />
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          <PasskeyRegistration onAdded={() => void load()} onError={setActionError} />
        </div>
      </Section>

      <Section
        id="authenticator"
        icon={Smartphone}
        title={t.totpHeading}
        description={all.setup.totpSubheading}
        aside={<Badge on={status.totp}>{status.totp ? t.totpOn : t.totpOff}</Badge>}
      >
        {!status.totp && !status.totpAvailable && (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{t.totpUnavailable}</p>
        )}

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
            <div
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 ${
                status.backupCodesLow ? 'bg-amber-50 ring-1 ring-inset ring-amber-200' : 'bg-slate-50'
              }`}
            >
              <KeyRound size={16} aria-hidden="true" className={status.backupCodesLow ? 'text-amber-700' : 'text-slate-500'} />
              <p className="text-sm text-slate-700">
                {t.backupHeading}: <span className="font-semibold tabular-nums">{status.backupCodesRemaining}</span> {t.backupRemaining}
              </p>
              {status.backupCodesLow && <span className="text-sm font-medium text-amber-800">{t.backupLow}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-expanded={pending === 'regenerate'}
                onClick={() => { setActionError(null); setPending('regenerate'); }}
                className={outlineButton}
              >
                <RefreshCw size={14} aria-hidden="true" />
                {t.backupRegenerate}
              </button>
              <button
                type="button"
                aria-expanded={pending === 'remove'}
                onClick={() => { setActionError(null); setPending('remove'); }}
                className={dangerButton}
              >
                {t.totpRemove}
              </button>
            </div>
            {pending === 'regenerate' && (
              <>
                <p className="text-xs text-slate-600">{t.backupRegenerateHint}</p>
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

      <Section id="trusted" icon={ShieldCheck} title={t.trustedHeading} description={t.trustedHint}>
        {status.trustedDevices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-600">
            {t.trustedEmpty}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {status.trustedDevices.map((device) => (
              <DeviceRow
                key={device.id}
                icon={deviceIcon(device.label)}
                name={device.label ?? '—'}
                tag={device.current ? <CurrentTag>{t.trustedThis}</CurrentTag> : null}
                detail={`${t.trustedExpires}: ${when(device.expiresAt, '—')}`}
                action={<ConfirmAction label={t.trustedRemove} onConfirm={() => removeTrusted(device.id)} />}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section id="sessions" icon={Monitor} title={t.sessionsHeading} description={t.sessionsHint}>
        <ul className="divide-y divide-slate-100">
          {sessions.map((session) => (
            <DeviceRow
              key={session.id}
              icon={deviceIcon(session.device)}
              name={session.device}
              tag={session.current ? <CurrentTag>{t.trustedThis}</CurrentTag> : null}
              detail={`${t.sessionLastActive}: ${when(session.lastActiveAt, '—')} · IP ${session.ipAddress ?? '—'}`}
              action={
                <ConfirmAction
                  label={session.current ? t.sessionRevokeCurrent : t.sessionRevoke}
                  {...(session.current ? { hint: t.sessionRevokeCurrentHint } : {})}
                  onConfirm={() => revokeSession(session.id)}
                />
              }
            />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function FactorLink({
  href, icon: Icon, label, value, on, warn,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  on: boolean;
  warn?: boolean;
}): JSX.Element {
  const tone = warn ? 'text-amber-800' : on ? 'text-emerald-800' : 'text-slate-500';
  return (
    <a
      href={href}
      className="group flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#126247]/40 sm:px-6"
    >
      <Icon size={17} aria-hidden="true" className="shrink-0 text-slate-500 group-hover:text-[#126247]" />
      <span className="min-w-0">
        <span className="block text-xs font-medium text-slate-500">{label}</span>
        <span className={`block truncate text-sm font-semibold ${tone}`}>{value}</span>
      </span>
    </a>
  );
}
