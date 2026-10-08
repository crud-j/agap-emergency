import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'green'
  | 'red'
  | 'amber'
  | 'blue'
  | 'muted'
  | 'orange';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-agap-surface  text-agap-textMid',
  green:   'bg-agap-greenSoft text-agap-green',
  red:     'bg-agap-dangerSoft text-agap-danger',
  amber:   'bg-agap-amberSoft  text-agap-amber',
  blue:    'bg-agap-infoSoft   text-agap-info',
  orange:  'bg-orange-50       text-orange-600',
  muted:   'bg-agap-track      text-agap-textSub',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
