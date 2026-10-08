import type { JSX } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/incident-format';

interface EtaLabelProps {
  etaSeconds?: number | null;
  updatedAt?: string | null;
  className?: string;
}

/**
 * ETA display primitive. ETA is always an estimate, never a guarantee
 * (CLAUDE.md rule 13) — so it is always suffixed "est." and paired with the
 * freshness of the last update. When no ETA is available yet it reads
 * "Pending est." rather than fabricating a number.
 */
export function EtaLabel({ etaSeconds, updatedAt, className }: EtaLabelProps): JSX.Element {
  const mins = etaSeconds != null ? Math.max(1, Math.round(etaSeconds / 60)) : null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-agap-textSub', className)}>
      <Clock size={12} className="shrink-0" />
      <span className="font-semibold text-agap-textMid">
        {mins != null ? `~${mins}m` : 'Pending'}{' '}
        <span className="font-normal text-agap-textSub">est.</span>
      </span>
      {updatedAt && <span className="text-agap-textSub">· updated {timeAgo(updatedAt)}</span>}
    </span>
  );
}
