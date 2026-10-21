'use client';

import { useEffect, useState, type JSX, type ReactNode } from 'react';
import Link from 'next/link';
import {
  MapPin, User, Users, FileText, Image as ImageIcon, Activity, Sparkles,
  AlertTriangle, HeartPulse, CheckCircle2, ChevronDown, ChevronRight, Copy, Check,
  Shield, ShieldCheck, ShieldAlert, Video, Play, Landmark, Ban,
} from 'lucide-react';
import { IncidentChatPanel } from './IncidentChatPanel';
import { BarangayPanel, BARANGAY_REPORT, barangayHasNotReported } from './BarangayPanel';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, DrawerTitle,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tabs, TabsList, TabsTrigger, TabsContent,
  PriorityBadge, StatusChip, Button, Skeleton, EmptyState, EtaLabel,
} from '@/components/ui';
import {
  useIncident, useUpdateIncidentStatus, useCreateResolution, useCloseIncident,
} from '@/features/incidents/hooks';
import { usePriorityRecommendation } from '@/features/dispatch/hooks';
import { useIncidentBarangay } from '@/hooks/useBarangay';
import { categoryIcon, formatAffectedCount, titleCase, timeAgo } from '@/lib/incident-format';
import {
  REPORTER_STATUS_LABELS,
  ReporterStatus,
  describeIntakeAnswers,
  intakeReportLines,
} from '@agap/shared';
import {
  fetchAttachmentBlob, type IncidentDetail, type IncidentAttachment, type IncidentEvent,
} from '@/features/incidents/api';

/** In-field statuses advanced by the responder app, not the dashboard. */
const IN_FIELD = ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING'];

/** Statuses that end the incident without going through the normal path. */
const ENDED_EARLY: Record<string, string> = {
  CANCELLED: 'Cancelled',
  FALSE_ALERT: 'Marked as a false alert',
  DUPLICATE: 'Merged as a duplicate',
  UNABLE_TO_RESPOND: 'Unable to respond',
  REFERRED: 'Referred to the barangay',
};

interface StatusAction {
  label: string;
  to: string;
}

/**
 * What the dispatcher does next, following INCIDENT_STATUS_TRANSITIONS exactly.
 *  SUBMITTED → RECEIVED → ACKNOWLEDGED → ASSESSED → DISPATCH_PENDING
 *  ACKNOWLEDGED / ASSESSED may also become FALSE_ALERT (offered separately, with a confirm)
 *  RESOLVED → CLOSED through the resolution dialog; REFERRED → CLOSED directly
 *  Other statuses → no action here (dispatch console / responder app)
 */
function nextStep(status: string): { hint: string; action?: StatusAction; falseAlert?: boolean } {
  switch (status) {
    case 'SUBMITTED':
      return { hint: 'New report. Confirm you have it.', action: { label: 'Mark received', to: 'RECEIVED' } };
    case 'RECEIVED':
      return { hint: 'Let the reporter know MDRRMO is on it.', action: { label: 'Acknowledge', to: 'ACKNOWLEDGED' } };
    case 'ACKNOWLEDGED':
      return { hint: 'Review the details, then mark it assessed.', action: { label: 'Mark assessed', to: 'ASSESSED' }, falseAlert: true };
    case 'ASSESSED':
      return {
        hint: 'Send it to dispatch, or let the barangay handle it (Barangay tab).',
        action: { label: 'Ready for dispatch', to: 'DISPATCH_PENDING' },
        falseAlert: true,
      };
    case 'DISPATCH_PENDING':
      return { hint: 'Waiting for a unit. Assign one in the dispatch console.' };
    case 'RESOLVED':
      return { hint: 'Field work is done. Record the outcome to close it.', action: { label: 'Resolve & close', to: 'CLOSED' } };
    case 'REFERRED':
      return { hint: 'The barangay is handling it. Close when they report it done.', action: { label: 'Close incident', to: 'CLOSED' } };
    default:
      return {
        hint: IN_FIELD.includes(status)
          ? 'The responder updates this from the field and marks it resolved.'
          : 'No further actions.',
      };
  }
}

interface IncidentDetailDrawerProps {
  incidentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shared incident detail Drawer (MOD-14/15). Opened from the incident queue
 * (WS-4.2) and the live map (WS-4.3) alike. One GET /incidents/:id fetch powers
 * the whole view; the barangay tab has its own query.
 *
 * Layout: a summary (what, where, how far along) stays on top, the details sit in
 * tabs so nothing is a wall of text, and the footer always says what to do next.
 */
export function IncidentDetailDrawer({ incidentId, open, onOpenChange }: IncidentDetailDrawerProps): JSX.Element {
  const { data: incident, isLoading, isError, refetch } = useIncident(incidentId);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent width="w-[520px]">
        <DrawerHeader>
          <DrawerTitle>Incident Detail</DrawerTitle>
        </DrawerHeader>

        <DrawerBody>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : isError || !incident ? (
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load incident"
              description="The detail view is unavailable right now."
              action={<Button variant="secondary" size="sm" onClick={() => void refetch()}>Retry</Button>}
            />
          ) : (
            // Keyed so the tab resets to Overview when another incident opens.
            <IncidentDetailBody key={incident.id} incident={incident} />
          )}
        </DrawerBody>

        {incident && !isLoading && !isError && <StatusActionFooter incident={incident} />}
      </DrawerContent>
    </Drawer>
  );
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function IncidentDetailBody({ incident }: { incident: IncidentDetail }): JSX.Element {
  const [tab, setTab] = useState('overview');
  const events = incident.incident_events ?? [];
  const barangayAttention = useBarangayAttention(incident.id);

  return (
    <div className="space-y-4">
      <SummaryHeader incident={incident} />
      <LifecycleTracker status={incident.status} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="barangay" className="gap-1.5">
            Barangay
            {barangayAttention && (
              <span className="h-2 w-2 rounded-full bg-agap-danger" aria-label="Needs attention" />
            )}
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            Timeline
            {events.length > 0 && <span className="text-[11px] font-medium text-agap-textSub">{events.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Overview incident={incident} onOpenBarangay={() => setTab('barangay')} />
        </TabsContent>
        <TabsContent value="barangay">
          <BarangayPanel incidentId={incident.id} incidentStatus={incident.status} />
        </TabsContent>
        <TabsContent value="timeline">
          <Timeline events={events} />
        </TabsContent>
        <TabsContent value="chat">
          <IncidentChatPanel incidentId={incident.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** True when the barangay needs the dispatcher: asked for backup, or has gone quiet. */
function useBarangayAttention(incidentId: string): boolean {
  const { data } = useIncidentBarangay(incidentId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const notice = data?.notice;
  if (!notice || notice.closed_at) return false;
  return notice.last_report === 'NEEDS_BACKUP' || barangayHasNotReported(notice, now);
}

function SummaryHeader({ incident }: { incident: IncidentDetail }): JSX.Element {
  const Icon = categoryIcon(incident.category);
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-agap-greenSoft text-agap-green">
        <Icon size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-lg font-extrabold text-agap-textMain">{titleCase(incident.category)}</h2>
          <PriorityBadge priority={incident.priority} />
        </div>
        <p className="font-mono text-xs text-agap-textSub">
          {incident.public_reference} · reported {timeAgo(incident.submitted_at)}
        </p>
        <div className="mt-1.5">
          <StatusChip status={incident.status} />
        </div>
      </div>
    </div>
  );
}

// ─── Lifecycle tracker ───────────────────────────────────────────────────────

const STAGES: Array<{ label: string; statuses: string[] }> = [
  { label: 'Reported', statuses: ['DRAFT', 'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED'] },
  { label: 'Assessed', statuses: ['ASSESSED', 'DISPATCH_PENDING'] },
  { label: 'Dispatched', statuses: ['DISPATCHED', 'EN_ROUTE'] },
  { label: 'On scene', statuses: ['ON_SCENE', 'TRANSPORTING', 'ASSISTING'] },
  { label: 'Resolved', statuses: ['RESOLVED'] },
  { label: 'Closed', statuses: ['CLOSED'] },
];

/** Where the incident is in its life, at a glance. Early endings replace the bar with one line. */
function LifecycleTracker({ status }: { status: string }): JSX.Element {
  const ended = ENDED_EARLY[status];
  if (ended) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-agap-surface px-3 py-2 text-sm text-agap-textMid">
        {status === 'REFERRED' ? <Landmark size={15} /> : <Ban size={15} />}
        <span className="font-semibold">{ended}</span>
      </div>
    );
  }

  const current = Math.max(0, STAGES.findIndex((s) => s.statuses.includes(status)));
  return (
    <ol className="flex items-start" aria-label={`Progress: ${STAGES[current]!.label}`}>
      {STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={stage.label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && (
              <span
                className={`absolute right-1/2 top-[7px] h-0.5 w-full ${i <= current ? 'bg-agap-green' : 'bg-agap-track'}`}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${
                done ? 'bg-agap-green' : active ? 'bg-agap-green ring-agap-greenSoft' : 'bg-agap-track'
              }`}
            >
              {done && <Check size={10} className="text-white" strokeWidth={3} />}
            </span>
            <span
              className={`mt-1 text-[10px] leading-tight ${
                active ? 'font-bold text-agap-green' : done ? 'text-agap-textMid' : 'text-agap-textSub'
              }`}
              aria-current={active ? 'step' : undefined}
            >
              {stage.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function Overview({ incident, onOpenBarangay }: { incident: IncidentDetail; onOpenBarangay: () => void }): JSX.Element {
  const loc = incident.incident_locations;
  const address =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') || null);
  const hasCoords = loc?.latitude != null && loc?.longitude != null && Number(loc.latitude) !== 0;
  const coords = hasCoords ? `${Number(loc!.latitude).toFixed(5)}, ${Number(loc!.longitude).toFixed(5)}` : null;
  const attachments = incident.incident_attachments ?? [];
  const latestAssessment = incident.on_scene_assessments?.[0]; // backend orders desc

  return (
    <div className="space-y-5">
      {incident.description && (
        <p className="rounded-xl border-l-4 border-agap-green bg-agap-greenSoft/50 px-3 py-2 text-sm text-agap-textMain">
          “{incident.description}”
        </p>
      )}

      <Section icon={MapPin} title="Location">
        <p className="text-sm font-semibold text-agap-textMain">{address ?? 'Address not available'}</p>
        {loc?.landmark && <p className="mt-0.5 text-sm text-agap-textMid">Near {loc.landmark}</p>}
        {coords && <CopyCoordinates coords={coords} />}
      </Section>

      <BarangaySummary incidentId={incident.id} onOpen={onOpenBarangay} />

      <PriorityRecommendation incidentId={incident.id} currentPriority={incident.priority} />

      <People incident={incident} />

      <CallerDetails incident={incident} />

      <Response incident={incident} />

      {latestAssessment && <Assessment assessment={latestAssessment} />}

      {/* Citizen Photo Reference (MOD-10) — read-only preview of photos submitted from the mobile app */}
      <CitizenPhotoStrip incidentId={incident.id} attachments={attachments} />
    </div>
  );
}

function CopyCoordinates({ coords }: { coords: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(coords.replace(' ', '')).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="mt-1 inline-flex items-center gap-1.5 rounded-md font-mono text-xs text-agap-textSub hover:text-agap-textMain"
      title="Copy coordinates"
    >
      {coords}
      {copied ? <Check size={12} className="text-agap-green" /> : <Copy size={12} />}
    </button>
  );
}

/** One line on the Overview; the full controls live in the Barangay tab. */
function BarangaySummary({ incidentId, onOpen }: { incidentId: string; onOpen: () => void }): JSX.Element | null {
  const { data } = useIncidentBarangay(incidentId);
  const attention = useBarangayAttention(incidentId);
  if (!data) return null;
  const notice = data.notice;
  const report = notice?.last_report ? BARANGAY_REPORT[notice.last_report] : null;
  const state = !notice
    ? 'Not set'
    : report
      ? report.label
      : notice.closed_at
        ? 'Closed'
        : attention
          ? 'No reply yet'
          : 'Waiting for reply';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-agap-surface ${
        attention ? 'border-red-200 bg-red-50/60' : 'border-[rgba(168,181,193,0.25)]'
      }`}
    >
      <Landmark size={16} className="shrink-0 text-agap-textSub" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-agap-textSub">Barangay</span>
        <span className="block truncate text-sm font-semibold text-agap-textMain">
          {notice ? `Brgy ${notice.barangay.name}` : 'Barangay not set'}
          <span className={`font-normal ${attention ? 'text-agap-danger' : 'text-agap-textMid'}`}> · {state}</span>
        </span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-agap-textSub" />
    </button>
  );
}

function PriorityRecommendation({
  incidentId, currentPriority,
}: {
  incidentId: string;
  currentPriority: string;
}): JSX.Element | null {
  const { data, isLoading } = usePriorityRecommendation(incidentId);
  if (isLoading || !data) return null;

  const differs = data.recommendedPriority !== currentPriority;
  const reasons = data.reasons ?? [];
  return (
    <Collapsible
      icon={Sparkles}
      title={
        <span className="flex flex-wrap items-center gap-1.5">
          Suggested priority <PriorityBadge priority={data.recommendedPriority} />
          <span className="text-xs font-normal normal-case tracking-normal text-agap-textSub">
            {differs ? 'differs from current' : 'matches current'}
          </span>
        </span>
      }
      tone={differs ? 'info' : 'plain'}
    >
      {reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-agap-textMid">
          {reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
      <p className="mt-1 text-[11px] text-agap-textSub">Assistive only. The dispatcher decides.</p>
    </Collapsible>
  );
}

/** Reporter ≠ Patient: always separate concepts (CLAUDE.md rule 2). */
function People({ incident }: { incident: IncidentDetail }): JSX.Element {
  const reporter = incident.incident_reporters;
  const reporterStatus = reporter?.reporter_status as ReporterStatus | null | undefined;
  const patients = incident.incident_patients ?? [];

  return (
    <div className="grid grid-cols-2 gap-3">
      <Section icon={User} title="Reporter">
        <p className="text-sm text-agap-textMain">
          {reporter?.is_guest ? 'Guest / bystander' : reporter?.reporter_name ?? 'Registered citizen'}
        </p>
        {reporter?.reporter_phone && <p className="mt-0.5 text-xs text-agap-textSub">{reporter.reporter_phone}</p>}
        {reporterStatus && REPORTER_STATUS_LABELS[reporterStatus] && (
          <p
            className={`mt-1 text-xs font-semibold ${
              reporterStatus === ReporterStatus.NEEDS_HELP ? 'text-red-600' : 'text-agap-green'
            }`}
          >
            {REPORTER_STATUS_LABELS[reporterStatus]}
          </p>
        )}
      </Section>

      <Section icon={Users} title={patients.length > 1 ? `Patients (${patients.length})` : 'Patient'}>
        {patients.length > 0 ? (
          <ul className="space-y-1">
            {patients.map((p) => (
              <li key={p.id} className="text-sm text-agap-textMain">
                {p.is_unknown ? 'Unknown patient' : p.patient_name ?? 'Unnamed'}
                {(p.approximate_age != null || p.sex) && (
                  <span className="text-xs text-agap-textSub">
                    {' '}· {[p.approximate_age ? `~${p.approximate_age}y` : null, p.sex].filter(Boolean).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-agap-textSub">Unidentified. Does not block dispatch.</p>
        )}
      </Section>
    </div>
  );
}

function CallerDetails({ incident }: { incident: IncidentDetail }): JSX.Element | null {
  const reportedCount = formatAffectedCount(incident.hazard_flags, incident.number_of_patients);
  // Structured answers (MOD-09) are labelled from the shared intake catalog;
  // their flattened copies in hazard_flags are skipped so nothing shows twice.
  const callerAnswers = incident.incident_details?.caller_answers ?? {};
  const intakeAnswers = describeIntakeAnswers(incident.category, callerAnswers);
  const intakeLines = new Set(intakeReportLines(incident.category, callerAnswers));
  const flags = incident.hazard_flags ?? [];
  const callerDetails = flags.filter(
    (flag) => !flag.startsWith('AFFECTED_COUNT:') && !flag.startsWith('DISPATCH:') && !intakeLines.has(flag),
  );
  const requestedResponses = flags.filter((f) => f.startsWith('DISPATCH:')).map((f) => f.slice('DISPATCH:'.length));
  const count = intakeAnswers.length + callerDetails.length;

  if (!reportedCount && count === 0 && requestedResponses.length === 0) return null;

  return (
    <Collapsible
      icon={AlertTriangle}
      title="Caller-reported details"
      summary={[reportedCount && `${reportedCount} affected`, count > 0 && `${count} answer${count === 1 ? '' : 's'}`]
        .filter(Boolean)
        .join(' · ')}
    >
      {intakeAnswers.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,auto)_1fr] gap-x-3 gap-y-1 text-sm">
          {intakeAnswers.map((a) => (
            <div key={a.key} className="contents">
              <dt className="text-agap-textSub">{a.question}</dt>
              <dd className="font-semibold text-agap-textMain">{a.answer}</dd>
            </div>
          ))}
        </dl>
      )}
      {callerDetails.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-agap-textMain">
          {callerDetails.map((detail, index) => <li key={`${index}-${detail}`}>{detail}</li>)}
        </ul>
      )}
      {requestedResponses.length > 0 && (
        <p className="mt-1 text-sm text-agap-textMain">Response requested: {requestedResponses.join(', ')}</p>
      )}
      <p className="mt-1.5 text-[11px] text-agap-textSub">Reported at intake; not independently verified.</p>
    </Collapsible>
  );
}

function Response({ incident }: { incident: IncidentDetail }): JSX.Element {
  const latestDispatch = incident.dispatches?.[incident.dispatches.length - 1];
  return (
    <Section icon={Activity} title="Response">
      {latestDispatch ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-agap-textMain">Unit {titleCase(latestDispatch.status)}</span>
          <EtaLabel updatedAt={incident.dispatched_at} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-agap-textSub">No unit dispatched yet.</p>
          <Link href="/operations/dispatch" className="text-sm font-semibold text-agap-green hover:underline">
            Dispatch console →
          </Link>
        </div>
      )}
    </Section>
  );
}

function Assessment({
  assessment: a,
}: {
  assessment: NonNullable<IncidentDetail['on_scene_assessments']>[number];
}): JSX.Element {
  const vitals = [
    a.blood_pressure_sys != null && a.blood_pressure_dia != null ? `BP ${a.blood_pressure_sys}/${a.blood_pressure_dia}` : null,
    a.pulse_bpm != null ? `HR ${a.pulse_bpm}` : null,
    a.respiratory_rate != null ? `RR ${a.respiratory_rate}` : null,
    a.oxygen_saturation != null ? `SpO₂ ${a.oxygen_saturation}%` : null,
    a.temperature_celsius != null ? `T ${a.temperature_celsius}°C` : null,
    a.gcs_score != null ? `GCS ${a.gcs_score}` : null,
  ].filter(Boolean);
  const chips = [
    a.consciousness_state && `Consciousness: ${titleCase(a.consciousness_state)}`,
    a.breathing_status && `Breathing: ${titleCase(a.breathing_status)}`,
    a.triage_tag && `Triage: ${a.triage_tag}`,
  ].filter(Boolean) as string[];

  return (
    <Section icon={HeartPulse} title={`On-scene assessment · ${timeAgo(a.assessed_at)}`}>
      <div className="rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface/50 p-3">
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-agap-textMain">{c}</span>
            ))}
          </div>
        )}
        {vitals.length > 0 && <p className="mt-2 text-xs tabular-nums text-agap-textMid">{vitals.join(' · ')}</p>}
        {a.visible_injuries.length > 0 && (
          <p className="mt-1.5 text-xs text-agap-textMid">
            <span className="text-agap-textSub">Injuries:</span> {a.visible_injuries.join(', ')}
          </p>
        )}
        {a.interventions.length > 0 && (
          <p className="mt-1 text-xs text-agap-textMid">
            <span className="text-agap-textSub">Interventions:</span> {a.interventions.join(', ')}
          </p>
        )}
        {a.assessment_notes && <p className="mt-1.5 text-sm text-agap-textMain">{a.assessment_notes}</p>}
      </div>
    </Section>
  );
}

// ─── Timeline tab ─────────────────────────────────────────────────────────────

/** Newest first: the latest change is what the dispatcher looks for. */
function Timeline({ events }: { events: IncidentEvent[] }): JSX.Element {
  if (events.length === 0) {
    return <p className="text-sm text-agap-textSub">No events yet.</p>;
  }
  const newestFirst = [...events].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

  return (
    <ol className="relative space-y-4 border-l border-agap-track pl-5">
      {newestFirst.map((e, i) => {
        // Same status before and after = a note on the incident (a barangay call,
        // a status-page report), not a lifecycle step: do not draw it as a status.
        const isNote = !!e.from_status && e.from_status === e.to_status;
        const at = new Date(e.occurred_at);
        return (
          <li key={e.id} className="relative">
            <span
              className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${
                isNote ? 'bg-agap-track' : i === 0 ? 'bg-agap-green' : 'bg-agap-green/60'
              }`}
            />
            <div className="flex flex-wrap items-center gap-2">
              {isNote ? (
                <span className="text-xs font-semibold text-agap-textMid">Note</span>
              ) : (
                <StatusChip status={e.to_status} />
              )}
              <time className="text-xs text-agap-textSub" dateTime={e.occurred_at} title={at.toLocaleString()}>
                {at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {timeAgo(e.occurred_at)}
              </time>
            </div>
            {e.notes && <p className="mt-1 text-sm text-agap-textMain">{e.notes}</p>}
            {e.triggered_by_role && (
              <p className="mt-0.5 text-[11px] text-agap-textSub">by {titleCase(e.triggered_by_role)}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Footer status actions ────────────────────────────────────────────────────

function StatusActionFooter({ incident }: { incident: IncidentDetail }): JSX.Element {
  const update = useUpdateIncidentStatus();
  const [resolveOpen, setResolveOpen] = useState(false);
  // False alert ends the incident: first click arms it, second click confirms.
  const [armFalseAlert, setArmFalseAlert] = useState(false);
  const { hint, action, falseAlert } = nextStep(incident.status);

  useEffect(() => {
    setArmFalseAlert(false);
  }, [incident.status]);

  return (
    <DrawerFooter className="flex-col items-stretch gap-2">
      <p className="text-xs text-agap-textSub">
        <span className="font-semibold text-agap-textMid">Next: </span>
        {hint}
      </p>
      {update.isError && (
        <p className="text-xs text-agap-danger">
          {(update.error as Error)?.message ?? 'Action failed. The change may not be allowed.'}
        </p>
      )}
      {(action || falseAlert || incident.status === 'DISPATCH_PENDING') && (
        <div className="flex items-center gap-2">
          {falseAlert && (
            <Button
              variant={armFalseAlert ? 'danger' : 'ghost'}
              size="sm"
              loading={update.isPending && update.variables?.status === 'FALSE_ALERT'}
              onClick={() => {
                if (!armFalseAlert) { setArmFalseAlert(true); return; }
                update.mutate({ id: incident.id, status: 'FALSE_ALERT' });
              }}
              onBlur={() => setArmFalseAlert(false)}
            >
              {armFalseAlert ? 'Confirm false alert' : 'False alert'}
            </Button>
          )}
          <span className="flex-1" />
          {incident.status === 'DISPATCH_PENDING' && (
            <Link href="/operations/dispatch">
              <Button variant="primary" size="sm">Open dispatch console</Button>
            </Link>
          )}
          {action && incident.status === 'RESOLVED' && (
            <Button variant="primary" size="sm" onClick={() => setResolveOpen(true)}>
              <CheckCircle2 size={14} /> {action.label}
            </Button>
          )}
          {action && incident.status !== 'RESOLVED' && (
            <Button
              variant="primary"
              size="sm"
              loading={update.isPending && update.variables?.status === action.to}
              onClick={() => update.mutate({ id: incident.id, status: action.to })}
            >
              {action.label}
            </Button>
          )}
        </div>
      )}

      {incident.status === 'RESOLVED' && (
        <ResolutionDialog incidentId={incident.id} open={resolveOpen} onOpenChange={setResolveOpen} />
      )}
    </DrawerFooter>
  );
}

// ─── Resolution dialog (MOD-45) ─────────────────────────────────────────────────

const RESOLUTION_OUTCOMES = [
  'RESOLVED_SUCCESSFULLY',
  'PATIENT_TRANSPORTED',
  'PATIENT_TREATED_ON_SCENE',
  'HAZARD_CONTAINED',
  'RESCUE_COMPLETED',
  'NO_ACTION_REQUIRED',
  'REFERRED_TO_OTHER_AGENCY',
  'OTHER',
] as const;

const PATIENT_DISPOSITIONS = [
  'TREATED_ON_SCENE',
  'TRANSPORTED_TO_HOSPITAL',
  'TRANSPORTED_TO_EVACUATION_CENTER',
  'REFUSED_TRANSPORT',
  'DECEASED_ON_SCENE',
  'TRANSFERRED_TO_OTHER_AGENCY',
  'UNABLE_TO_LOCATE',
  'NO_PATIENT_FOUND',
  'OTHER',
] as const;

const NO_DISPOSITION = '__none__';

/**
 * Captures the incident outcome, patient disposition, and notes (MOD-45), then
 * records the resolution and closes the incident. Resolution persists even if
 * the subsequent close fails, so the outcome is never lost.
 */
function ResolutionDialog({
  incidentId, open, onOpenChange,
}: {
  incidentId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}): JSX.Element {
  const [outcome, setOutcome] = useState('');
  const [disposition, setDisposition] = useState(NO_DISPOSITION);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createResolution = useCreateResolution();
  const close = useCloseIncident();
  const pending = createResolution.isPending || close.isPending;

  function handleOpen(next: boolean) {
    if (next) {
      setOutcome(''); setDisposition(NO_DISPOSITION); setNotes(''); setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!outcome) { setError('Select an outcome.'); return; }
    setError(null);
    try {
      await createResolution.mutateAsync({
        id: incidentId,
        body: {
          outcome,
          ...(disposition !== NO_DISPOSITION && { patientDisposition: disposition }),
          ...(notes.trim() && { resolutionNotes: notes.trim() }),
        },
      });
      await close.mutateAsync({ id: incidentId });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record resolution.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-agap-green" /> Resolve &amp; Close Incident
          </DialogTitle>
          <DialogDescription>
            Record the outcome and patient disposition before closing. This is kept for analytics and audit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-agap-textMain">
              Outcome <span className="text-agap-danger">*</span>
            </label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select outcome" /></SelectTrigger>
              <SelectContent>
                {RESOLUTION_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>{titleCase(o)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-agap-textMain">Patient disposition</label>
            <Select value={disposition} onValueChange={setDisposition}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Not applicable" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DISPOSITION}>Not applicable</SelectItem>
                {PATIENT_DISPOSITIONS.map((d) => (
                  <SelectItem key={d} value={d}>{titleCase(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-agap-textMain">Resolution notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Summary, follow-up needs, handover details…"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green resize-none"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button variant="primary" size="sm" loading={pending} onClick={() => void handleSubmit()}>
            Resolve &amp; Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Citizen Photo Strip (MOD-10) + authenticity verification (MOD-25) ────────

// Human-readable explanations for the backend's advisory authenticity flags.
const PHOTO_FLAG_LABELS: Record<string, string> = {
  STALE_PHOTO: 'Captured well before the report',
  FUTURE_TIMESTAMP: 'Capture time is after the report',
  OUTSIDE_BOCAUE: 'Captured outside Bocaue',
  PHOTO_LOCATION_MISMATCH: 'Capture location far from the incident',
  NOT_LIVE_CAPTURE: 'Not a live in-app capture',
  NO_CAPTURE_GPS: 'No GPS recorded at capture',
  NO_PROVENANCE: 'No capture metadata (older app or manual upload)',
};

/** Maps an attachment's advisory score to a dispatcher-facing verdict chip. */
function photoVerdict(a: IncidentAttachment): { label: string; cls: string; Icon: typeof Shield } {
  const score = a.authenticity_score;
  const flags = a.authenticity_flags ?? [];
  if (score == null) {
    return { label: 'Unverified', cls: 'border-slate-200 bg-slate-100 text-slate-500', Icon: Shield };
  }
  if (score >= 80 && flags.length === 0) {
    return { label: 'Verified', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', Icon: ShieldCheck };
  }
  if (score >= 50) {
    return { label: `Review ${score}`, cls: 'border-amber-200 bg-amber-50 text-amber-700', Icon: ShieldAlert };
  }
  return { label: `Suspect ${score}`, cls: 'border-red-200 bg-red-50 text-red-700', Icon: ShieldAlert };
}

function photoTitle(a: IncidentAttachment): string {
  const parts = [`${a.file_name} · submitted ${timeAgo(a.uploaded_at)}`];
  if (a.authenticity_score != null) parts.push(`Authenticity ${a.authenticity_score}/100`);
  if (a.capture_source) parts.push(`Source: ${a.capture_source}`);
  const flags = a.authenticity_flags ?? [];
  if (flags.length) parts.push(flags.map((f) => PHOTO_FLAG_LABELS[f] ?? f).join('; '));
  return parts.join('\n');
}

/**
 * Read-only preview of photos/videos submitted by the citizen from the mobile
 * app. The data arrives embedded in the incident detail fetch — no extra query.
 * Photos carry an advisory authenticity verdict (Tier 1 photo validation).
 * Videos open an inline player so the dispatcher can watch without leaving the
 * drawer — a new-tab link was unreliable and caused playback glitches.
 * Returns null when the citizen didn't capture any media.
 */
function CitizenPhotoStrip({
  incidentId, attachments,
}: {
  incidentId: string;
  attachments: IncidentAttachment[];
}): JSX.Element | null {
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const mediaUrls = useAttachmentUrls(incidentId, attachments);

  if (attachments.length === 0) return null;

  const flaggedCodes = Array.from(
    new Set(attachments.flatMap((a) => a.authenticity_flags ?? [])),
  );

  return (
    <>
      <Section icon={ImageIcon} title={`Citizen Media (${attachments.length})`}>
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => {
            const v = photoVerdict(a);
            const isVideo = a.file_type?.startsWith('video/');
            const isImage = a.file_type?.startsWith('image/');
            const url = mediaUrls[a.id];

            if ((isVideo || isImage) && url === undefined) {
              return (
                <div
                  key={a.id}
                  className="h-24 w-24 animate-pulse rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface"
                  aria-label="Loading media"
                />
              );
            }

            if (url && isVideo) {
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveVideoUrl(url)}
                  title={`${a.file_name} · click to play`}
                  className="group relative overflow-hidden rounded-xl border border-[rgba(168,181,193,0.20)] transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
                >
                  {/* Video thumbnail — seeks to 0.1 s to paint the first frame */}
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    src={url}
                    className="h-24 w-24 bg-black object-cover"
                    muted
                    preload="metadata"
                    onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.1; }}
                  />
                  {/* Play-button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/45">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow">
                      <Play size={13} className="ml-0.5 text-agap-textMain" fill="currentColor" />
                    </div>
                  </div>
                  {/* Video badge — top left */}
                  <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-md border border-slate-300/60 bg-black/60 px-1 py-0.5 text-[9px] font-semibold text-white">
                    <Video size={8} /> VIDEO
                  </span>
                  <span className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {timeAgo(a.uploaded_at)}
                  </span>
                </button>
              );
            }

            if (url && isImage) {
              return (
                <a
                  key={a.id}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title={photoTitle(a)}
                  className="group relative overflow-hidden rounded-xl border border-[rgba(168,181,193,0.20)] transition-shadow hover:shadow-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={a.file_name}
                    className="h-24 w-24 object-cover"
                  />
                  <span className={`absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-[9px] font-semibold ${v.cls}`}>
                    <v.Icon size={10} /> {v.label}
                  </span>
                  <span className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {timeAgo(a.uploaded_at)}
                  </span>
                </a>
              );
            }

            return (
              <a
                key={a.id}
                href={url ?? '#'}
                target="_blank"
                rel="noreferrer"
                title={url === null ? `${a.file_name} · could not be loaded` : a.file_name}
                className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface text-agap-textSub transition-colors hover:bg-agap-surface/80"
              >
                <FileText size={20} />
                <span className="max-w-[80px] truncate px-1 text-[10px] font-medium">{a.file_name}</span>
                <span className="text-[9px]">{timeAgo(a.uploaded_at)}</span>
              </a>
            );
          })}
        </div>

        {/* Dispatcher verification advisory — only when photos have flags */}
        {flaggedCodes.length > 0 && (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800">
              <ShieldAlert size={12} /> Verify photo authenticity before relying on this evidence
            </div>
            <ul className="mt-1 space-y-0.5">
              {flaggedCodes.map((f) => (
                <li key={f} className="text-[11px] text-amber-700">• {PHOTO_FLAG_LABELS[f] ?? f}</li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-amber-600">Advisory only — this never blocks dispatch.</p>
          </div>
        )}
      </Section>

      {/* ── Inline video player — opens when a video thumbnail is clicked ── */}
      <Dialog open={!!activeVideoUrl} onOpenChange={(open) => { if (!open) setActiveVideoUrl(null); }}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
          <DialogHeader className="px-5 pb-3 pt-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Video size={16} className="text-agap-textSub" />
              Video Evidence
            </DialogTitle>
            <DialogDescription className="text-xs text-agap-textSub">
              Captured and submitted by the citizen at the incident scene.
            </DialogDescription>
          </DialogHeader>
          {activeVideoUrl && (
            // key forces a fresh element (and stops the previous video) whenever
            // a different clip is selected.
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              key={activeVideoUrl}
              src={activeVideoUrl}
              controls
              autoPlay
              className="w-full"
              style={{ backgroundColor: '#000', maxHeight: '60vh' }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Loads each attachment through the authenticated API and exposes it as a
 * blob: URL. undefined = still loading, null = failed. Object URLs are revoked
 * on unmount / when the attachment set changes.
 */
function useAttachmentUrls(
  incidentId: string,
  attachments: IncidentAttachment[],
): Record<string, string | null> {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const ids = attachments.map((a) => a.id).join(',');

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    setUrls({});
    for (const id of ids ? ids.split(',') : []) {
      fetchAttachmentBlob(incidentId, id)
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          created.push(objectUrl);
          if (!cancelled) setUrls((prev) => ({ ...prev, [id]: objectUrl }));
        })
        .catch(() => {
          if (!cancelled) setUrls((prev) => ({ ...prev, [id]: null }));
        });
    }
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [incidentId, ids]);

  return urls;
}

// ─── Section wrappers ─────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, children,
}: {
  icon: typeof MapPin;
  title: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon size={14} className="text-agap-textSub" />
        <span className="text-xs font-semibold uppercase tracking-wide text-agap-textSub">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** A section that starts folded, showing a one-line summary, for detail that is useful but not urgent. */
function Collapsible({
  icon: Icon, title, summary, tone = 'plain', children,
}: {
  icon: typeof MapPin;
  title: ReactNode;
  summary?: string;
  tone?: 'plain' | 'info';
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-xl border ${
        tone === 'info' ? 'border-agap-infoSoft bg-agap-infoSoft/50' : 'border-[rgba(168,181,193,0.25)]'
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green"
      >
        <Icon size={14} className="shrink-0 text-agap-textSub" />
        <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-agap-textSub">{title}</span>
        {summary && !open && <span className="shrink-0 text-xs text-agap-textSub">{summary}</span>}
        <ChevronDown size={14} className={`shrink-0 text-agap-textSub transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
