import type { JSX } from 'react';
import { Skeleton } from '@/components/ui';

/**
 * Instant loading skeleton for every Operations Center route. The Sidebar +
 * Topbar from the (ops) layout stay mounted, so this only fills the <main>
 * content area — giving immediate feedback the moment a nav link is clicked,
 * instead of freezing on the previous page while the next one fetches/compiles.
 */
export default function OpsLoading(): JSX.Element {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>

      {/* Content block */}
      <div className="space-y-3 rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white p-5 shadow-card">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
