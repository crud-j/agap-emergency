'use client';

import { useState, type FormEvent, type JSX } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import { ID_CARD_RELEASE_REASONS, type IdCardHolder, type IdCardReleaseReason } from '@agap/shared';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useFindIdCardHolder, useReleaseIdCard } from '@/features/identity-verification/hooks';
import { CARD_RELEASE_REASON_LABELS, cardHolderNotes } from '@/features/identity-verification/format';

function lookupError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 400) return 'Enter the 12-digit number printed on the card.';
    if (err.status === 403) return 'Only MDRRMO administrators can do this.';
    if (err.status === 404) return 'No account holds this card. The citizen can scan it now.';
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
 * For a citizen whose PhilHealth ID is already linked to an account that isn't theirs (plan §7).
 * Staff look at the physical card, type its number, see which account holds it, and release it.
 * The number is cleared as soon as it has been used. Every lookup and release is audited.
 */
export function IdCardRelease(): JSX.Element {
  const [pin, setPin] = useState('');
  const [holder, setHolder] = useState<IdCardHolder | null>(null);
  const [reason, setReason] = useState<IdCardReleaseReason | ''>('');
  const [done, setDone] = useState<string | null>(null);
  const find = useFindIdCardHolder();
  const release = useReleaseIdCard();

  async function onFind(event: FormEvent) {
    event.preventDefault();
    setHolder(null);
    setDone(null);
    setReason('');
    release.reset();
    const found = await find.mutateAsync(pin).catch(() => null);
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
        <h2 className="text-sm font-bold text-agap-textMain">A citizen&apos;s PhilHealth ID is linked to someone else&apos;s account</h2>
        <p className="mt-0.5 text-xs text-agap-textSub">
          Look at the card and check it against the person in front of you first. Lookups are recorded in the audit log.
        </p>
      </div>

      <form onSubmit={onFind} className="flex flex-wrap items-center gap-2">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          maxLength={32}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Number on the card, e.g. 00-000000001-0"
          aria-label="PhilHealth number on the card"
          className="h-9 w-72 max-w-full rounded-lg border border-[rgba(168,181,193,0.40)] bg-white px-3 text-sm text-agap-textMain outline-none focus:border-agap-green"
        />
        <Button type="submit" variant="outline" size="sm" disabled={!pin.trim() || find.isPending} loading={find.isPending}>
          <Search size={14} /> Find account
        </Button>
      </form>

      {find.error && !holder ? <p className="text-xs text-agap-danger">{lookupError(find.error)}</p> : null}

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
