'use client';

import { Suspense, useEffect, useState, type JSX, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Siren, Plus, CheckCircle2, Circle, Users, AlertTriangle, ClipboardList, ArrowRightLeft, Check,
  Crown, UserPlus, Info, ChevronDown, ExternalLink, Zap, Network, Flag, Repeat, Timer, History, BellRing,
  RotateCcw,
} from 'lucide-react';
import {
  Button, Badge, PriorityBadge, StatusChip,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
  Skeleton, EmptyState,
} from '@/components/ui';
import { confirmAction, escapeHtml, notify } from '@/components/ui/alerts';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { useNow } from '@/lib/use-now';
import { ApiError } from '@/lib/api';
import { ACTIVE_STATUSES, titleCase } from '@/lib/incident-format';
import { useIncidents } from '@/features/incidents/hooks';
import { useMajorIncidents } from '@/features/oversight/hooks';
import type { MajorIncident } from '@/features/oversight/api';
import type { IncidentListItem } from '@/features/incidents/api';
import {
  useIncidentIcs,
  useActivateIcs,
  useDeactivateIcs,
  useAddIcsPosition,
  useSetIncidentCommander,
  useRemoveIcsPosition,
  useHandovers,
  useAcknowledgeHandover,
  useHandoverRecipients,
  useIncidentAgencies,
} from '@/features/incidents/command-hooks';
import { useResponders } from '@/features/responders/hooks';
import { buildIcsCandidates } from '@/features/incidents/ics-candidates';
import { ICS_POSITIONS, INCIDENT_COMMANDER, icsPositionLabel } from '@/features/incidents/ics-positions';
import type { IcsAssignment, IcsStructure, HandoverRecord } from '@/features/incidents/command';
import { cn } from '@/lib/utils';
import { CreateHandoverDialog } from '@/components/command/CreateHandoverDialog';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import {
  AgencyCoordinationPanel,
  CommandBriefPanel,
  CommandLogPanel,
  HospitalEvacuationPanel,
} from '@/components/command/CommandSections';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INTRO_STORAGE_KEY = 'agap.command.intro';
const panel = 'rounded-xl border border-agap-track/40 bg-white shadow-card';
const fieldClass = 'w-full rounded-xl border border-[rgba(168,181,193,0.35)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green';

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function personName(a: IcsAssignment): string {
  return a.users?.full_name ?? 'Unnamed user';
}

const current = (ics: IcsStructure) => ics.ics_assignments.filter((a) => !a.relieved_at);

/** "They are notified" only when someone else is affected: nobody is notified of their own action. */
function notifiedSuffix(userId: string | undefined, selfId: string | undefined): string {
  return userId && userId !== selfId ? ' They have been notified.' : '';
}

// ─── "What is this page?" ────────────────────────────────────────────────────

function IntroCard(): JSX.Element {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(INTRO_STORAGE_KEY) === 'closed') setOpen(false);
    } catch {
      /* storage unavailable — keep it open */
    }
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, next ? 'open' : 'closed');
    } catch {
      /* storage unavailable — preference just won't persist */
    }
  }

  const step = (n: number, children: ReactNode) => (
    <li className="flex gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-agap-green text-[11px] font-bold text-white">{n}</span>
      <span>{children}</span>
    </li>
  );

  return (
    <section className={cn(panel, 'border-[rgba(37,99,235,0.20)] bg-agap-infoSoft/40')}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-5 py-3 text-left text-[13px] font-bold text-agap-textMain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/40"
      >
        <Info size={15} className="shrink-0 text-agap-info" />
        What is Incident Command, and when do I use it?
        <ChevronDown size={15} className={cn('ml-auto shrink-0 text-agap-textSub transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid gap-5 px-5 pb-5 md:grid-cols-2">
          <div>
            <p className="text-[13px] text-agap-textMid">
              Most emergencies need one ambulance and a dispatcher. <strong>Big ones need more</strong>: a fireworks
              explosion, a flood rescue, a multi-vehicle crash on NLEX. Many teams arrive at once, and without one
              plan they get in each other&apos;s way.
            </p>
            <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-agap-textSub">Start command when</p>
            <ul className="mt-1 space-y-1 text-[13px] text-agap-textMain">
              <li className="flex gap-2"><span className="text-agap-textSub">•</span>More than one team or agency is on scene (BFP, PNP, barangay)</li>
              <li className="flex gap-2"><span className="text-agap-textSub">•</span>Many people are hurt or at risk</li>
              <li className="flex gap-2"><span className="text-agap-textSub">•</span>It will last for hours (big fire, flood, evacuation)</li>
            </ul>
          </div>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-agap-textSub">It does three things</p>
            <ol className="mt-1 space-y-2 text-[13px] text-agap-textMain">
              {step(1, <><strong>Puts one person in charge</strong>: the Incident Commander.</>)}
              {step(2, <><strong>Gives others clear jobs</strong>, so nobody does the same work twice. Each person is notified.</>)}
              {step(3, <><strong>Keeps one shared plan</strong>: goals and the latest update. Crews see it in the AGAP app.</>)}
            </ol>
            <p className="mt-3 text-[12px] text-agap-textSub">
              Command ends by itself when the incident is resolved or closed. Everything is kept for the after-action review.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Incident list (left) ────────────────────────────────────────────────────

interface RowIncident {
  id: string;
  ref: string;
  category: string;
  priority: string;
  barangay: string | null;
}

function IncidentRow({ incident, major, selected, onSelect }: {
  incident: RowIncident;
  major?: MajorIncident;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          'relative w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-agap-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/40',
          selected && 'bg-agap-greenSoft hover:bg-agap-greenSoft',
        )}
      >
        {selected && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-agap-green" />}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-agap-textMain">{incident.ref}</span>
          <PriorityBadge priority={incident.priority} />
        </div>
        <p className="mt-0.5 truncate text-[12px] text-agap-textMid">
          {titleCase(incident.category)}{incident.barangay && ` · ${incident.barangay}`}
        </p>
        {major && (major.icsActive || major.surgeName) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {major.icsActive && <Badge variant="green"><Crown size={11} /> Under command</Badge>}
            {major.surgeName && <Badge variant="red"><Zap size={11} /> {major.surgeName}</Badge>}
            {major.agencies > 0 && <Badge variant="blue"><Network size={11} /> {major.agencies}</Badge>}
          </div>
        )}
      </button>
    </li>
  );
}

function IncidentList({ selectedId, onSelect }: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  const incidents = useIncidents({ statuses: ACTIVE_STATUSES, perPage: 100 });
  const majors = useMajorIncidents();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const matches = (r: RowIncident) =>
    !q || [r.ref, r.category, r.barangay ?? ''].some((v) => v.toLowerCase().includes(q));

  const majorById = new Map((majors.data ?? []).map((m) => [m.incidentId, m]));
  const commanded = (majors.data ?? [])
    .map((m) => ({ row: { id: m.incidentId, ref: m.publicReference, category: m.category, priority: m.priority, barangay: m.barangay }, major: m }))
    .filter(({ row }) => matches(row));
  const others = (incidents.data?.data ?? [])
    .filter((i: IncidentListItem) => ACTIVE_STATUSES.includes(i.status) && !majorById.has(i.id))
    .map((i) => ({ id: i.id, ref: i.public_reference, category: i.category, priority: i.priority, barangay: i.incident_locations?.barangay ?? null }))
    .filter(matches);

  return (
    <aside className={cn(panel, 'lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto')}>
      <div className="border-b border-agap-track/30 px-4 py-3">
        <h2 className="text-[13px] font-bold text-agap-textMain">Choose an incident</h2>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reference, type, barangay"
          aria-label="Search incidents"
          className={cn(fieldClass, 'mt-2 h-9 py-1.5 text-[13px]')}
        />
      </div>
      <div className="space-y-4 p-2">
        <div>
          <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-agap-textSub">
            Big incidents now ({commanded.length})
          </p>
          {majors.isLoading ? (
            <Skeleton className="mx-3 h-14" />
          ) : majors.isError ? (
            <p className="px-3 text-[12px] text-agap-danger">Could not load. It will retry.</p>
          ) : commanded.length === 0 ? (
            <p className="px-3 text-[12px] text-agap-textSub">{q ? 'No match.' : 'None right now.'}</p>
          ) : (
            <ul>
              {commanded.map(({ row, major }) => (
                <IncidentRow key={row.id} incident={row} major={major} selected={selectedId === row.id} onSelect={() => onSelect(row.id)} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-agap-textSub">
            Other active incidents ({others.length})
          </p>
          {incidents.isLoading ? (
            <Skeleton className="mx-3 h-24" />
          ) : others.length === 0 ? (
            <p className="px-3 pb-2 text-[12px] text-agap-textSub">{q ? 'No match.' : 'No other active incidents.'}</p>
          ) : (
            <ul>
              {others.map((row) => (
                <IncidentRow key={row.id} incident={row} selected={selectedId === row.id} onSelect={() => onSelect(row.id)} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Person picker (shared by Start and Assign dialogs) ──────────────────────

function PersonSelect({ value, onChange, labelId, holders = [], enabled }: {
  value: string;
  onChange: (id: string) => void;
  labelId: string;
  /** Current job holders, to show "already Safety Officer" next to names. */
  holders?: IcsAssignment[];
  enabled: boolean;
}): JSX.Element {
  const user = useAuthUser();
  const staff = useHandoverRecipients(enabled);
  const responders = useResponders(undefined, { enabled });
  const loading = staff.isLoading || responders.isLoading;
  const groups = buildIcsCandidates({ self: user, staff: staff.data ?? [], responders: responders.data ?? [] });
  const heldBy = new Map<string, string[]>();
  for (const a of holders) {
    if (!a.users) continue;
    heldBy.set(a.users.id, [...(heldBy.get(a.users.id) ?? []), icsPositionLabel(a.position)]);
  }

  return (
    <>
      <Select value={value} onValueChange={onChange} disabled={loading || groups.length === 0}>
        <SelectTrigger aria-labelledby={labelId}>
          <SelectValue placeholder={loading ? 'Loading people…' : groups.length === 0 ? 'No one available' : 'Select a person'} />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.people.map((p) => {
                const held = heldBy.get(p.id);
                return (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.detail}{held ? ` — already ${held.join(', ')}` : ''}
                  </SelectItem>
                );
              })}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1.5 text-xs text-agap-textSub">
        {staff.isError || responders.isError
          ? "Part of the list couldn't load. Close and reopen to try again."
          : 'Supervisors, dispatchers and responders with an active AGAP account.'}
      </p>
    </>
  );
}

function NotifiedNote(): JSX.Element {
  return (
    <p className="flex items-center gap-1.5 rounded-lg bg-agap-surface px-3 py-2 text-[12px] text-agap-textMid">
      <BellRing size={13} className="shrink-0 text-agap-textSub" />
      They get a notification in AGAP on their phone or console.
    </p>
  );
}

// ─── Start command ───────────────────────────────────────────────────────────

function StartCommandDialog({ incidentId, open, onClose, restart }: {
  incidentId: string;
  open: boolean;
  onClose: () => void;
  restart: boolean;
}): JSX.Element {
  const user = useAuthUser();
  const [commanderId, setCommanderId] = useState('');
  const [goals, setGoals] = useState('');
  const [error, setError] = useState<string | null>(null);
  const activate = useActivateIcs();

  useEffect(() => {
    if (open) {
      setCommanderId(user?.id ?? '');
      setGoals('');
      setError(null);
    }
  }, [open, user?.id]);

  async function confirm() {
    if (!commanderId) {
      setError('Choose who is in charge.');
      return;
    }
    try {
      setError(null);
      const ics = await activate.mutateAsync({
        incidentId,
        objectives: goals.split('\n').map((s) => s.trim()).filter(Boolean),
        commanderUserId: commanderId,
      });
      onClose();
      const ic = current(ics).find((a) => a.position === INCIDENT_COMMANDER);
      void notify('success', {
        title: restart ? 'Command started again' : 'Incident Command started',
        text: ic
          ? `${ic.users?.id === user?.id ? 'You are' : `${personName(ic)} is`} in charge.${notifiedSuffix(ic.users?.id, user?.id)}`
          : 'Name the person in charge next.',
      });
    } catch (e) {
      setError(errorText(e, 'Could not start command. Try again.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !activate.isPending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Siren size={16} className="text-agap-green" /> {restart ? 'Start command again' : 'Start Incident Command'}
          </DialogTitle>
          <DialogDescription>
            Name the person in charge. You can add goals and other jobs after.
            {restart && ' The earlier plan and team stay in the history.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label id="start-ic-label" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-agap-textMid">
              Who is in charge? <span className="text-agap-danger" aria-hidden="true">*</span>
            </label>
            <PersonSelect value={commanderId} onChange={(v) => { setCommanderId(v); setError(null); }} labelId="start-ic-label" enabled={open} />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-agap-textMid">
              Goals <span className="font-normal normal-case text-agap-textSub">(optional, one per line)</span>
            </span>
            <textarea
              rows={3}
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              placeholder={'Get everyone out safely.\nStop the fire from spreading.'}
              className={cn(fieldClass, 'resize-none')}
            />
          </label>
          {commanderId && commanderId !== user?.id && <NotifiedNote />}
          {error && <p role="alert" className="text-xs text-agap-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={activate.isPending}>Cancel</Button>
          <Button variant="primary" loading={activate.isPending} onClick={confirm}>Start command</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotUnderCommand({ incidentId, canCommand }: { incidentId: string; canCommand: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(panel, 'flex flex-col items-center gap-4 px-6 py-10 text-center')}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-agap-surface">
        <Siren size={24} className="text-agap-textSub" />
      </div>
      <div className="max-w-md">
        <h3 className="font-bold text-agap-textMain">This incident is not under command</h3>
        <p className="mt-1 text-sm text-agap-textSub">
          That is normal for most incidents. Start command only if it is big: many teams, many people hurt,
          or it will last for hours.
        </p>
      </div>
      {canCommand ? (
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Siren size={15} /> Start Incident Command
        </Button>
      ) : (
        <p className="text-xs text-agap-textSub">Only a Supervisor can start command.</p>
      )}
      <StartCommandDialog incidentId={incidentId} open={open} onClose={() => setOpen(false)} restart={false} />
    </div>
  );
}

// ─── Status bars ─────────────────────────────────────────────────────────────

function RunningBar({ ics, canCommand, onChangeCommander, onEnd }: {
  ics: IcsStructure;
  canCommand: boolean;
  onChangeCommander: () => void;
  onEnd: () => void;
}): JSX.Element {
  const now = useNow(30_000);
  const commander = current(ics).find((a) => a.position === INCIDENT_COMMANDER);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-[rgba(13,96,83,0.20)] bg-agap-greenSoft px-5 py-3.5">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-agap-green opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-agap-green" />
        </span>
        <div>
          <p className="text-[13px] font-bold text-agap-textMain">Under command</p>
          <p className="flex items-center gap-1 text-[12px] text-agap-textMid">
            <Timer size={12} /> {fmtDuration(now - new Date(ics.activated_at).getTime())} · since {fmtTs(ics.activated_at)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 border-agap-track/60 sm:border-l sm:pl-5">
        <Crown size={16} className={commander ? 'text-agap-green' : 'text-agap-danger'} />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-agap-textSub">In charge</p>
          {commander
            ? <p className="text-[13px] font-bold text-agap-textMain">{personName(commander)}</p>
            : <p className="text-[13px] font-bold text-agap-danger">No one yet</p>}
        </div>
      </div>
      {canCommand && (
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant={commander ? 'secondary' : 'primary'} onClick={onChangeCommander}>
            {commander ? <><Repeat size={13} /> Change commander</> : <><Crown size={13} /> Name commander</>}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEnd}>
            <Flag size={13} /> End command
          </Button>
        </div>
      )}
    </div>
  );
}

function EndedBar({ ics, incidentId, canCommand, incidentActive }: {
  ics: IcsStructure;
  incidentId: string;
  canCommand: boolean;
  incidentActive: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ended = ics.deactivated_at!;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-agap-track/50 bg-agap-surface px-5 py-3.5">
      <Flag size={18} className="shrink-0 text-agap-textSub" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-agap-textMain">Command ended {fmtTs(ended)}</p>
        <p className="text-[12px] text-agap-textSub">
          It ran for {fmtDuration(new Date(ended).getTime() - new Date(ics.activated_at).getTime())}.
          The final plan and everyone who held a job are kept below.
        </p>
      </div>
      {canCommand && incidentActive && (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <RotateCcw size={13} /> Start again
        </Button>
      )}
      <StartCommandDialog incidentId={incidentId} open={open} onClose={() => setOpen(false)} restart />
    </div>
  );
}

// ─── Setup checklist ─────────────────────────────────────────────────────────

function ChecklistItem({ done, optional, title, hint, action }: {
  done: boolean;
  optional?: boolean;
  title: string;
  hint: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {done
        ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-agap-green" aria-label="Done" />
        : <Circle size={18} className="mt-0.5 shrink-0 text-agap-track" aria-label="Not done" />}
      <div className="min-w-0 flex-1">
        <p className={cn('text-[13px] font-semibold', done ? 'text-agap-textSub' : 'text-agap-textMain')}>
          {title}{optional && <span className="ml-1.5 font-normal text-agap-textSub">(if needed)</span>}
        </p>
        {!done && <p className="text-[12px] text-agap-textSub">{hint}</p>}
      </div>
      {!done && action}
    </li>
  );
}

function SetupChecklist({ incidentId, ics, onNameCommander, onEditPlan }: {
  incidentId: string;
  ics: IcsStructure;
  onNameCommander: () => void;
  onEditPlan: () => void;
}): JSX.Element | null {
  const agencies = useIncidentAgencies(incidentId);
  const holders = current(ics);
  const hasCommander = holders.some((a) => a.position === INCIDENT_COMMANDER);
  const otherJobs = holders.some((a) => a.position !== INCIDENT_COMMANDER);
  const hasGoals = ics.objectives.length > 0;
  const hasUpdate = !!ics.situation_notes?.trim();
  const hasAgencies = (agencies.data ?? []).some((a) => !a.left_at);

  const required = [hasCommander, hasGoals, hasUpdate];
  const doneCount = required.filter(Boolean).length;
  const [showDone, setShowDone] = useState(false);
  const allDone = doneCount === required.length;

  if (allDone && !showDone) {
    return (
      <button
        type="button"
        onClick={() => setShowDone(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-agap-track/40 bg-white px-5 py-2.5 text-left text-[13px] text-agap-textMid shadow-card hover:bg-agap-surface"
      >
        <CheckCircle2 size={16} className="text-agap-green" />
        <strong className="text-agap-textMain">Setup done.</strong> Commander named, goals and first update written.
        <span className="ml-auto text-[12px] font-semibold text-agap-green">Show steps</span>
      </button>
    );
  }

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section className={panel}>
      <div className="flex items-center justify-between gap-3 border-b border-agap-track/30 px-5 py-3.5">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-agap-textMain">
          <ClipboardList size={14} className="text-agap-textSub" /> Setup steps
        </h2>
        <div className="flex items-center gap-3">
          <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-agap-track/40 sm:block" aria-hidden="true">
            <div className="h-full rounded-full bg-agap-green transition-all" style={{ width: `${(doneCount / required.length) * 100}%` }} />
          </div>
          <span className={cn('text-[12px] font-semibold', allDone ? 'text-agap-green' : 'text-agap-textSub')}>
            {allDone ? 'Ready' : `${doneCount} of ${required.length} done`}
          </span>
        </div>
      </div>
      <ol className="divide-y divide-agap-track/15 px-5">
        <ChecklistItem
          done={hasCommander}
          title="Put someone in charge"
          hint="Name the Incident Commander. Everyone reports to them."
          action={<Button size="sm" variant="primary" onClick={onNameCommander}><Crown size={13} /> Name</Button>}
        />
        <ChecklistItem
          done={hasGoals}
          title="Write the goals"
          hint="What must the teams achieve? Short lines, most important first."
          action={<Button size="sm" variant="secondary" onClick={onEditPlan}>Write goals</Button>}
        />
        <ChecklistItem
          done={hasUpdate}
          title="Write the first situation update"
          hint="What is happening now and what is still needed. Update it as things change."
          action={<Button size="sm" variant="secondary" onClick={onEditPlan}>Write update</Button>}
        />
        <ChecklistItem
          done={otherJobs}
          optional
          title="Give out other jobs"
          hint="For bigger incidents: someone for the teams on the ground, supplies, safety, public updates."
          action={<Button size="sm" variant="secondary" onClick={() => scrollTo('command-team')}>See jobs</Button>}
        />
        <ChecklistItem
          done={hasAgencies}
          optional
          title="Add other agencies"
          hint="When BFP, PNP or another agency joins the response."
          action={(
            <Link href="/operations/multi-agency" className="inline-flex h-8 items-center gap-1 rounded-lg border border-agap-track/50 px-3 text-[12px] font-semibold text-agap-textMain hover:bg-agap-surface">
              Multi-Agency <ExternalLink size={12} />
            </Link>
          )}
        />
      </ol>
      {allDone && (
        <div className="border-t border-agap-track/30 px-5 py-2 text-right">
          <button type="button" onClick={() => setShowDone(false)} className="text-[12px] font-semibold text-agap-green">Hide steps</button>
        </div>
      )}
    </section>
  );
}

// ─── Assign / change commander ───────────────────────────────────────────────

function AssignDialog({ incidentId, position, onClose, holders }: {
  incidentId: string;
  /** Open when set. */
  position: string | null;
  onClose: () => void;
  holders: IcsAssignment[];
}): JSX.Element {
  const user = useAuthUser();
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddIcsPosition();
  const setCommander = useSetIncidentCommander();
  const open = !!position;
  const info = ICS_POSITIONS.find((p) => p.key === position);
  const isCommander = position === INCIDENT_COMMANDER;
  const currentCommander = isCommander ? holders.find((a) => a.position === INCIDENT_COMMANDER) : undefined;
  const pending = add.isPending || setCommander.isPending;

  useEffect(() => {
    if (open) {
      setUserId('');
      setError(null);
    }
  }, [open, position]);

  async function confirm() {
    if (!position || !userId) {
      setError('Choose a person.');
      return;
    }
    try {
      setError(null);
      const ics = isCommander
        ? await setCommander.mutateAsync({ incidentId, userId })
        : await add.mutateAsync({ incidentId, data: { position, userId } });
      onClose();
      const holder = current(ics).find((a) => a.position === position && a.users?.id === userId);
      const who = userId === user?.id ? 'You are' : `${holder ? personName(holder) : 'They'} is`;
      const job = isCommander ? 'the Incident Commander' : icsPositionLabel(position);
      void notify('success', {
        title: currentCommander ? 'Command handed over' : 'Job assigned',
        text: `${who} now ${job}.${notifiedSuffix(userId, user?.id)}`,
      });
    } catch (e) {
      setError(errorText(e, 'Could not assign. Try again.'));
    }
  }

  const title = currentCommander ? 'Change the Incident Commander' : `Assign ${info?.label ?? 'a job'}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !pending) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {currentCommander ? <Repeat size={16} className="text-agap-green" /> : <UserPlus size={16} className="text-agap-green" />}
            {title}
          </DialogTitle>
          <DialogDescription>
            {currentCommander
              ? `${personName(currentCommander)} hands command over and is relieved in the same step. Both are notified.`
              : info?.description}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label id="assign-person-label" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-agap-textMid">
              {currentCommander ? 'New commander' : 'Who?'} <span className="text-agap-danger" aria-hidden="true">*</span>
            </label>
            <PersonSelect
              value={userId}
              onChange={(v) => { setUserId(v); setError(null); }}
              labelId="assign-person-label"
              holders={holders}
              enabled={open}
            />
          </div>
          <NotifiedNote />
          {error && <p role="alert" className="text-xs text-agap-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" loading={pending} onClick={confirm}>
            {currentCommander ? 'Hand over command' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Command team ────────────────────────────────────────────────────────────

function PersonChip({ assignment, incidentId, editable }: {
  assignment: IcsAssignment;
  incidentId: string;
  editable: boolean;
}): JSX.Element {
  const user = useAuthUser();
  const remove = useRemoveIcsPosition();
  const name = personName(assignment);
  const job = icsPositionLabel(assignment.position);
  const isSelf = assignment.users?.id === user?.id;

  // The popup runs the request: a failure shows inside it, so it can be retried.
  async function relieve() {
    const ok = await confirmAction({
      title: isSelf ? `Step down as ${job}?` : `Relieve ${name}?`,
      text: `${isSelf ? 'You stop' : `${name} stops`} being ${job} for this incident.`
        + `${isSelf ? '' : ' They will be notified.'} The job stays in the history.`,
      confirmText: isSelf ? 'Step down' : 'Relieve',
      cancelText: 'Keep',
      tone: 'danger',
      icon: 'warning',
      onConfirm: () => remove.mutateAsync({ incidentId, posId: assignment.id }),
    });
    if (ok) {
      void notify('success', {
        title: isSelf ? 'You stepped down' : `${name} relieved`,
        text: `No longer ${job}.${notifiedSuffix(assignment.users?.id, user?.id)}`,
      });
    }
  }

  return (
    <div className="rounded-lg bg-agap-surface px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-agap-green text-[11px] font-bold text-white">
          {name[0]?.toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-agap-textMain">{name}</p>
          <p className="truncate text-[11px] text-agap-textSub">
            {titleCase(assignment.users?.role ?? '')}
            {assignment.organizations && ` · ${assignment.organizations.short_name ?? assignment.organizations.name}`}
            {' · since '}{fmtTs(assignment.assigned_at)}
          </p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => void relieve()}
            disabled={remove.isPending}
            aria-label={`Relieve ${name} as ${job}`}
            className="rounded-md px-2 py-1 text-[12px] font-semibold text-agap-textSub hover:bg-agap-dangerSoft hover:text-agap-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-danger/40 disabled:opacity-50"
          >
            Relieve
          </button>
        )}
      </div>
    </div>
  );
}

function CommandTeam({ incidentId, ics, editable, onAssign }: {
  incidentId: string;
  ics: IcsStructure;
  editable: boolean;
  onAssign: (position: string) => void;
}): JSX.Element {
  const holders = current(ics);
  const running = !ics.deactivated_at;
  const [commander, ...others] = ICS_POSITIONS;
  const filled = others.filter((p) => holders.some((a) => a.position === p.key)).length;

  const card = (key: string, label: string, description: string, primary = false) => {
    const people = holders.filter((a) => a.position === key);
    return (
      <div
        key={key}
        className={cn(
          'flex flex-col rounded-xl border p-4',
          primary ? 'border-[rgba(13,96,83,0.25)] bg-agap-greenSoft/50' : people.length ? 'border-agap-track/50 bg-white' : 'border-dashed border-agap-track/70 bg-white',
        )}
      >
        <div className="flex items-start gap-2">
          {primary && <Crown size={16} className="mt-0.5 shrink-0 text-agap-green" />}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-agap-textMain">{label}</p>
            <p className="text-[12px] text-agap-textSub">{description}</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {people.map((a) => <PersonChip key={a.id} assignment={a} incidentId={incidentId} editable={editable} />)}
          {people.length === 0 && (
            primary && running
              ? <p className="flex items-center gap-1.5 text-[12px] font-semibold text-agap-danger"><AlertTriangle size={13} /> No one is in charge</p>
              : <p className="text-[12px] text-agap-textSub">Not assigned</p>
          )}
        </div>
        {editable && (
          <div className="mt-auto pt-3">
            {primary ? (
              <Button size="sm" variant={people.length ? 'secondary' : 'primary'} onClick={() => onAssign(key)}>
                {people.length ? <><Repeat size={13} /> Change commander</> : <><Crown size={13} /> Name commander</>}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => onAssign(key)}>
                <Plus size={13} /> {people.length === 0 ? 'Assign' : 'Add another'}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className={cn(panel, 'scroll-mt-4')} id="command-team">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-agap-track/30 px-5 py-3.5">
        <div>
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-agap-textMain">
            <Users size={14} className="text-agap-textSub" /> Who does what
          </h2>
          <p className="mt-0.5 text-[12px] text-agap-textSub">
            {running
              ? 'Fill only the jobs you need. A small incident may need only an Incident Commander.'
              : 'Everyone was released when command ended. See the history below.'}
          </p>
        </div>
        <span className="text-[12px] text-agap-textSub">{filled} of {others.length} other jobs filled</span>
      </div>
      <div className="space-y-3 p-4">
        {commander && card(commander.key, commander.label, commander.description, true)}
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {others.map((p) => card(p.key, p.label, p.description))}
        </div>
      </div>
    </section>
  );
}

function JobHistory({ ics }: { ics: IcsStructure }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const past = ics.ics_assignments
    .filter((a) => a.relieved_at)
    .sort((a, b) => b.relieved_at!.localeCompare(a.relieved_at!));
  if (past.length === 0) return null;
  return (
    <section className={panel}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-xl px-5 py-3.5 text-left text-[13px] font-bold text-agap-textMain hover:bg-agap-surface/60"
      >
        <History size={14} className="text-agap-textSub" /> Earlier job holders ({past.length})
        <ChevronDown size={15} className={cn('ml-auto text-agap-textSub transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="divide-y divide-agap-track/15 border-t border-agap-track/30 px-5">
          {past.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-[13px]">
              <span className="font-semibold text-agap-textMain">{personName(a)}</span>
              <Badge variant="muted">{icsPositionLabel(a.position)}</Badge>
              <span className="ml-auto text-[12px] text-agap-textSub">
                {fmtTs(a.assigned_at)} → {fmtTs(a.relieved_at!)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Shift handover (MOD-44) ─────────────────────────────────────────────────

function handoverName(u?: { full_name: string | null; id: string } | null): string {
  if (!u) return '—';
  return u.full_name ?? u.id.slice(0, 8);
}

function HandoverPanel({ incidentId }: { incidentId: string }): JSX.Element {
  const user = useAuthUser();
  const { data: handovers, isLoading } = useHandovers(incidentId);
  const acknowledge = useAcknowledgeHandover();
  const [createOpen, setCreateOpen] = useState(false);

  const list = handovers ?? [];
  const myPending = list.find((h) => h.acknowledged_at == null && h.to_user_id === user?.id);

  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-agap-track/30 px-5 py-3.5">
        <div>
          <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-agap-textMain">
            <ArrowRightLeft size={14} className="text-agap-textSub" /> Shift handover
          </h2>
          <p className="mt-0.5 text-[12px] text-agap-textSub">
            Going off shift? Pass this incident to the next person with a short summary of what is left to do.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {myPending && (
            <Button variant="primary" size="sm" loading={acknowledge.isPending} onClick={() => acknowledge.mutate(incidentId)}>
              <Check size={14} /> I have taken over
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
            <ArrowRightLeft size={14} /> Hand over
          </Button>
        </div>
      </div>
      <div className="px-5 py-4">
        {acknowledge.isError && (
          <p className="mb-2 rounded-xl bg-agap-dangerSoft px-4 py-2 text-xs text-agap-danger">
            {errorText(acknowledge.error, 'Could not confirm. There is no handover waiting for you.')}
          </p>
        )}
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : list.length === 0 ? (
          <p className="text-sm text-agap-textSub">No handovers for this incident.</p>
        ) : (
          <ol className="space-y-3">
            {list.map((h: HandoverRecord) => {
              const acked = h.acknowledged_at != null;
              return (
                <li key={h.id} className="rounded-xl border border-agap-track/40 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-agap-textMain">
                      <span className="font-semibold">{handoverName(h.users_incident_handovers_from_user_idTousers)}</span>
                      <ArrowRightLeft size={13} className="text-agap-textSub" />
                      <span className="font-semibold">{handoverName(h.users_incident_handovers_to_user_idTousers)}</span>
                    </div>
                    <Badge variant={acked ? 'green' : 'amber'}>{acked ? 'Taken over' : 'Waiting'}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-agap-textMid">{h.situation_summary}</p>
                  {h.pending_actions.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {h.pending_actions.map((a, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-agap-textMain">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-agap-amber" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-[11px] text-agap-textSub">
                    Handed over {fmtTs(h.handed_over_at)}
                    {acked && h.acknowledged_at && ` · taken over ${fmtTs(h.acknowledged_at)}`}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <CreateHandoverDialog incidentId={incidentId} open={createOpen} onClose={() => setCreateOpen(false)} />
    </section>
  );
}

// ─── End command ─────────────────────────────────────────────────────────────

/** Confirm, then end command. The popup runs the request and shows a failure in place. */
function useEndCommand(incidentId: string, reference: string | undefined) {
  const deactivate = useDeactivateIcs();
  return async (holders: number) => {
    const released = holders > 0
      ? `${holders} job holder${holders === 1 ? ' is' : 's are'} released and notified.`
      : 'No one holds a job right now.';
    const points = [
      'The incident stays open.',
      released,
      'The plan and team are kept for the after-action review.',
      'You can start command again if it flares up.',
    ];
    const ok = await confirmAction({
      title: 'End Incident Command?',
      html:
        '<p>Do this when the emergency is under control and normal dispatch can handle the rest.</p>'
        + `<ul class="mt-3 list-disc space-y-1 pl-5">${points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`,
      confirmText: 'End command',
      cancelText: 'Keep command',
      tone: 'danger',
      icon: 'warning',
      onConfirm: () => deactivate.mutateAsync({ incidentId }),
    });
    if (ok) {
      void notify('success', {
        title: 'Incident Command ended',
        text: `${reference ? `${reference}: the` : 'The'} plan and team are kept in the history.`,
      });
    }
  };
}

// ─── Workspace (right) ───────────────────────────────────────────────────────

function useIncidentSummary(incidentId: string) {
  const majors = useMajorIncidents();
  const incidents = useIncidents({ statuses: ACTIVE_STATUSES, perPage: 100 });
  const major = majors.data?.find((m) => m.incidentId === incidentId);
  const listed = incidents.data?.data.find((i) => i.id === incidentId);
  if (!major && !listed) return null;
  return {
    ref: major?.publicReference ?? listed!.public_reference,
    category: major?.category ?? listed?.category ?? '',
    priority: major?.priority ?? listed?.priority ?? '',
    status: major?.status ?? listed?.status ?? '',
    barangay: major?.barangay ?? listed?.incident_locations?.barangay ?? null,
  };
}

function Workspace({ incidentId, canCommand }: { incidentId: string; canCommand: boolean }): JSX.Element {
  const { data: ics, isLoading, isError, error } = useIncidentIcs(incidentId);
  const summary = useIncidentSummary(incidentId);
  const [assignPosition, setAssignPosition] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const endCommand = useEndCommand(incidentId, summary?.ref);

  const editPlan = () => {
    setEditRequest((n) => n + 1);
    document.getElementById('command-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // A 404 means "never under command" (normal). Anything else is a real failure.
  const notFound = isError && error instanceof ApiError && error.status === 404;
  const running = !!ics && !ics.deactivated_at;
  const incidentActive = !!summary && ACTIVE_STATUSES.includes(summary.status);
  const editable = canCommand && running;

  let body: ReactNode;
  if (isLoading) {
    body = <Skeleton className="h-48 rounded-xl" />;
  } else if (isError && !notFound) {
    body = (
      <div className={cn(panel, 'flex items-center gap-3 px-5 py-4 text-sm text-agap-danger')}>
        <AlertTriangle size={16} /> Could not load command for this incident. It will retry when you come back.
      </div>
    );
  } else if (!ics) {
    body = <NotUnderCommand incidentId={incidentId} canCommand={canCommand && incidentActive} />;
  } else {
    const holders = current(ics);
    body = (
      <>
        {running
          ? <RunningBar ics={ics} canCommand={canCommand} onChangeCommander={() => setAssignPosition(INCIDENT_COMMANDER)} onEnd={() => void endCommand(holders.length)} />
          : <EndedBar ics={ics} incidentId={incidentId} canCommand={canCommand} incidentActive={incidentActive} />}
        {editable && (
          <SetupChecklist
            incidentId={incidentId}
            ics={ics}
            onNameCommander={() => setAssignPosition(INCIDENT_COMMANDER)}
            onEditPlan={editPlan}
          />
        )}
        <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="min-w-0 space-y-4">
            <CommandTeam incidentId={incidentId} ics={ics} editable={editable} onAssign={setAssignPosition} />
            <JobHistory ics={ics} />
          </div>
          <div className="min-w-0 space-y-4">
            <CommandBriefPanel incidentId={incidentId} ics={ics} editable={editable} editRequest={editRequest} id="command-plan" />
            <AgencyCoordinationPanel incidentId={incidentId} />
          </div>
        </div>
        {running && <HospitalEvacuationPanel />}
        <AssignDialog
          incidentId={incidentId}
          position={assignPosition}
          onClose={() => setAssignPosition(null)}
          holders={holders}
        />
      </>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      {summary && (
        <div className={cn(panel, 'flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4')}>
          <span className="font-mono text-[15px] font-bold text-agap-textMain">{summary.ref}</span>
          <PriorityBadge priority={summary.priority} />
          <StatusChip status={summary.status} />
          <span className="text-[13px] text-agap-textMid">{titleCase(summary.category)}{summary.barangay && ` · ${summary.barangay}`}</span>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setDetailsOpen(true)}>
            Incident details <ExternalLink size={13} />
          </Button>
        </div>
      )}
      {body}
      <HandoverPanel incidentId={incidentId} />
      <CommandLogPanel incidentId={incidentId} />
      <IncidentDetailDrawer incidentId={detailsOpen ? incidentId : null} open={detailsOpen} onOpenChange={setDetailsOpen} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommandPage(): JSX.Element {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <CommandScreen />
    </Suspense>
  );
}

function commandHref(incidentId: string): string {
  return `/operations/command?incident=${encodeURIComponent(incidentId)}`;
}

/**
 * The chosen incident lives in the URL (?incident=<id>), so a command notice in the
 * bell opens it directly, the link can be shared, and Back returns to the last one.
 */
function CommandScreen(): JSX.Element {
  const user = useAuthUser();
  const canCommand = hasRole(user, 'SUPERVISOR');
  const majors = useMajorIncidents();
  const router = useRouter();
  const selectedId = useSearchParams().get('incident');

  const select = (id: string) => router.push(commandHref(id), { scroll: false });

  // Open straight onto the incident when exactly one is under command.
  const onlyCommanded = majors.data?.length === 1 ? majors.data[0]?.incidentId : undefined;
  useEffect(() => {
    if (!selectedId && onlyCommanded) router.replace(commandHref(onlyCommanded), { scroll: false });
  }, [selectedId, onlyCommanded, router]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-agap-textMain">
          <Siren size={22} className="text-agap-green" /> Incident Command
        </h1>
        <p className="mt-0.5 text-sm text-agap-textSub">
          Organize the response to a big emergency: who is in charge, who does what, and the plan everyone follows.
        </p>
      </div>

      <IntroCard />

      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <IncidentList selectedId={selectedId} onSelect={select} />
        {selectedId ? (
          <Workspace key={selectedId} incidentId={selectedId} canCommand={canCommand} />
        ) : (
          <div className={panel}>
            <EmptyState
              icon={Siren}
              title="Choose an incident"
              description="Pick an incident on the left to see its command, or to start command for it."
            />
          </div>
        )}
      </div>
    </div>
  );
}
