'use client';

import { useState, type JSX } from 'react';
import {
  Megaphone, Plus, Send, CalendarClock, Archive,
  AlertTriangle, Radio, Info,
} from 'lucide-react';
import {
  Button, Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Skeleton, EmptyState,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase } from '@/lib/incident-format';
import {
  useAnnouncements,
  usePublishedAnnouncements,
  useCreateAnnouncement,
  usePublishAnnouncement,
  useScheduleAnnouncement,
  useArchiveAnnouncement,
} from '@/features/announcements/hooks';
import type { Announcement, CreateAnnouncementBody } from '@/features/announcements/api';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'FLOOD_ALERT',
  'EVACUATION_ORDER',
  'CLASS_SUSPENSION',
  'ROAD_CLOSURE',
  'FIRE_ADVISORY',
  'INDUSTRIAL_HAZARD',
  'POST_DISASTER_UPDATE',
  'RESCUE_UPDATE',
  'GENERAL_INFORMATION',
] as const;

const SEVERITIES = ['INFORMATIONAL', 'ADVISORY', 'WARNING', 'CRITICAL'] as const;
const SCOPES = ['MUNICIPALITY_WIDE', 'BARANGAY_SPECIFIC', 'CATEGORY_SPECIFIC'] as const;

const STATUS_TABS = ['ALL', 'DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const CAN_PUBLISH = ['DRAFT'] as const;
const CAN_SCHEDULE = ['DRAFT'] as const;
const CAN_ARCHIVE = ['PUBLISHED', 'SCHEDULED'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface StatusStyle { variant: 'green' | 'amber' | 'blue' | 'muted' | 'red'; label: string }

function statusStyle(status: string): StatusStyle {
  switch (status) {
    case 'DRAFT':     return { variant: 'muted',  label: 'Draft' };
    case 'SCHEDULED': return { variant: 'amber',  label: 'Scheduled' };
    case 'PUBLISHED': return { variant: 'green',  label: 'Published' };
    case 'ARCHIVED':  return { variant: 'muted',  label: 'Archived' };
    case 'SUPERSEDED':return { variant: 'muted',  label: 'Superseded' };
    default:          return { variant: 'muted',  label: titleCase(status) };
  }
}

interface SeverityStyle { variant: 'red' | 'amber' | 'blue' | 'muted'; label: string }

function severityStyle(severity: string): SeverityStyle {
  switch (severity) {
    case 'CRITICAL':      return { variant: 'red',   label: 'Critical' };
    case 'WARNING':       return { variant: 'amber', label: 'Warning' };
    case 'ADVISORY':      return { variant: 'blue',  label: 'Advisory' };
    case 'INFORMATIONAL': return { variant: 'muted', label: 'Info' };
    default:              return { variant: 'muted', label: titleCase(severity) };
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Compose Dialog ───────────────────────────────────────────────────────────

const EMPTY_FORM: CreateAnnouncementBody = {
  title: '',
  body: '',
  category: '',
  severity: 'INFORMATIONAL',
  scope: 'MUNICIPALITY_WIDE',
  targetBarangays: [],
};

interface ComposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ComposeDialog({ open, onOpenChange }: ComposeDialogProps): JSX.Element {
  const [form, setForm] = useState<CreateAnnouncementBody>(EMPTY_FORM);
  const [barangayInput, setBarangayInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useCreateAnnouncement();

  function handleOpen(next: boolean) {
    if (next) {
      setForm(EMPTY_FORM);
      setBarangayInput('');
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.body.trim() || !form.category || !form.severity || !form.scope) {
      setError('Title, body, category, severity, and scope are required.');
      return;
    }
    try {
      setError(null);
      const barangays = barangayInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await create.mutateAsync({ ...form, targetBarangays: barangays });
      handleOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create announcement.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone size={18} className="text-agap-green" />
            Compose Announcement
          </DialogTitle>
          <DialogDescription>
            Save as draft, then publish or schedule. This is a one-way broadcast — not a dispatch channel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-agap-textMid mb-1.5 uppercase tracking-wide">
              Title <span className="text-agap-danger">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Class suspension — Bocaue Central"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-agap-textMid mb-1.5 uppercase tracking-wide">
              Body <span className="text-agap-danger">*</span>
            </label>
            <textarea
              rows={4}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Announcement message…"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green resize-none"
            />
          </div>

          {/* Category / Severity row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-agap-textMid mb-1.5 uppercase tracking-wide">
                Category <span className="text-agap-danger">*</span>
              </label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-agap-textMid mb-1.5 uppercase tracking-wide">
                Severity <span className="text-agap-danger">*</span>
              </label>
              <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-xs font-semibold text-agap-textMid mb-1.5 uppercase tracking-wide">
              Scope <span className="text-agap-danger">*</span>
            </label>
            <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target barangays */}
          <div>
            <label className="block text-xs font-semibold text-agap-textMid mb-1.5 uppercase tracking-wide">
              Target Barangays <span className="text-agap-textSub font-normal normal-case">(optional, comma-separated)</span>
            </label>
            <input
              type="text"
              value={barangayInput}
              onChange={(e) => setBarangayInput(e.target.value)}
              placeholder="e.g. Lolomboy, Bunlo, Bambang"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-agap-dangerSoft border border-[rgba(212,72,88,0.18)] px-3 py-2 text-sm text-agap-danger">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => handleOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={handleSubmit}>
            Save as Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Schedule Dialog ──────────────────────────────────────────────────────────

interface ScheduleDialogProps {
  target: Announcement | null;
  onClose: () => void;
}

function ScheduleDialog({ target, onClose }: ScheduleDialogProps): JSX.Element {
  const [scheduledAt, setScheduledAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const schedule = useScheduleAnnouncement();

  async function handleConfirm() {
    if (!scheduledAt) { setError('Please select a date and time.'); return; }
    if (!target) return;
    try {
      setError(null);
      await schedule.mutateAsync({ id: target.id, scheduledAt: new Date(scheduledAt).toISOString() });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to schedule.');
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock size={16} className="text-agap-amber" />
            Schedule Announcement
          </DialogTitle>
          {target && (
            <DialogDescription className="text-agap-textMid font-medium truncate">
              &ldquo;{target.title}&rdquo;
            </DialogDescription>
          )}
        </DialogHeader>

        <div>
          <label className="block text-xs font-semibold text-agap-textMid mb-1.5 uppercase tracking-wide">
            Publish at
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            min={new Date().toISOString().slice(0, 16)}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain focus:outline-none focus:ring-2 focus:ring-agap-green"
          />
          {error && (
            <p className="mt-2 text-xs text-agap-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={schedule.isPending} onClick={handleConfirm}>
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Broadcast Notice ─────────────────────────────────────────────────────────

function BroadcastNotice(): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[rgba(59,130,246,0.22)] bg-agap-infoSoft px-4 py-3">
      <Radio size={16} className="text-agap-info mt-0.5 shrink-0" />
      <p className="text-sm text-agap-textMid">
        <span className="font-semibold text-agap-textMain">One-way broadcast only.</span>{' '}
        Announcements are public information messages. They are never a substitute for emergency dispatch or 911 / MDRRMO hotline calls.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnnouncementsPage(): JSX.Element {
  const user = useAuthUser();
  const canPublish = hasRole(user, 'ANNOUNCEMENTS_PUBLISHER', 'SYSTEM_ADMINISTRATOR');

  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');
  const [composeOpen, setComposeOpen] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState<Announcement | null>(null);

  const params = activeTab === 'ALL' ? {} : { status: activeTab };

  const publisherQuery = useAnnouncements(params, canPublish);
  const publicQuery = usePublishedAnnouncements(!canPublish);

  const isLoading = canPublish
    ? publisherQuery.isLoading
    : publicQuery.isLoading;

  const data = canPublish ? publisherQuery.data : null;

  const rows: Announcement[] = canPublish
    ? data?.data ?? []
    : publicQuery.data ?? [];

  const total = canPublish
    ? data?.meta.total ?? 0
    : rows.length;

  const totalPages = canPublish
    ? data?.meta.totalPages ?? 0
    : 1;

  const publish = usePublishAnnouncement();
  const archive = useArchiveAnnouncement();



  // ─── Columns ─────────────────────────────────────────────────────────────

  const columns: Column<Announcement>[] = [
    {
      key: 'title',
      header: 'Title',
      sortable: true,
      accessor: (row) => (
        <div>
          <p className="font-semibold text-agap-textMain truncate max-w-[220px]">{row.title}</p>
          {row.body && (
            <p className="text-xs text-agap-textSub truncate max-w-[220px] mt-0.5">{row.body}</p>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      accessor: (row) => (
        <span className="text-xs font-medium text-agap-textMid">{titleCase(row.category)}</span>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      accessor: (row) => {
        const s = severityStyle(row.severity);
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'scope',
      header: 'Scope',
      accessor: (row) => (
        <span className="text-xs text-agap-textMid">{titleCase(row.scope)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      accessor: (row) => {
        const s = statusStyle(row.status);
        return <Badge variant={s.variant}>{s.label}</Badge>;
      },
    },
    {
      key: 'date',
      header: 'Date',
      accessor: (row) => (
        <span className="text-xs text-agap-textSub whitespace-nowrap">
          {row.status === 'PUBLISHED'
            ? fmtDate(row.published_at)
            : row.status === 'SCHEDULED'
            ? fmtDate(row.scheduled_at)
            : fmtDate(row.created_at)}
        </span>
      ),
    },
    ...(canPublish
      ? [
          {
            key: 'actions',
            header: '',
            accessor: (row: Announcement) => (
              <div className="flex items-center gap-1.5 justify-end">
                {(CAN_PUBLISH as readonly string[]).includes(row.status) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); publish.mutate(row.id); }}
                    disabled={publish.isPending}
                    title="Publish now"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-agap-greenSoft text-agap-green hover:bg-agap-green hover:text-white transition-colors disabled:opacity-50"
                  >
                    <Send size={11} />
                    Publish
                  </button>
                )}
                {(CAN_SCHEDULE as readonly string[]).includes(row.status) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setScheduleTarget(row); }}
                    title="Schedule"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-agap-amberSoft text-agap-amber hover:bg-amber-100 transition-colors"
                  >
                    <CalendarClock size={11} />
                    Schedule
                  </button>
                )}
                {(CAN_ARCHIVE as readonly string[]).includes(row.status) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); archive.mutate(row.id); }}
                    disabled={archive.isPending}
                    title="Archive"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-agap-surface text-agap-textSub hover:bg-agap-track transition-colors disabled:opacity-50"
                  >
                    <Archive size={11} />
                    Archive
                  </button>
                )}
              </div>
            ),
            headerClassName: 'text-right',
            cellClassName: 'text-right',
          } satisfies Column<Announcement>,
        ]
      : []),
  ];

  // ─── Loading skeleton ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-44 rounded-xl" />
        </div>
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-agap-textMain tracking-tight flex items-center gap-2">
            <Megaphone size={22} className="text-agap-green" />
            Municipal Announcements
          </h1>
          <p className="text-sm text-agap-textSub mt-0.5">
            MOD-53 · Bocaue MDRRMO public broadcast channel
          </p>
        </div>
        {canPublish && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setComposeOpen(true)}
            className="shrink-0"
          >
            <Plus size={16} />
            New Announcement
          </Button>
        )}
      </div>

      {/* Broadcast notice */}
      <BroadcastNotice />

      {/* Role notice for non-publishers */}
      {!canPublish && (
        <div className="flex items-center gap-2 rounded-2xl border border-[rgba(217,119,6,0.22)] bg-agap-amberSoft px-4 py-3">
          <AlertTriangle size={15} className="text-agap-amber shrink-0" />
          <p className="text-sm text-agap-textMid">
            You need the <span className="font-semibold">Announcements Publisher</span> role to compose and publish.
          </p>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-agap-surface p-1 w-fit">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-3.5 py-1.5 text-sm font-semibold rounded-lg transition-all',
              activeTab === tab
                ? 'bg-white text-agap-green shadow-tile'
                : 'text-agap-textSub hover:text-agap-textMain',
            )}
          >
            {tab === 'ALL' ? 'All' : titleCase(tab)}
          </button>
        ))}
      </div>

      {/* Count */}
      {data && (
        <p className="text-xs text-agap-textSub">
          {data.meta.total} announcement{data.meta.total !== 1 ? 's' : ''}
          {activeTab !== 'ALL' ? ` · ${titleCase(activeTab)}` : ''}
        </p>
      )}

      {/* Table */}
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.id}
        emptyTitle="No announcements"
        emptyDescription={
          activeTab === 'DRAFT'
            ? 'No drafts yet. Click "New Announcement" to compose one.'
            : `No ${titleCase(activeTab).toLowerCase()} announcements.`
        }
      />

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-agap-textSub">
            {total} announcement{total !== 1 ? 's' : ''}
            {canPublish && activeTab !== 'ALL'
              ? ` · ${titleCase(activeTab)}`
              : ''}
          </p>
          <div className="flex items-center gap-1.5">
            <Info size={12} className="text-agap-textSub" />
            <span className="text-xs text-agap-textSub">
              Showing {rows.length} of {data?.meta.total ?? 0}
            </span>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} />
      <ScheduleDialog target={scheduleTarget} onClose={() => setScheduleTarget(null)} />
    </div>
  );
}
