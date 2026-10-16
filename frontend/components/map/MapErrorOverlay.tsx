'use client';

import type { ReactElement } from 'react';

export function MapErrorOverlay({ onRetry }: { onRetry: () => void }): ReactElement {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-agap-surface/95">
      <span className="text-sm font-semibold text-agap-textMain">Map unavailable</span>
      <p className="max-w-xs text-center text-xs text-agap-textSub">
        Check your connection or verify the map tile configuration.
      </p>
      <button
        onClick={onRetry}
        className="rounded-xl bg-agap-green px-4 py-2 text-sm font-bold text-white"
      >
        Retry
      </button>
    </div>
  );
}
