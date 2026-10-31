'use client';

import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useParams } from 'next/navigation';
import type { JSX } from 'react';
import {
  Button,
  EmptyState,
  Skeleton,
} from '@/components/ui';
import {
  IncidentDetailBody,
  StatusActionFooter,
} from '@/components/incidents/IncidentDetailDrawer';
import { useIncident } from '@/features/incidents/hooks';

export default function DispatchIncidentPage(): JSX.Element {
  const params = useParams<{ incidentId: string }>();
  const incidentId = params.incidentId;
  const { data: incident, isLoading, isError, refetch } = useIncident(incidentId);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-6xl flex-col gap-6 lg:gap-8 pb-12">
      
      {/* Header Section - Animated entry from top */}
      <div className="flex flex-wrap items-end justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          {/* Enhanced Back Button Touch Target */}
          <Link
            href="/operations/dispatch"
            className="group mb-5 inline-flex items-center gap-2 rounded-full border border-slate-200/60 bg-white/50 py-1.5 pl-2.5 pr-4 text-[13px] font-semibold text-slate-600 shadow-sm backdrop-blur-md transition-all hover:border-slate-300 hover:bg-white hover:text-agap-green active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/50"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
            Back to dispatch
          </Link>
          
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-agap-green ring-1 ring-inset ring-emerald-600/10">
              Dispatch workspace
            </span>
          </div>
          
          <h1 className="mt-2.5 text-3xl font-bold tracking-tight text-agap-textMain sm:text-4xl">
            Incident details
          </h1>
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-agap-textSub">
            Review the incident, coordinate response, and take the next authorized action.
          </p>
        </div>
      </div>

      {/* Main Content Panel - Animated entry from bottom */}
      <section className="relative min-h-[400px] w-full overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-inset ring-slate-900/5 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150 fill-mode-both">
        
        {/* Subtle top gradient highlight for premium feel */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#126247]/20 via-[#126247] to-[#126247]/20 opacity-20" aria-hidden="true" />

        {isLoading ? (
          // Upgraded Skeleton UI mimicking actual content layout
          <div className="flex flex-col gap-6 p-6 sm:p-8 animate-in fade-in duration-300">
            {/* Header / Badges Skeleton */}
            <div className="flex flex-wrap items-center gap-3">
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>
            
            {/* Title & Metadata Grid Skeleton */}
            <div className="space-y-4">
              <Skeleton className="h-10 w-2/3 max-w-md rounded-lg" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </div>
            
            {/* Body Block Skeleton */}
            <div className="mt-4 space-y-3">
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-[90%] rounded-md" />
              <Skeleton className="h-4 w-[75%] rounded-md" />
              <Skeleton className="h-32 w-full rounded-xl mt-4" />
            </div>
          </div>
        ) : isError || !incident ? (
          // Enhanced Empty/Error State
          <div className="flex h-full min-h-[400px] items-center justify-center p-6 animate-in fade-in zoom-in-[0.98] duration-300">
            <EmptyState
              icon={AlertTriangle}
              title="Couldn’t load incident"
              description="The incident detail is unavailable right now. Please check your connection or try again."
              action={(
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => void refetch()}
                  className="mt-2 transition-transform active:scale-95"
                >
                  Retry loading
                </Button>
              )}
            />
          </div>
        ) : (
          // Actual Content
          <div className="flex h-full flex-col animate-in fade-in duration-500">
            <div className="flex-1 p-6 sm:p-8">
              <IncidentDetailBody key={incident.id} incident={incident} />
            </div>
            
            {/* Footer with distinct visual separation */}
            <div className="border-t border-slate-100 bg-slate-50/50">
              <StatusActionFooter incident={incident} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}