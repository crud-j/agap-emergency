'use client';

import { useState, type JSX } from 'react';
import Link from 'next/link';
import {
  ArrowRight, BedDouble, Building2, FileText, HeartPulse, Network, PencilLine, ScrollText, Siren, Target, Tent, Zap,
} from 'lucide-react';
import { Badge, Button, PriorityBadge, Skeleton, StatusChip } from '@/components/ui';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { useMajorIncidents } from '@/features/oversight/hooks';
import { useIncidentAgencies, useUpdateIcs } from '@/features/incidents/command-hooks';
import type { IcsStructure } from '@/features/incidents/command';
import { useIncidentAudit } from '@/features/audit/hooks';
import { useFacilities } from '@/features/hospitals/hooks';
import { timeAgo, titleCase } from '@/lib/incident-format';
import { cn } from '@/lib/utils';

/** Mirrors ICS_SITUATION_NOTES_MAX in incidents.service.ts. */
const SITUATION_NOTES_MAX = 4000;
const COMMAND_LOG_SHOWN = 25;

/** facilities.receiving_status (facility_receiving_status enum). */
const RECEIVING_VARIANT: Record<string, 'green' | 'amber' | 'red' | 'muted'> = {
  OPEN: 'green',
  EMERGENCY_ONLY: 'amber',
  AT_CAPACITY: 'red',
  CLOSED: 'red',
  UNKNOWN: 'muted',
};

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ─── Major incidents ──────────────────────────────────────────────────────────

/** Active incidents under ICS command or in an active surge (GET /oversight/major-incidents). */
export function MajorIncidentsPanel({ selectedId, onSelect }: {
  selectedId: string | null;
  onSelect: (incidentId: string) => void;
}): JSX.Element {
  const { data, isLoading, isError } = useMajorIncidents();
  return (
    <DashboardPanel title={<><Siren size={14} className="text-agap-textSub" /> Major incidents</>}>
      {isError ? (
        <p className="text-sm text-agap-danger">Couldn&apos;t load major incidents.</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-16 w-full" />
      ) : data.length === 0 ? (
        <p className="text-sm text-agap-textSub">No incident is under ICS command or in an active surge.</p>
      ) : (
        <ul className="-mx-2">
          {data.map((m) => (
            <li key={m.incidentId}>
              <button
                type="button"
                onClick={() => onSelect(m.incidentId)}
                aria-pressed={selectedId === m.incidentId}
                className={cn(
                  'flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2 text-left hover:bg-agap-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/40',
                  selectedId === m.incidentId && 'bg-agap-greenSoft',
                )}
              >
                <span className="font-mono text-[12px] font-semibold text-agap-textMain">{m.publicReference}</span>
                <PriorityBadge priority={m.priority} />
                <StatusChip status={m.status} />
                <span className="text-[12px] text-agap-textMid">
                  {titleCase(m.category)}{m.barangay && ` · ${m.barangay}`}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                  {m.icsActive && <Badge variant="green">ICS · {m.positionsFilled} position{m.positionsFilled === 1 ? '' : 's'}</Badge>}
                  {m.surgeName && <Badge variant="red"><Zap size={11} /> {m.surgeName}</Badge>}
                  {m.agencies > 0 && <Badge variant="blue"><Network size={11} /> {m.agencies}</Badge>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

// ─── Objectives and situation report ─────────────────────────────────────────

/** Stored in incident_command_structures.objectives / situation_notes via PATCH /incidents/:id/ics. */
export function CommandBriefPanel({ incidentId, ics, editable }: {
  incidentId: string;
  ics: IcsStructure;
  editable: boolean;
}): JSX.Element {
  const update = useUpdateIcs();
  const [editing, setEditing] = useState(false);
  const [objectivesText, setObjectivesText] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setObjectivesText(ics.objectives.join('\n'));
    setNotes(ics.situation_notes ?? '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    try {
      setError(null);
      await update.mutateAsync({
        incidentId,
        data: {
          objectives: objectivesText.split('\n').map((s) => s.trim()).filter(Boolean),
          situationNotes: notes,
        },
      });
      setEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Saving failed.');
    }
  }

  const fieldClass = 'w-full rounded-xl border border-[rgba(168,181,193,0.35)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green';

  return (
    <DashboardPanel
      title={<><Target size={14} className="text-agap-textSub" /> Objectives and situation report</>}
      action={editable && !editing ? (
        <Button variant="secondary" size="sm" onClick={startEdit}><PencilLine size={13} /> Edit</Button>
      ) : undefined}
    >
      {editing ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-agap-textSub">Objectives (one per line)</span>
            <textarea rows={4} value={objectivesText} onChange={(e) => setObjectivesText(e.target.value)} className={cn(fieldClass, 'resize-y')} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-agap-textSub">Situation report</span>
            <textarea
              rows={5}
              maxLength={SITUATION_NOTES_MAX}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Current conditions, hazards, resources on scene, next update time."
              className={cn(fieldClass, 'resize-y')}
            />
            <span className="mt-1 block text-right text-[11px] text-agap-textSub">{notes.length} / {SITUATION_NOTES_MAX}</span>
          </label>
          {error && <p className="text-xs text-agap-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={update.isPending} onClick={save}>Save</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-agap-textSub">Objectives</p>
            {ics.objectives.length === 0 ? (
              <p className="text-sm text-agap-textSub">No objectives recorded.</p>
            ) : (
              <ul className="space-y-1">
                {ics.objectives.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-agap-textMain">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-agap-green" />
                    {obj}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-agap-textSub">
              <FileText size={12} /> Situation report
            </p>
            {ics.situation_notes ? (
              <p className="whitespace-pre-wrap text-sm text-agap-textMain">{ics.situation_notes}</p>
            ) : (
              <p className="text-sm text-agap-textSub">No situation report yet.</p>
            )}
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}

// ─── Agency coordination ─────────────────────────────────────────────────────

/** Organizations participating in this incident (MOD-34). Adding agencies stays on Multi-Agency. */
export function AgencyCoordinationPanel({ incidentId }: { incidentId: string }): JSX.Element {
  const { data, isLoading, isError } = useIncidentAgencies(incidentId);
  const current = (data ?? []).filter((a) => !a.left_at);
  return (
    <DashboardPanel
      title={<><Network size={14} className="text-agap-textSub" /> Agency coordination</>}
      action={(
        <Link href="/operations/multi-agency" className="flex items-center gap-1 text-[12px] font-semibold text-agap-green hover:text-agap-green/80">
          Multi-Agency <ArrowRight size={13} />
        </Link>
      )}
    >
      {isError ? (
        <p className="text-sm text-agap-danger">Couldn&apos;t load agencies.</p>
      ) : isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : current.length === 0 ? (
        <p className="text-sm text-agap-textSub">No other agency has joined this incident.</p>
      ) : (
        <ul className="divide-y divide-agap-track/15">
          {current.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <Building2 size={14} className="shrink-0 text-agap-textSub" />
              <span className="text-[13px] font-semibold text-agap-textMain">
                {a.organizations?.short_name ?? a.organizations?.name ?? '—'}
              </span>
              {a.organizations && <Badge variant="muted">{titleCase(a.organizations.organization_type)}</Badge>}
              <span className="truncate text-[12px] text-agap-textSub">{a.role_in_incident ?? ''}</span>
              <span className="ml-auto whitespace-nowrap text-[11px] text-agap-textSub">joined {timeAgo(a.joined_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardPanel>
  );
}

// ─── Hospitals and evacuation centers ────────────────────────────────────────

/** Receiving status and capacity from the facilities registry (GET /facilities). */
export function HospitalEvacuationPanel(): JSX.Element {
  const { data, isLoading, isError } = useFacilities();
  const hospitals = (data ?? []).filter((f) => f.facility_type === 'HOSPITAL');
  const evacuation = (data ?? []).filter((f) => f.facility_type === 'EVACUATION_CENTER');

  const capacity = (f: { capacity_available: number | null; capacity_total: number | null }) =>
    f.capacity_total === null ? 'Capacity not recorded' : `${f.capacity_available ?? '—'} of ${f.capacity_total} available`;

  const list = (rows: typeof hospitals, empty: string, showStatus: boolean) =>
    rows.length === 0 ? <p className="text-sm text-agap-textSub">{empty}</p> : (
      <ul className="divide-y divide-agap-track/15">
        {rows.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
            <span className="text-[13px] font-semibold text-agap-textMain">{f.name}</span>
            {f.barangay && <span className="text-[12px] text-agap-textSub">{f.barangay}</span>}
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[12px] text-agap-textMid">{capacity(f)}</span>
              {showStatus && (
                <Badge variant={RECEIVING_VARIANT[f.receiving_status] ?? 'muted'}>
                  {titleCase(f.receiving_status)}
                </Badge>
              )}
            </span>
          </li>
        ))}
      </ul>
    );

  return (
    <DashboardPanel
      title={<><HeartPulse size={14} className="text-agap-textSub" /> Hospitals and evacuation centers</>}
      bodyClassName="space-y-4"
    >
      {isError ? (
        <p className="text-sm text-agap-danger">Couldn&apos;t load facilities.</p>
      ) : isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-agap-textSub">
              <BedDouble size={12} /> Hospitals
            </p>
            {list(hospitals, 'No hospitals registered.', true)}
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-agap-textSub">
              <Tent size={12} /> Evacuation centers
            </p>
            {list(evacuation, 'No evacuation centers registered. Add them under Hospitals & Facilities.', false)}
          </div>
        </>
      )}
    </DashboardPanel>
  );
}

// ─── Command log ─────────────────────────────────────────────────────────────

/** Audit entries recorded for this incident (GET /audit/incidents/:id), newest first. */
export function CommandLogPanel({ incidentId }: { incidentId: string }): JSX.Element {
  const { data, isLoading, isError } = useIncidentAudit(incidentId);
  return (
    <DashboardPanel title={<><ScrollText size={14} className="text-agap-textSub" /> Command log</>}>
      {isError ? (
        <p className="text-sm text-agap-danger">Couldn&apos;t load the command log.</p>
      ) : isLoading || !data ? (
        <Skeleton className="h-24 w-full" />
      ) : data.length === 0 ? (
        <p className="text-sm text-agap-textSub">No recorded actions for this incident yet.</p>
      ) : (
        <ol className="space-y-2">
          {data.slice(0, COMMAND_LOG_SHOWN).map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
              <span className="w-28 shrink-0 font-mono text-[11px] text-agap-textSub">{fmtTs(e.occurred_at)}</span>
              <Badge variant="muted">{titleCase(e.action)}</Badge>
              <span className="text-agap-textMid">{titleCase(e.entity_type ?? '')}</span>
              <span className="text-agap-textSub">· {e.users?.full_name ?? (e.actor_id ? 'Staff' : 'System')}</span>
            </li>
          ))}
          {data.length > COMMAND_LOG_SHOWN && (
            <li className="text-[11px] text-agap-textSub">
              {data.length - COMMAND_LOG_SHOWN} older entries in the <Link href="/audit" className="font-semibold text-agap-green">Activity Log</Link>.
            </li>
          )}
        </ol>
      )}
    </DashboardPanel>
  );
}
