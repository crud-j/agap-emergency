'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes, type JSX } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export const DrawerOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // z-[1200]: above Leaflet map panes/controls (which reach z-index 1000) and
      // the dispatch page's z-[1000] floating overlays — otherwise the drawer opens
      // hidden behind the map.
      'fixed inset-0 z-[1200] bg-black/20 backdrop-blur-[2px]',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DrawerOverlay.displayName = 'DrawerOverlay';

interface DrawerContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: 'right' | 'left';
  width?: string;
}

export const DrawerContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DrawerContentProps
>(({ className, children, side = 'right', width = 'w-[480px]', ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DrawerOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed top-0 z-[1210] h-full bg-white shadow-[−4px_0_40px_rgba(135,149,163,0.12)] border-l border-[rgba(168,181,193,0.20)] flex flex-col',
        'data-[state=open]:animate-in data-[state=closed]:animate-out duration-300',
        side === 'right'
          ? 'right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
          : 'left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        width,
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DrawerContent.displayName = 'DrawerContent';

export function DrawerHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn('flex items-center justify-between px-6 py-4 border-b border-[rgba(168,181,193,0.20)]', className)}
      {...props}
    >
      {children}
      <DrawerClose className="rounded-lg p-1.5 text-agap-textSub hover:bg-agap-surface hover:text-agap-textMain transition-colors focus:outline-none focus:ring-2 focus:ring-agap-green">
        <X size={16} />
        <span className="sr-only">Close</span>
      </DrawerClose>
    </div>
  );
}

export function DrawerBody({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('flex-1 overflow-y-auto px-6 py-5', className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn('flex justify-end gap-3 px-6 py-4 border-t border-[rgba(168,181,193,0.20)]', className)}
      {...props}
    />
  );
}

export const DrawerTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-base font-bold text-agap-textMain', className)}
    {...props}
  />
));
DrawerTitle.displayName = 'DrawerTitle';
