import type { JSX } from 'react';
import { Skeleton } from '@/components/ui';

/**
 * Loading skeleton matching the Dispatch Operations layout: map on top with the
 * queue below it on small screens, full-bleed map with a floating column from lg.
 */
export default function DispatchLoading(): JSX.Element {
  return (
    <div
      className="flex flex-col gap-3 lg:relative lg:block lg:h-[calc(100dvh-6.5rem)] lg:min-h-[560px] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-[rgba(168,181,193,0.22)] lg:bg-agap-surface lg:shadow-card lg:[html[data-ops-nav=dock]_&]:h-[calc(100dvh-11rem)]"
      aria-busy="true"
      aria-label="Loading dispatch map"
    >
      {/* Map */}
      <div className="relative h-[46vh] min-h-[280px] overflow-hidden rounded-2xl border border-[rgba(168,181,193,0.22)] bg-agap-surface sm:h-[52vh] lg:absolute lg:inset-0 lg:h-auto lg:min-h-0 lg:rounded-none lg:border-0">
        <div className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 sm:block lg:left-[calc(50%+208px)] xl:left-[calc(50%+228px)]">
          <Skeleton className="h-9 w-56 rounded-full" />
        </div>
      </div>

      {/* Column (stats + queue) */}
      <div className="flex flex-col gap-3 lg:absolute lg:left-4 lg:top-4 lg:w-[400px] xl:w-[440px]">
        <div className="space-y-3 rounded-2xl border border-[rgba(168,181,193,0.22)] bg-white p-3 shadow-card lg:bg-white/95">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
