'use client';

import { useEffect, useState, type ReactElement } from 'react';
import { MapPin, Clock, AlertTriangle } from 'lucide-react';
import type { IncidentListItem } from '@/hooks/useDispatch';
import { categoryIcon, priorityClasses, statusClasses, titleCase, timeAgo } from '@/lib/incident-format';
import { computeSla, formatCountdown } from '@/lib/sla';

export function IncidentQueue({
  incidents,
  selectedId,
  onSelect,
  loading,
}: {
  incidents: IncidentListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}): ReactElement {
  // Tick every second so SLA countdowns stay live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading && incidents.length === 0) {
    return <p className="p-4 text-sm text-slate-500">Loading incidents…</p>;
  }
  if (incidents.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-400 font-medium">No active incidents</p>
        <p className="text-slate-600 text-sm mt-1">New emergencies appear here instantly.</p>
      </div>
    );
  }

  const breachedCount = incidents.filter((i) => computeSla(i, now).breached).length;

  return (
    <div>
      {breachedCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-red-600/15 border-b border-red-900/40 text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold">
            {breachedCount} incident{breachedCount > 1 ? 's' : ''} past SLA — supervisor notified
          </span>
        </div>
      )}
      <div className="divide-y divide-slate-800">
        {incidents.map((inc) => (
          <IncidentRow
            key={inc.id}
            inc={inc}
            now={now}
            selected={inc.id === selectedId}
            onSelect={() => onSelect(inc.id)}
          />
        ))}
      </div>
    </div>
  );
}

function IncidentRow({
  inc,
  now,
  selected,
  onSelect,
}: {
  inc: IncidentListItem;
  now: number;
  selected: boolean;
  onSelect: () => void;
}): ReactElement {
  const Icon = categoryIcon(inc.category);
  const prio = priorityClasses(inc.priority);
  const status = statusClasses(inc.status);
  const sla = computeSla(inc, now);
  const loc = inc.incident_locations;
  const address =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality].filter(Boolean).join(', ') || 'Location pending');

  const edge = sla.breached
    ? 'border-l-red-500'
    : selected
      ? 'border-l-sky-500'
      : 'border-l-transparent';

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 border-l-2 ${edge} transition-colors hover:bg-slate-800/60 ${
        selected ? 'bg-slate-800' : sla.breached ? 'bg-red-950/20' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 h-9 w-9 shrink-0 rounded-lg ${prio.bg} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${prio.text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100 truncate">{titleCase(inc.category)}</span>
            <span className="text-[11px] text-slate-500 shrink-0">{timeAgo(inc.submitted_at)}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${prio.bg} ${prio.text}`}>
              {titleCase(inc.priority)}
            </span>
            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${status.bg} ${status.text}`}>
              {titleCase(inc.status)}
            </span>
            <span className="text-[11px] font-mono text-slate-600">{inc.public_reference}</span>
          </div>

          {/* SLA countdown */}
          {!sla.met && <SlaChip label={sla.label} remaining={sla.remainingSecs} breached={sla.breached} warn={sla.warn} />}

          <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
            <MapPin className="h-3 w-3 shrink-0 text-slate-600" />
            <span className="truncate">{address}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function SlaChip({
  label,
  remaining,
  breached,
  warn,
}: {
  label: string;
  remaining: number;
  breached: boolean;
  warn: boolean;
}): ReactElement {
  const tone = breached
    ? 'bg-red-500/20 text-red-300'
    : warn
      ? 'bg-amber-500/20 text-amber-300'
      : 'bg-slate-700/50 text-slate-300';
  return (
    <div className={`mt-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {breached ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      <span>
        {breached ? 'SLA ' : `${label} `}
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}
