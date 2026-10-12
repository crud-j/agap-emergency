'use client';

import { useState, type JSX } from 'react';
import Link from 'next/link';
import {
  MapPin, User, Users, FileText, Image as ImageIcon, Activity, Sparkles,
  AlertTriangle, HeartPulse, MessageSquare, CheckCircle2,
} from 'lucide-react';
import { IncidentChatPanel } from './IncidentChatPanel';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, DrawerTitle,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  PriorityBadge, StatusChip, Button, Skeleton, EmptyState, EtaLabel,
} from '@/components/ui';
import {
  useIncident, useUpdateIncidentStatus, useCreateResolution, useCloseIncident,
} from '@/features/incidents/hooks';
import { usePriorityRecommendation } from '@/features/dispatch/hooks';
import { categoryIcon, titleCase, timeAgo } from '@/lib/incident-format';
import type { IncidentDetail, IncidentAttachment } from '@/features/incidents/api';

const TERMINAL = ['CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED'];

interface StatusAction {
  label: string;
  to: string;
  variant: 'primary' | 'danger';
}

const FALSE_ALERT: StatusAction = { label: 'False Alert', to: 'FALSE_ALERT', variant: 'danger' };

/**
 * Lifecycle transitions offered in the Drawer footer, following
 * INCIDENT_STATUS_TRANSITIONS exactly.
 *  SUBMITTED  → RECEIVED (only; Acknowledge requires RECEIVED first)
 *  RECEIVED   → ACKNOWLEDGED
 *  ACKNOWLEDGED → ASSESSED | FALSE_ALERT
 *  ASSESSED   → DISPATCH_PENDING | FALSE_ALERT
 *  RESOLVED   → CLOSED
 *  Terminal / in-field statuses → no actions (handled by dispatch/responder screens)
 */
function statusActions(status: string): StatusAction[] {
  switch (status) {
    case 'SUBMITTED':
      return [{ label: 'Mark Received', to: 'RECEIVED', variant: 'primary' }];
    case 'RECEIVED':
      return [{ label: 'Acknowledge', to: 'ACKNOWLEDGED', variant: 'primary' }];
    case 'ACKNOWLEDGED':
      return [{ label: 'Mark Assessed', to: 'ASSESSED', variant: 'primary' }, FALSE_ALERT];
    case 'ASSESSED':
      return [{ label: 'Ready for Dispatch', to: 'DISPATCH_PENDING', variant: 'primary' }, FALSE_ALERT];
    case 'RESOLVED':
      return [{ label: 'Close Incident', to: 'CLOSED', variant: 'primary' }];
    default:
      return [];
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
 * the whole view: timeline, reporter≠patient, location, media, and status actions.
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
            <IncidentDetailBody incident={incident} />
          )}
        </DrawerBody>

        {incident && !isLoading && !isError && (
          <StatusActionFooter incident={incident} />
        )}
      </DrawerContent>
    </Drawer>
  );
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function IncidentDetailBody({ incident }: { incident: IncidentDetail }): JSX.Element {
  const Icon = categoryIcon(incident.category);
  const loc = incident.incident_locations;
  const address =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') || null);
  const hasCoords =
    loc?.latitude != null && loc?.longitude != null && Number(loc.latitude) !== 0;
  const events = incident.incident_events ?? [];
  const attachments = incident.incident_attachments ?? [];
  const latestDispatch = incident.dispatches?.[incident.dispatches.length - 1];
  const latestAssessment = incident.on_scene_assessments?.[0]; // backend orders desc

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-agap-greenSoft text-agap-green">
          <Icon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-agap-textMain">{titleCase(incident.category)}</h2>
          <p className="font-mono text-xs text-agap-textSub">{incident.public_reference}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={incident.priority} />
            <StatusChip status={incident.status} />
            <span className="text-xs text-agap-textSub">· reported {timeAgo(incident.submitted_at)}</span>
          </div>
        </div>
      </div>

      {/* MOD-24 priority recommendation */}
      <PriorityRecommendationChip incidentId={incident.id} currentPriority={incident.priority} />

      {/* Location */}
      <Section icon={MapPin} title="Location">
        <p className="text-sm text-agap-textMain">{address ?? 'Address not available'}</p>
        {hasCoords && (
          <p className="mt-0.5 font-mono text-xs text-agap-textSub">
            {Number(loc!.latitude).toFixed(5)}, {Number(loc!.longitude).toFixed(5)}
          </p>
        )}
        {incident.description && (
          <p className="mt-2 text-sm text-agap-textMid">{incident.description}</p>
        )}
      </Section>

      {/* Reporter ≠ Patient — always separate concepts (CLAUDE.md rule 2) */}
      <div className="grid grid-cols-2 gap-3">
        <Section icon={User} title="Reporter">
          <p className="text-sm text-agap-textMain">
            {incident.incident_reporters?.is_guest
              ? 'Guest / bystander'
              : incident.incident_reporters?.reporter_name ?? 'Registered citizen'}
          </p>
          {incident.incident_reporters?.reporter_phone && (
            <p className="mt-0.5 text-xs text-agap-textSub">{incident.incident_reporters.reporter_phone}</p>
          )}
        </Section>

        <Section icon={Users} title="Patient(s)">
          {incident.incident_patients && incident.incident_patients.length > 0 ? (
            <ul className="space-y-1">
              {incident.incident_patients.map((p) => (
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
            <p className="text-sm text-agap-textSub">
              Unidentified — does not block dispatch
            </p>
          )}
        </Section>
      </div>

      {/* Response / ETA */}
      <Section icon={Activity} title="Response">
        {latestDispatch ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <StatusChip status={incident.status} />
              <span className="text-xs text-agap-textSub">dispatch {titleCase(latestDispatch.status)}</span>
            </div>
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

      {/* On-scene assessment (MOD-37) */}
      {latestAssessment && (
        <Section icon={HeartPulse} title="On-Scene Assessment">
          <div className="rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface/50 p-3">
            <div className="flex flex-wrap gap-2">
              {latestAssessment.consciousness_state && (
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-agap-textMain">
                  Consciousness: {titleCase(latestAssessment.consciousness_state)}
                </span>
              )}
              {latestAssessment.breathing_status && (
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-agap-textMain">
                  Breathing: {titleCase(latestAssessment.breathing_status)}
                </span>
              )}
              {latestAssessment.triage_tag && (
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-agap-textMain">
                  Triage: {latestAssessment.triage_tag}
                </span>
              )}
            </div>

            {(() => {
              const a = latestAssessment;
              const vitals = [
                a.blood_pressure_sys != null && a.blood_pressure_dia != null
                  ? `BP ${a.blood_pressure_sys}/${a.blood_pressure_dia}`
                  : null,
                a.pulse_bpm != null ? `HR ${a.pulse_bpm}` : null,
                a.respiratory_rate != null ? `RR ${a.respiratory_rate}` : null,
                a.oxygen_saturation != null ? `SpO₂ ${a.oxygen_saturation}%` : null,
                a.temperature_celsius != null ? `T ${a.temperature_celsius}°C` : null,
                a.gcs_score != null ? `GCS ${a.gcs_score}` : null,
              ].filter(Boolean);
              return vitals.length > 0 ? (
                <p className="mt-2 text-xs text-agap-textMid tabular-nums">{vitals.join(' · ')}</p>
              ) : null;
            })()}

            {latestAssessment.visible_injuries.length > 0 && (
              <p className="mt-1.5 text-xs text-agap-textMid">
                <span className="text-agap-textSub">Injuries:</span> {latestAssessment.visible_injuries.join(', ')}
              </p>
            )}
            {latestAssessment.interventions.length > 0 && (
              <p className="mt-1 text-xs text-agap-textMid">
                <span className="text-agap-textSub">Interventions:</span> {latestAssessment.interventions.join(', ')}
              </p>
            )}
            {latestAssessment.assessment_notes && (
              <p className="mt-1.5 text-sm text-agap-textMain">{latestAssessment.assessment_notes}</p>
            )}
            <p className="mt-1.5 text-[11px] text-agap-textSub">Updated {timeAgo(latestAssessment.assessed_at)}</p>
          </div>
        </Section>
      )}

      {/* Citizen Photo Reference (MOD-10) — read-only preview of photos submitted from the mobile app */}
      <CitizenPhotoStrip attachments={attachments} />

      {/* Timeline */}
      <Section icon={FileText} title="Timeline">
        {events.length === 0 ? (
          <p className="text-sm text-agap-textSub">No status events yet.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-agap-track pl-4">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-agap-green ring-2 ring-white" />
                <div className="flex items-center gap-2">
                  <StatusChip status={e.to_status} />
                  <span className="text-xs text-agap-textSub">{timeAgo(e.occurred_at)}</span>
                </div>
                {e.notes && <p className="mt-0.5 text-xs text-agap-textMid">{e.notes}</p>}
                {e.triggered_by_role && (
                  <p className="text-[11px] text-agap-textSub">{titleCase(e.triggered_by_role)}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Communications (MOD-33) */}
      <Section icon={MessageSquare} title="Communications">
        <IncidentChatPanel incidentId={incident.id} />
      </Section>
    </div>
  );
}

// ─── MOD-24 chip ────────────────────────────────────────────────────────────────

function PriorityRecommendationChip({
  incidentId, currentPriority,
}: {
  incidentId: string;
  currentPriority: string;
}): JSX.Element | null {
  const { data, isLoading } = usePriorityRecommendation(incidentId);
  if (isLoading || !data) return null;

  const differs = data.recommendedPriority !== currentPriority;
  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-agap-infoSoft bg-agap-infoSoft/60 px-3 py-2"
      title={data.note}
    >
      <Sparkles size={16} className="mt-0.5 shrink-0 text-agap-info" />
      <div className="text-sm">
        <span className="font-semibold text-agap-textMain">Recommended priority: </span>
        <PriorityBadge priority={data.recommendedPriority} />
        <span className="ml-1 text-xs text-agap-textSub">
          {differs ? '— differs from current (assistive; dispatcher decides)' : '— matches current (assistive)'}
        </span>
      </div>
    </div>
  );
}

// ─── Footer status actions ────────────────────────────────────────────────────

function StatusActionFooter({ incident }: { incident: IncidentDetail }): JSX.Element | null {
  const update = useUpdateIncidentStatus();
  const [resolveOpen, setResolveOpen] = useState(false);
  const actions = statusActions(incident.status);

  // RESOLVED → CLOSED must capture an outcome first (MOD-45).
  const isResolved = incident.status === 'RESOLVED';

  if (actions.length === 0) {
    return (
      <DrawerFooter>
        <span className="text-sm text-agap-textSub">
          Incident is {titleCase(incident.status)} — no further actions.
        </span>
      </DrawerFooter>
    );
  }

  return (
    <DrawerFooter className="flex-col items-stretch gap-2">
      {update.isError && (
        <p className="text-xs text-agap-danger">
          {(update.error as Error)?.message ?? 'Action failed — the transition may not be allowed.'}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {isResolved ? (
          <Button variant="primary" size="sm" onClick={() => setResolveOpen(true)}>
            <CheckCircle2 size={14} className="mr-1.5" /> Resolve &amp; Close
          </Button>
        ) : (
          actions.map((a) => (
            <Button
              key={a.to}
              variant={a.variant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              loading={update.isPending && update.variables?.status === a.to}
              onClick={() => update.mutate({ id: incident.id, status: a.to })}
            >
              {a.label}
            </Button>
          ))
        )}
      </div>

      {isResolved && (
        <ResolutionDialog
          incidentId={incident.id}
          open={resolveOpen}
          onOpenChange={setResolveOpen}
        />
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

// ─── Citizen Photo Strip (MOD-10) ────────────────────────────────────────────

/**
 * Read-only preview of photos/videos submitted by the citizen from the mobile
 * app. The data arrives embedded in the incident detail fetch — no extra query.
 * Returns null when the citizen didn't capture any media.
 */
function CitizenPhotoStrip({ attachments }: { attachments: IncidentAttachment[] }): JSX.Element | null {
  if (attachments.length === 0) return null;

  return (
    <Section icon={ImageIcon} title={`Citizen Photo Reference (${attachments.length})`}>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) =>
          a.storage_url && a.file_type?.startsWith('image/') ? (
            <a
              key={a.id}
              href={a.storage_url}
              target="_blank"
              rel="noreferrer"
              title={`${a.file_name} · submitted ${timeAgo(a.uploaded_at)}`}
              className="group relative overflow-hidden rounded-xl border border-[rgba(168,181,193,0.20)] transition-shadow hover:shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.storage_url}
                alt={a.file_name}
                className="h-24 w-24 object-cover"
              />
              <span className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {timeAgo(a.uploaded_at)}
              </span>
            </a>
          ) : (
            <a
              key={a.id}
              href={a.storage_url ?? '#'}
              target="_blank"
              rel="noreferrer"
              title={a.file_name}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface text-agap-textSub transition-colors hover:bg-agap-surface/80"
            >
              <FileText size={20} />
              <span className="max-w-[80px] truncate px-1 text-[10px] font-medium">{a.file_name}</span>
              <span className="text-[9px]">{timeAgo(a.uploaded_at)}</span>
            </a>
          ),
        )}
      </div>
    </Section>
  );
}

// ─── Small section wrapper ──────────────────────────────────────────────────────

function Section({
  icon: Icon, title, children,
}: {
  icon: typeof MapPin;
  title: string;
  children: React.ReactNode;
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
