'use client';

import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { useTranslations } from '@/hooks/use-translations';
import { initialsOf, type RememberedAccount } from '@/lib/remembered-accounts';

interface AccountPickerProps {
  accounts: RememberedAccount[];
  /** Email of the account that already has a live session in this browser, if any. */
  activeEmail: string | null;
  /**
   * Real sign-in for the chosen account. Resolves with the function that carries on (MFA,
   * forced password change or the console) so the row can show "Signed in" first; throws
   * with a readable message when the password is wrong.
   */
  onSignIn: (email: string, password: string) => Promise<() => void>;
  /** This browser can use passkeys: offer one first, with the password as the fallback. */
  passkeyAvailable: boolean;
  /** A passkey sign-in is in progress (the page shows its overlay and any error). */
  passkeyBusy: boolean;
  /** Passkey sign-in for the chosen account, scoped to that account's passkeys. */
  onPasskey: (email: string) => void;
  /** Continue with the session that is already live (no password needed). */
  onContinueSession: () => void;
  onRemove: (email: string) => void;
  onUseAnother: () => void;
}

const AVATAR_TONES = ['bg-emerald-100 text-emerald-900', 'bg-teal-100 text-teal-900', 'bg-lime-100 text-lime-900'];

function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none transition-transform duration-300 ${open ? 'rotate-90 text-[#126247]' : 'text-slate-300'}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** The fingerprint glyph the main login form uses for passkeys. */
function PasskeyIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
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

export function AccountPicker({
  accounts,
  activeEmail,
  onSignIn,
  passkeyAvailable,
  passkeyBusy,
  onPasskey,
  onContinueSession,
  onRemove,
  onUseAnother,
}: AccountPickerProps): JSX.Element {
  const t = useTranslations().login;

  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // Same as the main form: a passkey first, "Use password instead" as the fallback.
  const [mode, setMode] = useState<'passkey' | 'password'>(passkeyAvailable ? 'passkey' : 'password');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [okEmail, setOkEmail] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ email: string; message: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (openEmail && mode === 'password') passwordRef.current?.focus();
  }, [openEmail, mode]);

  const locked = busy !== null || okEmail !== null || passkeyBusy;

  function toggle(account: RememberedAccount): void {
    if (editing || locked) return;
    if (account.email === activeEmail) {
      setOkEmail(account.email);
      setTimeout(onContinueSession, 650);
      return;
    }
    setPassword('');
    setRowError(null);
    setMode(passkeyAvailable ? 'passkey' : 'password');
    setOpenEmail((current) => (current === account.email ? null : account.email));
  }

  async function submit(event: FormEvent<HTMLFormElement>, account: RememberedAccount): Promise<void> {
    event.preventDefault();
    if (locked) return;
    if (!password) {
      setRowError({ email: account.email, message: t.pickerEnterPassword });
      return;
    }
    setRowError(null);
    setBusy(account.email);
    try {
      const proceed = await onSignIn(account.email, password);
      setPassword('');
      setBusy(null);
      setOkEmail(account.email);
      setTimeout(proceed, 700);
    } catch (cause: unknown) {
      setBusy(null);
      setRowError({ email: account.email, message: cause instanceof Error ? cause.message : t.errorGeneric });
    }
  }

  function remove(account: RememberedAccount): void {
    setRemoving(account.email);
    setTimeout(() => {
      onRemove(account.email);
      setRemoving(null);
      if (openEmail === account.email) setOpenEmail(null);
    }, 300);
  }

  const welcomeName = (okEmail ? accounts.find((a) => a.email === okEmail)?.name ?? '' : '').split(' ')[0] ?? '';

  return (
    <div className="auth-in">
      {okEmail && (
        <p role="status" className="mb-3 text-center text-sm font-semibold text-emerald-800">
          {t.pickerWelcome.replace('{name}', welcomeName)} · <span className="font-normal text-slate-500">{t.pickerOpening}</span>
        </p>
      )}

      <div
        role="region"
        aria-label={t.pickerHeading}
        tabIndex={0}
        className="max-h-[min(38svh,22rem)] overflow-y-auto overscroll-contain rounded-2xl pr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
      <ul className="flex flex-col gap-2.5">
        {accounts.map((account, index) => {
          const open = openEmail === account.email;
          const isActive = account.email === activeEmail;
          const isBusy = busy === account.email;
          const isOk = okEmail === account.email;
          const dim = (locked && !isBusy && !isOk);
          const error = rowError?.email === account.email ? rowError.message : null;

          return (
            <li
              key={account.email}
              className={`rounded-2xl bg-white/90 shadow-card ring-1 transition-all duration-300 ${
                open ? 'ring-2 ring-[#126247]/60' : 'ring-slate-200/80'
              } ${dim ? 'pointer-events-none opacity-40' : ''} ${removing === account.email ? 'translate-x-4 opacity-0' : ''}`}
            >
              <div className="relative flex items-center">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(account)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40"
                >
                  <span className={`grid h-11 w-11 flex-none place-items-center rounded-full text-sm font-bold ${AVATAR_TONES[index % AVATAR_TONES.length]}`}>
                    {initialsOf(account.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-950">{account.name}</span>
                    <span className="block truncate text-[13px] text-slate-600">{account.email}</span>
                  </span>
                  <span
                    className={`inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity ${
                      editing ? 'opacity-0' : ''
                      } ${isActive ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}
                  >
                    <i className="h-1.5 w-1.5 rounded-full bg-current" />
                    {isActive ? t.pickerSignedIn : t.pickerSignedOut}
                  </span>
                  <span className={editing ? 'opacity-0' : ''}>
                    <Chevron open={open} />
                  </span>
                </button>

                <button
                  type="button"
                  aria-label={t.pickerRemoveLabel.replace('{name}', account.name)}
                  onClick={() => remove(account)}
                  tabIndex={editing ? 0 : -1}
                  className={`absolute right-3 grid h-8 w-8 place-items-center rounded-full bg-white text-red-600 ring-1 ring-slate-200 transition-all duration-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 ${
                    editing ? 'scale-100 opacity-100' : 'pointer-events-none scale-75 opacity-0'
                  }`}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>

              {/* Sign-in, revealed in place: a passkey first, the password as the fallback */}
              <div className={`grid transition-[grid-template-rows] duration-500 ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className={`min-h-0 overflow-hidden ${open ? 'visible' : 'invisible'}`}>
                  {mode === 'passkey' ? (
                    <div className="space-y-2 px-3.5 pb-4 pt-0.5">
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => onPasskey(account.email)}
                        className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#126247] text-sm font-semibold text-white transition-colors hover:bg-[#0F543D] disabled:cursor-not-allowed disabled:opacity-70 ${
                          passkeyBusy ? 'auth-btn-loading' : ''
                        }`}
                      >
                        <PasskeyIcon />
                        {passkeyBusy ? t.passkeyWaiting : t.passkeySignIn}
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => setMode('password')}
                        className="flex h-10 w-full items-center justify-center rounded-xl text-sm font-semibold text-[#126247] ring-1 ring-[#126247]/30 transition-colors hover:bg-slate-50 disabled:opacity-60"
                      >
                        {t.usePasswordInstead}
                      </button>
                    </div>
                  ) : (
                  <form onSubmit={(event) => void submit(event, account)} noValidate className="px-3.5 pb-4 pt-0.5">
                    <div
                      className={`flex h-11 items-center gap-2.5 rounded-xl bg-slate-50 px-3 text-slate-400 ring-1 transition-shadow focus-within:bg-white focus-within:text-[#126247] focus-within:ring-2 focus-within:ring-[#126247]/50 ${
                        error ? 'auth-shake bg-red-50/40 text-red-500 ring-2 ring-red-400' : 'ring-slate-200'
                      }`}
                    >
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect width="18" height="11" x="3" y="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <input
                        ref={open ? passwordRef : undefined}
                        type="password"
                        autoComplete="current-password"
                        value={open ? password : ''}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          if (rowError) setRowError(null);
                        }}
                        placeholder={t.pickerPasswordFor.replace('{name}', account.name.split(' ')[0] ?? '')}
                        aria-label={t.pickerPasswordFor.replace('{name}', account.name)}
                        aria-invalid={error ? true : undefined}
                        className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </div>
                    {error && (
                      <p role="alert" className="pt-1.5 text-xs text-red-700">
                        {error}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={locked}
                      className={`relative mt-2.5 flex h-11 w-full items-center justify-center overflow-hidden rounded-xl text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed ${
                        isOk ? 'bg-emerald-600' : 'bg-[#126247] hover:bg-[#0F543D] disabled:opacity-70'
                      } ${isBusy ? 'auth-btn-loading' : ''}`}
                    >
                      {isOk ? `✓ ${t.pickerSignedInOk}` : isBusy ? t.pickerSigningIn : t.pickerContinue}
                    </button>
                    {passkeyAvailable && (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          setRowError(null);
                          setMode('passkey');
                        }}
                        className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-[#126247] ring-1 ring-[#126247]/30 transition-colors hover:bg-slate-50 disabled:opacity-60"
                      >
                        <PasskeyIcon />
                        {t.usePasskeyInstead}
                      </button>
                    )}
                  </form>
                  )}
                </div>
              </div>

              {/* Live session: the row itself confirms it */}
              {isOk && isActive && <span className="sr-only">{t.pickerSignedInOk}</span>}
            </li>
          );
        })}

        <li className="rounded-2xl bg-white/90 shadow-card ring-1 ring-slate-200/80">
          <button
            type="button"
            onClick={onUseAnother}
            disabled={locked || editing}
            className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40"
          >
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-slate-500 ring-1 ring-slate-300">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900">{t.pickerUseAnother}</span>
              <span className="block truncate text-xs text-slate-500">{t.pickerUseAnotherHint}</span>
            </span>
            <Chevron open={false} />
          </button>
        </li>
      </ul>
      </div>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v);
            setOpenEmail(null);
          }}
          disabled={locked}
          className="text-sm font-semibold text-[#1B5E3B] underline-offset-2 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B5E3B]"
        >
          {editing ? t.pickerDone : t.pickerRemove}
        </button>
        <p className="mt-2 text-xs text-slate-600">{t.pickerPrivacy}</p>
      </div>
    </div>
  );
}
