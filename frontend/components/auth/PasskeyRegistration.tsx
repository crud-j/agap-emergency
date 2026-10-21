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
      if (!isPasskeyCancelled(cause)) onError?.(cause instanceof Error ? cause.message : t.loadFailed);
    }
    setBusy(false);
  }

  if (!passkeysSupported()) return <p className="text-sm text-slate-600">{t.passkeyUnsupported}</p>;

  return (
    <div>
      <div className="flex max-w-md flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-sm font-medium text-slate-700">
          {t.passkeyLabel}
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={150}
            placeholder={t.passkeyLabelPlaceholder}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-1.5"
          />
        </label>
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy}
          className="rounded-lg bg-[#126247] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0F543D] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#126247]/40"
        >
          {busy ? t.passkeyAdding : t.passkeyAdd}
        </button>
      </div>
      {note && (
        <p role="status" className="mt-2 text-sm text-emerald-800">
          {note}
        </p>
      )}
    </div>
  );
}
