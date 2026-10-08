import type { JSX } from 'react';
import { cn } from '@/lib/utils';

const config: Record<string, { label: string; text: string; bg: string; dot: string }> = {
  CRITICAL: { label: 'Critical', text: 'text-red-600',     bg: 'bg-red-50',     dot: 'bg-red-500' },
  HIGH:     { label: 'High',     text: 'text-orange-600',  bg: 'bg-orange-50',  dot: 'bg-orange-500' },
  MEDIUM:   { label: 'Medium',   text: 'text-amber-600',   bg: 'bg-amber-50',   dot: 'bg-amber-500' },
  LOW:      { label: 'Low',      text: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-600' },
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
