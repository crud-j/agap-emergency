'use client';

import { useEffect, useState, type JSX } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Landmark, MessageSquare, Pencil, Phone, PhoneCall, RotateCw, X,
} from 'lucide-react';
import {
  Badge, Button, Skeleton, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  type BadgeVariant,
} from '@/components/ui';
import {
  useIncidentBarangay, useBarangays, useSetIncidentBarangay, useResendBarangayAlert,
  useLogBarangayCall, useRecordBarangayOutcome, useConfirmBarangayHandled,
  type BarangayContact, type BarangayNotice, type BarangayOutcome, type BarangaySmsReply, type BarangaySmsStatus,
} from '@/hooks/useBarangay';
import { titleCase } from '@/lib/incident-format';

const ROLE_LABEL: Record<BarangayContact['role'], string> = {
  PRIMARY: 'Primary',
  BACKUP: 'Backup',
  OTHER: 'Other',
};

const SMS_STATUS: Record<BarangaySmsStatus, { label: string; variant: BadgeVariant }> = {
  PENDING:  { label: 'Sending…', variant: 'blue' },
  SENT:     { label: 'Delivered', variant: 'green' },
  PARTIAL:  { label: 'Reached one number', variant: 'amber' },
  FAILED:   { label: 'Failed', variant: 'red' },
  SKIPPED:  { label: 'No SMS number on file', variant: 'muted' },
  DISABLED: { label: 'SMS alerts off', variant: 'muted' },
};

type Tone = 'good' | 'bad' | 'neutral';

/** What the barangay said, as a headline. Covers phone calls and the status page. */
export const BARANGAY_REPORT: Record<string, { label: string; tone: Tone }> = {
  SEEN: { label: 'Seen the alert', tone: 'neutral' },
  ON_THE_WAY: { label: 'Acting on it', tone: 'good' },
  ON_SCENE: { label: 'On scene', tone: 'good' },
  HANDLED: { label: 'Reports it completed', tone: 'good' },
  NEEDS_BACKUP: { label: 'Needs backup', tone: 'bad' },
  NO_ANSWER: { label: 'Did not answer', tone: 'bad' },
};

const SOURCE_LABEL: Record<'LINK' | 'SMS_REPLY' | 'PHONE_CALL', string> = {
  LINK: 'status page',
  SMS_REPLY: 'SMS reply',
  PHONE_CALL: 'phone call',
};

const TONE_CLASS: Record<Tone, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  bad: 'border-red-200 bg-red-50 text-red-700',
  neutral: 'border-[rgba(168,181,193,0.30)] bg-agap-surface text-agap-textMain',
};

const OUTCOMES: Array<{ outcome: BarangayOutcome; label: string }> = [
  { outcome: 'ON_THE_WAY', label: 'On the way' },
  { outcome: 'HANDLED', label: 'Handled' },
  { outcome: 'NEEDS_BACKUP', label: 'Needs backup' },
  { outcome: 'NO_ANSWER', label: 'No answer' },
];

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The reminder time has passed (or the reminder went out) and the barangay has not reported. */
export function barangayHasNotReported(notice: BarangayNotice, now: number): boolean {
  if (notice.closed_at || notice.last_report) return false;
  if (notice.followup_sent_at) return true;
  return !!notice.followup_due_at && new Date(notice.followup_due_at).getTime() <= now;
}

/** Re-renders every 15 s so time-based warnings ("has not reported back") appear on their own. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * MOD-17 / MOD-34: which barangay owns this incident, what it last reported, and who
 * to call there. Assistive only: the dispatcher can always correct the barangay, and
 * nothing here changes the incident lifecycle except the explicit "Confirm handled".
 *
 * Layout, top to bottom: barangay, current barangay status, SMS delivery, contacts,
 * and actions that only appear when they apply.
 */
export function BarangayPanel({
  incidentId,
  incidentStatus,
}: {
  incidentId: string;
  incidentStatus?: string | undefined;
}): JSX.Element | null {
  const { data, isLoading, isError } = useIncidentBarangay(incidentId);
  const now = useNow();
  const [editing, setEditing] = useState(false);
  // Outcome buttons appear once the dispatcher has called a number.
  const [called, setCalled] = useState(false);

  // Ops-only endpoint: roles without access simply do not see the panel.
  if (isError) return null;
  if (isLoading || !data) return <Skeleton className="h-28 w-full" />;

  const { notice, contacts } = data;
  const needsConfirm = !!notice && notice.is_approximate && notice.match_method !== 'MANUAL';
  const open = !!notice && !notice.closed_at;

  return (
    <div className="space-y-3">
      {/* Barangay */}
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-agap-surface text-agap-textSub">
          <Landmark size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-agap-textMain">
            {notice ? `Brgy ${notice.barangay.name}` : 'Barangay not set'}
          </p>
          <p className="text-xs text-agap-textSub">
            {!notice
              ? 'The location is outside every barangay. Set it to alert one.'
              : needsConfirm
                ? 'Nearest match. Please confirm.'
                : notice.match_method === 'MANUAL'
                  ? 'Set by a dispatcher'
                  : 'Matched from the GPS location'}
          </p>
        </div>
        {needsConfirm && <Badge variant="amber">Confirm</Badge>}
        {!editing && !needsConfirm && notice && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Change barangay">
            <Pencil size={13} /> Change
          </Button>
        )}
      </div>

      {(editing || needsConfirm || !notice) && (
        <BarangayPicker
          incidentId={incidentId}
          value={notice?.barangay_id}
          placeholder={needsConfirm ? 'Confirm barangay' : 'Choose barangay'}
          onDone={() => setEditing(false)}
          canCancel={editing}
        />
      )}

      {notice && (
        <>
          <ReportStatus notice={notice} now={now} incidentStatus={incidentStatus} />
          <SmsReplies replies={data.smsReplies ?? []} />
          <SmsDelivery incidentId={incidentId} notice={notice} />
          <Contacts
            incidentId={incidentId}
            contacts={contacts}
            canLog={open}
            onCalled={() => setCalled(true)}
          />
          {open && called && <OutcomePrompt incidentId={incidentId} onDone={() => setCalled(false)} />}
          {open && <ConfirmHandled incidentId={incidentId} notice={notice} incidentStatus={incidentStatus} />}
        </>
      )}
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function BarangayPicker({
  incidentId, value, placeholder, onDone, canCancel,
}: {
  incidentId: string;
  value: string | undefined;
  placeholder: string;
  onDone: () => void;
  canCancel: boolean;
}): JSX.Element {
  const { data: barangays } = useBarangays();
  const setBarangay = useSetIncidentBarangay(incidentId);
  return (
    <div>
      <div className="flex items-center gap-2">
        <Select
          value={value ?? ''}
          onValueChange={(id) => setBarangay.mutate(id, { onSuccess: onDone })}
          disabled={!barangays || setBarangay.isPending}
        >
          <SelectTrigger aria-label="Barangay" className="h-9 flex-1">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {(barangays ?? []).map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canCancel && (
          <Button variant="ghost" size="sm" onClick={onDone} aria-label="Cancel change">
            <X size={14} />
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-agap-textSub">Changing it texts the new barangay.</p>
      {setBarangay.isError && <p className="mt-1 text-xs text-agap-danger">Could not update the barangay. Try again.</p>}
    </div>
  );
}

/** The one thing a dispatcher needs first: what the barangay is doing right now. */
function ReportStatus({
  notice, now, incidentStatus,
}: {
  notice: BarangayNotice;
  now: number;
  incidentStatus?: string | undefined;
}): JSX.Element {
  const silent = barangayHasNotReported(notice, now);

  if (notice.last_report) {
    const report = BARANGAY_REPORT[notice.last_report] ?? { label: titleCase(notice.last_report), tone: 'neutral' as Tone };
    return (
      <div className={`rounded-xl border px-3 py-2.5 ${TONE_CLASS[report.tone]}`} role="status">
        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Barangay status</p>
        <p className="text-base font-bold">{report.label}</p>
        {notice.last_report_at && (
          <p className="text-xs opacity-80">
            {clock(notice.last_report_at)}
            {notice.last_report_source ? ` · via ${SOURCE_LABEL[notice.last_report_source]}` : ''}
          </p>
        )}
        {notice.last_report === 'NEEDS_BACKUP' && (
          <p className="mt-1 text-xs font-semibold">A supervisor was alerted. Consider dispatching a unit.</p>
        )}
        {notice.last_report === 'HANDLED' && !notice.closed_at && incidentStatus !== 'ASSESSED' && incidentStatus !== 'REFERRED' && (
          <p className="mt-1 text-xs">MDRRMO still decides when to close. Assess the incident to confirm it.</p>
        )}
      </div>
    );
  }

  if (notice.closed_at) {
    return (
      <div className={`rounded-xl border px-3 py-2.5 ${TONE_CLASS.neutral}`}>
        <p className="text-sm font-semibold">Barangay coordination closed</p>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${
        silent ? 'border-amber-200 bg-amber-50 text-amber-900' : TONE_CLASS.neutral
      }`}
      role={silent ? 'alert' : 'status'}
    >
      {silent ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Clock size={16} className="mt-0.5 shrink-0 text-agap-textSub" />}
      <div>
        <p className="text-sm font-bold">{silent ? 'No reply from the barangay' : 'Waiting for the barangay'}</p>
        <p className="text-xs opacity-80">
          {silent
            ? notice.followup_sent_at ? 'A reminder was texted. Call them.' : 'Call them.'
            : 'Their update appears here as soon as they send it.'}
        </p>
      </div>
    </div>
  );
}

/** The barangay's own words, so the dispatcher can see exactly what was texted back. */
function SmsReplies({ replies }: { replies: BarangaySmsReply[] }): JSX.Element | null {
  if (replies.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-agap-textSub">SMS from the barangay</p>
      <ul className="space-y-1">
        {replies.map((r) => (
          <li key={r.id} className="flex items-baseline gap-2 text-xs">
            <span className="shrink-0 tabular-nums text-agap-textSub">{clock(r.received_at)}</span>
            <span className="min-w-0 flex-1 break-words font-mono text-agap-textMain">“{r.body}”</span>
            {r.parsed_command && (
              <span className="shrink-0 text-agap-textSub">
                → {BARANGAY_REPORT[r.parsed_command]?.label ?? titleCase(r.parsed_command)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SmsDelivery({ incidentId, notice }: { incidentId: string; notice: BarangayNotice }): JSX.Element {
  const resend = useResendBarangayAlert(incidentId);
  const failed = notice.sms_status === 'FAILED' || notice.sms_status === 'PARTIAL';
  const { label, variant } = SMS_STATUS[notice.sms_status];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-agap-textSub">
      <MessageSquare size={13} className="shrink-0" />
      <span>Alert SMS</span>
      <Badge variant={variant}>
        {label}
        {notice.sms_status === 'SENT' && notice.sms_sent_at ? ` ${clock(notice.sms_sent_at)}` : ''}
      </Badge>
      {failed && !notice.closed_at && (
        <Button variant="secondary" size="sm" className="ml-auto h-7" onClick={() => resend.mutate()} loading={resend.isPending}>
          <RotateCw size={12} /> Resend
        </Button>
      )}
      {resend.isError && <span className="w-full text-agap-danger">Resend failed. Call the barangay instead.</span>}
    </div>
  );
}

function Contacts({
  incidentId, contacts, canLog, onCalled,
}: {
  incidentId: string;
  contacts: BarangayContact[];
  canLog: boolean;
  onCalled: () => void;
}): JSX.Element {
  const logCall = useLogBarangayCall(incidentId);

  // Dial link or "Log call": record the attempt, then ask what the barangay said.
  function markCalled(contactId: string) {
    logCall.mutate(contactId);
    onCalled();
  }

  if (contacts.length === 0) {
    return <p className="text-xs text-agap-textSub">No contact numbers on file for this barangay.</p>;
  }

  return (
    <ul className="divide-y divide-[rgba(168,181,193,0.20)] rounded-xl border border-[rgba(168,181,193,0.25)]">
      {contacts.map((c) => (
        <li key={c.id} className="flex items-center gap-2 px-3 py-2">
          <Phone size={13} className="shrink-0 text-agap-textSub" />
          <div className="min-w-0 flex-1">
            <a
              href={`tel:${c.phone_e164}`}
              className="font-mono text-sm font-semibold text-agap-textMain hover:underline"
              onClick={() => canLog && markCalled(c.id)}
            >
              {c.phone_e164}
            </a>
            <p className="text-[11px] text-agap-textSub">
              {ROLE_LABEL[c.role]}{c.label ? ` · ${c.label}` : ''}
            </p>
          </div>
          {c.is_demo && <Badge variant="orange">Demo</Badge>}
          {canLog && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={logCall.isPending}
              onClick={() => markCalled(c.id)}
              title="Log that you called this number (for desk phones, or when the dial link does nothing)"
            >
              <PhoneCall size={12} /> Log call
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function OutcomePrompt({ incidentId, onDone }: { incidentId: string; onDone: () => void }): JSX.Element {
  const recordOutcome = useRecordBarangayOutcome(incidentId);
  return (
    <div className="rounded-xl border border-agap-infoSoft bg-agap-infoSoft/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-agap-textMain">What did the barangay say?</p>
        <button type="button" onClick={onDone} className="text-agap-textSub hover:text-agap-textMain" aria-label="Skip">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {OUTCOMES.map(({ outcome, label }) => (
          <Button
            key={outcome}
            variant={outcome === 'NEEDS_BACKUP' ? 'danger' : 'secondary'}
            size="sm"
            disabled={recordOutcome.isPending}
            onClick={() => recordOutcome.mutate(outcome, { onSuccess: onDone })}
          >
            {label}
          </Button>
        ))}
      </div>
      {recordOutcome.isError && <p className="mt-1 text-xs text-agap-danger">Could not save that. Try again.</p>}
    </div>
  );
}

/**
 * "Confirm handled" refers the incident to the barangay (ASSESSED → REFERRED). It is only
 * shown when it can be pressed; earlier steps live in the drawer footer.
 */
function ConfirmHandled({
  incidentId, notice, incidentStatus,
}: {
  incidentId: string;
  notice: BarangayNotice;
  incidentStatus?: string | undefined;
}): JSX.Element | null {
  const confirmHandled = useConfirmBarangayHandled(incidentId);
  if (incidentStatus !== 'ASSESSED') return null;

  const reportedDone = notice.last_report === 'HANDLED';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[rgba(168,181,193,0.25)] p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-agap-textMain">
          {reportedDone ? 'The barangay reports it completed' : 'Barangay can handle this?'}
        </p>
        <p className="text-xs text-agap-textSub">Refers the incident to the barangay instead of dispatching a unit.</p>
        {confirmHandled.isError && <p className="mt-1 text-xs text-agap-danger">Could not confirm. Check the incident status.</p>}
      </div>
      <Button
        variant={reportedDone ? 'primary' : 'outline'}
        size="sm"
        loading={confirmHandled.isPending}
        onClick={() => confirmHandled.mutate()}
      >
        <CheckCircle2 size={13} /> Confirm handled
      </Button>
    </div>
  );
}
