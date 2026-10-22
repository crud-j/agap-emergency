'use client';

import type { JSX, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Titled card used by the role dashboards. */
export function DashboardPanel({ title, action, children, className, bodyClassName }: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}): JSX.Element {
  return (
    <section className={cn('rounded-xl border border-agap-track/40 bg-white shadow-card', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-agap-track/30 px-5 py-3.5">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold text-agap-textMain">{title}</h2>
        {action}
      </div>
      <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  );
}
