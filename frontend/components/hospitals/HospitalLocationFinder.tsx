'use client';

import { useState, type JSX } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useResolveHospitalLocation } from '@/features/hospitals/hooks';
import type { Hospital, ResolvedCandidate, ResolveLocationBody } from '@/features/hospitals/api';
import {
  candidateRegistration, describeHospitalError, finderView, scorePercent, type FinderView,
} from '@/features/hospitals/location';

interface HospitalLocationFinderProps {
  /** Name, address, municipality and province as typed (or as stored, in "Set location"). */
  query: ResolveLocationBody;
  /** The hospital being edited ("Set location"); null when creating. */
  currentHospitalId: string | null;
  /** Hospitals this user can see, to name an already registered candidate. */
  visibleHospitals: ReadonlyArray<Pick<Hospital, 'id' | 'name'>>;
  picked: ResolvedCandidate | null;
  /** The pin is still on the picked candidate (within 25 m). */
  pinOnPicked: boolean;
  onPick: (candidate: ResolvedCandidate) => void;
  /** Called with the result list so the map can show it. */
  onResults: (candidates: ResolvedCandidate[]) => void;
  /** Opens an already registered hospital in the registry. */
  onOpenRegistered?: (id: string) => void;
}

/**
 * "Find location" (MOD-39, plan §9.2 step 6). Asks the server only on a click
 * (Nominatim policy). A best match is put on the map; anything less clear waits for
 * the user to pick a result or place the pin. Coordinates only ever come from a
 * result or from the user; nothing is saved until the dialog is confirmed.
 */
export function HospitalLocationFinder({
  query, currentHospitalId, visibleHospitals, picked, pinOnPicked, onPick, onResults, onOpenRegistered,
}: HospitalLocationFinderProps): JSX.Element {
  const resolve = useResolveHospitalLocation();
  const [view, setView] = useState<FinderView | null>(null);
  const [aiAssisted, setAiAssisted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFind() {
    setError(null);
    const name = query.name.trim();
    if (name.length < 2) { setError('Type the hospital name first.'); return; }
    try {
      const response = await resolve.mutateAsync({
        name,
        ...(query.address?.trim() && { address: query.address.trim() }),
        ...(query.municipality?.trim() && { municipality: query.municipality.trim() }),
        ...(query.province?.trim() && { province: query.province.trim() }),
      });
      const next = finderView(response, currentHospitalId);
      setView(next);
      setAiAssisted(response.aiAssisted);
      onResults(next.kind === 'MANUAL' ? [] : next.candidates);
      if (next.kind === 'BEST_MATCH') onPick(next.best);
    } catch (err) {
      setView(null);
      onResults([]);
      setError(`${describeHospitalError(err).message} Click the map or type the coordinates.`);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" type="button" loading={resolve.isPending} onClick={() => void handleFind()}>
          <Search size={13} className="mr-1" /> Find location
        </Button>
        {view && aiAssisted && (
          <Badge variant="blue"><Sparkles size={11} className="mr-1 inline" aria-hidden />AI-assisted</Badge>
        )}
        <span className="text-xs text-agap-textSub">Searches the map for the name and address above.</span>
      </div>

      {error && <p className="rounded-xl bg-agap-dangerSoft px-3 py-2 text-xs text-agap-danger" role="alert">{error}</p>}

      {view?.kind === 'MANUAL' && (
        <p className="rounded-xl bg-agap-surface px-3 py-2 text-xs text-agap-textMid" role="status">{view.message}</p>
      )}
      {view?.kind === 'CHOOSE' && <p className="text-xs text-agap-textMid" role="status">{view.note}</p>}

      {view && view.kind !== 'MANUAL' && (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {view.candidates.map((c) => {
            const registration = candidateRegistration(c, currentHospitalId, visibleHospitals);
            const pickable = registration.kind === 'NEW' || registration.kind === 'THIS';
            const isPicked = picked?.candidateId === c.candidateId;
            return (
              <li key={c.candidateId}
                className={cn(
                  'rounded-xl border px-3 py-2',
                  isPicked ? 'border-agap-green bg-agap-greenSoft' : 'border-[rgba(168,181,193,0.20)] bg-white',
                )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-agap-textMain">
                      {c.name || 'Unnamed place'}
                      {view.kind === 'BEST_MATCH' && view.best.candidateId === c.candidateId && (
                        <Badge variant="green">Best match</Badge>
                      )}
                      <span className="text-xs font-normal text-agap-textSub">{scorePercent(c.score)}</span>
                    </p>
                    <p className="line-clamp-2 text-xs text-agap-textSub">{c.address}</p>
                    <p className="text-[11px] text-agap-textSub">{c.reasons.join(' · ')}</p>
                    <Registration registration={registration} onOpen={onOpenRegistered} />
                    {isPicked && !pinOnPicked && (
                      <p className="text-[11px] text-agap-amber">Pin moved away from this result: it will be saved as a manual location.</p>
                    )}
                  </div>
                  {pickable && !isPicked && (
                    <Button variant="secondary" size="sm" type="button" onClick={() => onPick(c)}>Use this</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Registration({ registration, onOpen }: {
  registration: ReturnType<typeof candidateRegistration>;
  onOpen?: ((id: string) => void) | undefined;
}): JSX.Element | null {
  switch (registration.kind) {
    case 'NEW':
      return null;
    case 'THIS':
      return <p className="text-[11px] text-agap-textSub">This hospital&apos;s current map reference.</p>;
    case 'HIDDEN':
      return <p className="text-[11px] text-agap-amber">Already registered (not visible to you).</p>;
    case 'OTHER':
      return (
        <p className="text-[11px] text-agap-amber">
          Already registered as{' '}
          {onOpen ? (
            <button type="button" className="font-semibold underline" onClick={() => onOpen(registration.id)}>
              {registration.name}
            </button>
          ) : (
            <span className="font-semibold">{registration.name}</span>
          )}
          .
        </p>
      );
  }
}
