'use client';

import { Suspense, useState, type JSX } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Archive, Ban, CalendarClock, CheckCircle2, ImageIcon, Megaphone, PencilLine,
  Plus, Radio, Send, Undo2, X,
} from 'lucide-react';
import {
  Button, Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerFooter, DrawerTitle,
  Skeleton,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { cn } from '@/lib/utils';
import {
  useAnnouncements,
  useAnnouncementImage,
  usePublishAnnouncement,
  useScheduleAnnouncement,
  useUnscheduleAnnouncement,
  useCancelAnnouncement,
  useArchiveAnnouncement,
} from '@/features/announcements/hooks';
import type { Announcement } from '@/features/announcements/api';
import { AnnouncementPreview } from '@/components/announcements/AnnouncementPreview';
import {
  categoryLabel, severityMeta, statusMeta, fmtManila, LANGUAGE_LABELS,
} from '@/features/announcements/labels';
import { getTemplate, manilaInputToIso, isoToManilaInput, SOURCE_REQUIRED_CATEGORIES } from '@/features/announcements/templates';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_TABS = ['ALL', 'DRAFT', 'SCHEDULED', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const inputCls =
  'w-full rounded-lg border border-[rgba(168,181,193,0.35)] bg-white px-3 py-2 text-sm text-agap-textMain ' +
  'focus:outline-none focus:ring-2 focus:ring-agap-green focus:border-transparent';

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

  async function confirm() {
    const iso = manilaInputToIso(value);
    if (!target || !iso) { setError('Choose a date and time.'); return; }
    try {
      setError(null);
      await schedule.mutateAsync({ id: target.id, scheduledAt: iso });
      setValue('');
      onClose();
    } catch (e) {
      setError(errMsg(e, 'Failed to schedule.'));
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setError(null); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={16} className="text-agap-amber" /> Schedule release
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
          onChange={(e) => setValue(e.target.value)}
          className={inputCls}
        />
        <p className="mt-2 text-xs text-agap-textSub">
          Scheduling approves the notice. It goes out automatically within a minute of this time.
        </p>
        {error && <p className="mt-2 text-xs text-agap-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={schedule.isPending} onClick={confirm}>Approve &amp; schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cancel dialog ────────────────────────────────────────────────────────────

function CancelDialog({ target, onClose }: { target: Announcement | null; onClose: () => void }): JSX.Element {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancel = useCancelAnnouncement();

  async function confirm() {
    if (!target) return;
    if (note.trim().length < 5) { setError('Explain what changed — residents will see this note.'); return; }
    try {
      setError(null);
      await cancel.mutateAsync({ id: target.id, correctionNote: note.trim() });
      setNote('');
      onClose();
    } catch (e) {
      setError(errMsg(e, 'Failed to cancel.'));
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setError(null); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban size={16} className="text-agap-danger" /> Cancel announcement
          </DialogTitle>
          {target && <DialogDescription className="line-clamp-2">{target.title}</DialogDescription>}
        </DialogHeader>
        <label htmlFor="cnote" className="mb-1.5 block text-xs font-semibold text-agap-textMid">
          Reason / correction note
        </label>
        <textarea
          id="cnote"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Kanselado ang naunang abiso. Balik-klase na sa Okt 15 ayon sa EO No. __."
          className={cn(inputCls, 'resize-y')}
        />
        <p className="mt-2 text-xs text-agap-textSub">
          The notice stays visible to residents who open it, clearly marked as cancelled with this note. Nothing is deleted.
        </p>
        {error && <p className="mt-2 text-xs text-agap-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Keep it</Button>
          <Button variant="danger" loading={cancel.isPending} onClick={confirm}>Cancel announcement</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function DetailDrawer({
  item, canPublish, onClose, onSchedule, onCancel,
}: {
  item: Announcement | null;
  canPublish: boolean;
  onClose: () => void;
  onSchedule: (a: Announcement) => void;
  onCancel: (a: Announcement) => void;
}): JSX.Element {
  const router = useRouter();
  const missingFields = item ? getMissingPublishFields(item) : [];
  const publish = usePublishAnnouncement();
  const unschedule = useUnscheduleAnnouncement();
  const archive = useArchiveAnnouncement();
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const image = useAnnouncementImage(item?.id ?? null, !!item?.image_storage_key, item?.updated_at);

  if (!item) {
    return <Drawer open={false} onOpenChange={() => undefined}><DrawerContent /></Drawer>;
  }

  const st = statusMeta(item.status);
  const template = getTemplate(item.template_key);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    try { setError(null); await fn(); } catch (e) { setError(errMsg(e, fallback)); }
  }

  const rows: [string, string][] = [
    ['Category', categoryLabel(item.category)],
    ['Template', template?.label ?? 'Manual'],
    ['Language', LANGUAGE_LABELS[item.language] ?? item.language],
    ['Area', areaOf(item)],
    ['Issued by', item.issuing_office ?? '—'],
    ['Source', item.source_reference ?? '—'],
    ['Contact', item.contact_info ?? '—'],
    ...(item.effective_start_at ? [['Effective', `${fmtManila(item.effective_start_at)}${item.effective_end_at ? ` – ${fmtManila(item.effective_end_at)}` : ''}`] as [string, string]] : []),
    ['Created', fmtManila(item.created_at)],
    ...(item.approved_at ? [['Approved', fmtManila(item.approved_at)] as [string, string]] : []),
    ...(item.scheduled_at && item.status === 'SCHEDULED' ? [['Goes out', fmtManila(item.scheduled_at)] as [string, string]] : []),
    ...(item.published_at ? [['Published', fmtManila(item.published_at)] as [string, string]] : []),
    ...(item.status === 'PUBLISHED' || item.status === 'CANCELLED' ? [['SMS queued', String(item.sms_sent_count ?? 0)] as [string, string]] : []),
    ...(item.cancelled_at ? [['Cancelled', fmtManila(item.cancelled_at)] as [string, string]] : []),
  ];

  return (
    <Drawer open onOpenChange={(o) => { if (!o) { setError(null); setConfirmPublish(false); onClose(); } }}>
      <DrawerContent width="w-full sm:w-[560px]">
        <DrawerHeader>
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant={st.variant}>{st.label}</Badge>
            <DrawerTitle className="truncate">{item.title}</DrawerTitle>
          </div>
        </DrawerHeader>
        <DrawerBody className="space-y-5">
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

          <dl className="divide-y divide-agap-surface rounded-xl border border-[rgba(168,181,193,0.25)] text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-3 px-4 py-2">
                <dt className="text-xs font-semibold text-agap-textSub">{k}</dt>
                <dd className="break-words text-agap-textMain">{v}</dd>
              </div>
            ))}
          </dl>

          {item.correction_note && (
            <div className="rounded-xl border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-4 py-3 text-sm">
              <p className="text-xs font-bold text-agap-danger">Correction note</p>
              <p className="mt-1 text-agap-textMid">{item.correction_note}</p>
            </div>
          )}

          {confirmPublish && (
            missingFields.length > 0 ? (
              <div className="rounded-xl border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-4 py-3 text-sm">
                <p className="font-semibold text-agap-danger">Cannot publish — required fields are missing:</p>
                <ul className="mt-1.5 space-y-0.5 text-xs text-agap-textMid">
                  {missingFields.map((f) => <li key={f} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-agap-danger" aria-hidden />  {f}</li>)}
                </ul>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setConfirmPublish(false)}>Back</Button>
                  <Button size="sm" variant="primary" onClick={() => { setConfirmPublish(false); router.push(`/announcements/compose?id=${item.id}`); }}>
                    <PencilLine size={13} /> Edit to fix
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-agap-green bg-agap-greenSoft px-4 py-3 text-sm">
                <p className="font-semibold text-agap-textMain">Approve and publish now?</p>
                <p className="mt-1 text-xs text-agap-textMid">
                  It appears in the citizen app immediately and goes to push and SMS subscribers.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setConfirmPublish(false)}>Back</Button>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={publish.isPending}
                    onClick={() => run(async () => { await publish.mutateAsync(item.id); setConfirmPublish(false); onClose(); }, 'Failed to publish.')}
                  >
                    <Send size={13} /> Approve &amp; publish
                  </Button>
                </div>
              </div>
            )
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-3 py-2 text-xs text-agap-danger">
              {error}
            </p>
          )}
        </DrawerBody>

        {canPublish && (
          <DrawerFooter className="flex-wrap justify-start">
            {item.status === 'DRAFT' && (
              <>
                <Button size="sm" variant="primary" onClick={() => setConfirmPublish(true)} disabled={confirmPublish}>
                  <Send size={13} /> Publish
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onSchedule(item)}>
                  <CalendarClock size={13} /> Schedule
                </Button>
                <Button size="sm" variant="ghost" onClick={() => router.push(`/announcements/compose?id=${item.id}`)}>
                  <PencilLine size={13} /> Edit
                </Button>
              </>
            )}
            {item.status === 'SCHEDULED' && (
              <>
                <Button size="sm" variant="primary" onClick={() => setConfirmPublish(true)} disabled={confirmPublish}>
                  <Send size={13} /> Publish now
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={unschedule.isPending}
                  onClick={() => run(() => unschedule.mutateAsync(item.id), 'Failed to return to draft.')}
                >
                  <Undo2 size={13} /> Back to draft
                </Button>
              </>
            )}
            {(item.status === 'PUBLISHED' || item.status === 'SCHEDULED') && (
              <Button size="sm" variant="danger" onClick={() => onCancel(item)}>
                <Ban size={13} /> Cancel
              </Button>
            )}
            {(item.status === 'PUBLISHED' || item.status === 'CANCELLED') && (
              <Button
                size="sm"
                variant="ghost"
                loading={archive.isPending}
                onClick={() => run(async () => { await archive.mutateAsync(item.id); onClose(); }, 'Failed to archive.')}
              >
                <Archive size={13} /> Archive
              </Button>
            )}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AnnouncementsList(): JSX.Element {
  const user = useAuthUser();
  const canPublish = hasRole(user, 'ANNOUNCEMENTS_PUBLISHER', 'SYSTEM_ADMINISTRATOR');
  const router = useRouter();
  const params = useSearchParams();
  const flash = params.get('published') ? 'published' : params.get('saved') ? 'saved' : null;

  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Announcement | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Announcement | null>(null);

  const { data, isLoading } = useAnnouncements({
    page,
    perPage: 20,
    ...(activeTab !== 'ALL' && { status: activeTab }),
  });
  const rows: Announcement[] = data?.data ?? [];
  // Keep the drawer in sync with refetched rows after an action.
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      header: 'Announcement',
      accessor: (row) => (
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('mt-1 h-8 w-1 shrink-0 rounded-full', severityMeta(row.severity).bar)} aria-hidden />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-semibold text-agap-textMain">
              <span className="truncate max-w-[360px]">{row.title}</span>
              {row.image_storage_key && <ImageIcon size={13} className="shrink-0 text-agap-textSub" aria-label="Has image" />}
            </p>
            <p className="mt-0.5 truncate max-w-[360px] text-xs text-agap-textSub">
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
        return <Badge variant={s.variant}>{s.label}</Badge>;
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-agap-textMain">
            <Megaphone size={22} className="text-agap-green" aria-hidden />
            Municipal Announcements
          </h1>
          <p className="mt-0.5 text-sm text-agap-textSub">
            Official notices from the Office of the Mayor and MDRRMO to Bocaue residents.
          </p>
        </div>
        {canPublish && (
          <Button variant="primary" onClick={() => router.push('/announcements/compose')} className="shrink-0">
            <Plus size={16} /> New announcement
          </Button>
        )}
      </div>

      {flash && (
        <div className="flex items-center gap-2 rounded-xl border border-[rgba(13,96,83,0.2)] bg-agap-greenSoft px-4 py-2.5 text-sm text-agap-textMain">
          <CheckCircle2 size={16} className="shrink-0 text-agap-green" aria-hidden />
          {flash === 'published'
            ? 'Announcement published. It is now in the citizen app and queued for push and SMS.'
            : 'Draft saved. Open it below to publish or schedule.'}
          <Link href="/announcements" className="ml-auto text-agap-textSub hover:text-agap-textMain" aria-label="Dismiss">
            <X size={14} />
          </Link>
        </div>
      )}

      <div className="flex items-start gap-2.5 rounded-xl border border-[rgba(168,181,193,0.3)] bg-white px-4 py-2.5 text-xs text-agap-textMid">
        <Radio size={14} className="mt-0.5 shrink-0 text-agap-textSub" aria-hidden />
        <p>
          <span className="font-semibold text-agap-textMain">One-way broadcast.</span>{' '}
          Announcements inform the public; they are never a dispatch channel or a substitute for 911 / MDRRMO hotlines.
        </p>
      </div>

      {!canPublish && (
        <p className="rounded-xl border border-[rgba(217,119,6,0.25)] bg-agap-amberSoft px-4 py-2.5 text-sm text-agap-textMid">
          You need the <span className="font-semibold">Announcements Publisher</span> role to compose and publish.
        </p>
      )}

      {/* Status tabs */}
      <div role="tablist" className="flex w-fit flex-wrap gap-1 rounded-xl bg-agap-surface p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => { setActiveTab(tab); setPage(1); }}
            className={cn(
              'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
              activeTab === tab ? 'bg-white text-agap-textMain shadow-tile' : 'text-agap-textSub hover:text-agap-textMain',
            )}
          >
            {tab === 'ALL' ? 'All' : statusMeta(tab).label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyTitle="No announcements"
          emptyDescription={
            activeTab === 'ALL' || activeTab === 'DRAFT'
              ? 'Click “New announcement” to compose one from a template.'
              : `No ${statusMeta(activeTab).label.toLowerCase()} announcements.`
          }
        />
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-agap-textSub">
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
