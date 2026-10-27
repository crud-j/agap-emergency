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
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/operations/dispatch"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-agap-textSub transition-colors hover:text-agap-green"
          >
            <ArrowLeft size={14} />
            Back to dispatch
          </Link>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-agap-green">
            Dispatch workspace
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-agap-textMain">
            Incident details
          </h1>
          <p className="mt-1 text-sm text-agap-textSub">
            Review the incident, coordinate response, and take the next authorized action.
          </p>
        </div>
      </div>

      <section className="min-h-0 overflow-hidden rounded-2xl border border-agap-track/40 bg-white shadow-panel">
        {isLoading ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : isError || !incident ? (
          <div className="p-6">
            <EmptyState
              icon={AlertTriangle}
              title="Couldn’t load incident"
              description="The incident detail is unavailable right now."
              action={(
                <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                  Retry
                </Button>
              )}
            />
          </div>
        ) : (
          <>
            <div className="p-6 sm:p-8">
              <IncidentDetailBody key={incident.id} incident={incident} />
            </div>
            <StatusActionFooter incident={incident} />
          </>
        )}
      </section>
    </div>
  );
}
