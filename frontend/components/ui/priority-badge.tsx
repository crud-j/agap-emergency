import type { JSX } from 'react';
import { PRIORITY_LABELS } from '@agap/shared';
import { cn } from '@/lib/utils';

// Labels come from @agap/shared (MOD-24): priority sets the order of response, not whether one happens.
const config: Record<string, { label: string; text: string; bg: string; dot: string }> = {
  CRITICAL: { label: PRIORITY_LABELS.CRITICAL, text: 'text-red-600',     bg: 'bg-red-50',     dot: 'bg-red-500' },
  HIGH:     { label: PRIORITY_LABELS.HIGH,     text: 'text-orange-600',  bg: 'bg-orange-50',  dot: 'bg-orange-500' },
  MEDIUM:   { label: PRIORITY_LABELS.MEDIUM,   text: 'text-amber-600',   bg: 'bg-amber-50',   dot: 'bg-amber-500' },
  LOW:      { label: PRIORITY_LABELS.LOW,      text: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-600' },
};

interface PriorityBadgeProps {
  priority?: string | null;
  showDot?: boolean;
  className?: string;
}

export function PriorityBadge({ priority, showDot = true, className }: PriorityBadgeProps): JSX.Element {
  const c = config[priority ?? ''] ?? { label: priority ?? '—', text: 'text-agap-textSub', bg: 'bg-agap-surface', dot: 'bg-agap-textSub' };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        c.bg, c.text, className,
      )}
    >
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />}
      {c.label}
    </span>
  );
}
