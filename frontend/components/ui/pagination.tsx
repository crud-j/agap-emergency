'use client';

import type { JSX } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
  /** Shows a rows-per-page picker when given. */
  onPerPageChange?: ((perPage: number) => void) | undefined;
  /** Plural noun for the count, e.g. "users". */
  noun?: string | undefined;
  /** True while the next page loads; the controls stay usable. */
  fetching?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Page numbers with first/last and gaps: 1 … 4 5 [6] 7 8 … 20. At most 7 slots, so it
 * stays one line on a laptop no matter how many pages there are.
 */
export function pageSlots(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(page - 1, totalPages - 4));
  const end = Math.min(totalPages - 1, Math.max(page + 1, 5));
  const slots: Array<number | 'gap'> = [1];
  if (start > 2) slots.push('gap');
  for (let p = start; p <= end; p += 1) slots.push(p);
  if (end < totalPages - 1) slots.push('gap');
  slots.push(totalPages);
  return slots;
}

/** Shared table footer for every paginated list in the console. */
export function Pagination({
  page, totalPages, total, perPage, onPageChange, onPerPageChange, noun = 'rows', fetching, className,
}: PaginationProps): JSX.Element | null {
  const pages = Math.max(1, totalPages);
  if (total === 0) return null;
  const first = (page - 1) * perPage + 1;
  const last = Math.min(total, page * perPage);

  const navButton = 'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green';

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3 pt-1', className)}
    >
      <p className="text-xs text-agap-textSub" aria-live="polite">
        Showing <span className="font-semibold text-agap-textMid tabular-nums">{first.toLocaleString()}–{last.toLocaleString()}</span>{' '}
        of <span className="font-semibold text-agap-textMid tabular-nums">{total.toLocaleString()}</span> {noun}
        {fetching && <span className="ml-2 text-agap-textSub">· loading…</span>}
      </p>

      <div className="flex items-center gap-3">
        {onPerPageChange && (
          <label className="flex items-center gap-1.5 text-xs text-agap-textSub">
            Rows
            <select
              value={perPage}
              onChange={(e) => onPerPageChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-agap-track bg-white px-2 text-xs font-semibold text-agap-textMid focus:outline-none focus:ring-2 focus:ring-agap-green"
            >
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}

        {pages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              aria-label="Previous page"
              className={cn(navButton, 'border-agap-track bg-white text-agap-textMid hover:bg-agap-surface disabled:cursor-not-allowed disabled:bg-agap-surface disabled:text-agap-textSub/60')}
            >
              <ChevronLeft size={14} />
            </button>
            {pageSlots(page, pages).map((slot, i) =>
              slot === 'gap' ? (
                <span key={`gap-${i}`} className="px-1 text-xs text-agap-textSub" aria-hidden>…</span>
              ) : (
                <button
                  key={slot}
                  type="button"
                  onClick={() => onPageChange(slot)}
                  aria-current={slot === page ? 'page' : undefined}
                  aria-label={`Page ${slot}`}
                  className={cn(
                    navButton,
                    'tabular-nums',
                    slot === page
                      ? 'border-agap-green bg-agap-green text-white'
                      : 'border-agap-track bg-white text-agap-textMid hover:bg-agap-surface',
                  )}
                >
                  {slot}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pages}
              aria-label="Next page"
              className={cn(navButton, 'border-agap-track bg-white text-agap-textMid hover:bg-agap-surface disabled:cursor-not-allowed disabled:bg-agap-surface disabled:text-agap-textSub/60')}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

/** Client-side paging for lists the server returns whole (small reference lists). */
export function paginate<T>(rows: T[], page: number, perPage: number): { rows: T[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return { rows: rows.slice((safePage - 1) * perPage, safePage * perPage), totalPages, page: safePage };
}
