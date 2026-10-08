import * as React from 'react';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { text: string; bg: string }> = {
  // Intake
  DRAFT:             { text: 'text-agap-textSub', bg: 'bg-agap-surface' },
  SUBMITTED:         { text: 'text-red-600',      bg: 'bg-red-50' },
  RECEIVED:          { text: 'text-red-600',       bg: 'bg-red-50' },
  // Active
  ACKNOWLEDGED:      { text: 'text-amber-600',    bg: 'bg-amber-50' },
  ASSESSED:          { text: 'text-amber-600',    bg: 'bg-amber-50' },
  DISPATCH_PENDING:  { text: 'text-amber-600',    bg: 'bg-amber-50' },
  // En-route
  DISPATCHED:        { text: 'text-blue-600',     bg: 'bg-blue-50' },
  EN_ROUTE:          { text: 'text-blue-600',     bg: 'bg-blue-50' },
  // On-scene
  ON_SCENE:          { text: 'text-emerald-700',  bg: 'bg-emerald-50' },
  TRANSPORTING:      { text: 'text-emerald-700',  bg: 'bg-emerald-50' },
  ASSISTING:         { text: 'text-emerald-700',  bg: 'bg-emerald-50' },
  // Terminal positive
  RESOLVED:          { text: 'text-agap-green',   bg: 'bg-agap-greenSoft' },
  CLOSED:            { text: 'text-agap-textSub', bg: 'bg-agap-surface' },
  // Terminal negative
  CANCELLED:         { text: 'text-agap-textSub', bg: 'bg-agap-surface' },
  FALSE_ALERT:       { text: 'text-agap-textSub', bg: 'bg-agap-surface' },
  DUPLICATE:         { text: 'text-agap-textSub', bg: 'bg-agap-surface' },
  UNABLE_TO_RESPOND: { text: 'text-red-600',      bg: 'bg-red-50' },
  REFERRED:          { text: 'text-blue-600',     bg: 'bg-blue-50' },
};

function titleCase(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusChipProps {
  status?: string | null;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  const c = STATUS_CONFIG[status ?? ''] ?? { text: 'text-agap-textSub', bg: 'bg-agap-surface' };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        c.bg, c.text, className,
      )}
    >
      {titleCase(status ?? '—')}
    </span>
  );
}

