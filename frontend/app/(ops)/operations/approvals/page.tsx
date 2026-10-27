'use client';

import { useState, type JSX } from 'react';
import { CheckCircle2, Info, MessageSquareWarning, ShieldCheck, Undo2 } from 'lucide-react';
import {
  Button, Badge, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  useAnnouncementImage,
  useAnnouncementPolicy,
  useApproveAnnouncement,
  usePendingApprovals,
  useReturnAnnouncement,
} from '@/features/announcements/hooks';
import type { Announcement } from '@/features/announcements/api';
import { AnnouncementPreview } from '@/components/announcements/AnnouncementPreview';
import { categoryLabel, fmtManila, severityMeta, LANGUAGE_LABELS } from '@/features/announcements/labels';

/**
 * Supervisor: CRITICAL advisories from the LGU Information Officer awaiting MDRRMO
 * approval (ROLE_DASHBOARDS_PLAN.md Phase 7). Approve releases it (now, or at the
 * officer's requested time); Return sends it back to draft with a note.
 */

const MIN_NOTE = 10;

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

function areaOf(a: Announcement) {
  return a.scope === 'MUNICIPALITY_WIDE' || a.target_barangays.length === 0
    ? 'All of Bocaue'
    : `Brgy. ${a.target_barangays.join(', ')}`;
}

function waitingFor(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

// ─── Return dialog ────────────────────────────────────────────────────────────

function ReturnDialog({ target, onClose, onDone }: {
  target: Announcement | null;
  onClose: () => void;
  onDone: () => void;
}): JSX.Element {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ret = useReturnAnnouncement();

  async function confirm() {
    if (!target) return;
    if (note.trim().length < MIN_NOTE) { setError('Say what the officer must change (at least 10 characters).'); return; }
    try {
      setError(null);
      await ret.mutateAsync({ id: target.id, note: note.trim() });
      setNote('');
      onDone();
    } catch (e) {
      setError(errMsg(e, 'Failed to return.'));
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setError(null); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 size={16} className="text-agap-amber" /> Return to the officer
          </DialogTitle>
          {target && <DialogDescription className="line-clamp-2">{target.title}</DialogDescription>}
        </DialogHeader>
        <label htmlFor="rnote" className="mb-1.5 block text-xs font-semibold text-agap-textMid">
          What must change
        </label>
        <textarea
          id="rnote"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Idagdag ang mga evacuation center para sa Lolomboy at Bunlo."
          className="w-full resize-y rounded-lg border border-[rgba(168,181,193,0.35)] bg-white px-3 py-2 text-sm text-agap-textMain focus:border-transparent focus:outline-none focus:ring-2 focus:ring-agap-green"
        />
        <p className="mt-2 text-xs text-agap-textSub">
          The advisory goes back to draft. The officer sees this note on the Announcements page. Nothing is sent to residents.
        </p>
        {error && <p className="mt-2 text-xs text-agap-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Back</Button>
          <Button variant="primary" loading={ret.isPending} onClick={confirm}>Return with note</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Review panel ─────────────────────────────────────────────────────────────

function Review({ item, onReturn, onApproved }: {
  item: Announcement;
  onReturn: () => void;
  onApproved: (scheduled: boolean) => void;
}): JSX.Element {
  const image = useAnnouncementImage(item.id, !!item.image_storage_key, item.updated_at, 'approval');
  const approve = useApproveAnnouncement();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const later = !!item.scheduled_at && new Date(item.scheduled_at).getTime() > Date.now();

  async function confirm() {
    try {
      setError(null);
      await approve.mutateAsync(item.id);
      setConfirming(false);
      onApproved(later);
    } catch (e) {
      setError(errMsg(e, 'Failed to approve.'));
    }
  }

  const rows: [string, string][] = [
    ['Category', categoryLabel(item.category)],
    ['Language', LANGUAGE_LABELS[item.language] ?? item.language],
    ['Area', areaOf(item)],
    ['Issued by', item.issuing_office ?? '—'],
    ['Source', item.source_reference ?? '—'],
    ['Contact', item.contact_info ?? '—'],
    ['Submitted', `${fmtManila(item.approval_requested_at)}${item.requestedByName ? ` · ${item.requestedByName}` : ''}`],
    ['Release', later ? `At ${fmtManila(item.scheduled_at)}` : 'Immediately on approval'],
  ];

  return (
    <section className="space-y-4 rounded-xl border border-agap-track/40 bg-white p-5 shadow-card">
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
          timeLabel: 'Not yet published',
          imageUrl: image.url,
          imageAlt: item.image_alt_text ?? 'Announcement image',
          push: { title: item.title, body: item.summary ?? item.body?.slice(0, 140) ?? '' },
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

      {confirming && (
        <div className="rounded-xl border border-agap-green bg-agap-greenSoft px-4 py-3 text-sm">
          <p className="font-semibold text-agap-textMain">
            {later ? `Approve for release at ${fmtManila(item.scheduled_at)}?` : 'Approve and release now?'}
          </p>
          <p className="mt-1 text-xs text-agap-textMid">
            It appears in the citizen app and goes to push and SMS subscribers. You are recorded as the approver.
          </p>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Back</Button>
            <Button size="sm" variant="primary" loading={approve.isPending} onClick={confirm}>
              <ShieldCheck size={13} /> Approve
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-3 py-2 text-xs text-agap-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => setConfirming(true)} disabled={confirming}>
          <ShieldCheck size={15} /> Approve
        </Button>
        <Button variant="secondary" onClick={onReturn}>
          <Undo2 size={15} /> Return with note
        </Button>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage(): JSX.Element {
  const query = usePendingApprovals();
  const policy = useAnnouncementPolicy();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [returnTarget, setReturnTarget] = useState<Announcement | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const items = query.data ?? [];
  const selected = items.find((a) => a.id === selectedId) ?? items[0] ?? null;
  const now = query.dataUpdatedAt || Date.now();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-agap-textMain">
          <ShieldCheck size={22} className="text-agap-green" aria-hidden />
          Advisory Approvals
        </h1>
        <p className="mt-0.5 text-sm text-agap-textSub">
          CRITICAL advisories from the LGU Information Officer. Nothing reaches residents until you approve it.
        </p>
      </div>

      {policy.data && !policy.data.criticalNeedsApproval && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-[rgba(168,181,193,0.3)] bg-white px-4 py-2.5 text-sm text-agap-textMid">
          <Info size={15} className="mt-0.5 shrink-0 text-agap-textSub" aria-hidden />
          Approval is switched off, so CRITICAL advisories are published directly by the officer. Anything submitted earlier still appears here.
        </div>
      )}

      {flash && (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-[rgba(13,96,83,0.2)] bg-agap-greenSoft px-4 py-2.5 text-sm text-agap-textMain">
          <CheckCircle2 size={16} className="shrink-0 text-agap-green" aria-hidden /> {flash}
        </div>
      )}

      {query.isError && !query.data ? (
        <p className="rounded-xl border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-4 py-2.5 text-sm text-agap-danger">
          Couldn&apos;t load advisories awaiting approval. Retrying every minute.
        </p>
      ) : query.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-agap-track/40 bg-white px-5 py-10 text-center shadow-card">
          <p className="font-semibold text-agap-textMain">Nothing awaiting approval</p>
          <p className="mt-1 text-sm text-agap-textSub">New submissions appear here within a minute.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="space-y-2" aria-label="Advisories awaiting approval">
            {items.map((a) => {
              const sev = severityMeta(a.severity);
              const active = selected?.id === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    aria-current={active}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/40',
                      active ? 'border-agap-green' : 'border-agap-track/40 hover:bg-agap-surface',
                    )}
                  >
                    <span className={cn('mt-0.5 h-9 w-1 shrink-0 rounded-full', sev.bar)} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-agap-textMain">{a.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-agap-textSub">
                        {categoryLabel(a.category)} · {areaOf(a)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-agap-textSub">
                        <Badge variant={sev.variant}>{sev.label}</Badge>
                        Waiting {waitingFor(a.approval_requested_at, now)}
                        {a.requestedByName && <> · {a.requestedByName}</>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <Review
              key={selected.id}
              item={selected}
              onReturn={() => setReturnTarget(selected)}
              onApproved={(scheduled) => {
                setFlash(scheduled
                  ? `Approved. "${selected.title}" goes out at ${fmtManila(selected.scheduled_at)}.`
                  : `Approved and published: "${selected.title}".`);
                setSelectedId(null);
              }}
            />
          )}
        </div>
      )}

      <ReturnDialog
        target={returnTarget}
        onClose={() => setReturnTarget(null)}
        onDone={() => {
          setFlash(returnTarget ? `Returned to the officer: "${returnTarget.title}".` : null);
          setReturnTarget(null);
          setSelectedId(null);
        }}
      />

      <p className="flex items-center gap-1.5 text-xs text-agap-textSub">
        <MessageSquareWarning size={13} aria-hidden />
        Announcements are a one-way public broadcast, never a dispatch channel.
      </p>
    </div>
  );
}
