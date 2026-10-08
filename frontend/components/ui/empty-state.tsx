import type { JSX } from 'react';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string | undefined;
  action?: import('react').ReactNode | undefined;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-6 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-agap-surface mb-4">
        <Icon size={24} className="text-agap-textSub" />
      </div>
      <h3 className="text-base font-bold text-agap-textMain mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-agap-textSub max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
