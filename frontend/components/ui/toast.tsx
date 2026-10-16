'use client';

import { type ComponentPropsWithoutRef, type JSX } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToastVariant } from './use-toast';

export const ToastProvider = ToastPrimitive.Provider;

function VariantIcon({ variant }: { variant: ToastVariant }): JSX.Element {
  if (variant === 'success') return <CheckCircle2 size={16} className="text-agap-green" />;
  if (variant === 'error')   return <AlertCircle  size={16} className="text-agap-danger" />;
  if (variant === 'warning') return <AlertTriangle size={16} className="text-agap-amber" />;
  return <Info size={16} className="text-agap-info" />;
}

const variantBorder: Record<ToastVariant, string> = {
  default: 'border-[rgba(168,181,193,0.20)]',
  success: 'border-agap-track',
  error:   'border-[rgba(212,72,88,0.22)]',
  warning: 'border-[rgba(217,119,6,0.22)]',
};

interface ToastProps extends ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

export function Toast({ title, description, variant = 'default', className, ...props }: ToastProps): JSX.Element {
  return (
    <ToastPrimitive.Root
      className={cn(
        'group pointer-events-auto relative flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white p-4 shadow-card',
        variantBorder[variant],
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full',
        'data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
        className,
      )}
      {...props}
    >
      <span className="mt-0.5 shrink-0">
        <VariantIcon variant={variant} />
      </span>
      <div className="flex-1 min-w-0">
        <ToastPrimitive.Title className="text-sm font-semibold text-agap-textMain">
          {title}
        </ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="text-xs text-agap-textSub mt-0.5 leading-relaxed">
            {description}
          </ToastPrimitive.Description>
        )}
      </div>
      <ToastPrimitive.Close className="shrink-0 rounded-lg p-1 text-agap-textSub hover:bg-agap-surface hover:text-agap-textMain transition-colors focus:outline-none focus:ring-2 focus:ring-agap-green">
        <X size={14} />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
}

export function ToastViewport({ className, ...props }: ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>): JSX.Element {
  return (
    <ToastPrimitive.Viewport
      className={cn('fixed bottom-4 right-4 z-[1400] flex max-h-screen w-full max-w-sm flex-col gap-2', className)}
      {...props}
    />
  );
}
