'use client';

import { useState, type FormEvent, type JSX } from 'react';
import { Flame, MapPin, Search, X } from 'lucide-react';
import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui';
import { titleCase } from '@/lib/incident-format';
import { usePlaceSearch } from '@/features/risk/hooks';
import type { PlaceResult } from '@/features/risk/api';
import { parseLatLngText, type QuickPick } from '@/features/risk/place-input';

interface PinPlaceFinderProps {
  /** Barangay names as stored (geo_regions); empty while the map data loads or if it failed. */
  barangays: readonly string[];
  /** Busiest spots or flood barangays for the chosen type. */
  picks: QuickPick[];
  riskType: string;
  /** Put the pin here. The caller checks it is inside Bocaue. */
  onPin: (lat: number, lng: number) => void;
  /** Zoom to a barangay (no pin: a barangay is an area). */
  onBarangay: (name: string) => void;
}

/**
 * The ways to place a risk-area pin without hunting on the map (MOD-51, 2026-11-15):
 * - "Find a place": coordinates or a map link are placed at once (no request); any other
 *   text is searched on the map, inside Bocaue only, on Enter or a click;
 * - "Go to barangay": zooms to it;
 * - quick picks: the busiest spots (or flood barangays) for the chosen type.
 */
export function PinPlaceFinder({ barangays, picks, riskType, onPin, onBarangay }: PinPlaceFinderProps): JSX.Element {
  const [text, setText] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const search = usePlaceSearch();

  function clearResults() {
    setResults(null);
    setMessage(null);
  }

  async function find(e: FormEvent) {
    e.preventDefault();
    clearResults();
    const q = text.trim().replace(/\s+/g, ' ');
    const point = parseLatLngText(q);
    if (point) { onPin(point.lat, point.lng); return; }
    if (q.length < 2) { setMessage('Type a place, a street or a landmark.'); return; }
    try {
      const res = await search.mutateAsync(q);
      if (res.unavailable) setMessage('The map search is unavailable right now. Pick a barangay, paste coordinates or click the map.');
      else if (res.results.length === 0) setMessage(`Nothing called “${q}” was found in Bocaue. Try a nearby landmark, pick a barangay or click the map.`);
      else setResults(res.results);
    } catch (err) {
      setMessage(err instanceof Error && err.message ? err.message : 'The search did not work. Try again.');
    }
  }

  function pick(r: PlaceResult) {
    clearResults();
    setText(r.name);
    onPin(r.lat, r.lng);
  }

  const typeWord = titleCase(riskType).toLowerCase();

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form onSubmit={find} className="flex min-w-0 flex-1 gap-2" role="search">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-agap-textSub" aria-hidden />
            <input
              className="h-9 w-full rounded-xl border border-[rgba(168,181,193,0.25)] bg-white pl-8 pr-8 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
              placeholder="Find a place, or paste coordinates or a map link"
              aria-label="Find a place, or paste coordinates or a map link"
              maxLength={300}
              value={text}
              onChange={(e) => { setText(e.target.value); if (results || message) clearResults(); }}
            />
            {text && (
              <button
                type="button"
                aria-label="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-agap-textSub hover:text-agap-textMain"
                onClick={() => { setText(''); clearResults(); }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button type="submit" variant="secondary" size="sm" className="h-9" loading={search.isPending}>Find</Button>
        </form>

        {/* A "go to" menu, not a setting: it always shows its placeholder, so the same
            barangay can be chosen again after panning away. The map outlines the choice. */}
        {barangays.length > 0 && (
          <Select value="" onValueChange={onBarangay}>
            <SelectTrigger aria-label="Go to barangay" className="h-9 sm:w-48"><SelectValue placeholder="Go to barangay" /></SelectTrigger>
            <SelectContent>
              {barangays.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {results && (
        <ul className="max-h-48 overflow-y-auto rounded-xl border border-[rgba(168,181,193,0.25)] bg-white" aria-label="Places found">
          {results.map((r) => (
            <li key={`${r.name}|${r.lat}|${r.lng}`}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-agap-surface focus:bg-agap-surface focus:outline-none"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-agap-danger" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-agap-textMain">{r.name}</span>
                  {r.area && <span className="block truncate text-xs text-agap-textSub">{r.area}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p role="status" className="text-xs text-agap-textMid">{message}</p>}

      {picks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-agap-textSub">
            {riskType === 'FLOOD' ? 'Most flood reports (90 days):' : `Most ${typeWord} reports (90 days):`}
          </span>
          {picks.map((p) => (
            <button
              key={p.kind === 'spot' ? `${p.lat}|${p.lng}` : p.name}
              type="button"
              onClick={() => (p.kind === 'spot' ? onPin(p.lat, p.lng) : onBarangay(p.name))}
              className="inline-flex items-center gap-1 rounded-full border border-[rgba(168,181,193,0.35)] bg-white px-2.5 py-1 font-semibold text-agap-textMain hover:border-agap-green hover:text-agap-green"
              title={p.kind === 'spot' ? 'Put the pin on this spot' : 'Zoom to this barangay'}
            >
              <Flame size={12} className="text-agap-danger" aria-hidden />
              {p.kind === 'spot' ? p.label : p.name} · {p.count}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
