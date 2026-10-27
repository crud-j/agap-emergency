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
  useIncident, useUpdateIncidentStatus, useCreateResolution, useCloseIncident, useReporterStanding,
  useIncidentTransports, useUpdateIncidentTransport, useRejectAttachment,
} from '@/features/incidents/hooks';
import { usePriorityRecommendation, useSetIncidentPriority } from '@/features/dispatch/hooks';
import { useIncidentBarangay } from '@/hooks/useBarangay';
import { categoryIcon, formatAffectedCount, titleCase, timeAgo } from '@/lib/incident-format';
import {
  REPORTER_STATUS_LABELS,
  ReporterStatus,
  describeIntakeAnswers,
  intakeReportLines,
} from '@agap/shared';
import {
  fetchAttachmentBlob, type IncidentDetail, type IncidentAttachment, type IncidentEvent, type IncidentTransport,
} from '@/features/incidents/api';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { useHospitals, useIncidentReferrals, useCreateReferral } from '@/features/hospitals/hooks';
import type { Hospital } from '@/features/hospitals/api';

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

export function IncidentDetailBody({ incident }: { incident: IncidentDetail }): JSX.Element {
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
  const referrals = useIncidentReferrals(incident.id);
  const transports = useIncidentTransports(incident.id);

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

      <Section icon={Activity} title="Trigger">
        <p className="text-sm font-semibold text-agap-textMain">
          {incident.trigger_method === 'SHAKE_GESTURE'
            ? 'Shake'
            : incident.trigger_method === 'SOS_BUTTON'
              ? 'SOS button'
              : 'Manual'}
        </p>
      </Section>

      <BarangaySummary incidentId={incident.id} onOpen={onOpenBarangay} />

      <PriorityRecommendation incidentId={incident.id} currentPriority={incident.priority} status={incident.status} />

      <People incident={incident} />

      <CallerDetails incident={incident} />

      <Response incident={incident} />

      <TransportPanel incidentId={incident.id} transports={transports.data ?? []} />

      <ReferralPanel incident={incident} referrals={referrals.data ?? []} isLoading={referrals.isLoading} />

      {latestAssessment && <Assessment assessment={latestAssessment} />}

      {/* Citizen Photo Reference (MOD-10) — read-only preview of photos submitted from the mobile app */}
      <CitizenPhotoStrip incidentId={incident.id} attachments={attachments} />
    </div>
  );
}

function TransportPanel({ incidentId, transports }: { incidentId: string; transports: IncidentTransport[] }): JSX.Element | null {
  const user = useAuthUser();
  const canChange = hasRole(user, 'DISPATCHER', 'SUPERVISOR');
  const [selected, setSelected] = useState<IncidentTransport | null>(null);
  if (transports.length === 0) return null;

  return (
    <Section icon={Activity} title="Transport">
      <div className="space-y-3">
        {transports.map((transport) => (
          <div key={transport.id} className="rounded-xl border border-slate-200 bg-white/60 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-agap-textMain">
                  {transport.facilities?.name ?? 'Destination not set'}
                </p>
                <p className="text-xs text-agap-textSub">
                  Started {transport.transport_started_at ? new Date(transport.transport_started_at).toLocaleString() : '—'}
                </p>
                {transport.estimated_arrival_at && (
                  <p className="text-xs text-agap-textSub">
                    Est. arrival {new Date(transport.estimated_arrival_at).toLocaleString()}
                  </p>
                )}
                <p className="text-xs font-semibold text-agap-textMid">
                  {transport.arrived_at ? `Arrived ${new Date(transport.arrived_at).toLocaleString()}` : 'En route'}
                </p>
              </div>
              {canChange && !transport.arrived_at && (
                <Button size="sm" variant="secondary" onClick={() => setSelected(transport)}>Change</Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {selected && (
        <ChangeTransportDialog
          incidentId={incidentId}
          transport={selected}
          open
          onOpenChange={(open) => { if (!open) setSelected(null); }}
        />
      )}
    </Section>
  );
}

function ChangeTransportDialog({
  incidentId, transport, open, onOpenChange,
}: {
  incidentId: string;
  transport: IncidentTransport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const { data: hospitals = [] } = useHospitals();
  const update = useUpdateIncidentTransport();
  const [destinationId, setDestinationId] = useState(transport.destination_id ?? '');
  const [reason, setReason] = useState('');

  async function submit() {
    if (!destinationId) return;
    await update.mutateAsync({
      incidentId,
      transportId: transport.id,
      body: { destinationId, ...(reason.trim() ? { changeReason: reason.trim() } : {}) },
    });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !update.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change transport destination</DialogTitle>
          <DialogDescription>Choose the active receiving facility and optionally record why it changed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={destinationId} onValueChange={setDestinationId}>
            <SelectTrigger><SelectValue placeholder="Select hospital" /></SelectTrigger>
            <SelectContent>
              {hospitals.map((hospital) => <SelectItem key={hospital.id} value={hospital.id}>{hospital.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Optional reason"
            className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={update.isPending}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={!destinationId || update.isPending}>Save destination</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReferralPanel({
  incident, referrals, isLoading,
}: {
  incident: IncidentDetail;
  referrals: Array<{
    id: string;
    facility_id: string;
    acknowledgment_status: string | null;
    patient_arrived_at: string | null;
    created_at: string;
    facilities?: { name: string };
  }>;
  isLoading: boolean;
}): JSX.Element | null {
  const user = useAuthUser();
  const canRefer = hasRole(user, 'DISPATCHER', 'SUPERVISOR');
  const allowedStatus = ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING'].includes(incident.status);
  const [open, setOpen] = useState(false);
  if (!canRefer && referrals.length === 0) return null;

  return (
    <Section icon={HeartPulse} title="Hospital referrals">
      {canRefer && allowedStatus && <ReferralDialog incident={incident} open={open} onOpenChange={setOpen} />}
      {isLoading ? <Skeleton className="h-10 w-full" /> : referrals.length === 0 ? (
        <p className="text-sm text-agap-textSub">No hospital referrals.</p>
      ) : (
        <div className="space-y-2">
          {referrals.map((referral) => (
            <div key={referral.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <div>
                <p className="font-semibold text-agap-textMain">{referral.facilities?.name ?? referral.facility_id}</p>
                <p className="text-xs text-agap-textSub">{new Date(referral.created_at).toLocaleString()}</p>
              </div>
              <span className="font-semibold text-agap-textMid">
                {referral.patient_arrived_at ? 'Arrived' : referral.acknowledgment_status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function ReferralDialog({
  incident, open, onOpenChange,
}: { incident: IncidentDetail; open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  const { data: hospitals = [], isLoading: hospitalsLoading } = useHospitals();
  const create = useCreateReferral();
  const [hospitalId, setHospitalId] = useState('');
  const [dispatchId, setDispatchId] = useState(incident.dispatches[0]?.id ?? 'none');
  const [patientId, setPatientId] = useState('none');
  const [notes, setNotes] = useState('');
  const [eta, setEta] = useState('');

  useEffect(() => {
    if (open) {
      setHospitalId('');
      setDispatchId(incident.dispatches[0]?.id ?? 'none');
      setPatientId('none');
      setNotes('');
      setEta('');
    }
  }, [incident.dispatches, open]);

  async function submit() {
    if (!hospitalId) return;
    await create.mutateAsync({
      hospitalId,
      body: {
        incidentId: incident.id,
        ...(dispatchId !== 'none' ? { dispatchId } : {}),
        ...(patientId !== 'none' ? { patientId } : {}),
        ...(notes.trim() ? { preArrivalNotes: notes.trim() } : {}),
        ...(eta.trim() ? { etaMinutes: Number(eta) } : {}),
      },
    });
    onOpenChange(false);
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => onOpenChange(true)}>Refer to hospital</Button>
      <Dialog open={open} onOpenChange={(next) => !create.isPending && onOpenChange(next)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Refer to hospital</DialogTitle>
            <DialogDescription>Send the receiving facility the incident details. Do not include patient names in notes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select value={hospitalId} onValueChange={setHospitalId}>
              <SelectTrigger><SelectValue placeholder={hospitalsLoading ? 'Loading hospitals…' : 'Select hospital'} /></SelectTrigger>
              <SelectContent>{hospitals.map((hospital: Hospital) => <SelectItem key={hospital.id} value={hospital.id}>{hospital.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={dispatchId} onValueChange={setDispatchId}>
              <SelectTrigger><SelectValue placeholder="Dispatch (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No dispatch</SelectItem>
                {incident.dispatches.map((dispatch) => <SelectItem key={dispatch.id} value={dispatch.id}>{dispatch.id.slice(0, 8)} · {dispatch.status}</SelectItem>)}
              </SelectContent>
            </Select>
            {incident.incident_patients.length > 0 && (
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger><SelectValue placeholder="Patient (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No patient selected</SelectItem>
                  {incident.incident_patients.map((patient) => <SelectItem key={patient.id} value={patient.id}>{patient.patient_name ?? 'Unknown patient'}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Pre-arrival notes (no names)" className="min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={eta} onChange={(event) => setEta(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ETA in minutes (estimated)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            {create.isError && <p className="text-sm text-agap-danger">Could not create referral. Check the incident and try again.</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={!hospitalId || create.isPending}>Send referral</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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

const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const PRIORITY_LOCKED = new Set(['CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE']);

function PriorityRecommendation({
  incidentId, currentPriority, status,
}: {
  incidentId: string;
  currentPriority: string;
  status: string;
}): JSX.Element | null {
  const { data, isLoading } = usePriorityRecommendation(incidentId);
  const user = useAuthUser();
  const setPriority = useSetIncidentPriority();
  const [choice, setChoice] = useState(currentPriority);
  useEffect(() => setChoice(currentPriority), [currentPriority]);
  if (isLoading || !data) return null;

  // MOD-24 / Rule 8: the suggestion assists; the dispatcher sets the priority.
  const canSet = hasRole(user, 'DISPATCHER', 'SUPERVISOR') && !PRIORITY_LOCKED.has(status);

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
      {canSet && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Incident priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{titleCase(p)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={choice === currentPriority}
            loading={setPriority.isPending}
            onClick={() => setPriority.mutate({ incidentId, priority: choice })}
          >
            Set priority
          </Button>
          {differs && choice !== data.recommendedPriority && (
            <Button size="sm" variant="ghost" onClick={() => setChoice(data.recommendedPriority)}>
              Use suggested
            </Button>
          )}
          {setPriority.isError && (
            <p className="w-full text-xs text-agap-danger">
              {setPriority.error instanceof Error ? setPriority.error.message : 'Could not change the priority.'}
            </p>
          )}
        </div>
      )}
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
        {!reporter?.is_guest && <ReporterStandingLine incidentId={incident.id} />}
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

/** Trust signal for triage: the reporter's verified (closed) reports and false alerts. */
function ReporterStandingLine({ incidentId }: { incidentId: string }): JSX.Element | null {
  const { data } = useReporterStanding(incidentId);
  const standing = data?.standing;
  if (!standing) return null;
  const falseAlerts = standing.falseAlerts > 0 && (
    <span className="text-agap-danger">
      {' '}· {standing.falseAlerts} false alert{standing.falseAlerts === 1 ? '' : 's'}
    </span>
  );
  return standing.isVerifiedReporter ? (
    <p className="mt-1 flex flex-wrap items-center gap-1 text-xs font-semibold text-agap-green">
      <ShieldCheck size={12} />
      Verified reporter · {standing.verifiedReports} closed report{standing.verifiedReports === 1 ? '' : 's'}
      {falseAlerts}
    </p>
  ) : (
    <p className="mt-1 text-xs text-agap-textSub">
      First report{falseAlerts}
    </p>
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

export function StatusActionFooter({ incident }: { incident: IncidentDetail }): JSX.Element {
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
        <ResolutionDialog incident={incident} open={resolveOpen} onOpenChange={setResolveOpen} />
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
  incident, open, onOpenChange,
}: {
  incident: IncidentDetail;
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

  // Radix doesn't call onOpenChange when the parent opens a controlled dialog,
  // so reset the form here.
  useEffect(() => {
    if (!open) return;
    setOutcome(''); setDisposition(NO_DISPOSITION); setNotes(''); setError(null);
  }, [open]);

  async function handleSubmit() {
    if (!outcome) { setError('Select an outcome.'); return; }
    setError(null);
    try {
      await createResolution.mutateAsync({
        id: incident.id,
        body: {
          outcome,
          ...(disposition !== NO_DISPOSITION && { patientDisposition: disposition }),
          ...(notes.trim() && { resolutionNotes: notes.trim() }),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the outcome.');
      return;
    }
    try {
      await close.mutateAsync({ id: incident.id });
      onOpenChange(false);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      setError(`Outcome saved, but closing failed: ${reason}. Try again.`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 size={18} className="shrink-0 text-agap-green" />
            Resolve &amp; close incident
          </DialogTitle>
          <DialogDescription>
            Record the outcome before closing. It is kept for analytics and audit, and the reporter is told the incident is closed.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-agap-surface px-3 py-2.5">
          <span className="text-sm font-semibold text-agap-textMain">{incident.public_reference}</span>
          <span className="text-xs text-agap-textSub">
            {incident.resolved_at ? `Marked resolved ${timeAgo(incident.resolved_at)}` : 'Marked resolved'}
          </span>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="resolution-outcome" className="block text-sm font-medium text-agap-textMain">
              Outcome <span className="text-agap-danger">*</span>
            </label>
            <Select value={outcome} onValueChange={(v) => { setOutcome(v); setError(null); }}>
              <SelectTrigger id="resolution-outcome" className="w-full">
                <SelectValue placeholder="Select outcome" />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTION_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>{titleCase(o)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="resolution-disposition" className="block text-sm font-medium text-agap-textMain">
              Patient disposition
            </label>
            <Select value={disposition} onValueChange={setDisposition}>
              <SelectTrigger id="resolution-disposition" className="w-full">
                <SelectValue placeholder="Not applicable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DISPOSITION}>Not applicable</SelectItem>
                {PATIENT_DISPOSITIONS.map((d) => (
                  <SelectItem key={d} value={d}>{titleCase(d)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="resolution-notes" className="block text-sm font-medium text-agap-textMain">
              Resolution notes <span className="font-normal text-agap-textSub">(optional)</span>
            </label>
            <textarea
              id="resolution-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Summary, follow-up needs, handover details…"
              className="block w-full resize-none rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={pending} onClick={() => void handleSubmit()}>
            <CheckCircle2 size={14} /> Resolve &amp; close
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

const AI_REVIEW_LABELS: Record<string, string> = {
  LIKELY_REAL: 'AI: looks real',
  SUSPICIOUS: 'AI: suspicious',
  LIKELY_FAKE: 'AI: likely fake',
};

/**
 * Maps an attachment's advisory signals to a dispatcher-facing verdict chip.
 * Combines Tier 1 (device provenance) and Tier 2 (AI plausibility) — the more
 * severe of the two wins, then a manual dispatcher rejection overrides both.
 */
function photoVerdict(a: IncidentAttachment): { label: string; cls: string; Icon: typeof Shield } {
  if (a.rejected_at) {
    return { label: 'Rejected', cls: 'border-slate-300 bg-slate-200 text-slate-600', Icon: Ban };
  }
  if (a.ai_review_label === 'LIKELY_FAKE') {
    return { label: 'AI: likely fake', cls: 'border-red-200 bg-red-50 text-red-700', Icon: ShieldAlert };
  }

  const score = a.authenticity_score;
  const flags = a.authenticity_flags ?? [];
  if (score == null) {
    if (a.ai_review_label === 'SUSPICIOUS') {
      return { label: 'AI: suspicious', cls: 'border-amber-200 bg-amber-50 text-amber-700', Icon: ShieldAlert };
    }
    return { label: 'Unverified', cls: 'border-slate-200 bg-slate-100 text-slate-500', Icon: Shield };
  }
  if (score >= 80 && flags.length === 0 && a.ai_review_label !== 'SUSPICIOUS') {
    return { label: 'Verified', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700', Icon: ShieldCheck };
  }
  if (score >= 50 || a.ai_review_label === 'SUSPICIOUS') {
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
  if (a.ai_review_label) {
    parts.push(`${AI_REVIEW_LABELS[a.ai_review_label] ?? a.ai_review_label}${a.ai_review_reason ? `: ${a.ai_review_reason}` : ''}`);
  }
  if (a.rejected_at) parts.push(`Rejected by dispatcher${a.rejection_notes ? `: ${a.rejection_notes}` : ''}`);
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
  const [rejectTarget, setRejectTarget] = useState<IncidentAttachment | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const mediaUrls = useAttachmentUrls(incidentId, attachments);
  const rejectMutation = useRejectAttachment();

  if (attachments.length === 0) return null;

  const flaggedCodes = Array.from(
    new Set(attachments.flatMap((a) => a.authenticity_flags ?? [])),
  );

  function closeRejectDialog() {
    setRejectTarget(null);
    setRejectNotes('');
  }

  function confirmReject() {
    if (!rejectTarget) return;
    const notes = rejectNotes.trim();
    rejectMutation.mutate(
      { incidentId, attachmentId: rejectTarget.id, ...(notes ? { notes } : {}) },
      { onSuccess: closeRejectDialog },
    );
  }

  return (
    <>
      <Section icon={ImageIcon} title={`Citizen Media (${attachments.length})`}>
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => {
            const v = photoVerdict(a);
            const isVideo = a.file_type?.startsWith('video/');
            const isImage = a.file_type?.startsWith('image/');
            const url = mediaUrls[a.id];
            const isRejected = !!a.rejected_at;
            const aiFlagged = a.ai_review_label === 'SUSPICIOUS' || a.ai_review_label === 'LIKELY_FAKE';

            let tile: ReactNode;

            if ((isVideo || isImage) && url === undefined) {
              tile = (
                <div
                  className="h-24 w-24 animate-pulse rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface"
                  aria-label="Loading media"
                />
              );
            } else if (url && isVideo) {
              tile = (
                <button
                  type="button"
                  onClick={() => setActiveVideoUrl(url)}
                  title={`${a.file_name} · click to play`}
                  className={`group relative overflow-hidden rounded-xl border border-[rgba(168,181,193,0.20)] transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green ${isRejected ? 'opacity-50 grayscale' : ''}`}
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
            } else if (url && isImage) {
              tile = (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  title={photoTitle(a)}
                  className={`group relative overflow-hidden rounded-xl border border-[rgba(168,181,193,0.20)] transition-shadow hover:shadow-md ${isRejected ? 'opacity-50 grayscale' : ''}`}
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
            } else {
              tile = (
                <a
                  href={url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  title={url === null ? `${a.file_name} · could not be loaded` : a.file_name}
                  className={`flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface text-agap-textSub transition-colors hover:bg-agap-surface/80 ${isRejected ? 'opacity-50 grayscale' : ''}`}
                >
                  <FileText size={20} />
                  <span className="max-w-[80px] truncate px-1 text-[10px] font-medium">{a.file_name}</span>
                  <span className="text-[9px]">{timeAgo(a.uploaded_at)}</span>
                </a>
              );
            }

            return (
              <div key={a.id} className="group relative">
                {tile}

                {/* Video/image/generic tiles already carry their own Tier-1 verdict
                    badge top-left; a bare file tile doesn't, so give it one too when
                    AI flagged it or it's rejected. */}
                {!isVideo && !isImage && (aiFlagged || isRejected) && (
                  <span className={`pointer-events-none absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-[9px] font-semibold ${v.cls}`}>
                    <v.Icon size={10} /> {v.label}
                  </span>
                )}

                {/* AI verdict badge — only for video (image already shows it via `v` on the tile itself) */}
                {isVideo && (aiFlagged || isRejected) && (
                  <span className={`pointer-events-none absolute left-1 bottom-6 inline-flex items-center gap-0.5 rounded-md border px-1 py-0.5 text-[9px] font-semibold ${v.cls}`}>
                    <v.Icon size={10} /> {v.label}
                  </span>
                )}

                {/* Reject affordance — always available to a dispatcher, more prominent once AI flags it */}
                {!isRejected && (url !== undefined || (!isVideo && !isImage)) && (
                  <button
                    type="button"
                    title="Reject this evidence"
                    aria-label="Reject this evidence"
                    onClick={() => setRejectTarget(a)}
                    className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border shadow-sm transition-colors ${
                      aiFlagged
                        ? 'border-red-300 bg-red-600 text-white hover:bg-red-700'
                        : 'border-slate-300 bg-white/90 text-slate-500 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 focus-visible:opacity-100'
                    }`}
                  >
                    <Ban size={11} />
                  </button>
                )}
              </div>
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

      {/* ── Reject evidence confirmation ── */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) closeRejectDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Ban size={16} className="text-red-600" />
              Reject this evidence?
            </DialogTitle>
            <DialogDescription className="text-xs text-agap-textSub">
              {rejectTarget?.file_name} will be marked as not credible. The reporter is warned that
              submitting false evidence may affect their reporting standing. This never changes the
              incident's status or blocks dispatch.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Optional notes (e.g. why this looks fake)"
            maxLength={500}
            rows={3}
            className="w-full resize-none rounded-lg border border-[rgba(168,181,193,0.30)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={closeRejectDialog} disabled={rejectMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={confirmReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? 'Rejecting…' : 'Reject evidence'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
