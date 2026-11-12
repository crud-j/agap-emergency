'use client';

import { Fragment, Suspense, useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Archive, Ban, CalendarClock, History, Hourglass, ImageIcon, Megaphone, MessageSquareWarning,
  PencilLine, Plus, Radio, Send, ShieldCheck, Undo2,
} from 'lucide-react';
import {
  Button, Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, DrawerTitle,
  Skeleton,
  type Column,
} from '@/components/ui';
import { alertMessage, confirmAction, escapeHtml, notify } from '@/components/ui/alerts';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { cn } from '@/lib/utils';
import {
  useAnnouncements,
  useAnnouncementDelivery,
  useAnnouncementImage,
  usePublishAnnouncement,
  useScheduleAnnouncement,
  useUnscheduleAnnouncement,
  useCancelAnnouncement,
  useArchiveAnnouncement,
  useSubmitAnnouncement,
  useWithdrawAnnouncement,
} from '@/features/announcements/hooks';
import type { Announcement, AnnouncementDeliveryStat } from '@/features/announcements/api';
import { AnnouncementPreview } from '@/components/announcements/AnnouncementPreview';
import {
  categoryLabel, severityMeta, statusMeta, fmtManila, LANGUAGE_LABELS,
} from '@/features/announcements/labels';
import { getTemplate, manilaInputToIso, isoToManilaInput, SOURCE_REQUIRED_CATEGORIES } from '@/features/announcements/templates';

// ─── Constants ────────────────────────────────────────────────────────────────

// ADVISORIES filters by severity (hazard notices), not status: spec §2, a filter, not a page.
// PENDING_APPROVAL and RETURNED are Phase 7's filters (the LGU account gets no new page).
// Grouped as: overview filters · still being prepared · already released.
const TAB_GROUPS = [
  ['ALL', 'ADVISORIES'],
  ['DRAFT', 'RETURNED', 'PENDING_APPROVAL', 'SCHEDULED'],
  ['PUBLISHED', 'CANCELLED', 'SUPERSEDED', 'ARCHIVED'],
] as const;
const STATUS_TABS = TAB_GROUPS.flat();
const ADVISORY_SEVERITIES = 'WARNING,CRITICAL';
type StatusTab = (typeof STATUS_TABS)[number];

function tabLabel(tab: StatusTab): string {
  if (tab === 'ALL') return 'All';
  if (tab === 'ADVISORIES') return 'Advisories';
  if (tab === 'RETURNED') return 'Returned';
  if (tab === 'DRAFT') return 'Drafts';
  if (tab === 'ARCHIVED') return 'Archive';
  return statusMeta(tab).label;
}

const inputCls =
  'min-h-10 w-full rounded-lg border border-agap-fieldBorder bg-white px-3 py-2 text-sm text-agap-textMain ' +
  'placeholder:text-agap-hint hover:border-agap-textMid motion-safe:transition-colors ' +
  'focus:outline-none focus:border-agap-green focus:ring-2 focus:ring-agap-green/30';

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

function getMissingPublishFields(a: Announcement): string[] {
  const missing: string[] = [];
  if (!a.title?.trim()) missing.push('Title');
  if (!a.body?.trim()) missing.push('Announcement body');
  if (!a.issuing_office?.trim()) missing.push('Issuing office');
  const needsSource = SOURCE_REQUIRED_CATEGORIES.has(a.category) || a.severity !== 'INFORMATIONAL';
  if (needsSource && !a.source_reference?.trim()) missing.push('Source / reference');
  if (a.scope === 'BARANGAY_SPECIFIC' && a.target_barangays.length === 0) missing.push('Affected barangays');
  return missing;
}

function areaOf(a: Announcement) {
  return a.scope === 'MUNICIPALITY_WIDE' || a.target_barangays.length === 0
    ? 'All of Bocaue'
    : `Brgy. ${a.target_barangays.join(', ')}`;
}

/** "2 delivered · 1 failed". Notices published before delivery tracking only have the queued count. */
function smsDeliverySummary(queued: number, stats: AnnouncementDeliveryStat[] | undefined): string {
  if (!stats?.length) return `${queued} queued`;
  const count = (s: AnnouncementDeliveryStat['status']) => stats.find((x) => x.status === s)?.count ?? 0;
  const parts = [
    `${count('DELIVERED')} delivered`,
    count('SENT') > 0 && `${count('SENT')} sent, no receipt yet`,
    count('PENDING') > 0 && `${count('PENDING')} waiting`,
    count('FAILED') > 0 && `${count('FAILED')} failed`,
  ].filter(Boolean);
  const hint = count('FAILED') > 0 ? ' — check the Textbee phone’s load and signal' : '';
  return parts.join(' · ') + hint;
}

/** The notice as it will be released, for a confirmation popup. Every value is escaped. */
function noticeSummaryHtml(a: Announcement, note: string): string {
  const sev = severityMeta(a.severity);
  return (
    `<div class="rounded-xl border border-agap-track bg-agap-pearl px-4 py-3">` +
    `<p class="font-bold text-agap-textMain">${escapeHtml(a.title)}</p>` +
    (a.summary ? `<p class="mt-1 text-[13px] text-agap-textMid">${escapeHtml(a.summary)}</p>` : '') +
    `<p class="mt-2 text-[12px] font-semibold ${sev.text}">${escapeHtml(sev.label)} · ${escapeHtml(sev.priority)}` +
    `<span class="font-normal text-agap-textSub"> · ${escapeHtml(areaOf(a))}</span></p>` +
    `</div>` +
    `<p class="mt-3 text-[13px]">${escapeHtml(note)}</p>`
  );
}

function SeverityCell({ severity }: { severity: string }) {
  const m = severityMeta(severity);
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', m.text)}>
      <Icon size={13} aria-hidden /> {m.label}
    </span>
  );
}

// ─── Schedule dialog ──────────────────────────────────────────────────────────

function ScheduleDialog({ target, onClose }: { target: Announcement | null; onClose: () => void }): JSX.Element {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const schedule = useScheduleAnnouncement();
  const submit = useSubmitAnnouncement();
  // Phase 7: a CRITICAL advisory is submitted with its release time instead.
  const viaApproval = !!target?.requiresApproval;

  function close() {
    setError(null);
    setValue('');
    onClose();
  }

  async function confirm() {
    const iso = manilaInputToIso(value);
    if (!target || !iso) { setError('Choose a date and time.'); return; }
    try {
      setError(null);
      if (viaApproval) await submit.mutateAsync({ id: target.id, scheduledAt: iso });
      else await schedule.mutateAsync({ id: target.id, scheduledAt: iso });
      close();
      void notify('success', viaApproval
        ? { title: 'Submitted for MDRRMO approval', text: `Requested release: ${fmtManila(iso)}. It goes out once a Supervisor approves it.` }
        : { title: 'Release scheduled', text: `“${target.title}” goes out ${fmtManila(iso)} (Bocaue time).` });
    } catch (e) {
      setError(errMsg(e, 'Failed to schedule.'));
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-agap-amberSoft text-agap-amberText">
              <CalendarClock size={16} aria-hidden />
            </span>
            {viaApproval ? 'Submit with a release time' : 'Schedule release'}
          </DialogTitle>
          {target && <DialogDescription className="line-clamp-2">{target.title}</DialogDescription>}
        </DialogHeader>
        <label htmlFor="sched" className="mb-1.5 block text-xs font-semibold text-agap-textMid">
          Publish at (Bocaue time)
        </label>
        <input
          id="sched"
          type="datetime-local"
          value={value}
          min={isoToManilaInput(new Date().toISOString())}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          aria-invalid={!!error}
          aria-describedby="sched-help"
          className={inputCls}
        />
        <p id="sched-help" className="mt-2 text-xs leading-snug text-agap-hint">
          {viaApproval
            ? 'An MDRRMO Supervisor approves it first. If approval comes after this time, it goes out on approval.'
            : 'Scheduling approves the notice. It goes out automatically within a minute of this time.'}
        </p>
        {error && <p role="alert" className="mt-2 text-xs font-medium text-agap-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="primary" loading={schedule.isPending || submit.isPending} onClick={confirm}>
            {viaApproval ? 'Submit for approval' : <>Approve &amp; schedule</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cancel dialog ────────────────────────────────────────────────────────────

const MIN_NOTE = 5;

function CancelDialog({ target, onClose }: { target: Announcement | null; onClose: () => void }): JSX.Element {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancel = useCancelAnnouncement();
  const length = note.trim().length;

  function close() {
    setError(null);
    setNote('');
    onClose();
  }

  async function confirm() {
    if (!target) return;
    if (length < MIN_NOTE) { setError('Explain what changed — residents will see this note.'); return; }
    try {
      setError(null);
      await cancel.mutateAsync({ id: target.id, correctionNote: note.trim() });
      close();
      void notify('success', {
        title: 'Announcement cancelled',
        text: 'Residents who open it see it marked cancelled, with your note.',
      });
    } catch (e) {
      setError(errMsg(e, 'Failed to cancel.'));
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-agap-dangerSoft text-agap-danger">
              <Ban size={16} aria-hidden />
            </span>
            Cancel announcement
          </DialogTitle>
          {target && <DialogDescription className="line-clamp-2">{target.title}</DialogDescription>}
        </DialogHeader>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="cnote" className="text-xs font-semibold text-agap-textMid">
            Reason / correction note<span className="text-agap-danger" aria-hidden> *</span>
          </label>
          <span className={cn('text-[11px] tabular-nums', length >= MIN_NOTE ? 'text-agap-hint' : 'text-agap-amberText')}>
            {length < MIN_NOTE ? `${MIN_NOTE - length} more characters` : `${length} characters`}
          </span>
        </div>
        <textarea
          id="cnote"
          rows={4}
          value={note}
          onChange={(e) => { setNote(e.target.value); setError(null); }}
          placeholder="e.g. Kanselado ang naunang abiso. Balik-klase na sa Okt 15 ayon sa EO No. __."
          aria-invalid={!!error}
          aria-describedby="cnote-help"
          className={cn(inputCls, 'resize-y')}
        />
        <p id="cnote-help" className="mt-2 text-xs leading-snug text-agap-hint">
          The notice stays visible to residents who open it, clearly marked as cancelled with this note. Nothing is deleted.
        </p>
        {error && <p role="alert" className="mt-2 text-xs font-medium text-agap-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={close}>Keep it</Button>
          <Button variant="danger" loading={cancel.isPending} onClick={confirm}>Cancel announcement</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function DetailSection({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-agap-hint">{title}</h3>
      <dl className="divide-y divide-agap-surface rounded-xl border border-agap-track text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[120px_1fr] gap-3 px-4 py-2.5">
            <dt className="text-xs font-semibold text-agap-hint">{k}</dt>
            <dd className="break-words text-agap-textMain">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DetailDrawer({
  item, canPublish, onClose, onSchedule, onCancel, onHold,
}: {
  item: Announcement | null;
  canPublish: boolean;
  onClose: () => void;
  onSchedule: (a: Announcement) => void;
  onCancel: (a: Announcement) => void;
  /**
   * Keeps the drawer open on this notice while a popup inside it is up. An action
   * can move the notice out of the current tab, and unmounting the drawer would
   * pull the popup out mid-animation.
   */
  onHold: (a: Announcement | null) => void;
}): JSX.Element {
  const router = useRouter();
  const publish = usePublishAnnouncement();
  const submit = useSubmitAnnouncement();
  const withdraw = useWithdrawAnnouncement();
  const unschedule = useUnscheduleAnnouncement();
  const archive = useArchiveAnnouncement();
  // Popups open inside the drawer: Radix blocks clicks and focus outside it.
  const [drawerEl, setDrawerEl] = useState<HTMLDivElement | null>(null);
  const image = useAnnouncementImage(item?.id ?? null, !!item?.image_storage_key, item?.updated_at);
  const sentOut = item?.status === 'PUBLISHED' || item?.status === 'CANCELLED';
  const delivery = useAnnouncementDelivery(item?.id ?? null, sentOut);

  if (!item) {
    return <Drawer open={false} onOpenChange={() => undefined}><DrawerContent /></Drawer>;
  }

  const st = statusMeta(item.status);
  const sev = severityMeta(item.severity);
  const template = getTemplate(item.template_key);
  // Phase 7: the server decides; a CRITICAL draft goes to MDRRMO instead of out.
  const viaApproval = !!item.requiresApproval && item.status === 'DRAFT';
  const editHref = `/announcements/compose?id=${item.id}`;

  /** Runs a popup flow with the drawer held open on this notice until it has closed. */
  function held(flow: (a: Announcement) => Promise<void>) {
    return async () => {
      if (!item) return;
      const current = item;
      onHold(current);
      try {
        await flow(current);
      } finally {
        onHold(null);
      }
    };
  }

  const onPublish = held(async (item) => {
    const missing = getMissingPublishFields(item);
    if (missing.length > 0) {
      const html =
        `<p>Add these before it can ${viaApproval ? 'be submitted' : 'go out'}:</p>` +
        `<ul class="mt-2 list-disc space-y-0.5 pl-5">${missing.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`;
      // Only drafts open in the composer; a scheduled notice goes back to draft first.
      if (item.status !== 'DRAFT') {
        await alertMessage({ target: drawerEl, icon: 'warning', title: 'Required details are missing', html });
        return;
      }
      const fix = await confirmAction({
        target: drawerEl,
        icon: 'warning',
        title: 'Required details are missing',
        html,
        confirmText: 'Edit to fix',
        cancelText: 'Back',
      });
      if (fix) router.push(editHref);
      return;
    }

    if (viaApproval) {
      const ok = await confirmAction({
        target: drawerEl,
        title: 'Submit for MDRRMO approval?',
        html: noticeSummaryHtml(item, 'A Supervisor reviews it. Nothing reaches residents until it is approved, and it is locked while it waits.'),
        confirmText: 'Submit for approval',
        onConfirm: () => submit.mutateAsync({ id: item.id }),
      });
      if (ok) void notify('success', { title: 'Submitted for MDRRMO approval', text: 'It goes out once a Supervisor approves it.' });
      return;
    }

    const ok = await confirmAction({
      target: drawerEl,
      icon: 'warning',
      title: item.status === 'SCHEDULED' ? 'Publish now instead of on schedule?' : 'Approve and publish now?',
      html: noticeSummaryHtml(
        item,
        'It appears in the citizen app immediately and goes to push and SMS subscribers. Published text cannot be edited — corrections are made by cancelling it with a note.',
      ),
      confirmText: 'Approve & publish',
      onConfirm: () => publish.mutateAsync(item.id),
    });
    if (!ok) return;
    onClose();
    void notify('success', { title: 'Announcement published', text: 'It is in the citizen app now and queued for push and SMS.' });
  });

  const onWithdraw = held(async (item) => {
    const ok = await confirmAction({
      target: drawerEl,
      title: 'Withdraw from MDRRMO review?',
      text: 'It goes back to drafts so you can change it. Submit it again when it is ready.',
      confirmText: 'Withdraw to draft',
      onConfirm: () => withdraw.mutateAsync(item.id),
    });
    if (ok) void notify('success', { title: 'Withdrawn to drafts', text: item.title });
  });

  const onUnschedule = held(async (item) => {
    const ok = await confirmAction({
      target: drawerEl,
      title: 'Stop the scheduled release?',
      text: `It will not go out on ${fmtManila(item.scheduled_at)}. It returns to drafts, where you can publish or schedule it again.`,
      confirmText: 'Back to draft',
      onConfirm: () => unschedule.mutateAsync(item.id),
    });
    if (ok) void notify('success', { title: 'Scheduled release stopped', text: 'It is back in drafts.' });
  });

  const onArchive = held(async (item) => {
    const ok = await confirmAction({
      target: drawerEl,
      title: 'Archive this announcement?',
      text: item.status === 'PUBLISHED'
        ? 'It leaves the announcement feed in the citizen app. Residents can still open it from past announcements, marked no longer active. Nothing is deleted.'
        : 'It moves to the archive. Residents can still open it, marked as withdrawn. Nothing is deleted.',
      confirmText: 'Archive',
      onConfirm: () => archive.mutateAsync(item.id),
    });
    if (!ok) return;
    onClose();
    void notify('success', { title: 'Announcement archived', text: 'Find it under Archive or in Publication History.' });
  });

  const noticeRows: [string, ReactNode][] = [
    ['Category', categoryLabel(item.category)],
    ['Severity', <SeverityCell key="sev" severity={item.severity} />],
    ['Area', areaOf(item)],
    ['Language', LANGUAGE_LABELS[item.language] ?? item.language],
    ['Template', template?.label ?? 'Manual'],
    ['Issued by', item.issuing_office ?? '—'],
    ['Source', item.source_reference ?? '—'],
    ['Contact', item.contact_info ?? '—'],
    ...(item.effective_start_at
      ? [['Effective', `${fmtManila(item.effective_start_at)}${item.effective_end_at ? ` – ${fmtManila(item.effective_end_at)}` : ''}`] as [string, string]]
      : []),
  ];

  const timelineRows: [string, ReactNode][] = [
    ['Created', fmtManila(item.created_at)],
    ...(item.approval_requested_at && item.status !== 'DRAFT'
      ? [['Submitted', `${fmtManila(item.approval_requested_at)}${item.requestedByName ? ` · ${item.requestedByName}` : ''}`] as [string, string]]
      : []),
    ...(item.status === 'PENDING_APPROVAL' && item.scheduled_at ? [['Requested time', fmtManila(item.scheduled_at)] as [string, string]] : []),
    ...(item.approved_at ? [['Approved', `${fmtManila(item.approved_at)}${item.approverName ? ` · ${item.approverName}` : ''}`] as [string, string]] : []),
    ...(item.scheduled_at && item.status === 'SCHEDULED' ? [['Goes out', fmtManila(item.scheduled_at)] as [string, string]] : []),
    ...(item.published_at ? [['Published', fmtManila(item.published_at)] as [string, string]] : []),
    ...(item.cancelled_at ? [['Cancelled', fmtManila(item.cancelled_at)] as [string, string]] : []),
  ];

  const deliveryRows: [string, ReactNode][] = sentOut
    ? [['SMS', smsDeliverySummary(item.sms_sent_count ?? 0, delivery.data)]]
    : [];

  return (
    <Drawer open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent ref={setDrawerEl} width="w-full sm:w-[580px]">
        <DrawerHeader className="items-start gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn('mt-0.5 h-10 w-1 shrink-0 rounded-full', sev.bar)} aria-hidden />
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={st.variant}>{st.label}</Badge>
                {item.status === 'DRAFT' && item.review_note && <Badge variant="amber">Returned</Badge>}
                <span className="text-xs text-agap-textSub">{categoryLabel(item.category)}</span>
              </div>
              <DrawerTitle className="line-clamp-2 leading-snug">{item.title}</DrawerTitle>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody className="space-y-5">
          {/* What needs attention first */}
          {item.status === 'DRAFT' && item.review_note && (
            <div role="note" className="rounded-xl border border-[rgba(217,119,6,0.35)] bg-agap-amberSoft px-4 py-3 text-sm">
              <p className="flex items-center gap-1.5 text-xs font-bold text-agap-amberText">
                <MessageSquareWarning size={14} aria-hidden /> Returned by MDRRMO
              </p>
              <p className="mt-1 whitespace-pre-line text-agap-textMain">{item.review_note}</p>
              <p className="mt-1.5 text-xs text-agap-hint">Edit the draft, then submit it again.</p>
            </div>
          )}

          {item.status === 'PENDING_APPROVAL' && (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-[rgba(37,99,235,0.2)] bg-agap-infoSoft px-4 py-3 text-sm text-agap-textMid">
              <Hourglass size={15} className="mt-0.5 shrink-0 text-agap-info" aria-hidden />
              <p>
                Waiting for an MDRRMO Supervisor since {fmtManila(item.approval_requested_at)}. It is locked until it is approved or returned.
                Withdraw it if you need to change something.
              </p>
            </div>
          )}

          {item.status === 'SCHEDULED' && item.scheduled_at && (
            <div role="status" className="flex items-start gap-2 rounded-xl border border-[rgba(201,106,0,0.25)] bg-agap-amberSoft px-4 py-3 text-sm text-agap-textMid">
              <CalendarClock size={15} className="mt-0.5 shrink-0 text-agap-amberText" aria-hidden />
              <p>Goes out automatically on <span className="font-semibold text-agap-textMain">{fmtManila(item.scheduled_at)}</span> (Bocaue time).</p>
            </div>
          )}

          {item.correction_note && (
            <div className="rounded-xl border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-4 py-3 text-sm">
              <p className="text-xs font-bold text-agap-danger">Correction note</p>
              <p className="mt-1 text-agap-textMid">{item.correction_note}</p>
            </div>
          )}

          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-agap-hint">How residents see it</h3>
            <AnnouncementPreview
              imageError={image.isError}
              model={{
                title: item.title,
                summary: item.summary ?? '',
                body: item.body ?? '',
                severity: item.severity,
                category: item.category,
                issuingOffice: item.issuing_office ?? '',
                sourceReference: item.source_reference ?? '',
                areaText: areaOf(item),
                timeLabel: item.published_at ? fmtManila(item.published_at) : 'Not yet published',
                imageUrl: image.url,
                imageAlt: item.image_alt_text ?? 'Announcement image',
                push: { title: item.title, body: item.summary ?? item.body?.slice(0, 140) ?? '' },
                cancelled: item.status === 'CANCELLED' ? { note: item.correction_note } : null,
              }}
            />
          </section>

          <DetailSection title="Notice details" rows={noticeRows} />
          <DetailSection title="Timeline" rows={timelineRows} />
          <DetailSection title="Delivery" rows={deliveryRows} />
        </DrawerBody>

        {canPublish && (
          <DrawerFooter className="flex-wrap items-center justify-start gap-2">
            {item.status === 'DRAFT' && (
              <>
                <Button size="sm" variant="primary" onClick={onPublish} loading={publish.isPending || submit.isPending}>
                  {viaApproval ? <><ShieldCheck size={13} /> Submit for MDRRMO approval</> : <><Send size={13} /> Publish</>}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onSchedule(item)}>
                  <CalendarClock size={13} /> {viaApproval ? 'Submit with a release time' : 'Schedule'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => router.push(editHref)}>
                  <PencilLine size={13} /> Edit
                </Button>
              </>
            )}
            {item.status === 'PENDING_APPROVAL' && (
              <Button size="sm" variant="secondary" loading={withdraw.isPending} onClick={onWithdraw}>
                <Undo2 size={13} /> Withdraw to draft
              </Button>
            )}
            {item.status === 'SCHEDULED' && (
              <>
                <Button size="sm" variant="primary" onClick={onPublish} loading={publish.isPending}>
                  <Send size={13} /> Publish now
                </Button>
                <Button size="sm" variant="secondary" loading={unschedule.isPending} onClick={onUnschedule}>
                  <Undo2 size={13} /> Back to draft
                </Button>
              </>
            )}
            {/* Ending a notice sits apart from moving it forward. */}
            {(item.status === 'PUBLISHED' || item.status === 'CANCELLED' || item.status === 'SCHEDULED') && (
              <div className="ml-auto flex flex-wrap gap-2">
                {(item.status === 'PUBLISHED' || item.status === 'CANCELLED') && (
                  <Button size="sm" variant="ghost" loading={archive.isPending} onClick={onArchive}>
                    <Archive size={13} /> Archive
                  </Button>
                )}
                {(item.status === 'PUBLISHED' || item.status === 'SCHEDULED') && (
                  <Button size="sm" variant="danger" onClick={() => onCancel(item)}>
                    <Ban size={13} /> Cancel
                  </Button>
                )}
              </div>
            )}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FLASH = {
  published: { title: 'Announcement published', text: 'It is in the citizen app now and queued for push and SMS.' },
  submitted: { title: 'Submitted for MDRRMO approval', text: 'It goes out once a Supervisor approves it.' },
  saved: { title: 'Draft saved', text: 'Open it below to publish or schedule.' },
} as const;

function AnnouncementsList(): JSX.Element {
  const user = useAuthUser();
  const canPublish = hasRole(user, 'ANNOUNCEMENTS_PUBLISHER', 'SYSTEM_ADMINISTRATOR');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const tabParam = params.get('tab');
  const [activeTab, setActiveTab] = useState<StatusTab>(
    STATUS_TABS.includes(tabParam as StatusTab) ? (tabParam as StatusTab) : 'ALL',
  );
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Announcement | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Announcement | null>(null);

  // The composer lands here with ?published= / ?submitted= / ?saved=. Say so once
  // as a toast, then drop the flag so a refresh or Back doesn't repeat it.
  const flashShown = useRef<string | null>(null);
  useEffect(() => {
    const kind = (Object.keys(FLASH) as (keyof typeof FLASH)[]).find((k) => params.get(k));
    if (!kind) return;
    const key = `${kind}:${params.get(kind)}`;
    if (flashShown.current === key) return;
    flashShown.current = key;
    void notify('success', FLASH[kind]);
    const rest = new URLSearchParams(params.toString());
    (Object.keys(FLASH) as (keyof typeof FLASH)[]).forEach((k) => rest.delete(k));
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const { data, isLoading, isError, refetch } = useAnnouncements({
    page,
    perPage: 20,
    ...(activeTab === 'ADVISORIES'
      ? { severity: ADVISORY_SEVERITIES }
      : activeTab === 'RETURNED'
        ? { returned: true }
        : activeTab !== 'ALL' && { status: activeTab }),
  });
  const rows: Announcement[] = data?.data ?? [];
  // Keep the drawer in sync with refetched rows after an action. While a popup is
  // open in the drawer, keep showing the notice even if it has left this tab.
  const [held, setHeld] = useState<Announcement | null>(null);
  const selected = rows.find((r) => r.id === selectedId) ?? (held?.id === selectedId ? held : null);

  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      header: 'Announcement',
      accessor: (row) => (
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('mt-1 h-8 w-1 shrink-0 rounded-full', severityMeta(row.severity).bar)} aria-hidden />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold text-agap-textMain">
              <span className="max-w-[360px] truncate">{row.title}</span>
              {row.image_storage_key && <ImageIcon size={13} className="shrink-0 text-agap-textSub" aria-label="Has image" />}
            </p>
            <p className="mt-0.5 max-w-[360px] truncate text-xs text-agap-textSub">
              {row.summary ?? row.body}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      accessor: (row) => <span className="text-xs text-agap-textMid">{categoryLabel(row.category)}</span>,
    },
    {
      key: 'severity',
      header: 'Severity',
      accessor: (row) => <SeverityCell severity={row.severity} />,
    },
    {
      key: 'area',
      header: 'Area',
      accessor: (row) => <span className="block max-w-[160px] truncate text-xs text-agap-textMid">{areaOf(row)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => {
        const s = statusMeta(row.status);
        return (
          <span className="flex flex-wrap items-center gap-1">
            <Badge variant={s.variant}>{s.label}</Badge>
            {row.status === 'DRAFT' && row.review_note && <Badge variant="amber">Returned</Badge>}
          </span>
        );
      },
    },
    {
      key: 'date',
      header: 'When',
      accessor: (row) => (
        <span className="whitespace-nowrap text-xs text-agap-textSub">
          {row.status === 'SCHEDULED'
            ? `Goes out ${fmtManila(row.scheduled_at)}`
            : row.published_at
              ? fmtManila(row.published_at)
              : `Created ${fmtManila(row.created_at, false)}`}
        </span>
      ),
    },
  ];

  return (
    // Desktop: the page fills the scroll area, so the header, notices and tabs stay
    // put and only the table rows scroll (under a pinned column header). Smaller
    // screens keep normal page scrolling, since a pinned header would leave little
    // room for the list. The min height does the same for very short windows.
    <div className="flex flex-col gap-5 lg:h-full lg:min-h-[520px]">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-agap-greenSoft text-agap-green">
            <Megaphone size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-agap-textMain">Municipal Announcements</h1>
            <p className="mt-0.5 text-sm text-agap-textSub">
              Official notices from the Office of the Mayor and MDRRMO to Bocaue residents.
            </p>
          </div>
        </div>
        {canPublish && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href="/announcements/history"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-agap-textMid shadow-sm transition-colors hover:bg-slate-50 hover:text-agap-textMain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green focus-visible:ring-offset-2"
            >
              <History size={16} aria-hidden /> Publication history
            </Link>
            <Button variant="primary" onClick={() => router.push('/announcements/compose')}>
              <Plus size={16} /> New announcement
            </Button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-start gap-2.5 rounded-xl border border-agap-track bg-white px-4 py-2.5 text-xs text-agap-textMid">
        <Radio size={14} className="mt-0.5 shrink-0 text-agap-textSub" aria-hidden />
        <p>
          <span className="font-semibold text-agap-textMain">One-way broadcast.</span>{' '}
          Announcements inform the public; they are never a dispatch channel or a substitute for 911 / MDRRMO hotlines.
        </p>
      </div>

      {!canPublish && (
        <p className="shrink-0 rounded-xl border border-[rgba(217,119,6,0.25)] bg-agap-amberSoft px-4 py-2.5 text-sm text-agap-textMid">
          You need the <span className="font-semibold">Announcements Publisher</span> role to compose and publish.
        </p>
      )}

      {/* Status tabs: overview · being prepared · released */}
      <div className="-mx-1 shrink-0 overflow-x-auto px-1 pb-1">
        <div role="tablist" aria-label="Filter announcements" className="flex w-max items-center gap-1 rounded-xl bg-agap-surface p-1">
          {TAB_GROUPS.map((group, gi) => (
            <Fragment key={gi}>
              {gi > 0 && <span className="mx-1 h-5 w-px shrink-0 bg-agap-track" aria-hidden />}
              {group.map((tab) => (
                <button
                  key={tab}
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => { setActiveTab(tab); setPage(1); }}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green',
                    activeTab === tab ? 'bg-white text-agap-textMain shadow-tile' : 'text-agap-textSub hover:text-agap-textMain',
                  )}
                >
                  {tabLabel(tab)}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      </div>

      {isError ? (
        <div role="alert" className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-5 py-4 text-sm text-agap-danger">
          Couldn&apos;t load announcements. Check the connection to the server.
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>Try again</Button>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full shrink-0 rounded-2xl" />
      ) : (
        <DataTable
          stickyHeader
          // Content-height when short; shrinks and scrolls inside when it would overflow.
          className="lg:min-h-0"
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyTitle="No announcements"
          emptyDescription={
            activeTab === 'ALL' || activeTab === 'DRAFT'
              ? (canPublish ? 'Click “New announcement” to compose one from a template.' : 'Nothing has been drafted yet.')
              : activeTab === 'ADVISORIES'
                ? 'No Warning or Critical advisories.'
                : activeTab === 'RETURNED'
                  ? 'No drafts returned by MDRRMO.'
                  : `No ${statusMeta(activeTab).label.toLowerCase()} announcements.`
          }
        />
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between text-xs text-agap-textSub">
          <span>Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} total</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={!data.meta.hasPrev} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <DetailDrawer
        item={selected}
        canPublish={canPublish}
        onClose={() => setSelectedId(null)}
        onSchedule={setScheduleTarget}
        onCancel={setCancelTarget}
        onHold={setHeld}
      />
      <ScheduleDialog target={scheduleTarget} onClose={() => setScheduleTarget(null)} />
      <CancelDialog target={cancelTarget} onClose={() => setCancelTarget(null)} />
    </div>
  );
}

export default function AnnouncementsPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <AnnouncementsList />
    </Suspense>
  );
}
