'use client';

import { useState, type FormEvent, type JSX } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import {
  DEFAULT_ID_DOCUMENT_TYPE,
  ID_CARD_RELEASE_REASONS,
  ID_DOCUMENT_RULES,
  ID_DOCUMENT_TYPES,
  type IdCardHolder,
  type IdCardReleaseReason,
  type IdDocumentType,
} from '@agap/shared';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useFindIdCardHolder, useReleaseIdCard } from '@/features/identity-verification/hooks';
import { CARD_NUMBER_FIELD, CARD_RELEASE_REASON_LABELS, cardHolderNotes, idDocumentLabel } from '@/features/identity-verification/format';

function lookupError(err: unknown, documentType: IdDocumentType): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return `Enter ${ID_DOCUMENT_RULES[documentType].numberPrompt}.`;
    if (err.status === 403) return 'Only MDRRMO administrators can do this.';
    if (err.status === 404) return `No account holds this ${idDocumentLabel(documentType)}. The citizen can scan it now.`;
    if (err.status === 429) return 'Too many lookups. Wait a minute and try again.';
  }
  return "Couldn't look up this card. Try again.";
}

function releaseError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Confirm your sign-in, then release again.';
    if (err.status === 409) return 'This card is no longer linked to that account.';
  }
  return "Couldn't release this card. Try again.";
}

/**
 * For a citizen whose ID (PhilHealth ID or National ID) is already linked to an account that isn't
 * theirs (plan §7). Staff pick the ID, look at the physical card, type its number, see which account
 * holds it, and release it. The number is cleared as soon as it has been used. Every lookup and
 * release is audited.
 */
export function IdCardRelease(): JSX.Element {
  const [documentType, setDocumentType] = useState<IdDocumentType>(DEFAULT_ID_DOCUMENT_TYPE);
  const [pin, setPin] = useState('');
  const [holder, setHolder] = useState<IdCardHolder | null>(null);
  const [reason, setReason] = useState<IdCardReleaseReason | ''>('');
  const [done, setDone] = useState<string | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const find = useFindIdCardHolder();
  const release = useReleaseIdCard();
  const numberField = CARD_NUMBER_FIELD[documentType];

  function onTypeChange(value: IdDocumentType) {
    // A number typed for one ID means nothing for the other, and neither does an earlier result.
    setDocumentType(value);
    setPin('');
    setHolder(null);
    setReason('');
    setDone(null);
    setLookupMessage(null);
    release.reset();
  }

  async function onFind(event: FormEvent) {
    event.preventDefault();
    setHolder(null);
    setDone(null);
    setReason('');
    setLookupMessage(null);
    release.reset();
    const found = await find.mutateAsync({ pin, documentType }).catch((err: unknown) => {
      setLookupMessage(lookupError(err, documentType));
      return null;
    });
    // Reset drops the mutation, and the typed number in its variables, from the cache (gcTime 0).
    find.reset();
    setPin('');
    setHolder(found);
  }

  async function onRelease() {
    if (!holder || !reason) return;
    const result = await release.mutateAsync({ id: holder.id, reason }).catch(() => null);
    if (result) {
      setHolder(null);
      setReason('');
      setDone('Released. The citizen can scan this card now. The account that held it is no longer ID verified, and was told to scan again.');
    }
  }

  const notes = holder ? cardHolderNotes(holder) : [];

  return (
    <section className="space-y-3 rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white p-4">
      <div>
        <h2 className="text-sm font-bold text-agap-textMain">A citizen&apos;s ID is linked to someone else&apos;s account</h2>
        <p className="mt-0.5 text-xs text-agap-textSub">
          Look at the card and check it against the person in front of you first. Lookups are recorded in the audit log.
        </p>
      </div>

      <form onSubmit={onFind} className="flex flex-wrap items-center gap-2">
        <Select
          value={documentType}
          onValueChange={(value) => onTypeChange(value as IdDocumentType)}
          disabled={find.isPending || release.isPending}
        >
          <SelectTrigger className="h-9 w-40 text-sm" aria-label="Which ID the citizen is showing"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ID_DOCUMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{idDocumentLabel(type)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          maxLength={32}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          placeholder={numberField.placeholder}
          aria-label={numberField.label}
          className="h-9 w-80 max-w-full rounded-lg border border-[rgba(168,181,193,0.40)] bg-white px-3 text-sm text-agap-textMain outline-none focus:border-agap-green"
        />
        <Button type="submit" variant="outline" size="sm" disabled={!pin.trim() || find.isPending} loading={find.isPending}>
          <Search size={14} /> Find account
        </Button>
      </form>
      <p className="text-xs text-agap-textMid">Type the {numberField.label}.</p>
      {numberField.warning ? <p className="text-xs font-medium text-agap-danger">{numberField.warning}</p> : null}

      {lookupMessage && !holder ? <p className="text-xs text-agap-danger">{lookupMessage}</p> : null}

      {holder && (
        <div className="space-y-3 rounded-xl bg-agap-surface p-3">
          <div>
            <p className="text-xs text-agap-textSub">This card is held by</p>
            <p className="font-bold text-agap-textMain">{holder.account.name || 'Unnamed account'}</p>
            <p className="text-sm text-agap-textMid">{holder.account.phoneNumber ?? '—'}</p>
          </div>

          {notes.map((note) => (
            <p key={note} className="text-xs text-agap-textMid">{note}</p>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={reason} onValueChange={(value) => setReason(value as IdCardReleaseReason)}>
              <SelectTrigger className="h-9 w-72 max-w-full text-sm"><SelectValue placeholder="Why are you releasing it?" /></SelectTrigger>
              <SelectContent>
                {ID_CARD_RELEASE_REASONS.map((code) => (
                  <SelectItem key={code} value={code}>{CARD_RELEASE_REASON_LABELS[code]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="danger" size="sm" onClick={onRelease} disabled={!reason || release.isPending} loading={release.isPending}>
              Release card
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setHolder(null); setReason(''); }} disabled={release.isPending}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-agap-textSub">
            The account stays open and can still sign in and send an SOS. It just stops being ID verified.
          </p>
          {release.error ? <p className="text-xs text-agap-danger">{releaseError(release.error)}</p> : null}
        </div>
      )}

      {done && (
        <p className="flex items-center gap-2 rounded-xl bg-agap-greenSoft px-3 py-2 text-sm font-medium text-agap-green">
          <ShieldCheck size={16} className="shrink-0" /> {done}
        </p>
      )}
    </section>
  );
}
