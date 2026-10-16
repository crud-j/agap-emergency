import type { JSX } from 'react';
import { Skeleton } from '@/components/ui';

/** Map-shaped loading skeleton for the full-bleed Dispatch Operations view. */
export default function DispatchLoading(): JSX.Element {
  return (
    <div
      className="relative h-[calc(100vh-7rem)] min-h-[560px] overflow-hidden rounded-2xl border border-[rgba(168,181,193,0.22)] bg-agap-surface shadow-card"
      aria-busy="true"
      aria-label="Loading dispatch map"
    >
      {/* Floating left column (stats + queue + detail) */}
      <div className="absolute left-4 top-4 flex w-[380px] max-w-[calc(100%-2rem)] flex-col gap-3">
        <div className="space-y-3 rounded-2xl border border-[rgba(168,181,193,0.22)] bg-white/95 p-3 shadow-card">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-9 w-full rounded-xl" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </div>
      </div>

      {/* Center ETA pill */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <Skeleton className="h-9 w-56 rounded-full" />
      </div>
    </div>
  );
}
