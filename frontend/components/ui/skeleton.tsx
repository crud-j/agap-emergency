import type { JSX } from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return (
    <div className={cn('animate-pulse rounded-lg bg-agap-track', className)} />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }): JSX.Element {
  return (
    <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card p-5 space-y-3">
      <Skeleton className="h-4 w-2/5" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full last:w-3/4" />
      ))}
    </div>
  );
}

export function SkeletonRow(): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}
