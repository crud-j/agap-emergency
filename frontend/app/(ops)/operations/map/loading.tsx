import type { JSX } from 'react';
import { Skeleton } from '@/components/ui';

/** Map-shaped loading skeleton for the Real-Time Incident Map view. */
export default function MapLoading(): JSX.Element {
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[520px] flex-col gap-4" aria-busy="true" aria-label="Loading map">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <Skeleton className="flex-1 w-full rounded-2xl" />
    </div>
  );
}
