'use client';

import type { JSX } from 'react';
import { cn } from '@/lib/utils';
import type { WsState } from '@/lib/use-ws-state';

interface ConnectionIndicatorProps {
  state: WsState;
  queuedCount?: number;
  className?: string;
}

export function ConnectionIndicator({ state, queuedCount, className }: ConnectionIndicatorProps): JSX.Element {
  const label =
    state === 'connected' ? 'Live'
    : state === 'connecting' ? 'Connecting…'
    : queuedCount ? `Offline · ${queuedCount} queued`
    : 'Offline';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold select-none',
        state === 'connected'  && 'bg-agap-greenSoft text-agap-green',
        state === 'connecting' && 'bg-agap-amberSoft text-agap-amber',
        state === 'offline'    && 'bg-agap-dangerSoft text-agap-danger',
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          state === 'connected'  && 'bg-agap-green',
          state === 'connecting' && 'animate-pulse bg-agap-amber',
          state === 'offline'    && 'bg-agap-danger',
        )}
      />
      {label}
    </div>
  );
}
