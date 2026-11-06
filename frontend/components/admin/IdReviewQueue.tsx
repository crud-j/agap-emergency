'use client';

import { useState, type JSX } from 'react';
import { ChevronLeft, ChevronRight, Eye, IdCard, ShieldCheck } from 'lucide-react';
import {
  ID_REJECTION_REASONS,
  ID_REVIEW_STATUSES,
  type IdRejectionReason,
  type IdReviewItem,
  type IdReviewStatus,
} from '@agap/shared';
import {
  Badge, Button, DataTable,
  Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  type BadgeVariant, type Column,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useApproveIdReview, useIdImage, useIdReviews, useRejectIdReview } from '@/features/identity-verification/hooks';
import {
  REJECTION_REASON_LABELS,
  REVIEW_STATUS_LABELS,
  reviewCheckHint,
  reviewReasonLabel,
} from '@/features/identity-verification/format';

const PER_PAGE = 25;

const STATUS_VARIANT: Record<IdReviewStatus, BadgeVariant> = {
  PENDING_REVIEW: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Only MDRRMO administrators can review PhilHealth ID checks.';
    if (err.status === 409) return 'Someone else already decided this check.';
    if (err.status === 410) return 'This ID image has already been deleted.';
  }
  return fallback;
}

/**
 * PhilHealth ID reviews (MOD-01 / MOD-48, plan §7): IDs that citizens sent to MDRRMO at
 * registration. The queue shows no image and no ID number; the image loads only on click, and
 * every load is audited. A decision deletes the image and notifies the citizen.
 */
export function IdReviewQueue(): JSX.Element {
  const [status, setStatus] = useState<IdReviewStatus>('PENDING_REVIEW');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<IdReviewItem | null>(null);

  const { data, isLoading, error } = useIdReviews({ status, page, perPage: PER_PAGE });
  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);

  const columns: Column<IdReviewItem>[] = [
    {
      key: 'submitted',
      header: 'Submitted',
      accessor: (row) => <span className="whitespace-nowrap text-xs text-agap-textMid">{fmtDateTime(row.submittedAt)}</span>,
    },
    {
      key: 'account',
      header: 'Account (typed name)',
      accessor: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-agap-textMain">{row.account.name || 'Unnamed account'}</p>
          <p className="text-[11px] text-agap-textSub">{row.account.phoneNumber ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Why it needs review',
      accessor: (row) => <span className="text-xs text-agap-textMid">{reviewReasonLabel(row.reason)}</span>,
    },
    {
      key: 'attempts',
      header: 'Scans',
      accessor: (row) => <span className="text-xs text-agap-textMid">{row.attemptNumber}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => (
        <div className="space-y-0.5">
          <Badge variant={STATUS_VARIANT[row.status]}>{REVIEW_STATUS_LABELS[row.status]}</Badge>
          {row.rejectionReason && <p className="text-[11px] text-agap-textSub">{REJECTION_REASON_LABELS[row.rejectionReason]}</p>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Review status">
        {ID_REVIEW_STATUSES.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => { setStatus(value); setPage(1); }}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              status === value ? 'bg-agap-green text-white' : 'bg-white text-agap-textMid hover:bg-agap-surface border border-[rgba(168,181,193,0.20)]',
            )}
          >
            {REVIEW_STATUS_LABELS[value]}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl bg-agap-dangerSoft px-4 py-3 text-sm text-agap-danger">
          {errorText(error, "Couldn't load the PhilHealth ID reviews.")}
        </p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={setSelected}
          emptyTitle={status === 'PENDING_REVIEW' ? 'No IDs waiting for review' : `No ${REVIEW_STATUS_LABELS[status].toLowerCase()} IDs`}
          emptyDescription="Citizens send their PhilHealth ID here when the scan or the name check fails at registration."
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="flex items-center gap-1.5 text-xs text-agap-textSub">
          <IdCard size={12} /> {total} check{total === 1 ? '' : 's'} · page {page} of {totalPages}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft size={13} /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next <ChevronRight size={13} />
            </Button>
          </div>
        )}
      </div>

      {selected && (
        <IdReviewDetail key={selected.id} item={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function IdReviewDetail({ item, onClose }: { item: IdReviewItem; onClose: () => void }): JSX.Element {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<IdRejectionReason | ''>('');
  const [done, setDone] = useState<string | null>(null);

  const image = useIdImage(item.id);
  const approve = useApproveIdReview();
  const reject = useRejectIdReview();
  const pending = item.status === 'PENDING_REVIEW' && !done;
  const busy = approve.isPending || reject.isPending;
  const decisionError = approve.error ?? reject.error;

  async function onApprove() {
    const result = await approve.mutateAsync(item.id).catch(() => null);
    if (result) {
      image.hide();
      setDone(result.imageDeleted ? 'Approved. The citizen was notified and the ID image deleted.' : 'Approved. The citizen was notified; the image will be deleted shortly.');
    }
  }

  async function onReject() {
    if (!reason) return;
    const result = await reject.mutateAsync({ id: item.id, reason }).catch(() => null);
    if (result) {
      image.hide();
      setDone(result.imageDeleted ? 'Rejected. The citizen was notified and the ID image deleted.' : 'Rejected. The citizen was notified; the image will be deleted shortly.');
    }
  }

  return (
    <Drawer open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent width="w-full sm:w-[560px]">
        <DrawerHeader>
          <DrawerTitle className="text-lg font-bold tracking-tight">PhilHealth ID check</DrawerTitle>
        </DrawerHeader>

        <DrawerBody className="space-y-5">
          <section className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-agap-textSub">Typed name</p>
            <p className="text-lg font-bold text-agap-textMain">{item.account.name || 'Unnamed account'}</p>
            <p className="text-sm text-agap-textMid">{item.account.phoneNumber ?? '—'}</p>
          </section>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-agap-textSub">Why it needs review</dt>
              <dd className="font-medium text-agap-textMain">{reviewReasonLabel(item.reason)}</dd>
            </div>
            <div>
              <dt className="text-xs text-agap-textSub">Submitted</dt>
              <dd className="font-medium text-agap-textMain">{fmtDateTime(item.submittedAt)} · scan {item.attemptNumber}</dd>
            </div>
            {item.reviewedAt && (
              <div className="col-span-2">
                <dt className="text-xs text-agap-textSub">Decided</dt>
                <dd className="font-medium text-agap-textMain">
                  {REVIEW_STATUS_LABELS[item.status]} {fmtDateTime(item.reviewedAt)}
                  {item.reviewedByName ? ` by ${item.reviewedByName}` : ''}
                  {item.rejectionReason ? ` · ${REJECTION_REASON_LABELS[item.rejectionReason]}` : ''}
                </dd>
              </div>
            )}
          </dl>

          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-agap-textSub">ID image</p>
            {!item.hasImage || done ? (
              <p className="rounded-xl bg-agap-surface px-4 py-3 text-sm text-agap-textMid">
                The image has been deleted (it is kept only until a decision).
              </p>
            ) : image.url ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- an object URL from an authenticated fetch */}
                <img src={image.url} alt="Front of the citizen's PhilHealth ID" className="w-full rounded-xl border border-[rgba(168,181,193,0.20)]" />
                <button type="button" onClick={image.hide} className="text-xs font-semibold text-agap-green hover:underline">
                  Hide image
                </button>
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-dashed border-[rgba(168,181,193,0.40)] px-4 py-4">
                <p className="text-xs text-agap-textSub">{reviewCheckHint(item.reason)} Opening the image is recorded in the audit log.</p>
                <Button variant="outline" size="sm" loading={image.isLoading} onClick={image.show}>
                  <Eye size={14} /> Show ID image
                </Button>
                {image.error ? (
                  <p className="text-xs text-agap-danger">{errorText(image.error, "Couldn't load the image.")}</p>
                ) : null}
              </div>
            )}
          </section>

          {done && (
            <p className="flex items-center gap-2 rounded-xl bg-agap-greenSoft px-4 py-3 text-sm font-medium text-agap-green">
              <ShieldCheck size={16} /> {done}
            </p>
          )}
          {decisionError && !done ? (
            <p className="rounded-xl bg-agap-dangerSoft px-4 py-3 text-sm text-agap-danger">
              {errorText(decisionError, "Couldn't save the decision. Try again.")}
            </p>
          ) : null}

          {pending && rejecting && (
            <section className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-agap-textSub">Reason</label>
              <Select value={reason} onValueChange={(v) => setReason(v as IdRejectionReason)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
                <SelectContent>
                  {ID_REJECTION_REASONS.map((code) => (
                    <SelectItem key={code} value={code}>{REJECTION_REASON_LABELS[code]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-agap-textSub">
                The citizen is told by push and SMS that the check was not approved and can scan again. The account stays active.
              </p>
            </section>
          )}
        </DrawerBody>

        {pending && (
          <DrawerFooter>
            {rejecting ? (
              <>
                <Button variant="ghost" onClick={() => { setRejecting(false); setReason(''); }} disabled={busy}>Cancel</Button>
                <Button variant="danger" onClick={onReject} disabled={!reason || busy} loading={reject.isPending}>Reject</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setRejecting(true)} disabled={busy}>Reject…</Button>
                <Button variant="primary" onClick={onApprove} disabled={busy} loading={approve.isPending}>Approve</Button>
              </>
            )}
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
