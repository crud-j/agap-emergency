'use client';

import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { getSessionUser, getToken } from '@/lib/auth';
import { mfaRequest, type MfaStatus } from '@/lib/mfa';
import { logout, redirectToLogin, refreshSession } from '@/lib/session';
import { landingForRole, safeNextPath } from '@/lib/post-login';
import { useAuthUser } from '@/lib/use-auth';

type PageState = 'checking' | 'ready' | 'unavailable';

// --- Reusable Password Input Component with BrewedOps Error States ---
// Declared at module scope: defining it inside the page would give it a new
// identity every render, remounting the <input> and dropping focus per keystroke.
function PasswordInput({ 
  id, label, value, onChange, show, onToggleShow, hasError, shake, onShakeEnd
}: { 
  id: string; label: string; value: string; onChange: (v: string) => void; 
  show: boolean; onToggleShow: () => void; hasError?: boolean; shake?: boolean; onShakeEnd?: () => void;
}): JSX.Element {
  return (
    <div className="group relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div 
        className={`relative ${shake ? 'animate-ml-shake' : ''}`}
        onAnimationEnd={onShakeEnd}
      >
        <span className={`pointer-events-none absolute inset-y-0 left-4 flex items-center transition-colors ${hasError ? 'text-red-400 group-focus-within:text-red-500' : 'text-slate-400 group-focus-within:text-[#126247]'}`} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]">
            <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="16" r="1" fill="currentColor" />
          </svg>
        </span>
        
        <input
          id={id}
          type={show ? 'text' : 'password'}
          autoComplete={id === 'current' ? 'current-password' : 'new-password'}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={label}
          className={`h-[48px] w-full rounded-full border bg-white pl-11 pr-12 text-sm shadow-sm outline-none transition-all duration-200 placeholder:text-slate-400 ${hasError ? 'border-red-500 text-red-900 focus:border-red-500 focus:ring-4 focus:ring-red-500/20' : 'border-slate-300 text-slate-900 hover:border-slate-400 focus:border-[#126247] focus:ring-4 focus:ring-[#126247]/15'}`}
        />
        
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Hide password' : 'Show password'}
          className={`absolute inset-y-0 right-3 flex items-center px-2 transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${hasError ? 'text-red-400 hover:text-red-600 focus-visible:ring-red-500' : 'text-slate-400 hover:text-slate-600 focus-visible:ring-[#126247]'}`}
        >
          {show ? (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default function ChangePasswordPage(): JSX.Element {
  const router = useRouter();
  const user = useAuthUser();
  const [state, setState] = useState<PageState>('checking');
  
  // Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // UX State: Password Visibility Toggles & Animation
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [shakeConfirm, setShakeConfirm] = useState(false);

  // Validation Checks for Submission
  const isLengthValid = newPassword.length >= 12 && newPassword.length <= 128;
  const isSecurityValid = newPassword.length > 0 && !/agap|bocaue/i.test(newPassword);
  const isMatchValid = confirmPassword.length > 0 && newPassword === confirmPassword;

  // BrewedOps Motion Library Logic
  const calculateStrength = (v: string) => {
    if (!v) return 0;
    const base = [
      v.length >= 12, 
      /[a-z]/.test(v) && /[A-Z]/.test(v), 
      /\d/.test(v), 
      /[^a-zA-Z0-9]/.test(v)
    ].filter(Boolean).length;
    
    let l = Math.max(1, base);
    if (v.length < 8) l = 1;
    else if (v.length < 10) l = Math.min(l, 2);
    else if (v.length < 12) l = Math.min(l, 3);
    return l;
  };

  const strength = calculateStrength(newPassword);
  const statusLabels = ['Enter a password', 'Weak', 'Fair', 'Good', 'Strong'];

  const getBarColor = (index: number) => {
    if (strength === 0 || index > strength) return 'scale-x-0 bg-[#DCE4F0]';
    if (strength === 1) return 'scale-x-100 bg-[#FF3B30]';
    if (strength === 2) return 'scale-x-100 bg-[#FF9F0A]';
    if (strength === 3) return 'scale-x-100 bg-[#4FA3FF]';
    if (strength === 4) return 'scale-x-100 bg-[#1DB954]';
    return 'scale-x-0';
  };

  const getTextColor = () => {
    if (strength === 1) return 'text-[#D92D20]';
    if (strength === 2) return 'text-[#C77700]';
    if (strength === 3) return 'text-[#0050C8]';
    if (strength === 4) return 'text-[#12893C]';
    return 'text-slate-500';
  };

  useEffect(() => {
    let cancelled = false;
    async function restore(): Promise<void> {
      const result = getToken() ? 'ok' : await refreshSession();
      if (cancelled) return;
      if (result === 'unauthenticated') {
        redirectToLogin();
        return;
      }
      if (result === 'unavailable') {
        setState('unavailable');
        return;
      }
      const sessionUser = getSessionUser();
      if (!sessionUser) {
        redirectToLogin();
      } else if (!sessionUser.mustChangePassword) {
        router.replace(landingForRole(sessionUser.role));
      } else {
        setState('ready');
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    
    if (!isLengthValid || !isSecurityValid) {
      setError('Please meet all password requirements before continuing.');
      return;
    }
    if (!isMatchValid) {
      setError('The new passwords do not match.');
      // Force DOM reflow to replay the animation if clicked multiple times
      setShakeConfirm(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShakeConfirm(true);
        });
      });
      return;
    }

    const token = getToken();
    if (!token) {
      redirectToLogin();
      return;
    }

    setSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword }, token);
      const refreshed = await refreshSession();
      if (refreshed !== 'ok' || getSessionUser()?.mustChangePassword) {
        throw new Error('Password changed, but your session could not be refreshed. Sign in again.');
      }
      const destination = safeNextPath() ?? landingForRole(user?.role);
      let offerSetup = false;
      try {
        const mfa = await mfaRequest<MfaStatus>('/auth/mfa/status', { method: 'GET', auth: true });
        offerSetup = !mfa.totp && mfa.passkeys === 0;
      } catch {
        // Skip offer if unavailable
      }
      router.replace(
        offerSetup ? `/login/setup-passkey?next=${encodeURIComponent(destination)}` : destination,
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to change password. Please try again.');
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-agap-pearl p-4 sm:p-6">
      {/* BrewedOps Keyframes Injection */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ml-shake {
          0%, 100% { transform: translateX(0); }
          18% { transform: translateX(-7px); }
          36% { transform: translateX(6px); }
          54% { transform: translateX(-4px); }
          72% { transform: translateX(3px); }
        }
        .animate-ml-shake {
          animation: ml-shake 420ms cubic-bezier(.36,.07,.19,.97);
        }
      `}} />

      <section className="w-full max-w-[420px] animate-in fade-in zoom-in-95 duration-500 rounded-3xl border border-agap-track/60 bg-white p-6 shadow-card sm:p-8">
        
        {state !== 'ready' ? (
          <div className="flex flex-col items-center justify-center py-6 text-center animate-in fade-in duration-300">
            {state === 'checking' ? (
              <>
                <svg className="mb-4 h-8 w-8 animate-spin text-[#126247]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                <p className="text-sm font-medium text-slate-700">Restoring your session…</p>
              </>
            ) : (
              <>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden="true">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className="text-[1.1rem] font-semibold text-slate-900">Cannot reach the server</p>
                <p className="mt-1.5 text-sm text-slate-500">Reconnect to change your password.</p>
                <button
                  type="button"
                  onClick={() => {
                    setState('checking');
                    void refreshSession().then((result) => {
                      if (result === 'ok') {
                        const sessionUser = getSessionUser();
                        if (!sessionUser) redirectToLogin();
                        else if (!sessionUser.mustChangePassword) router.replace(landingForRole(sessionUser.role));
                        else setState('ready');
                      }
                      else if (result === 'unauthenticated') redirectToLogin();
                      else setState('unavailable');
                    });
                  }}
                  className="mt-6 flex h-[48px] w-full items-center justify-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white transition-all active:scale-[0.98] hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20"
                >
                  Retry Connection
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-slate-900 text-white shadow-md">
                <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <rect x="9" y="11" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" fill="currentColor"/>
                  <path d="M10 11V9a2 2 0 1 1 4 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="text-[10px] font-bold tracking-[0.22em] text-[#126247]/80">
                AGAP · ACCOUNT SECURITY
              </p>
              <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
                Change Password
              </h1>
              <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
                Enter your current and new password below.
              </p>
            </div>

            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4" noValidate>
              
              <PasswordInput 
                id="current" 
                label="Current password" 
                value={currentPassword} 
                onChange={(v) => { setCurrentPassword(v); setError(null); }} 
                show={showCurrent} 
                onToggleShow={() => setShowCurrent(!showCurrent)} 
              />

              <div className="pt-2">
                <PasswordInput 
                  id="new" 
                  label="New password" 
                  value={newPassword} 
                  onChange={(v) => { setNewPassword(v); setError(null); }} 
                  show={showNew} 
                  onToggleShow={() => setShowNew(!showNew)} 
                />
                
                {/* BrewedOps Motion Library Password Strength Meter */}
                <div className="px-1 mt-3">
                  <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
                    {[1, 2, 3, 4].map((index) => (
                      <div key={index} className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#EBF0F7]">
                        <div className={`absolute inset-0 origin-left transition-all duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] rounded-full ${getBarColor(index)}`} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2.5 flex justify-between text-[12px] font-semibold">
                    <span aria-live="polite" className={`transition-colors duration-300 ${getTextColor()}`}>
                      {statusLabels[strength]}
                    </span>
                    <span className="font-medium text-slate-500">
                      12+ characters required
                    </span>
                  </div>
                </div>
              </div>

              {/* Confirm Password with BrewedOps Shake Integration */}
              <PasswordInput 
                id="confirm" 
                label="Confirm new password" 
                value={confirmPassword} 
                onChange={(v) => { setConfirmPassword(v); setError(null); }} 
                show={showConfirm} 
                onToggleShow={() => setShowConfirm(!showConfirm)} 
                hasError={error === 'The new passwords do not match.'}
                shake={shakeConfirm}
                onShakeEnd={() => setShakeConfirm(false)}
              />

              <div className="my-5 pl-2 space-y-2.5">
                <div className={`flex items-center gap-2.5 text-[13px] transition-colors duration-300 ${isLengthValid ? 'text-slate-900' : 'text-slate-500'}`}>
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${isLengthValid ? 'bg-[#73b916] text-white' : 'bg-slate-200 text-transparent'}`}>
                    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  Must be between 12 and 128 characters
                </div>
                
                <div className={`flex items-center gap-2.5 text-[13px] transition-colors duration-300 ${isSecurityValid ? 'text-slate-900' : 'text-slate-500'}`}>
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${isSecurityValid ? 'bg-[#73b916] text-white' : 'bg-slate-200 text-transparent'}`}>
                    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  Must not contain your name, AGAP, or Bocaue
                </div>

                <div className={`flex items-center gap-2.5 text-[13px] transition-colors duration-300 ${isMatchValid ? 'text-slate-900' : 'text-slate-500'}`}>
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${isMatchValid ? 'bg-[#73b916] text-white' : 'bg-slate-200 text-transparent'}`}>
                    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  New passwords must match
                </div>
              </div>

              {error && (
                <div role="alert" aria-live="polite" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm animate-in slide-in-from-top-2 fade-in duration-300">
                  <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                    <path d="M12 7.5v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="12" cy="16" r="1" fill="currentColor" />
                  </svg>
                  <p className="break-words">{error}</p>
                </div>
              )}

              <div className="pt-2 space-y-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex h-[48px] w-full items-center justify-center gap-2 rounded-full bg-[#126247] text-[15px] font-semibold text-white shadow-md transition-all duration-200 hover:bg-[#0F543D] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#126247]/20 focus-visible:ring-offset-2"
                >
                  {saving ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                      Saving…
                    </>
                  ) : (
                    <>
                      Change Password
                      <svg viewBox="0 0 24 24" fill="none" className="h-[15px] w-[15px]" aria-hidden="true">
                        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    void logout().then(() => router.replace('/login'));
                  }}
                  className="flex h-[48px] w-full items-center justify-center rounded-full text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
                >
                  Sign out instead
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}