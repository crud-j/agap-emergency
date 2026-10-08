'use client';

import { useState, useMemo, type JSX } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';
import { EmptyState } from './empty-state';

export interface Column<T> {
  key: string;
  header: string;
  accessor: keyof T | ((row: T) => JSX.Element | string | null);
  sortable?: boolean;
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
}

interface DataTableProps<T extends object> {
  columns: Column<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string | undefined;
  emptyDescription?: string | undefined;
  onRowClick?: ((row: T) => void) | undefined;
  selectedKey?: string | undefined;
  filterValue?: string | undefined;
  filterKeys?: (keyof T)[] | undefined;
  className?: string;
}

type SortDir = 'asc' | 'desc' | null;

export function DataTable<T extends object>({
  columns,
  data,
  getRowKey,
  loading,
  emptyTitle = 'No records',
  emptyDescription,
  onRowClick,
  selectedKey,
  filterValue = '',
  filterKeys = [],
  className,
}: DataTableProps<T>): JSX.Element {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'));
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const filtered = useMemo(() => {
    if (!filterValue || filterKeys.length === 0) return data;
    const lower = filterValue.toLowerCase();
    return data.filter((row) =>
      filterKeys.some((k) => String((row as Record<string, unknown>)[k as string] ?? '').toLowerCase().includes(lower)),
    );
  }, [data, filterValue, filterKeys]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || typeof col.accessor === 'function') return filtered;
    return [...filtered].sort((a, b) => {
      const av = String((a as Record<string, unknown>)[col.accessor as string] ?? '');
      const bv = String((b as Record<string, unknown>)[col.accessor as string] ?? '');
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [filtered, sortKey, sortDir, columns]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border-b border-[rgba(168,181,193,0.12)] last:border-0">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card">
        <EmptyState title={emptyTitle ?? 'No records'} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[rgba(168,181,193,0.20)] bg-agap-surface/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold text-agap-textSub uppercase tracking-wide whitespace-nowrap',
                    col.headerClassName,
                    col.width,
                  )}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="inline-flex items-center gap-1 hover:text-agap-textMain transition-colors focus:outline-none"
                    >
                      {col.header}
                      {/* Inline SVG sort icons avoid lucide/@types/react version conflict */}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                        )
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-40"><polyline points="16 9 12 5 8 9"/><polyline points="8 15 12 19 16 15"/></svg>
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const key = getRowKey(row);
              const isSelected = selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'border-b border-[rgba(168,181,193,0.12)] last:border-0 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-agap-greenSoft/40',
                    isSelected && 'bg-agap-greenSoft',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn('px-4 py-3.5 text-agap-textMain', col.cellClassName)}
                    >
                      {typeof col.accessor === 'function'
                        ? col.accessor(row)
                        : String((row as Record<string, unknown>)[col.accessor as string] ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
