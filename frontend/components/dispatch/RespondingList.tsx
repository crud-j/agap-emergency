'use client';

import type { JSX } from 'react';
import { Radio, Truck } from 'lucide-react';
import { StatusChip } from '@/components/ui';
import { LegChip } from '@/components/map/LegChip';
import type { LegChip as LegChipData } from '@/features/map/live-tracking';
import type { IncidentListItem } from '@/features/incidents/api';
import { categoryIcon, priorityLabel, timeAgo, titleCase } from '@/lib/incident-format';

/** One unit with a live position on a responding incident. */
export interface RespondingUnit {
  key: string;
  label: string;
  chip: LegChipData;
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-emerald-500',
};

/**
 * "Responding" tab of Live Dispatch (MOD-22 + MOD-31): incidents with a unit out,
 * each with its units' current leg. Replaces the old Live Map's "Units on mission"
 * overlay, grouped by incident so a unit is never shown without its call.
 */
export function RespondingList({
  incidents, unitsByIncident, selectedId, onSelect, searching,
}: {
  incidents: IncidentListItem[];
  unitsByIncident: Record<string, RespondingUnit[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** A search is narrowing the list (changes the empty-state wording). */
  searching: boolean;
}): JSX.Element {
  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center px-4 py-10 text-center animate-in fade-in duration-300">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-200">
          <Radio size={20} className="text-slate-400" aria-hidden="true" />
        </div>
        <p className="text-[14px] font-bold text-slate-900">{searching ? 'No matching incidents' : 'No units in the field'}</p>
        <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-slate-500">
          {searching ? 'Try another reference or barangay.' : 'Dispatched incidents appear here with each unit’s progress.'}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-slate-100/60">
      {incidents.map((inc) => {
        const Icon = categoryIcon(inc.category);
        const units = unitsByIncident[inc.id] ?? [];
        const selected = inc.id === selectedId;
        return (
          <li key={inc.id}>
            <button
              type="button"
              onClick={() => onSelect(inc.id)}
              aria-pressed={selected}
              data-incident-id={inc.id}
              className={`flex w-full items-start gap-3.5 px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50 ${
                selected ? 'bg-emerald-50/80 shadow-[inset_4px_0_0_0_#126247]' : 'hover:bg-slate-50/80'
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${
                selected ? 'bg-emerald-100 text-emerald-700' : 'border border-slate-200 bg-white text-slate-500'
              }`}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[14px] font-bold text-slate-900">
                    {titleCase(inc.category)}
                    {inc.incident_locations?.barangay && (
                      <span className="font-medium text-slate-600"> · {inc.incident_locations.barangay}</span>
                    )}
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span aria-hidden="true" className={`h-2 w-2 rounded-full ${PRIORITY_DOT[inc.priority] ?? 'bg-slate-400'}`} />
                    <span className="text-[12px] font-semibold text-slate-700">{priorityLabel(inc.priority)}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <StatusChip status={inc.status} />
                  <span className="truncate text-[12px] text-slate-500">
                    <span className="font-mono">{inc.public_reference}</span> · {timeAgo(inc.submitted_at)}
                  </span>
                </div>
                {/* Units with a live position; one that hasn't sent a GPS fix yet isn't listed. */}
                <ul className="mt-2 flex flex-col gap-1" aria-label="Units">
                  {units.length === 0 ? (
                    <li className="text-[12px] text-slate-500">Waiting for the crew’s first position</li>
                  ) : (
                    units.map((u) => (
                      <li key={u.key} className="flex min-w-0 items-center gap-2">
                        <Truck size={12} className="shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="shrink-0 text-[12px] font-semibold text-slate-800">{u.label}</span>
                        <LegChip chip={u.chip} />
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
