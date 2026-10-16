import { type ReactNode, type JSX } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

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

const variantConfig = {
  default:  { icon: 'bg-agap-greenSoft text-agap-green',   num: 'text-agap-textMain' },
  critical: { icon: 'bg-red-50 text-red-600',              num: 'text-red-600' },
  warning:  { icon: 'bg-agap-amberSoft text-agap-amber',   num: 'text-agap-amber' },
  success:  { icon: 'bg-agap-greenSoft text-agap-green',   num: 'text-agap-green' },
};

export function StatCard({
  label, value, trend, trendLabel, icon, variant = 'default', loading, className,
}: StatCardProps): JSX.Element {
  const cfg = variantConfig[variant];

  return (
    <div className={cn(
      'flex flex-col gap-3 rounded-xl bg-white border border-agap-track/40 p-5 shadow-card transition-shadow hover:shadow-card-md',
      className,
    )}>
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-agap-textSub">{label}</span>
        {icon && (
          <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', cfg.icon)}>
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-9 w-20 animate-pulse rounded-lg bg-agap-track" />
      ) : (
        <span className={cn('font-mono text-[32px] font-bold leading-none tabular-nums', cfg.num)}>
          {value}
        </span>
      )}

      {(trend !== undefined || trendLabel) && !loading && (
        <div className="flex items-center gap-1.5">
          {trend !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                trend > 0 ? 'bg-red-50 text-red-600' :
                trend < 0 ? 'bg-emerald-50 text-emerald-700' :
                'bg-agap-surface text-agap-textSub',
              )}
            >
              {trend > 0 ? <TrendingUp size={10} /> : trend < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
              {Math.abs(trend)}%
            </span>
          )}
          {trendLabel && <span className="text-[11px] text-agap-textSub">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
