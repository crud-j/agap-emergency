import * as React from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-agap-green text-white hover:bg-[#0a4f44] active:bg-[#094840] shadow-green disabled:bg-agap-track disabled:text-agap-textSub disabled:shadow-none',
  secondary:
    'bg-agap-surface text-agap-textMain hover:bg-agap-track active:bg-agap-track border border-[rgba(168,181,193,0.20)] disabled:opacity-50',
  danger:
    'bg-agap-dangerSoft text-agap-danger border border-[rgba(212,72,88,0.22)] hover:bg-red-100 active:bg-red-200 disabled:opacity-50',
  ghost:
    'text-agap-textMid hover:bg-agap-surface active:bg-agap-track disabled:opacity-50',
  outline:
    'border border-agap-green text-agap-green bg-transparent hover:bg-agap-greenSoft active:bg-agap-greenSoft disabled:opacity-50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2.5 rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled ?? loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green focus-visible:ring-offset-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
