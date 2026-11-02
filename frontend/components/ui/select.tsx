'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

/**
 * 44 px tall by default (touch target). The border is agap-textSub, which keeps the
 * 3:1 contrast an input outline needs on white; dense tables still pass a smaller height.
 * Radix marks an empty select with data-placeholder (CSS ::placeholder never applies).
 */
export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'group flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-agap-textSub bg-white px-3 text-left text-sm text-agap-textMain shadow-sm',
      'transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none',
      '[&>span]:min-w-0 [&>span]:truncate',
      'data-[placeholder]:text-slate-500',
      'hover:border-agap-textMid',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-agap-green focus-visible:ring-offset-1',
      'data-[state=open]:border-agap-green data-[state=open]:ring-2 data-[state=open]:ring-agap-green/20',
      'disabled:cursor-not-allowed disabled:border-agap-track disabled:bg-agap-surface disabled:text-agap-textSub',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="shrink-0 text-agap-textMid transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
      />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export const SelectScrollUpButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronUp size={16} aria-hidden="true" className="text-agap-textMid" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

export const SelectScrollDownButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1', className)}
    {...props}
  >
    <ChevronDown size={16} aria-hidden="true" className="text-agap-textMid" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        // z-[1320]: above the dialog (z-[1310]) and drawer (z-[1210]); at z-50 the
        // options opened behind the Resolve & Close dialog and could not be picked.
        // The height never exceeds the room left in the window, so the list can't run off-screen.
        'relative z-[1320] max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[8rem] overflow-hidden rounded-xl border border-agap-track bg-white shadow-card-md',
        position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn('p-1', position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]')}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn('px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500', className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

/** 40 px rows (44 px on touch screens); the chosen option is green with a check, not colour alone. */
export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex min-h-10 w-full cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm text-agap-textMain',
      '[@media(pointer:coarse)]:min-h-11',
      'data-[highlighted]:bg-agap-surface data-[highlighted]:outline-none',
      'data-[state=checked]:font-semibold data-[state=checked]:text-agap-green',
      'data-[disabled]:pointer-events-none data-[disabled]:text-agap-textSub',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check size={14} aria-hidden="true" className="text-agap-green" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-agap-track', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;
