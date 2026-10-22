'use client';

import { useState, type JSX } from 'react';
import { History } from 'lucide-react';
import { Badge, Button, DataTable, Skeleton, type Column } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAnnouncements } from '@/features/announcements/hooks';
import type { Announcement } from '@/features/announcements/api';
import { categoryLabel, fmtManila, severityMeta, statusMeta } from '@/features/announcements/labels';

/**
 * Everything that went out to the public: still published, archived, replaced by
 * a newer notice, or cancelled with a correction. Drafts and scheduled items are
 * on the Announcements page. Spec §2: author, approver, publication time,
 * corrections and supersessions.
 */
const FILTERS = [
  { key: 'ALL', label: 'All', status: 'PUBLISHED,ARCHIVED,SUPERSEDED,CANCELLED' },
  { key: 'PUBLISHED', label: 'Published', status: 'PUBLISHED' },
  { key: 'CORRECTED', label: 'Cancelled / corrected', status: 'CANCELLED' },
  { key: 'SUPERSEDED', label: 'Superseded', status: 'SUPERSEDED' },
  { key: 'ARCHIVED', label: 'Archive', status: 'ARCHIVED' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

const PER_PAGE = 25;

const columns: Column<Announcement>[] = [
  {
    key: 'title',
    header: 'Announcement',
    accessor: (row) => (
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('mt-1 h-8 w-1 shrink-0 rounded-full', severityMeta(row.severity).bar)} aria-hidden />
        <div className="min-w-0">
          <p className="max-w-[320px] truncate font-semibold text-agap-textMain">{row.title}</p>
          <p className="mt-0.5 text-xs text-agap-textSub">
            {categoryLabel(row.category)} · {severityMeta(row.severity).label}
          </p>
        </div>
      </div>
    ),
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
    key: 'published',
    header: 'Published',
    accessor: (row) => <span className="whitespace-nowrap text-xs text-agap-textMid">{fmtManila(row.published_at)}</span>,
  },
  {
    key: 'author',
    header: 'Author',
    accessor: (row) => <span className="text-xs text-agap-textMid">{row.publisherName ?? '—'}</span>,
  },
  {
    key: 'approver',
    header: 'Approved by',
    accessor: (row) => (
      <div className="text-xs">
        <p className="text-agap-textMid">{row.approverName ?? '—'}</p>
        {row.approved_at && <p className="text-agap-textSub">{fmtManila(row.approved_at)}</p>}
      </div>
    ),
  },
  {
    key: 'delivery',
    header: 'Delivery',
    accessor: (row) => (
      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-agap-textMid">
        SMS {row.sms_sent_count ?? 0} · Push {row.push_sent_count ?? 0}
      </span>
    ),
  },
  {
    key: 'correction',
    header: 'Correction / change',
    accessor: (row) => {
      if (row.correction_note) {
        return <span className="block max-w-[240px] text-xs text-agap-textMid">{row.correction_note}</span>;
      }
      if (row.status === 'SUPERSEDED') return <span className="text-xs text-agap-textSub">Replaced by a newer notice</span>;
      if (row.status === 'ARCHIVED' && row.archived_at) {
        return <span className="text-xs text-agap-textSub">Archived {fmtManila(row.archived_at, false)}</span>;
      }
      return <span className="text-xs text-agap-textSub">—</span>;
    },
  },
];

export default function PublicationHistoryPage(): JSX.Element {
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [page, setPage] = useState(1);
  const status = FILTERS.find((f) => f.key === filter)!.status;

  const { data, isLoading, isError } = useAnnouncements({ status, page, perPage: PER_PAGE });
  const rows = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-agap-textMain">
          <History size={22} className="text-agap-green" aria-hidden />
          Publication History
        </h1>
        <p className="mt-0.5 text-sm text-agap-textSub">
          Every announcement released to the public, with who wrote it, who approved it, and any later correction.
        </p>
      </div>

      <div role="tablist" className="flex w-fit flex-wrap gap-1 rounded-xl bg-agap-surface p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={cn(
              'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
              filter === f.key ? 'bg-white text-agap-textMain shadow-tile' : 'text-agap-textSub hover:text-agap-textMain',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isError ? (
        <p className="rounded-xl border border-agap-track/40 bg-white px-5 py-4 text-sm text-agap-danger">
          Couldn&apos;t load the publication history.
        </p>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          emptyTitle="Nothing published yet"
          emptyDescription="Announcements appear here once they are published."
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
    </div>
  );
}
