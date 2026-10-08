import { type ReactNode, type JSX } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card } from './card';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: number | undefined;
  trendLabel?: string | undefined;
  icon?: ReactNode | undefined;
  variant?: 'default' | 'critical' | 'warning' | 'success' | undefined;
  loading?: boolean | undefined;
  className?: string | undefined;
}

export function StatCard({
  label, value, trend, trendLabel, icon, variant = 'default', loading, className,
}: StatCardProps): JSX.Element {
  const variantAccent = {
    default: 'bg-agap-greenSoft text-agap-green',
    critical: 'bg-agap-dangerSoft text-agap-danger',
    warning: 'bg-agap-amberSoft text-agap-amber',
    success: 'bg-agap-greenSoft text-agap-green',
  }[variant];

  return (
    <Card className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-start justify-between">
        <span className="text-sm font-semibold text-agap-textSub uppercase tracking-wide">{label}</span>
        {icon && (
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', variantAccent)}>
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-8 w-24 animate-pulse rounded-lg bg-agap-track" />
      ) : (
        <span className="text-3xl font-extrabold text-agap-textMain tabular-nums">{value}</span>
      )}

      {(trend !== undefined || trendLabel) && !loading && (
        <div className="flex items-center gap-1.5">
          {trend !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold',
                trend > 0 ? 'bg-red-50 text-red-600' :
                trend < 0 ? 'bg-emerald-50 text-emerald-700' :
                'bg-agap-surface text-agap-textSub',
              )}
            >
              {trend > 0 ? <TrendingUp size={10} /> : trend < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
              {Math.abs(trend)}%
            </span>
          )}
          {trendLabel && <span className="text-xs text-agap-textSub">{trendLabel}</span>}
        </div>
      )}
    </Card>
  );
}
